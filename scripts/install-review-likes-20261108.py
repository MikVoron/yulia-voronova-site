#!/usr/bin/env python3
"""Exact-file likes release. Additive migration, private checkpoint, guarded rollback."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = Path(__file__).resolve().parent
API = Path('/var/www/smartplate-api')
STATIC = Path('/var/www/smartplate-platform')
ROLLBACKS = Path('/root/smartplate-rollbacks')
REL = 'review-likes-20261108'
MIGRATION = 'server/migrations/044_review_likes.sql'
TARGETS = {
    **{'platform/' + name: STATIC / name for name in [
        'admin.html', 'auth-callback.html', 'cabinet.html', 'category-page.js', 'category.html',
        'data-v2.js', 'index.html', 'ingredient.html', 'login.html', 'recipe-editor.html',
        'recipe-page.js', 'recipe.html', 'review-discussions.css', 'review-discussions.js', 'review-like-settings.js']},
    **{'server/' + name: API / name for name in [
        'src/email.js', 'src/review-discussions.js', 'src/routes/content.js', 'src/review-likes.js',
        'migrations/044_review_likes.sql']},
}
UNCHANGED = {
    **{'server/' + name: API / name for name in [
        'index.js', 'package.json', 'package-lock.json', 'src/middleware.js',
        'src/review-photos.js', 'src/routes/review-photos.js', 'src/review-avatars.js']},
    **{'platform/' + name: STATIC / name for name in ['style-v4.css', 'review-photos.js', 'review-photos.css']},
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None


def run(*args, **options):
    return subprocess.run(args, check=True, text=True, capture_output=True, **options).stdout.strip()


def safe_path(path):
    if path.is_symlink() or path.resolve() != path or (path.exists() and not path.is_file()):
        raise RuntimeError('Unexpected file path: ' + str(path))


def verify(path, expected):
    safe_path(path)
    if sha(path) not in expected:
        raise RuntimeError('File hash changed: ' + str(path))


def atomic_install(source, target):
    safe_path(target)
    if not target.parent.is_dir():
        raise RuntimeError('Target directory missing: ' + str(target.parent))
    fd, temporary = tempfile.mkstemp(prefix='.review-likes-', dir=target.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(source.read_bytes())
            stream.flush()
            os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), 0o644)
            if os.geteuid() == 0:
                os.fchown(stream.fileno(), 0, 0)
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def fetch(path, data=None, method=None):
    headers = {'Content-Type': 'application/json'} if data is not None else {}
    request = urllib.request.Request('http://127.0.0.1:3000' + path,
        data=None if data is None else json.dumps(data).encode(), headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.load(response)


def health():
    result = fetch('/health')
    if result.get('status') != 'ok' or result.get('db') != 'ok':
        raise RuntimeError('API/database health failed')


def identity():
    rows = [line.split(None, 3) for line in run('ps', '-eo', 'pid=,uid=,gid=,args=').splitlines()]
    matches = [row for row in rows if len(row) == 4 and row[3] == 'node /var/www/smartplate-api/index.js']
    if len(matches) != 1 or matches[0][1:3] != ['997', '997']:
        raise RuntimeError('Expected one API process with UID/GID 997')
    return matches[0][0]


def restart():
    run('/usr/bin/env', 'PM2_HOME=/root/.pm2', '/usr/bin/pm2', 'restart', 'smartplate-api')
    for attempt in range(40):
        try:
            health()
            return identity()
        except Exception:
            if attempt == 39:
                raise
            time.sleep(0.5)


def psql(sql):
    return run('/usr/sbin/runuser', '-u', 'postgres', '--', '/usr/bin/psql', '-X', '-v', 'ON_ERROR_STOP=1', '-d', 'smartplate_db', '-At', input=sql)


def migration_body(sql):
    if sql.count('BEGIN;') != 1 or sql.count('COMMIT;') != 1:
        raise RuntimeError('Unexpected migration boundaries')
    return sql.replace('BEGIN;', '', 1).replace('COMMIT;', '', 1)


def api_smoke():
    row = psql('SELECT r.id || chr(9) || r.recipe_id FROM reviews r JOIN recipes p ON p.id=r.recipe_id WHERE p.is_published ORDER BY r.id LIMIT 1;')
    if not row:
        raise RuntimeError('No public review for read-only smoke')
    review_id, recipe_id = row.split('\t', 1)
    reviews = fetch('/content/reviews/' + urllib.parse.quote(recipe_id, safe=''))
    if not reviews or any(not isinstance(item.get('likeCount'), int) or not isinstance(item.get('likedByCurrentUser'), bool) for item in reviews):
        raise RuntimeError('Review likes missing')
    for item in reviews:
        for message in item.get('comments', []) + ([item['reply']] if item.get('reply') else []):
            if not isinstance(message.get('likeCount'), int) or message.get('likedByCurrentUser') is not False:
                raise RuntimeError('Reply/comment likes missing')
    page = fetch('/content/reviews/' + review_id + '/comments')
    if not isinstance(page.get('comments'), list):
        raise RuntimeError('Discussion reading failed')
    for path, data, method in [
        ('/auth/review-like-settings', None, 'GET'),
        ('/content/review-like-notifications', None, 'GET'),
        ('/content/review-likes/review/' + review_id, {'active': True}, 'PUT'),
        ('/content/review-like-notifications/read', {'ids': [1]}, 'POST'),
    ]:
        try:
            fetch(path, data, method)
            raise RuntimeError('Anonymous private route accepted: ' + path)
        except urllib.error.HTTPError as error:
            if error.code != 401:
                raise
    if fetch('/content/review-photos/config').get('enabled') is not True:
        raise RuntimeError('Existing photo feature changed')


def public_smoke(entries):
    for name, entry in entries.items():
        if not name.startswith('platform/'):
            continue
        basename = name.split('/', 1)[1]
        if basename.endswith(('.js', '.css')):
            request = urllib.request.Request('https://plate.voronova.online/' + basename + '?release=20261108-likes', headers={'Cache-Control': 'no-cache'})
            with urllib.request.urlopen(request, timeout=20) as response:
                if hashlib.sha256(response.read()).hexdigest() != entry['new_sha256']:
                    raise RuntimeError('Public asset hash mismatch: ' + name)
    with urllib.request.urlopen('https://plate.voronova.online/recipe.html?id=cutlets-chicken-nuggets-cornflakes', timeout=20) as response:
        html = response.read().decode()
    if 'review-discussions.js?v=20261108-like-animation' not in html:
        raise RuntimeError('Public recipe HTML cache marker missing')


def preflight(manifest_sha):
    verify(BASE / 'manifest.json', {manifest_sha})
    manifest = json.loads((BASE / 'manifest.json').read_text())
    verify(Path(__file__).resolve(), {manifest.get('installer_sha256')})
    rows = manifest.get('files', [])
    entries = {row['path']: row for row in rows}
    unchanged = manifest.get('unchanged', [])
    guards = {row['path']: row for row in unchanged}
    if manifest.get('release') != REL or len(rows) != len(TARGETS) or set(entries) != set(TARGETS) or len(unchanged) != len(UNCHANGED) or set(guards) != set(UNCHANGED):
        raise RuntimeError('Unexpected release scope')
    for name, target in TARGETS.items():
        entry = entries[name]
        source = BASE / 'payload' / name
        verify(source, {entry['new_sha256']})
        if not source.is_file():
            raise RuntimeError('Payload missing: ' + name)
        verify(target, {entry['old_sha256'], entry['new_sha256']})
        if source.suffix == '.js':
            run('node', '--check', str(source))
    for name, target in UNCHANGED.items():
        verify(target, {guards[name]['sha256']})
    health()
    identity()
    return manifest, entries


def rollback(installed, entries, checkpoint):
    for name in reversed(installed):
        target = TARGETS[name]
        verify(target, {entries[name]['new_sha256']})
        if entries[name]['old_sha256'] is None:
            target.unlink()
        else:
            atomic_install(checkpoint / 'previous' / name, target)
        verify(target, {entries[name]['old_sha256']})


def apply(manifest_sha):
    if os.geteuid() != 0:
        raise RuntimeError('Interactive sudo is required. Never provide its password to this script.')
    manifest, entries = preflight(manifest_sha)
    if all(sha(target) == entries[name]['new_sha256'] for name, target in TARGETS.items()):
        api_smoke()
        public_smoke(entries)
        print('REVIEW_LIKES_ALREADY_INSTALLED', flush=True)
        return
    for name, target in TARGETS.items():
        verify(target, {entries[name]['old_sha256']})
    if psql("SELECT bool_and(to_regclass(name) IS NOT NULL) FROM unnest(ARRAY['public.reviews','public.review_comments','public.review_replies','public.review_reply_reactions','public.review_photos']) name;") != 't':
        raise RuntimeError('Prerequisite tables missing')
    if psql("SELECT count(*) FROM information_schema.columns WHERE table_name='users' AND column_name='review_friend_badge';") != '1':
        raise RuntimeError('Existing review badge column missing')
    ROLLBACKS.mkdir(mode=0o700, parents=True, exist_ok=True)
    if ROLLBACKS.is_symlink() or ROLLBACKS.stat().st_uid != 0:
        raise RuntimeError('Unexpected checkpoint directory')
    checkpoint = Path(tempfile.mkdtemp(prefix=REL + '-', dir=ROLLBACKS))
    os.chmod(checkpoint, 0o700)
    for name, target in TARGETS.items():
        source = BASE / 'payload' / name
        staged = checkpoint / 'staged' / name
        staged.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, staged)
        verify(staged, {entries[name]['new_sha256']})
        if entries[name]['old_sha256'] is not None:
            verify(target, {entries[name]['old_sha256']})
            previous = checkpoint / 'previous' / name
            previous.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, previous)
            verify(previous, {entries[name]['old_sha256']})
    shutil.copyfile(BASE / 'manifest.json', checkpoint / 'manifest.json')
    with (checkpoint / 'database.dump').open('xb') as stream:
        os.fchmod(stream.fileno(), 0o600)
        subprocess.run(['/usr/sbin/runuser', '-u', 'postgres', '--', '/usr/bin/pg_dump', '-Fc', '--no-owner', '--no-acl', '-d', 'smartplate_db'], stdout=stream, stderr=subprocess.PIPE, check=True)
    run('/usr/bin/pg_restore', '--list', str(checkpoint / 'database.dump'))
    print('CHECKPOINT=' + str(checkpoint), flush=True)
    sql = migration_body((checkpoint / 'staged' / MIGRATION).read_text())
    psql("BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';\n" + sql + '\nROLLBACK;')
    print('REVIEW_LIKES_MIGRATION_DRY_RUN_OK', flush=True)
    installed = []
    try:
        psql("BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';\n" + sql + '\nCOMMIT;')
        print('REVIEW_LIKES_MIGRATION_APPLIED', flush=True)
        def install(name):
            target = TARGETS[name]
            verify(target, {entries[name]['old_sha256']})
            atomic_install(checkpoint / 'staged' / name, target)
            installed.append(name)
            verify(target, {entries[name]['new_sha256']})
        for name in TARGETS:
            if name.startswith('server/'):
                install(name)
        restart()
        api_smoke()
        for name in sorted(TARGETS, key=lambda item: item.endswith('.html')):
            if name.startswith('platform/'):
                install(name)
        health()
        for name, target in TARGETS.items():
            verify(target, {entries[name]['new_sha256']})
        for row in manifest['unchanged']:
            verify(UNCHANGED[row['path']], {row['sha256']})
        public_smoke(entries)
    except Exception:
        rollback(installed, entries, checkpoint)
        if any(name.startswith('server/') for name in installed):
            restart()
        print('REVIEW_LIKES_FILES_ROLLED_BACK; additive tables retained', flush=True)
        raise
    print(json.dumps({'marker': 'REVIEW_LIKES_RELEASE_OK', 'commit': manifest['commit'], 'files': len(TARGETS), 'api_pid': identity(), 'checkpoint': str(checkpoint)}), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('phase', choices=['check', 'apply'])
    parser.add_argument('--manifest-sha', required=True)
    args = parser.parse_args()
    if args.phase == 'check':
        manifest, _ = preflight(args.manifest_sha)
        print(json.dumps({'marker': 'REVIEW_LIKES_PREFLIGHT_OK', 'commit': manifest['commit'], 'files': len(TARGETS)}))
    else:
        apply(args.manifest_sha)


if __name__ == '__main__':
    main()
