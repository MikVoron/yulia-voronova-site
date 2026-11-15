#!/usr/bin/env python3
"""Scoped greeting release. No migrations, dependency installs, or content writes."""
import argparse
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import tempfile
import urllib.parse
import urllib.request

BASE = Path(__file__).resolve().parent
RELEASE = 'review-recipients-20261115'
API = 'server/src/routes/content.js'
FILES = [API] + ['platform/' + name for name in (
    'review-discussions.js', 'review-discussions.css', 'recipe-page.js',
    'category-page.js', 'recipe.html', 'category.html', 'ingredient.html')]
TARGETS = {name: Path('/var/www/smartplate-api/src/routes/content.js') if name == API
           else Path('/var/www/smartplate-platform') / Path(name).name for name in FILES}
PAGES = {'recipe.html': ('recipe', '?id=cutlets-chicken-nuggets-cornflakes'),
         'category.html': ('category', '?cat=cutlets'), 'ingredient.html': ('ingredient', '?id=chicken')}
VERSION = b'20261115-reply-recipient'
COMMON_SHA = 'f10f9f5b86dee27916394bcb839be03b5c37b50c3736f180d7288dda170ad196'
common_path = BASE / 'install-review-identity-20261115.py'
if common_path.is_symlink() or hashlib.sha256(common_path.read_bytes()).hexdigest() != COMMON_SHA:
    raise RuntimeError('Shared release-helper hash mismatch')
spec = importlib.util.spec_from_file_location('identity_release_helpers', common_path)
common = importlib.util.module_from_spec(spec)
spec.loader.exec_module(common)


def preflight(manifest_sha):
    file = BASE / 'manifest.json'
    common.safe(file)
    if common.sha(file) != manifest_sha:
        raise RuntimeError('Manifest hash mismatch')
    manifest = json.loads(file.read_text())
    if manifest.get('release') != RELEASE or set(manifest.get('files', {})) != set(FILES):
        raise RuntimeError('Unexpected release scope')
    if common.sha(Path(__file__).resolve()) != manifest.get('installer_sha256'):
        raise RuntimeError('Installer hash mismatch')
    for name in FILES:
        source, target, row = BASE / 'payload' / name, TARGETS[name], manifest['files'][name]
        common.safe(source)
        common.safe(target)
        if common.sha(source) != row['after']:
            raise RuntimeError('Payload hash mismatch: ' + name)
        if common.sha(target) not in (row['before'], row['after']):
            raise RuntimeError('Production changed: ' + name)
        if source.suffix == '.js':
            common.run('/usr/bin/node', '--check', str(source))
    common.health()
    return manifest


