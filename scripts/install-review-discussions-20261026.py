#!/usr/bin/env python3
"""Guarded, scoped DB/API/frontend release. Does not alter PM2 configuration."""
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
REL = 'review-discussions-20261026'
TARGETS = {
    'server/src/routes/content.js': API / 'src/routes/content.js',
    'server/src/review-discussions.js': API / 'src/review-discussions.js',
    'server/migrations/041_review_comments.sql': API / 'migrations/041_review_comments.sql',
    **{'platform/' + name: STATIC / name for name in [
        'recipe.html', 'recipe-page.js', 'category.html', 'category-page.js',
        'ingredient.html', 'ingredient-page.js', 'review-discussions.js', 'review-discussions.css']},
}
AVATAR_HASH = '6ff847a47d311a6dabc79c04eed020c56d9e8cf59713e723b6bb09b034facdbf'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None


def run(*args, **options):
    return subprocess.run(args, check=True, text=True, capture_output=True, **options).stdout.strip()


def safe_path(path):
    if path.is_symlink() or path.resolve() != path or (path.exists() and not path.is_file()):
        raise RuntimeError('Unexpected path: ' + str(path))


def verify_target(path, allowed_hashes):
    safe_path(path)
    if sha(path) not in allowed_hashes:
        raise RuntimeError('Production file changed since preflight: ' + str(path))


def atomic_install(source, target):
    safe_path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.review-discussions-', dir=target.parent)
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


def rollback_files(installed, entries, checkpoint):
    for name in reversed(installed):
        target = TARGETS[name]
        verify_target(target, {entries[name]['new_sha256']})
        if entries[name]['old_sha256'] is None:
            target.unlink()
        else:
            atomic_install(checkpoint / 'previous' / name, target)
        if sha(target) != entries[name]['old_sha256']:
            raise RuntimeError('Rollback hash mismatch: ' + name)


def api_identity():
    rows = run('ps', '-eo', 'pid=,uid=,gid=,args=').splitlines()
    processes = [line.split(None, 3) for line in rows
                 if len(line.split(None, 3)) == 4
                 and line.split(None, 3)[3] == 'node /var/www/smartplate-api/index.js']
    if len(processes) != 1 or processes[0][1:3] != ['997', '997']:
        raise RuntimeError('Expected one API process with UID/GID 997')
    return processes[0][0]


def fetch_json(path, data=None):
    request = urllib.request.Request('http://127.0.0.1:3000' + path,
                                    data=None if data is None else json.dumps(data).encode(),
                                    headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=8) as response:
        return json.load(response)


def health():
    data = fetch_json('/health')
    if data.get('status') != 'ok' or data.get('db') != 'ok':
        raise RuntimeError('API health failed')


def restart_api():
    run('/usr/bin/env', 'PM2_HOME=/root/.pm2', '/usr/bin/pm2', 'restart', 'smartplate-api')
    for attempt in range(40):
        try:
            health()
            return api_identity()
        except Exception:
            if attempt == 39:
                raise
            time.sleep(0.5)


def psql(sql):
    return run('runuser', '-u', 'postgres', '--', 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
               '-d', 'smartplate_db', '-At', input=sql)


def migration_body(sql):
    if sql.count('BEGIN;') != 1 or sql.count('COMMIT;') != 1:
        raise RuntimeError('Unexpected migration transaction boundaries')
    return sql.replace('BEGIN;', '', 1).replace('COMMIT;', '', 1)


def db_prerequisites():
    result = psql("SELECT to_regclass('public.review_avatar_assignments') IS NOT NULL "
                  "AND to_regclass('public.review_avatar_counter') IS NOT NULL "
                  "AND to_regclass('public.review_replies') IS NOT NULL "
                  "AND to_regclass('public.review_reply_reactions') IS NOT NULL;")
    if result != 't':
        raise RuntimeError('Prerequisite review/avatar tables are missing')
    if psql('SELECT COUNT(*) FROM review_avatar_counter WHERE id=1;') != '1':
        raise RuntimeError('Persistent avatar counter is missing')


def api_smoke():
    row = psql('SELECT id || chr(9) || recipe_id FROM reviews ORDER BY id LIMIT 1;')
    if not row:
        raise RuntimeError('No existing review available for read-only release smoke')
    review_id, recipe_id = row.split('\t', 1)
    reviews = fetch_json('/content/reviews/' + urllib.parse.quote(recipe_id, safe=''))
    if not reviews or any(not isinstance(item.get('comments'), list)
                          or not isinstance(item.get('commentCount'), int) for item in reviews):
        raise RuntimeError('Review discussion summaries are missing')
    page = fetch_json('/content/reviews/' + review_id + '/comments')
    if not isinstance(page.get('comments'), list) or not isinstance(page.get('hasMore'), bool):
        raise RuntimeError('Discussion page smoke failed')
    try:
        fetch_json('/content/reviews/' + review_id + '/comments', {'text': 'must not persist'})
        raise RuntimeError('Anonymous comment unexpectedly accepted')
    except urllib.error.HTTPError as error:
        if error.code != 401:
            raise


