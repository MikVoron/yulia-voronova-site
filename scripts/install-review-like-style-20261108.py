#!/usr/bin/env python3
"""Install approved review-like spacing and transparent background refinements."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

BASE = Path(__file__).resolve().parent
ROOT = Path('/var/www/smartplate-platform')
NAMES = {'review-discussions.css', 'recipe.html', 'category.html', 'ingredient.html'}
MANIFEST_SHA = '48fdf321dddd90b97f776499c84e059c8e142ff987710f54aaf9b238447ef139'
PUBLIC_ORIGIN = 'https://plate.voronova.online'
# Collection and recipe pages need their real query context for server rendering.
PUBLIC_PATHS = {
    'review-discussions.css': '/review-discussions.css?release=3ece43be',
    'recipe.html': '/recipe.html?id=cutlets-chicken-nuggets-cornflakes&release=3ece43be',
    'category.html': '/category.html?cat=cutlets&release=3ece43be',
    'ingredient.html': '/ingredient.html?id=chicken&release=3ece43be',
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(*args):
    return subprocess.run(args, text=True, capture_output=True, check=True, timeout=30).stdout.strip()


def safe(path):
    if path.is_symlink() or path.resolve() != path or not path.is_file():
        raise RuntimeError('Unexpected path: ' + str(path))


def health():
    with urllib.request.urlopen('http://127.0.0.1:3000/health', timeout=5) as response:
        data = json.load(response)
    if data.get('status') != 'ok' or data.get('db') != 'ok':
        raise RuntimeError('API health failed')


def pid():
    rows = [row.split(None, 3) for row in run('ps', '-eo', 'pid=,uid=,gid=,args=').splitlines()]
    matches = [row for row in rows if len(row) == 4 and row[3] == 'node /var/www/smartplate-api/index.js']
    if len(matches) != 1 or matches[0][1:3] != ['997', '997']:
        raise RuntimeError('Unexpected API identity')
    return int(matches[0][0])


def atomic_copy(source, target):
    safe(target)
    fd, temporary = tempfile.mkstemp(prefix='.review-like-style-', dir=target.parent)
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


def public_bytes(name):
    url = PUBLIC_ORIGIN + PUBLIC_PATHS[name]
    request = urllib.request.Request(url, headers={'Cache-Control': 'no-cache'})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        raise RuntimeError('Public check failed: ' + url + ' (HTTP ' + str(error.code) + ')') from error


def public_matches(name, expected):
    body = public_bytes(name)
    if name.endswith('.html'):
        return b'review-discussions.css?v=20261108-like-spacing' in body
    return hashlib.sha256(body).hexdigest() == expected


def main():
    if sys.argv[1:] not in ([], ['--check']):
        raise RuntimeError('Usage: install.py [--check]')
    manifest_path = BASE / 'manifest.json'
    safe(manifest_path)
    if sha(manifest_path) != MANIFEST_SHA:
        raise RuntimeError('Manifest hash changed')
    manifest = json.loads(manifest_path.read_text())
    if set(manifest['files']) != NAMES:
        raise RuntimeError('Unexpected file scope')
    for name, row in manifest['files'].items():
        source, target = BASE / 'payload' / name, ROOT / name
        safe(source)
        safe(target)
        if sha(source) != row['new_sha256'] or sha(target) not in (row['old_sha256'], row['new_sha256']):
            raise RuntimeError('File changed since preflight: ' + name)
        if name.endswith('.js'):
            run('/usr/bin/node', '--check', str(source))
    health()
    original_pid = pid()
    # Catch invalid URLs before sudo writes, even when the new CSS is not installed.
    for name in NAMES:
        body = public_bytes(name)
        if name.endswith('.html') and b'review-discussions.css?' not in body:
            raise RuntimeError('Public page lacks the discussion stylesheet: ' + PUBLIC_PATHS[name])
    if sys.argv[1:] == ['--check']:
        print(json.dumps({'marker': 'REVIEW_LIKE_STYLE_PREFLIGHT_OK', 'files': len(NAMES), 'api_pid': original_pid}))
        return
    if os.geteuid() != 0:
        raise RuntimeError('Installation requires interactive sudo')
    changed = [name for name in manifest['files'] if sha(ROOT / name) != manifest['files'][name]['new_sha256']]
    backup = Path(tempfile.mkdtemp(prefix='smartplate-review-like-style-20261108-', dir='/root'))
    os.chmod(backup, 0o700)
    for name in changed:
        shutil.copy2(ROOT / name, backup / name)
        staged = backup / 'new' / name
        staged.parent.mkdir(exist_ok=True)
        shutil.copyfile(BASE / 'payload' / name, staged)
        row = manifest['files'][name]
        if sha(backup / name) != row['old_sha256'] or sha(staged) != row['new_sha256']:
            raise RuntimeError('Snapshot changed: ' + name)
    (backup / 'manifest.json').write_bytes(manifest_path.read_bytes())
    print('BACKUP=' + str(backup), flush=True)
    installed = []
    try:
        for name in changed:
            if sha(ROOT / name) != manifest['files'][name]['old_sha256']:
                raise RuntimeError('Production changed before installation: ' + name)
            atomic_copy(backup / 'new' / name, ROOT / name)
            installed.append(name)
        for name, row in manifest['files'].items():
            stat = (ROOT / name).stat()
            if sha(ROOT / name) != row['new_sha256'] or not public_matches(name, row['new_sha256']):
                raise RuntimeError('Installed/public hash mismatch: ' + name)
            if (stat.st_uid, stat.st_gid, stat.st_mode & 0o777) != (0, 0, 0o644):
                raise RuntimeError('Unexpected ownership or permissions: ' + name)
        health()
        if pid() != original_pid:
            raise RuntimeError('API PID changed during static release')
    except Exception:
        for name in reversed(installed):
            if sha(ROOT / name) != manifest['files'][name]['new_sha256']:
                raise RuntimeError('Refusing rollback over concurrent changes: ' + name)
            atomic_copy(backup / name, ROOT / name)
            if sha(ROOT / name) != manifest['files'][name]['old_sha256']:
                raise RuntimeError('Rollback hash mismatch: ' + name)
        print('REVIEW_LIKE_STYLE_ROLLED_BACK', flush=True)
        raise
    print(json.dumps({'marker': 'REVIEW_LIKE_STYLE_LIVE_OK', 'files': len(NAMES), 'api_pid': original_pid, 'commit': manifest['commit']}))


if __name__ == '__main__':
    main()
