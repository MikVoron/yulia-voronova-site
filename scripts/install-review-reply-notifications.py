#!/usr/bin/env python3
"""Exact-file release with a database checkpoint; no historical email backfill."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

BASE = Path(__file__).resolve().parent
RELEASE = 'review-reply-notifications-20261115'
MIGRATION = 'server/migrations/046_review_reply_notifications.sql'
API_FILES = ['server/src/review-reply-notifications.js', 'server/src/email.js',
             'server/src/review-discussions.js', 'server/src/routes/content.js']
PLATFORM_FILES = ['data-v2.js', 'review-reply-settings.js', 'cabinet.html', 'admin.html',
                  'auth-callback.html', 'category.html', 'index.html', 'ingredient.html',
                  'login.html', 'recipe-editor.html', 'recipe.html']
ALLOWED = {name: '/var/www/smartplate-api/' + name.removeprefix('server/') for name in API_FILES}
ALLOWED.update({'platform/' + name: '/var/www/smartplate-platform/' + name for name in PLATFORM_FILES})
LOCK = Path('/run/lock/smartplate-review-reply-notifications.lock')
BACKUPS = Path('/root/smartplate-rollbacks')
VERSION = b'20261115-reply-notifications'


def sha(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def safe(file, missing=False):
    file = Path(file)
    if file.is_symlink() or file.resolve() != file.absolute() or (not missing and not file.is_file()):
        raise RuntimeError('Unexpected path: ' + str(file))


def run(args, timeout=180):
    result = subprocess.run([str(a) for a in args], text=True, capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(str(args[0]) + ': ' + result.stderr[-1400:] + result.stdout[-1400:])
    return result.stdout


def response(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'Cache-Control': 'no-cache'}), timeout=20) as r:
        return r.read()


def health():
    for origin in ('http://127.0.0.1:3000', 'https://api.voronova.online'):
        data = json.loads(response(origin + '/health'))
        if data.get('status') != 'ok' or data.get('db') != 'ok':
            raise RuntimeError('API/database unhealthy')
    apps = [r for r in (line.split(None, 3) for line in run(['/usr/bin/ps', '-eo', 'pid=,uid=,gid=,args=']).splitlines())
            if len(r) == 4 and r[3] == 'node /var/www/smartplate-api/index.js']
    if len(apps) != 1 or apps[0][1:3] != ['997', '997']:
        raise RuntimeError('Expected one API with UID/GID 997')
    return int(apps[0][0])


def restart():
    run(['/usr/bin/env', 'PM2_HOME=/root/.pm2', '/usr/bin/pm2', 'restart', 'smartplate-api'])
    for attempt in range(30):
        try:
            return health()
        except Exception:
            if attempt == 29:
                raise
            time.sleep(.5)


def sql(text):
    return run(['/usr/bin/sudo', '-n', '-u', 'postgres', '/usr/bin/psql', '-X', '-v', 'ON_ERROR_STOP=1',
                '-d', 'smartplate_db', '-At', '-c', text])


def load(expected):
    safe(BASE / 'manifest.json')
    if sha(BASE / 'manifest.json') != expected:
        raise RuntimeError('Manifest hash mismatch')
    plan = json.loads((BASE / 'manifest.json').read_text())
    rows = plan['files']
    if plan.get('release') != RELEASE or [r['file'] for r in rows] != list(ALLOWED) or {r['file']: r['target'] for r in rows} != ALLOWED:
        raise RuntimeError('Unexpected release scope')
    if sha(Path(__file__).resolve()) != plan['installer_sha256']:
        raise RuntimeError('Installer changed')
    for row in rows:
        source, target = BASE / 'runtime' / row['file'], Path(row['target'])
        safe(source)
        safe(target, missing=row['before'] is None)
        if (sha(target) if target.exists() else None) not in (row['before'], row['after']) or sha(source) != row['after']:
            raise RuntimeError('Production drift or payload mismatch: ' + row['file'])
        if source.suffix == '.js':
            run(['/usr/bin/node', '--check', source])
    migration = plan['migration']
    safe(BASE / 'runtime' / MIGRATION)
    if migration['file'] != MIGRATION or sha(BASE / 'runtime' / MIGRATION) != migration['sha256']:
        raise RuntimeError('Unexpected migration')
    return plan


def denied(url, method='GET', basic=False):
    try:
        urllib.request.urlopen(urllib.request.Request(url, method=method), timeout=20).close()
    except urllib.error.HTTPError as error:
        if error.code == 401 and (not basic or error.headers.get('WWW-Authenticate', '').lower().startswith('basic ')):
            error.close()
            return
        raise
    raise RuntimeError('Authentication unexpectedly allowed: ' + url)


def verify(plan):
    for row in plan['files']:
        target = Path(row['target'])
        safe(target)
        stat = target.stat()
        if sha(target) != row['after'] or (stat.st_uid, stat.st_gid, stat.st_mode & 0o777) != (0, 0, 0o644):
            raise RuntimeError('Installed hash or permissions: ' + row['file'])
        if not row['file'].startswith('platform/'):
            continue
        name = target.name
        url = 'https://plate.voronova.online/' + name
        if name in ('admin.html', 'recipe-editor.html'):
            denied(url, basic=True)
        elif name in ('recipe.html', 'category.html', 'ingredient.html', 'index.html'):
            route, query = {'recipe.html': ('recipe', '?id=side-tomato-oatmeal'), 'category.html': ('category', '?cat=cutlets'),
                            'ingredient.html': ('ingredient', '?id=chicken'), 'index.html': ('home', '')}[name]
            public = response(url + query)
            local = response('http://127.0.0.1:3000/_seo/' + route + query)
            if public != local:
                public = response(url + query)
                local = response('http://127.0.0.1:3000/_seo/' + route + query)
            if public != local or VERSION not in public:
                raise RuntimeError('SEO renderer parity or client version: ' + name)
        elif hashlib.sha256(response(url + '?v=' + VERSION.decode())).hexdigest() != row['after']:
            raise RuntimeError('Public hash: ' + name)
    for host in ('http://127.0.0.1:3000', 'https://plate.voronova.online/api'):
        for method, endpoint in [('GET', '/auth/review-reply-settings'), ('PUT', '/auth/review-reply-settings'),
                                 ('GET', '/content/review-reply-notifications'), ('POST', '/content/review-reply-notifications/read')]:
            denied(host + endpoint, method)
    return {'api_pid': health(), 'files': len(plan['files'])}


def atomic_copy(source, target):
    target = Path(target)
    safe(target, missing=True)
    fd, temporary = tempfile.mkstemp(prefix='.review-reply-', dir=target.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(Path(source).read_bytes())
            stream.flush()
            os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), 0o644)
            os.fchown(stream.fileno(), 0, 0)
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def backup_directory():
    BACKUPS.mkdir(mode=0o700, parents=True, exist_ok=True)
    if BACKUPS.is_symlink() or BACKUPS.resolve() != BACKUPS or BACKUPS.stat().st_uid != 0:
        raise RuntimeError('Unexpected checkpoint directory')
    return BACKUPS


def install(plan, manifest_sha):
    if os.geteuid() != 0:
        raise RuntimeError('Requires the prepared interactive sudo command')
    rows = plan['files']
    if all(Path(r['target']).exists() and sha(r['target']) == r['after'] for r in rows):
        return {'marker': 'REVIEW_REPLY_NOTIFICATIONS_ALREADY_INSTALLED', **verify(plan)}
    if any((sha(r['target']) if Path(r['target']).exists() else None) != r['before'] for r in rows):
        raise RuntimeError('Partial installation; stop for review')
    os.umask(0o077)
    backup = Path(tempfile.mkdtemp(prefix=RELEASE + '-', dir=backup_directory()))
    shutil.copy2(BASE / 'manifest.json', backup / 'manifest.json')
    if sha(backup / 'manifest.json') != manifest_sha:
        raise RuntimeError('Manifest changed during snapshot')
    for file in [r['file'] for r in rows] + [MIGRATION]:
        source, dest = BASE / 'runtime' / file, backup / 'runtime' / file
        safe(source)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, dest)
        expected = plan['migration']['sha256'] if file == MIGRATION else next(r['after'] for r in rows if r['file'] == file)
        if sha(dest) != expected:
            raise RuntimeError('Snapshot hash mismatch: ' + file)
    for row in rows:
        if row['before'] is not None:
            previous = backup / 'before' / row['file']
            previous.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(row['target'], previous)
            if sha(previous) != row['before']:
                raise RuntimeError('Production changed before snapshot')
    checkpoint = run(['/bin/bash', '/home/smartplate-admin/api-checkpoint-20260909.sh', '--create'], timeout=300)
    if 'CHECKPOINT_OK' not in checkpoint:
        raise RuntimeError('Database checkpoint failed')
    print(checkpoint, flush=True)
    (backup / 'schema-before.sql').write_text(run(['/usr/bin/sudo', '-n', '-u', 'postgres', '/usr/bin/pg_dump', '-d', 'smartplate_db', '--schema-only']))
    migration = (backup / 'runtime' / MIGRATION).read_text()
    # Verify DDL against the live schema under rollback before the real migration.
    sql("SET lock_timeout='5s'; " + migration.replace('COMMIT;', 'ROLLBACK;'))
    sql("SET lock_timeout='5s'; " + migration)
    installed = []
    try:
        # API modules first; restart and health check before changing public clients.
        for row in rows:
            if (sha(row['target']) if Path(row['target']).exists() else None) != row['before']:
                raise RuntimeError('Concurrent production change: ' + row['file'])
            atomic_copy(backup / 'runtime' / row['file'], row['target'])
            installed.append(row)
            if row['file'] == API_FILES[-1]:
                restart()
        result = verify(plan)
    except Exception:
        if any(sha(r['target']) != r['after'] for r in installed):
            raise RuntimeError('Concurrent changes; refusing rollback')
        for row in reversed(installed):
            if row['before'] is None:
                Path(row['target']).unlink()
            else:
                atomic_copy(backup / 'before' / row['file'], row['target'])
        restart()
        print('REVIEW_REPLY_NOTIFICATIONS_ROLLED_BACK; additive schema retained', flush=True)
        raise
    return {'marker': 'REVIEW_REPLY_NOTIFICATIONS_RELEASE_OK', 'commit': plan['commit'], 'backup': str(backup), **result}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest-sha', required=True)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    plan = load(args.manifest_sha)
    if args.check:
        result = {'marker': 'REVIEW_REPLY_NOTIFICATIONS_PREFLIGHT_OK', 'api_pid': health(), 'files': len(plan['files'])}
    elif args.verify:
        result = {'marker': 'REVIEW_REPLY_NOTIFICATIONS_VERIFIED_OK', **verify(plan)}
    else:
        with LOCK.open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = install(plan, args.manifest_sha)
    print(json.dumps(result), flush=True)


if __name__ == '__main__':
    main()
