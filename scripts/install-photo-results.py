"""Guarded, exact-file release and explicitly authorized one-user email backfill."""
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
ALLOWED = {
    'server/src/review-photos.js': '/var/www/smartplate-api/src/review-photos.js',
    'server/src/review-photo-results.js': '/var/www/smartplate-api/src/review-photo-results.js',
    'server/src/routes/review-photos.js': '/var/www/smartplate-api/src/routes/review-photos.js',
    'server/src/email.js': '/var/www/smartplate-api/src/email.js',
    'platform/data-v2.js': '/var/www/smartplate-platform/data-v2.js',
    'platform/admin-review-photos.js': '/var/www/smartplate-platform/admin-review-photos.js',
}
MIGRATION = 'server/migrations/045_review_photo_results.sql'
HELPER = 'scripts/photo-result-zhenya.cjs'
LOCK = Path('/run/lock/smartplate-photo-results.lock')
BACKUP_ROOT = Path('/root')


def sha(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def safe(file, missing=False):
    file = Path(file)
    if file.is_symlink() or file.resolve() != file.absolute() or (not missing and not file.is_file()):
        raise RuntimeError('Unexpected file: ' + str(file))


def run(args, timeout=180):
    result = subprocess.run([str(a) for a in args], text=True, capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(str(args[0]) + ': ' + result.stderr[-1600:] + result.stdout[-1600:])
    return result.stdout


def health():
    with urllib.request.urlopen('http://127.0.0.1:3000/health', timeout=10) as response:
        data = json.load(response)
    if data.get('status') != 'ok' or data.get('db') != 'ok':
        raise RuntimeError('API health failed')
    rows = [line.split(None, 3) for line in run(['/usr/bin/ps', '-eo', 'pid=,uid=,gid=,args=']).splitlines()]
    apps = [r for r in rows if len(r) == 4 and r[3] == 'node /var/www/smartplate-api/index.js']
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


def http_status(url, expected, method='GET', basic=False):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, method=method), timeout=20) as response:
            if response.status != expected:
                raise RuntimeError('Unexpected public/private status: ' + url)
    except urllib.error.HTTPError as error:
        if error.code != expected or (basic and not error.headers.get('WWW-Authenticate', '').lower().startswith('basic ')):
            raise RuntimeError('Unexpected authorization response: ' + url) from error
        error.close()


def verify(rows):
    for row in rows:
        target = Path(row['target'])
        safe(target)
        stat = target.stat()
        if sha(target) != row['after'] or (stat.st_uid, stat.st_gid, stat.st_mode & 0o777) != (0, 0, 0o644):
            raise RuntimeError('Installed hash/permission mismatch: ' + row['file'])
        if row['file'] == 'platform/data-v2.js':
            with urllib.request.urlopen('https://plate.voronova.online/data-v2.js?v=20261115-photo-results', timeout=20) as response:
                if hashlib.sha256(response.read()).hexdigest() != row['after']:
                    raise RuntimeError('Public script hash mismatch')
                if 'no-cache' not in response.headers.get('Cache-Control', ''):
                    raise RuntimeError('Shared client must be revalidated by browsers')
    http_status('https://plate.voronova.online/admin-review-photos.js', 401, basic=True)
    for method, path in [('GET', '/content/review-photo-results'), ('POST', '/content/review-photo-results/read'),
                         ('GET', '/content/review-like-notifications')]:
        http_status('http://127.0.0.1:3000' + path, 401, method=method)
    return health()


def sql(text):
    return run(['/usr/bin/sudo', '-n', '-u', 'postgres', '/usr/bin/psql', '-X', '-v', 'ON_ERROR_STOP=1', '-d', 'smartplate_db', '-At', '-c', text])


def load(expected):
    manifest = BASE / 'manifest.json'
    safe(manifest)
    if sha(manifest) != expected:
        raise RuntimeError('Manifest changed')
    plan = json.loads(manifest.read_text())
    rows = plan['files']
    if len(rows) != len(ALLOWED) or {r['file']: r['target'] for r in rows} != ALLOWED:
        raise RuntimeError('Unexpected release scope')
    for row in rows:
        source, target = BASE / 'runtime' / row['file'], Path(row['target'])
        safe(source)
        safe(target, missing=row['before'] is None)
        before = sha(target) if target.exists() else None
        if before not in (row['before'], row['after']) or sha(source) != row['after']:
            raise RuntimeError('Production drift or payload changed: ' + row['file'])
        run(['/usr/bin/node', '--check', source])
    for key, expected_file in [('migration', MIGRATION), ('helper', HELPER)]:
        row = plan[key]
        source = BASE / 'runtime' / expected_file
        safe(source)
        if row['file'] != expected_file or sha(source) != row['sha256']:
            raise RuntimeError('Unexpected migration/helper')
    return rows


def atomic_copy(source, target):
    target = Path(target)
    safe(target, missing=True)
    fd, temporary = tempfile.mkstemp(prefix='.photo-results-', dir=target.parent)
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