def response(url):
    request = urllib.request.Request(url, headers={'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(request, timeout=20) as stream:
        return stream.read()


def public_contract(manifest, installed):
    reviews = common.fetch('https://api.voronova.online/content/reviews/cutlets-chicken-nuggets-cornflakes')
    if not isinstance(reviews, list) or not reviews:
        raise RuntimeError('Existing public reviews unavailable')
    if installed:
        for review in reviews:
            name = review.get('authorName')
            if ('authorName' not in review
                    or (name is None and review.get('author') != 'Аноним')
                    or (name is not None and (not isinstance(name, str) or not name.strip()
                                             or name != name.strip() or name != review.get('author')))):
                raise RuntimeError('Public author-name contract failed')
    for name in FILES[1:]:
        filename = Path(name).name
        if filename in PAGES:
            route, query = PAGES[filename]
            served = response('https://plate.voronova.online/' + filename + query)
            expected = response('http://127.0.0.1:3000/_seo/' + route + query)
            if served != expected:
                # Accept a legitimate rating change only with immediate renderer parity.
                expected = response('http://127.0.0.1:3000/_seo/' + route + query)
                if served != expected:
                    raise RuntimeError('Public/renderer mismatch: ' + filename)
            if installed and (b'review-discussions.js?v=' + VERSION not in served
                              or b'review-discussions.css?v=' + VERSION not in served):
                raise RuntimeError('Public page uses old greeting assets: ' + filename)
        else:
            body = response('https://plate.voronova.online/' + filename + '?v=' + VERSION.decode())
            expected_hash = manifest['files'][name]['after'] if installed else common.sha(TARGETS[name])
            if hashlib.sha256(body).hexdigest() != expected_hash:
                raise RuntimeError('Served asset hash mismatch: ' + filename)


def verify(manifest):
    for name in FILES:
        target = TARGETS[name]
        common.safe(target)
        stat = target.stat()
        if common.sha(target) != manifest['files'][name]['after']:
            raise RuntimeError('Installed hash mismatch: ' + name)
        if (stat.st_uid, stat.st_gid, stat.st_mode & 0o777) != (0, 0, 0o644):
            raise RuntimeError('Installed ownership/mode mismatch: ' + name)
    public_contract(manifest, True)
    return {'api_pid': common.health(), 'files': len(FILES)}


def apply(manifest):
    if os.geteuid() != 0:
        raise RuntimeError('Installation requires interactive sudo')
    changed = [name for name in FILES if common.sha(TARGETS[name]) != manifest['files'][name]['after']]
    if not changed:
        return {'marker': 'REVIEW_RECIPIENTS_ALREADY_INSTALLED', **verify(manifest)}
    backup = Path(tempfile.mkdtemp(prefix=RELEASE + '-', dir=common.backup_directory()))
    os.chmod(backup, 0o700)
    for name in changed:
        previous, staged = backup / 'before' / name, backup / 'after' / name
        previous.parent.mkdir(parents=True, exist_ok=True)
        staged.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(TARGETS[name], previous)
        shutil.copyfile(BASE / 'payload' / name, staged)
        if common.sha(previous) != manifest['files'][name]['before'] or common.sha(staged) != manifest['files'][name]['after']:
            raise RuntimeError('Protected snapshot mismatch: ' + name)
    (backup / 'manifest.json').write_bytes((BASE / 'manifest.json').read_bytes())
    print('BACKUP=' + str(backup), flush=True)
    installed = []
    try:
        for name in changed:
            if common.sha(TARGETS[name]) != manifest['files'][name]['before']:
                raise RuntimeError('Production changed before installation: ' + name)
            common.atomic_copy(backup / 'after' / name, TARGETS[name])
            installed.append(name)
            if name == API:
                common.restart()
        result = verify(manifest)
    except Exception:
        for name in reversed(installed):
            if common.sha(TARGETS[name]) != manifest['files'][name]['after']:
                raise RuntimeError('Refusing rollback over concurrent changes: ' + name)
            common.atomic_copy(backup / 'before' / name, TARGETS[name])
            if common.sha(TARGETS[name]) != manifest['files'][name]['before']:
                raise RuntimeError('Rollback hash mismatch: ' + name)
        if API in installed:
            common.restart()
        print('REVIEW_RECIPIENTS_ROLLED_BACK', flush=True)
        raise
    return {'marker': 'REVIEW_RECIPIENTS_RELEASE_OK', 'commit': manifest['commit'],
            'backup': str(backup), **result}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest-sha', required=True)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    manifest = preflight(args.manifest_sha)
    if args.check:
        public_contract(manifest, False)
        result = {'marker': 'REVIEW_RECIPIENTS_PREFLIGHT_OK', 'api_pid': common.health(), 'files': len(FILES)}
    elif args.verify:
        result = {'marker': 'REVIEW_RECIPIENTS_VERIFIED_OK', **verify(manifest)}
    else:
        if os.geteuid() != 0:
            raise RuntimeError('Installation requires interactive sudo')
        with Path('/run/lock/smartplate-review-recipients.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            manifest = preflight(args.manifest_sha)
            result = apply(manifest)
    print(json.dumps(result), flush=True)


if __name__ == '__main__':
    main()
