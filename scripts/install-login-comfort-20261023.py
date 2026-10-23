#!/usr/bin/env python3
"""Guarded code-only installer. Uses the existing PM2 configuration, never edits it."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import urllib.request
import urllib.error

BASE = Path(__file__).resolve().parent
TARGETS = {
    'platform/login.css': '/var/www/smartplate-platform/login.css',
    'platform/login.js': '/var/www/smartplate-platform/login.js',
    'platform/login.html': '/var/www/smartplate-platform/login.html',
    'server/src/routes/auth.js': '/var/www/smartplate-api/src/routes/auth.js',
}
API_PATH = 'server/src/routes/auth.js'


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def run(*command):
    return subprocess.run(command, check=True, text=True, capture_output=True).stdout.strip()


def health():
    with urllib.request.urlopen('http://127.0.0.1:3000/health', timeout=5) as response:
        data = json.load(response)
    if data.get('status') != 'ok' or data.get('db') != 'ok':
        raise RuntimeError('API health is not ok')


def api_identity():
    rows = run('ps', '-eo', 'pid=,ppid=,uid=,gid=,args=').splitlines()
    processes = [line.split(None, 4) for line in rows
                 if len(line.split(None, 4)) == 5
                 and line.split(None, 4)[4].rstrip() == 'node /var/www/smartplate-api/index.js']
    if len(processes) != 1 or processes[0][2:4] != ['997', '997']:
        raise RuntimeError('Expected exactly one API process with UID/GID 997')
    return processes[0][0]


def restart_api():
    run('/usr/bin/env', 'PM2_HOME=/root/.pm2', '/usr/bin/pm2', 'restart', 'smartplate-api')
    for attempt in range(30):
        try:
            health()
            return api_identity()
        except Exception:
            if attempt == 29:
                raise
            time.sleep(0.5)


def atomic_install(source, target):
    data = source.read_bytes()
    descriptor, temporary = tempfile.mkstemp(prefix='.login-comfort-', dir=target.parent)
    try:
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), 0o644)
            os.fchown(stream.fileno(), 0, 0)
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def api_smoke():
    # Malformed input is rejected before reading/writing login codes or sending mail.
    request = urllib.request.Request('http://127.0.0.1:3000/auth/verify',
        data=json.dumps({'email': 'release-check@example.invalid', 'code': 'bad'}).encode(),
        headers={'Content-Type': 'application/json'}, method='POST')
    try:
        urllib.request.urlopen(request, timeout=5)
        raise RuntimeError('Malformed-code smoke unexpectedly succeeded')
    except urllib.error.HTTPError as error:
        body = json.load(error)
        if error.code != 400 or body.get('reason') != 'INVALID_CODE_FORMAT':
            raise RuntimeError('New API behavior smoke failed')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('phase', choices=['check', 'api', 'frontend'])
    parser.add_argument('--manifest-sha', required=True)
    parser.add_argument('--checkpoint', type=Path)
    options = parser.parse_args()
    manifest_path = BASE / 'manifest.json'
    if sha(manifest_path) != options.manifest_sha:
        raise RuntimeError('Manifest hash mismatch')
    manifest = json.loads(manifest_path.read_text())
    entries = {row['path']: row for row in manifest['files']}
    if set(entries) != set(TARGETS):
        raise RuntimeError('Unexpected file scope')
    for name, destination in TARGETS.items():
        source = BASE / 'payload' / name
        target = Path(destination)
        if source.is_symlink() or not source.is_file() or source.resolve() != source:
            raise RuntimeError('Invalid staged path: ' + name)
        if target.is_symlink() or target.resolve() != target:
            raise RuntimeError('Invalid target path: ' + name)
        if sha(source) != entries[name]['new_sha256']:
            raise RuntimeError('Staged hash mismatch: ' + name)
        if sha(target) not in (entries[name]['old_sha256'], entries[name]['new_sha256']):
            raise RuntimeError('Production file changed since preflight: ' + name)
        if source.suffix == '.js':
            run('node', '--check', str(source))
    health()
    pid_before = api_identity()
    if options.phase == 'check':
        print(json.dumps({'marker': 'LOGIN_COMFORT_PREFLIGHT_OK', 'api_pid': pid_before,
                          'commit': manifest['commit'], 'files': len(entries)}))
        return
    if os.geteuid() != 0:
        raise RuntimeError('Installation requires interactive sudo; do not pass a password to this script')
    if options.phase == 'api':
        checkpoint = options.checkpoint
        if (not checkpoint or not str(checkpoint).startswith('/root/smartplate-rollbacks/')
                or checkpoint.is_symlink() or not checkpoint.is_dir()
                or checkpoint.resolve() != checkpoint or checkpoint.stat().st_uid != 0
                or time.time() - checkpoint.stat().st_mtime > 86400):
            raise RuntimeError('A fresh root-owned checkpoint directory is required')
        selected = [API_PATH]
    else:
        if sha(Path(TARGETS[API_PATH])) != entries[API_PATH]['new_sha256']:
            raise RuntimeError('Install and verify the API phase first')
        api_smoke()
        selected = ['platform/login.css', 'platform/login.js', 'platform/login.html']
    changed = [name for name in selected if sha(Path(TARGETS[name])) != entries[name]['new_sha256']]
    if not changed:
        print('LOGIN_COMFORT_' + options.phase.upper() + '_ALREADY_INSTALLED')
        return
    backup = Path(tempfile.mkdtemp(prefix='smartplate-login-comfort-', dir='/root'))
    os.chmod(backup, 0o700)
    for name in changed:
        copy = backup / name
        copy.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(TARGETS[name], copy)
        staged = backup / 'staged' / name
        staged.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(BASE / 'payload' / name, staged)
        if sha(staged) != entries[name]['new_sha256']:
            raise RuntimeError('Staged source changed while making the root-owned snapshot: ' + name)
    (backup / 'manifest.json').write_bytes(manifest_path.read_bytes())
    print('BACKUP=' + str(backup), flush=True)
    installed = []
    try:
        for name in changed:
            if sha(Path(TARGETS[name])) != entries[name]['old_sha256']:
                raise RuntimeError('Production target changed before install: ' + name)
            atomic_install(backup / 'staged' / name, Path(TARGETS[name]))
            installed.append(name)
            if sha(Path(TARGETS[name])) != entries[name]['new_sha256']:
                raise RuntimeError('Installed hash mismatch: ' + name)
        if options.phase == 'api':
            restart_api()
            api_smoke()
        else:
            # A static release must not restart the API.
            if api_identity() != pid_before:
                raise RuntimeError('API PID changed during static installation')
            health()
    except Exception:
        for name in reversed(installed):
            if sha(Path(TARGETS[name])) != entries[name]['new_sha256']:
                raise RuntimeError('Refusing rollback over an unexpected concurrent change: ' + name)
            atomic_install(backup / name, Path(TARGETS[name]))
            if sha(Path(TARGETS[name])) != entries[name]['old_sha256']:
                raise RuntimeError('Rollback hash mismatch: ' + name)
        if options.phase == 'api' and installed:
            restart_api()
        print('LOGIN_COMFORT_' + options.phase.upper() + '_ROLLED_BACK', flush=True)
        raise
    print('LOGIN_COMFORT_' + options.phase.upper() + '_RELEASE_OK', flush=True)


if __name__ == '__main__':
    main()