def zhenya(backup, mode):
    # Root-owned helper is readable by the API user; its parent contains only
    # these reviewed source files, never DB dumps, credentials or old files.
    directory = Path('/var/lib/smartplate-photo-result-tools')
    if directory.exists():
        safe(directory / 'zhenya.cjs', missing=True)
        if directory.is_symlink() or directory.stat().st_uid != 0:
            raise RuntimeError('Unexpected helper directory')
    else:
        directory.mkdir(mode=0o755)
        os.chmod(directory, 0o755)
    helper = directory / 'zhenya.cjs'
    atomic_copy(backup / 'runtime' / HELPER, helper)
    return run(['/usr/bin/sudo', '-n', '-u', 'smartplate-api', '/usr/bin/node', helper, mode, '2026-11-15'])


def install(rows, send_zhenya, manifest_sha):
    if os.geteuid() != 0:
        raise RuntimeError('Run the prepared command with interactive sudo')
    os.umask(0o077)
    with open(LOCK, 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        backup = Path(tempfile.mkdtemp(prefix='smartplate-photo-results-20261115-', dir=BACKUP_ROOT))
        for row in rows:
            target = Path(row['target'])
            if target.exists():
                dest = backup / 'before' / row['file']
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(target, dest)
        shutil.copy2(BASE / 'manifest.json', backup / 'manifest.json')
        if sha(backup / 'manifest.json') != manifest_sha:
            raise RuntimeError('Manifest changed during snapshot')
        for file in [r['file'] for r in rows] + [MIGRATION, HELPER]:
            source = BASE / 'runtime' / file
            safe(source)
            dest = backup / 'runtime' / file
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, dest)
        for row in rows:
            if sha(backup / 'runtime' / row['file']) != row['after']:
                raise RuntimeError('Snapshot changed')
        plan = json.loads((backup / 'manifest.json').read_text())
        for key in ['migration', 'helper']:
            row = plan[key]
            if sha(backup / 'runtime' / row['file']) != row['sha256']:
                raise RuntimeError('Snapshot helper/migration changed')
        already = all(Path(r['target']).exists() and sha(r['target']) == r['after'] for r in rows)
        if not already:
            if any((sha(r['target']) if Path(r['target']).exists() else None) != r['before'] for r in rows):
                raise RuntimeError('Partial installation; stop for review')
            checkpoint = run(['/bin/bash', '/home/smartplate-admin/api-checkpoint-20260909.sh', '--create'], timeout=300)
            if 'CHECKPOINT_OK' not in checkpoint:
                raise RuntimeError('Checkpoint failed')
            print(checkpoint, flush=True)
            dump = run(['/usr/bin/sudo', '-n', '-u', 'postgres', '/usr/bin/pg_dump', '-d', 'smartplate_db', '--schema-only'])
            (backup / 'schema-before.sql').write_text(dump)
            migration = (backup / 'runtime' / MIGRATION).read_text()
            sql("SET lock_timeout='5s'; " + migration)
            installed = []
            try:
                for row in rows:
                    current = sha(row['target']) if Path(row['target']).exists() else None
                    if current != row['before']:
                        raise RuntimeError('Concurrent production change')
                    atomic_copy(backup / 'runtime' / row['file'], row['target'])
                    installed.append(row)
                restart()
                verify(rows)
            except Exception:
                if any(sha(r['target']) != r['after'] for r in installed):
                    raise RuntimeError('Concurrent changes; refusing automatic rollback')
                for row in reversed(installed):
                    if row['before'] is None:
                        Path(row['target']).unlink()
                    else:
                        atomic_copy(backup / 'before' / row['file'], row['target'])
                restart()
                print('PHOTO_RESULTS_ROLLED_BACK; additive queue retained', flush=True)
                raise
        print(json.dumps({'marker': 'PHOTO_RESULTS_RELEASE_OK', 'files': len(rows), 'api_pid': verify(rows), 'backup': str(backup)}), flush=True)
        # Mail is irreversible: run only AFTER successful release verification.
        # Never roll back a verified release because of an address/SMTP problem.
        if send_zhenya:
            try:
                print(zhenya(backup, 'inspect'), end='', flush=True)
                print(zhenya(backup, 'send'), end='', flush=True)
            except Exception as error:
                print('ZHENYA_EMAIL_PENDING: ' + str(error), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest-sha', required=True)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--verify', action='store_true')
    parser.add_argument('--send-zhenya', action='store_true')
    args = parser.parse_args()
    rows = load(args.manifest_sha)
    if args.check:
        print(json.dumps({'marker': 'PHOTO_RESULTS_PREFLIGHT_OK', 'files': len(rows), 'api_pid': health()}))
    elif args.verify:
        print(json.dumps({'marker': 'PHOTO_RESULTS_RELEASE_OK', 'api_pid': verify(rows)}))
    else:
        install(rows, args.send_zhenya, args.manifest_sha)


if __name__ == '__main__':
    main()