def preflight(manifest_sha):
    if sha(BASE / 'manifest.json') != manifest_sha:
        raise RuntimeError('Manifest SHA-256 mismatch')
    manifest = json.loads((BASE / 'manifest.json').read_text())
    if sha(Path(__file__).resolve()) != manifest.get('installer_sha256'):
        raise RuntimeError('Installer hash mismatch')
    entries = {entry['path']: entry for entry in manifest['files']}
    if manifest.get('release') != REL or set(entries) != set(TARGETS):
        raise RuntimeError('Unexpected release scope')
    for name, target in TARGETS.items():
        source = BASE / 'payload' / name
        safe_path(source)
        if not source.is_file() or sha(source) != entries[name]['new_sha256']:
            raise RuntimeError('Staged payload hash mismatch: ' + name)
        verify_target(target, {entries[name]['old_sha256'], entries[name]['new_sha256']})
        if source.suffix == '.js':
            run('node', '--check', str(source))
    if sha(API / 'src/review-avatars.js') != AVATAR_HASH:
        raise RuntimeError('Persistent avatar module differs from the verified dependency')
    health()
    api_identity()
    return manifest, entries


def apply(manifest_sha):
    if os.geteuid() != 0:
        raise RuntimeError('Installation requires interactive sudo; never pass a password to this script')
    manifest, entries = preflight(manifest_sha)
    db_prerequisites()
    if all(sha(target) == entries[name]['new_sha256'] for name, target in TARGETS.items()):
        api_smoke()
        print('REVIEW_DISCUSSIONS_ALREADY_INSTALLED', flush=True)
        return
    ROLLBACKS.mkdir(mode=0o700, parents=True, exist_ok=True)
    if ROLLBACKS.is_symlink() or ROLLBACKS.stat().st_uid != 0:
        raise RuntimeError('Unexpected rollback directory')
    checkpoint = Path(tempfile.mkdtemp(prefix=REL + '-', dir=ROLLBACKS))
    os.chmod(checkpoint, 0o700)
    installed = []
    for name in TARGETS:
        destination = checkpoint / 'staged' / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(BASE / 'payload' / name, destination)
        if sha(destination) != entries[name]['new_sha256']:
            raise RuntimeError('Staged payload changed while making protected snapshot')
        if entries[name]['old_sha256'] is not None:
            verify_target(TARGETS[name], {entries[name]['old_sha256'], entries[name]['new_sha256']})
            previous = checkpoint / 'previous' / name
            previous.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(TARGETS[name], previous)
    (checkpoint / 'manifest.json').write_bytes((BASE / 'manifest.json').read_bytes())
    with (checkpoint / 'database.dump').open('xb') as stream:
        os.fchmod(stream.fileno(), 0o600)
        subprocess.run(['runuser', '-u', 'postgres', '--', 'pg_dump', '-Fc', '--no-owner',
                        '--no-acl', '-d', 'smartplate_db'], stdout=stream, stderr=subprocess.PIPE, check=True)
    run('pg_restore', '--list', str(checkpoint / 'database.dump'))
    print('CHECKPOINT=' + str(checkpoint), flush=True)
    sql = migration_body((checkpoint / 'staged/server/migrations/041_review_comments.sql').read_text())
    psql("BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';\n" + sql + '\nROLLBACK;')
    print('REVIEW_DISCUSSIONS_MIGRATION_DRY_RUN_OK', flush=True)
    changed = [name for name, target in TARGETS.items() if sha(target) != entries[name]['new_sha256']]
    try:
        psql("BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';\n" + sql + '\nCOMMIT;')
        print('REVIEW_DISCUSSIONS_MIGRATION_APPLIED', flush=True)
        def install(name):
            verify_target(TARGETS[name], {entries[name]['old_sha256']})
            atomic_install(checkpoint / 'staged' / name, TARGETS[name])
            installed.append(name)
            if sha(TARGETS[name]) != entries[name]['new_sha256']:
                raise RuntimeError('Installed file hash mismatch: ' + name)
        for name in changed:
            if name.startswith('server/'):
                install(name)
        if any(name.startswith('server/') for name in changed):
            restart_api()
        api_smoke()
        for name in sorted(changed, key=lambda item: item.endswith('.html')):
            if name.startswith('platform/'):
                install(name)
        health()
        for name, target in TARGETS.items():
            verify_target(target, {entries[name]['new_sha256']})
    except Exception:
        rollback_files(installed, entries, checkpoint)
        if any(name.startswith('server/') for name in installed):
            restart_api()
        print('REVIEW_DISCUSSIONS_FILES_ROLLED_BACK; additive comments table retained', flush=True)
        raise
    print(json.dumps({'marker': 'REVIEW_DISCUSSIONS_RELEASE_OK', 'commit': manifest['commit'],
                      'files': len(TARGETS), 'api_pid': api_identity(), 'checkpoint': str(checkpoint)}), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('phase', choices=['check', 'apply'])
    parser.add_argument('--manifest-sha', required=True)
    args = parser.parse_args()
    if args.phase == 'check':
        manifest, _ = preflight(args.manifest_sha)
        print(json.dumps({'marker': 'REVIEW_DISCUSSIONS_PREFLIGHT_OK', 'commit': manifest['commit'], 'files': len(TARGETS)}))
    else:
        apply(args.manifest_sha)


if __name__ == '__main__':
    main()
