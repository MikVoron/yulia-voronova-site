#!/usr/bin/env python3
"""Guarded one-file API fix. No database, account, or email writes."""
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
import urllib.parse
import urllib.request

BASE = Path(__file__).resolve().parent
RELEASE = 'review-identity-20261115'
NAME = 'server/src/review-discussions.js'
TARGET = Path('/var/www/smartplate-api/src/review-discussions.js')
BACKUPS = Path('/root/smartplate-rollbacks')
LOCK = Path('/run/lock/smartplate-review-identity.lock')
OLD_FIELDS = b'u.display_name, u.avatar, u.role, ra.position'
NEW_FIELDS = b'u.display_name, u.avatar, ra.position'
OLD_FLAG = b"    isAuthor: row.role === 'admin',"
NEW_FLAG = (b'    // Discussion replies always use the account identity. Only the separate\n'
            b'    // /admin/reviews/:id/reply action publishes on behalf of Yulia.\n'
            b'    isAuthor: false,')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def safe(path):
    if path.is_symlink() or path.resolve() != path.absolute() or not path.is_file():
        raise RuntimeError('Unexpected file path: ' + str(path))


def run(*args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=45)
    if result.returncode:
        raise RuntimeError(str(args[0]) + ': ' + result.stderr[-1500:])
    return result.stdout.strip()


