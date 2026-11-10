"""Install only the four reviewed registration-audit runtime files."""
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
    'server/src/routes/auth.js': '/var/www/smartplate-api/src/routes/auth.js',
    'server/src/routes/admin.js': '/var/www/smartplate-api/src/routes/admin.js',
    'platform/admin.js': '/var/www/smartplate-platform/admin.js',
    'platform/admin.html': '/var/www/smartplate-platform/admin.html',
}


def sha(file):
    return hashlib.sha256(Path(file).read_bytes()).hexdigest()


def safe(file):
    if file.is_symlink() or file.resolve() != file.absolute():
        raise RuntimeError('Unexpected resolved path: ' + str(file))


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
    fd, temporary = tempfile.mkstemp(prefix='.registration-audit-', dir=target.parent)
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


def api_contract():
    # No login requests, email sends, or fabricated audit entries in production.
    request = urllib.request.Request('http://127.0.0.1:3000/admin/audit?event=registration_incomplete')
    try:
        urllib.request.urlopen(request, timeout=10)
        raise RuntimeError('Unauthenticated admin access unexpectedly accepted')
    except urllib.error.HTTPError as error:
        if error.code != 401:
            raise RuntimeError('Admin audit route is missing or unprotected')


def verify(rows):
    api_contract()
    for row in rows:
        target = Path(row['target'])
        if sha(target) != row['after']:
            raise RuntimeError('Installed hash mismatch: ' + row['file'])
        stat = target.stat()
        if (stat.st_uid, stat.st_gid, stat.st_mode & 0o777) != (0, 0, 0o644):
            raise RuntimeError('Installed permissions mismatch')
        if row['file'].startswith('platform/'):
            request = urllib.request.Request(
                'https://plate.voronova.online/' + target.name + '?v=20261110-registration-audit',
                headers={'Cache-Control': 'no-cache'})
            with urllib.request.urlopen(request, timeout=20) as response:
                if hashlib.sha256(response.read()).hexdigest() != row['after']:
                    raise RuntimeError('Public hash mismatch: ' + row['file'])
    return health()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest-sha', required=True)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--verify', action='store_true')
    options = parser.parse_args()
    manifest = BASE / 'manifest.json'
    safe(manifest)
    if sha(manifest) != options.manifest_sha:
        raise RuntimeError('Manifest changed')
    rows = json.loads(manifest.read_text())['files']
    if len(rows) != len(ALLOWED) or {row['file']: row['target'] for row in rows} != ALLOWED:
        raise RuntimeError('Unexpected runtime scope')
    for row in rows:
        source, target = BASE / 'runtime' / row['file'], Path(row['target'])
        safe(source)
        safe(target)
        if sha(source) != row['after'] or sha(target) not in (row['before'], row['after']):
            raise RuntimeError('Payload mismatch or production drift: ' + row['file'])
        if source.suffix == '.js':
            run(['/usr/bin/node', '--check', source])
    pid = health()
    if options.check:
        api_contract()
        print(json.dumps({'marker': 'REGISTRATION_AUDIT_PREFLIGHT_OK', 'files': len(rows), 'api_pid': pid}))
        return
    if options.verify:
        print(json.dumps({'marker': 'REGISTRATION_AUDIT_INSTALLED_OK', 'api_pid': verify(rows)}))
        return
    if os.geteuid() != 0:
        raise RuntimeError('Use interactive sudo in the Timeweb console')
    os.umask(0o077)
    with open('/run/lock/smartplate-registration-audit.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if all(sha(row['target']) == row['after'] for row in rows):
            print(json.dumps({'marker': 'REGISTRATION_AUDIT_INSTALLED_OK', 'api_pid': verify(rows)}))
            return
        if not all(sha(row['target']) == row['before'] for row in rows):
            raise RuntimeError('Partial or concurrent installation; review before proceeding')
        checkpoint = run(['/bin/bash', '/home/smartplate-admin/api-checkpoint-20260909.sh', '--create'], timeout=300)
        if 'CHECKPOINT_OK' not in checkpoint:
            raise RuntimeError('Checkpoint did not complete')
        print(checkpoint, flush=True)
        backup = Path(tempfile.mkdtemp(prefix='smartplate-registration-audit-20261110-', dir='/root'))
        os.chmod(backup, 0o700)
        for row in rows:
            for folder, source in [('before', Path(row['target'])), ('after', BASE / 'runtime' / row['file'])]:
                copy = backup / folder / row['file']
                copy.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, copy)
                if sha(copy) != row[folder]:
                    raise RuntimeError('Snapshot changed during copy')
        shutil.copy2(manifest, backup / 'manifest.json')
        print('BACKUP=' + str(backup), flush=True)
        installed = []
        try:
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
                    api_contract()
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
            print('REGISTRATION_AUDIT_ROLLED_BACK', flush=True)
            raise
        print(json.dumps({'marker': 'REGISTRATION_AUDIT_INSTALLED_OK', 'files': len(rows), 'api_pid': pid, 'backup': str(backup)}))


if __name__ == '__main__':
    main()
