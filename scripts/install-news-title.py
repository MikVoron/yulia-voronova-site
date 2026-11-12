"""Guarded news-title release; never publishes news or sends email."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = Path(__file__).resolve().parent
ALLOWED = {
    **{'platform/' + name: '/var/www/smartplate-platform/' + name for name in (
        'admin.html', 'admin.js', 'auth-callback.html', 'cabinet.html',
        'category.html', 'data-v2.js', 'index-page.js', 'index.css', 'index.html',
        'ingredient.html', 'login.html', 'recipe-editor.html', 'recipe.html')},
    'server/src/routes/content.js': '/var/www/smartplate-api/src/routes/content.js',
    'server/src/email.js': '/var/www/smartplate-api/src/email.js',
}
MIGRATION = 'server/migrations/043_news_title.sql'
LOCK = Path('/run/lock/smartplate-news-title.lock')
BACKUP_DIR = '/root'
PROTECTED_ASSETS = {'admin.html', 'admin.js', 'recipe-editor.html'}
SEO_ROUTES = {'index.html': 'home', 'category.html': 'category',
              'recipe.html': 'recipe', 'ingredient.html': 'ingredient'}
CACHE_KEY = b'data-v2.js?v=20261112-news-title'


def sha(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def safe(file):
    file = Path(file)
    if file.is_symlink() or file.resolve() != file.absolute() or not file.is_file():
        raise RuntimeError('Unexpected file or resolved path: ' + str(file))


def run(args, timeout=180):
    result = subprocess.run([str(arg) for arg in args], text=True,
                            capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(str(args[0]) + ': ' + result.stderr[-2000:] + result.stdout[-1000:])
    return result.stdout


def health():
    with urllib.request.urlopen('http://127.0.0.1:3000/health', timeout=10) as response:
        data = json.load(response)
    if data.get('status') != 'ok' or data.get('db') != 'ok':
        raise RuntimeError('API health is not ok')
    rows = [line.split(None, 3) for line in run(['/usr/bin/ps', '-eo', 'pid=,uid=,gid=,args=']).splitlines()]
    apps = [row for row in rows if len(row) == 4 and row[3] == 'node /var/www/smartplate-api/index.js']
    if len(apps) != 1 or apps[0][1:3] != ['997', '997']:
        raise RuntimeError('Unexpected API identity')
    return int(apps[0][0])


def restart():
    run(['/usr/bin/env', 'PM2_HOME=/root/.pm2', '/usr/bin/pm2', 'restart', 'smartplate-api'])
    for attempt in range(30):
        try:
            return health()
        except Exception:
            if attempt == 29:
                raise
            time.sleep(0.5)


def atomic_copy(source, target):
    safe(target)
    fd, temporary = tempfile.mkstemp(prefix='.news-title-', dir=target.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(source.read_bytes())
            stream.flush()
            os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), 0o644)
            os.fchown(stream.fileno(), 0, 0)
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def private_contract():
    for method, url in [('GET', 'http://127.0.0.1:3000/content/updates?all=1'),
                        ('PUT', 'http://127.0.0.1:3000/admin/news/0')]:
        try:
            urllib.request.urlopen(urllib.request.Request(url, method=method), timeout=10)
            raise RuntimeError('Unauthenticated private route unexpectedly accepted')
        except urllib.error.HTTPError as error:
            if error.code != 401:
                raise RuntimeError('Expected HTTP 401 on private route') from error
            error.close()
    for name in sorted(PROTECTED_ASSETS):
        try:
            urllib.request.urlopen('https://plate.voronova.online/' + name, timeout=20)
            raise RuntimeError('Admin asset unexpectedly accessible without Basic authentication')
        except urllib.error.HTTPError as error:
            if error.code != 401 or not error.headers.get('WWW-Authenticate', '').lower().startswith('basic '):
                raise RuntimeError('Expected HTTP 401 with Basic challenge') from error
            error.close()


def title_contract():
    with urllib.request.urlopen('http://127.0.0.1:3000/content/news?limit=50', timeout=10) as response:
        rows = json.load(response)
    if not isinstance(rows, list) or any('title' not in row for row in rows):
        raise RuntimeError('News API does not return the separate title field')


def public_response(url):
    request = urllib.request.Request(url, headers={'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(request, timeout=20) as response:
        if response.status != 200:
            raise RuntimeError('Expected HTTP 200: ' + url)
        return response.read(), response.headers.get_content_type()


def rendered_targets():
    home, content_type = public_response('http://127.0.0.1:3000/_seo/home')
    if content_type != 'text/html':
        raise RuntimeError('Homepage renderer did not return HTML')
    targets = {}
    for name, route in SEO_ROUTES.items():
        query = {'v': '20261112-news-title-r2'}
        if name in {'recipe.html', 'ingredient.html'}:
            match = re.search(r'href="' + re.escape(name) + r'\?id=([^"&]+)', home.decode('utf-8'))
            if not match:
                raise RuntimeError('No current published link for ' + name)
            query['id'] = urllib.parse.unquote(match[1])
        suffix = '?' + urllib.parse.urlencode(query)
        targets[name] = ('http://127.0.0.1:3000/_seo/' + route + suffix,
                         'https://plate.voronova.online/' + name + suffix)
    return targets


def verify_public_asset(row, targets, installed):
    target = Path(row['target'])
    if not row['file'].startswith('platform/') or target.name in PROTECTED_ASSETS:
        return
    if target.name in SEO_ROUTES:
        local_url, public_url = targets[target.name]
        expected, expected_type = public_response(local_url)
        served, served_type = public_response(public_url)
        if expected_type != 'text/html' or served_type != 'text/html':
            raise RuntimeError('Expected rendered HTML: ' + row['file'])
        if expected != served:
            # A legitimate rating/catalog update can occur between requests.
            # Accept the public bytes only if an immediately repeated local
            # render produces those exact bytes too.
            expected, expected_type = public_response(local_url)
            if expected_type != 'text/html' or expected != served:
                raise RuntimeError('Public rendered hash mismatch: ' + row['file'])
        if installed and CACHE_KEY not in served:
            raise RuntimeError('Rendered page uses an old shared client: ' + row['file'])
    else:
        url = 'https://plate.voronova.online/' + target.name + '?v=20261112-news-title-r2'
        served, _ = public_response(url)
        expected_hash = row['after'] if installed else sha(target)
        if hashlib.sha256(served).hexdigest() != expected_hash:
            raise RuntimeError('Public static hash mismatch: ' + row['file'])


def verify_public(rows, installed):
    targets = rendered_targets()
    for row in rows:
        verify_public_asset(row, targets, installed)


def verify(rows):
    private_contract()
    title_contract()
    for row in rows:
        target = Path(row['target'])
        if sha(target) != row['after']:
            raise RuntimeError('Installed hash mismatch: ' + row['file'])
        stat = target.stat()
        if (stat.st_uid, stat.st_gid, stat.st_mode & 0o777) != (0, 0, 0o644):
            raise RuntimeError('Installed permissions mismatch')
    verify_public(rows, installed=True)
    return health()


def sql(text):
    return run(['/usr/bin/sudo', '-n', '-u', 'postgres', '/usr/bin/psql', '-X', '-v',
                'ON_ERROR_STOP=1', '-d', 'smartplate_db', '-At', '-c', text])


def news_snapshot():
    return sql("SELECT md5(COALESCE(jsonb_agg(to_jsonb(n) - 'title' ORDER BY id)::text, '[]')) FROM public.news n;").strip()


def migrate(file):
    migration = file.read_text()
    before = news_snapshot()
    # All probe rows are in a temporary table. Explicit IDs avoid consuming
    # any production sequence; the DDL rehearsal ends with ROLLBACK.
    probe = """
      CREATE TEMP TABLE news_title_probe (LIKE public.news INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP;
      INSERT INTO news_title_probe (id,type,title,text,is_published)
        VALUES (-1,'news','Title','First paragraph.\n\nSecond paragraph.',false);
      UPDATE news_title_probe SET title=CASE WHEN true THEN 'Edited title' ELSE title END WHERE id=-1;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM news_title_probe WHERE id=-1 AND title='Edited title'
          AND text=E'First paragraph.\\n\\nSecond paragraph.' AND is_published=false)
        THEN RAISE EXCEPTION 'News title/body probe failed'; END IF;
      END $$;
    """
    sql("BEGIN; SET LOCAL lock_timeout='5s'; " + migration + probe + 'ROLLBACK;')
    print('NEWS_TITLE_POSTGRES_REHEARSAL_OK', flush=True)
    sql("BEGIN; SET LOCAL lock_timeout='5s'; " + migration + 'COMMIT;')
    shape = sql("SELECT data_type || ':' || character_maximum_length FROM information_schema.columns "
                "WHERE table_schema='public' AND table_name='news' AND column_name='title';").strip()
    if shape != 'character varying:200' or news_snapshot() != before:
        raise RuntimeError('Unexpected news schema or concurrent news-content change')


def load_plan(expected_hash):
    manifest = BASE / 'manifest.json'
    safe(manifest)
    if sha(manifest) != expected_hash:
        raise RuntimeError('Manifest changed')
    plan = json.loads(manifest.read_text())
    rows = plan['files']
    if len(rows) != len(ALLOWED) or {row['file']: row['target'] for row in rows} != ALLOWED:
        raise RuntimeError('Unexpected runtime scope')
    migration = BASE / 'runtime' / MIGRATION
    safe(migration)
    if plan['migration']['file'] != MIGRATION or sha(migration) != plan['migration']['sha256']:
        raise RuntimeError('Migration changed')
    for row in rows:
        source, target = BASE / 'runtime' / row['file'], Path(row['target'])
        safe(source)
        safe(target)
        if sha(source) != row['after'] or sha(target) not in (row['before'], row['after']):
            raise RuntimeError('Payload mismatch or production drift: ' + row['file'])
        if source.suffix == '.js':
            run(['/usr/bin/node', '--check', source])
    return rows, migration


def install(rows, migration):
    if os.geteuid() != 0:
        raise RuntimeError('Use interactive sudo in the Timeweb console')
    os.umask(0o077)
    with open(LOCK, 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if all(sha(row['target']) == row['after'] for row in rows):
            print(json.dumps({'marker': 'NEWS_TITLE_RELEASE_OK', 'api_pid': verify(rows)}))
            return
        if not all(sha(row['target']) == row['before'] for row in rows):
            raise RuntimeError('Partial or concurrent installation; review before proceeding')
        checkpoint = run(['/bin/bash', '/home/smartplate-admin/api-checkpoint-20260909.sh', '--create'], timeout=300)
        if 'CHECKPOINT_OK' not in checkpoint:
            raise RuntimeError('Checkpoint did not complete')
        print(checkpoint, flush=True)
        backup = Path(tempfile.mkdtemp(prefix='smartplate-news-title-20261112-', dir=BACKUP_DIR))
        os.chmod(backup, 0o700)
        for row in rows:
            for folder, source in [('before', Path(row['target'])), ('after', BASE / 'runtime' / row['file'])]:
                copy = backup / folder / row['file']
                copy.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, copy)
                if sha(copy) != row[folder]:
                    raise RuntimeError('Snapshot changed during copy')
        shutil.copy2(BASE / 'manifest.json', backup / 'manifest.json')
        shutil.copy2(migration, backup / 'migration.sql')
        print('BACKUP=' + str(backup), flush=True)
        installed = []
        try:
            migrate(backup / 'migration.sql')
            for prefix in ['server/', 'platform/']:
                for row in rows:
                    if not row['file'].startswith(prefix):
                        continue
                    if sha(row['target']) != row['before']:
                        raise RuntimeError('Concurrent production change')
                    atomic_copy(backup / 'after' / row['file'], Path(row['target']))
                    installed.append(row)
                if prefix == 'server/':
                    restart()
                    title_contract()
            pid = verify(rows)
        except Exception:
            if not all(sha(row['target']) == row['after'] for row in installed):
                raise RuntimeError('Concurrent changes; refusing automatic rollback')
            for row in reversed(installed):
                atomic_copy(backup / 'before' / row['file'], Path(row['target']))
                if sha(row['target']) != row['before']:
                    raise RuntimeError('Rollback hash mismatch')
            if any(row['file'].startswith('server/') for row in installed):
                restart()
            # The nullable additive column is compatible with the old API.
            # Keep it on rollback; never delete title data or restore the DB.
            print('NEWS_TITLE_ROLLED_BACK; additive title column retained', flush=True)
            raise
        print(json.dumps({'marker': 'NEWS_TITLE_RELEASE_OK', 'files': len(rows), 'api_pid': pid, 'backup': str(backup)}))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest-sha', required=True)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--check', action='store_true')
    modes.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    rows, migration = load_plan(args.manifest_sha)
    pid = health()
    private_contract()
    if args.check:
        verify_public(rows, installed=False)
        print(json.dumps({'marker': 'NEWS_TITLE_PREFLIGHT_OK', 'files': len(rows), 'api_pid': pid}))
    elif args.verify:
        print(json.dumps({'marker': 'NEWS_TITLE_RELEASE_OK', 'files': len(rows), 'api_pid': verify(rows)}))
    else:
        install(rows, migration)


if __name__ == '__main__':
    main()