def fetch(url):
    request = urllib.request.Request(url, headers={'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.load(response)


def health():
    for origin in ('http://127.0.0.1:3000', 'https://api.voronova.online'):
        data = fetch(origin + '/health')
        if data.get('status') != 'ok' or data.get('db') != 'ok':
            raise RuntimeError('API/database health failed: ' + origin)
    rows = [line.split(None, 3) for line in run('/usr/bin/ps', '-eo', 'pid=,uid=,gid=,args=').splitlines()]
    apps = [row for row in rows if len(row) == 4 and row[3] == 'node /var/www/smartplate-api/index.js']
    if len(apps) != 1 or apps[0][1:3] != ['997', '997']:
        raise RuntimeError('Expected one API process with UID/GID 997')
    return int(apps[0][0])


def restart():
    run('/usr/bin/env', 'PM2_HOME=/root/.pm2', '/usr/bin/pm2', 'restart', 'smartplate-api')
    for attempt in range(30):
        try:
            return health()
        except Exception:
            if attempt == 29:
                raise
            time.sleep(0.5)


def exact_patch(before, after):
    if before.count(OLD_FIELDS) != 1 or before.count(OLD_FLAG) != 1:
        raise RuntimeError('Unexpected baseline contract')
    if before.replace(OLD_FIELDS, NEW_FIELDS).replace(OLD_FLAG, NEW_FLAG) != after:
        raise RuntimeError('Payload contains changes outside the identity fix')


def preflight(manifest_sha):
    manifest_file = BASE / 'manifest.json'
    safe(manifest_file)
    if sha(manifest_file) != manifest_sha:
        raise RuntimeError('Manifest hash mismatch')
    manifest = json.loads(manifest_file.read_text())
    if manifest.get('release') != RELEASE or set(manifest.get('files', {})) != {NAME}:
        raise RuntimeError('Unexpected release scope')
    if sha(Path(__file__).resolve()) != manifest.get('installer_sha256'):
        raise RuntimeError('Installer hash mismatch')
    row = manifest['files'][NAME]
    before, source = BASE / 'before.js', BASE / 'payload' / NAME
    for file in (before, source, TARGET):
        safe(file)
    if sha(before) != row['before'] or sha(source) != row['after']:
        raise RuntimeError('Staged file hash mismatch')
    if sha(TARGET) not in (row['before'], row['after']):
        raise RuntimeError('Production changed since preflight')
    exact_patch(before.read_bytes(), source.read_bytes())
    run('/usr/bin/node', '--check', str(source))
    health()
    return manifest, source


def api_contract(recipe, require_personal):
    # Existing public data only. No artificial comments or authenticated writes.
    reviews = fetch('https://api.voronova.online/content/reviews/' + urllib.parse.quote(recipe, safe=''))
    if not isinstance(reviews, list) or not reviews:
        raise RuntimeError('Public reviews unavailable')
    comments = [comment for review in reviews for comment in review.get('comments', [])]
    if require_personal and any(comment.get('isAuthor') is not False for comment in comments):
        raise RuntimeError('A normal discussion message still has an author badge')
    page = fetch('https://api.voronova.online/content/reviews/' + str(reviews[0]['id']) + '/comments')
    if not isinstance(page.get('comments'), list) or not isinstance(page.get('hasMore'), bool):
        raise RuntimeError('Discussion pagination contract failed')
    if require_personal and any(comment.get('isAuthor') is not False for comment in page['comments']):
        raise RuntimeError('A paginated discussion message still has an author badge')
    return {'review_count': len(reviews), 'comments_checked': len(comments) + len(page['comments'])}


def verify(manifest):
    row = manifest['files'][NAME]
    safe(TARGET)
    if sha(TARGET) != row['after']:
        raise RuntimeError('Installed hash mismatch')
    stat = TARGET.stat()
    if (stat.st_uid, stat.st_gid, stat.st_mode & 0o777) != (0, 0, 0o644):
        raise RuntimeError('Installed ownership or mode mismatch')
    return {'api_pid': health(), **api_contract(manifest['smoke_recipe'], True)}


def atomic_copy(source, target):
    safe(target)
    fd, temporary = tempfile.mkstemp(prefix='.review-identity-', dir=target.parent)
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


def backup_directory():
    BACKUPS.mkdir(mode=0o700, parents=True, exist_ok=True)
    if BACKUPS.is_symlink() or BACKUPS.resolve() != BACKUPS or BACKUPS.stat().st_uid != 0:
        raise RuntimeError('Unexpected backup directory')
    return BACKUPS


def apply(manifest, source):
    if os.geteuid() != 0:
        raise RuntimeError('Installation requires interactive sudo; never pass a password to this script')
    row = manifest['files'][NAME]
    if sha(TARGET) == row['after']:
        return {'marker': 'REVIEW_IDENTITY_ALREADY_INSTALLED', **verify(manifest)}
    backup = Path(tempfile.mkdtemp(prefix=RELEASE + '-', dir=backup_directory()))
    os.chmod(backup, 0o700)
    previous, staged = backup / 'before.js', backup / 'after.js'
    shutil.copy2(TARGET, previous)
    shutil.copyfile(source, staged)
    (backup / 'manifest.json').write_bytes((BASE / 'manifest.json').read_bytes())
    if sha(previous) != row['before'] or sha(staged) != row['after']:
        raise RuntimeError('Protected snapshot hash mismatch')
    print('BACKUP=' + str(backup), flush=True)
    changed = False
    try:
        if sha(TARGET) != row['before']:
            raise RuntimeError('Production changed immediately before installation')
        atomic_copy(staged, TARGET)
        changed = True
        restart()
        result = verify(manifest)
    except Exception:
        if changed:
            if sha(TARGET) != row['after']:
                raise RuntimeError('Refusing rollback over concurrent changes')
            atomic_copy(previous, TARGET)
            if sha(TARGET) != row['before']:
                raise RuntimeError('Rollback hash mismatch')
            restart()
            print('REVIEW_IDENTITY_ROLLED_BACK', flush=True)
        raise
    return {'marker': 'REVIEW_IDENTITY_RELEASE_OK', 'commit': manifest['commit'],
            'backup': str(backup), **result}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest-sha', required=True)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    manifest, source = preflight(args.manifest_sha)
    if args.check:
        result = {'marker': 'REVIEW_IDENTITY_PREFLIGHT_OK', 'api_pid': health(),
                  **api_contract(manifest['smoke_recipe'], False)}
    elif args.verify:
        result = {'marker': 'REVIEW_IDENTITY_VERIFIED_OK', **verify(manifest)}
    else:
        if os.geteuid() != 0:
            raise RuntimeError('Installation requires interactive sudo')
        with LOCK.open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            # Repeat guards under the lock before modifying the API.
            manifest, source = preflight(args.manifest_sha)
            result = apply(manifest, source)
    print(json.dumps(result), flush=True)


if __name__ == '__main__':
    main()
