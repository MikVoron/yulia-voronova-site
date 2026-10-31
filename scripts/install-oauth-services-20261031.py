#!/usr/bin/env python3
"""Scoped OAuth reliability release using the reviewed OAuth installer core."""
import argparse
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import stat
import tempfile
import urllib.error
import urllib.parse
import urllib.request

BASE = Path(__file__).resolve().parent
API = {'server/src/routes/oauth.js': '/var/www/smartplate-api/src/routes/oauth.js'}
FRONTEND = {
    'platform/oauth-login.css': '/var/www/smartplate-platform/oauth-login.css',
    'platform/oauth-login.js': '/var/www/smartplate-platform/oauth-login.js',
    'platform/login.html': '/var/www/smartplate-platform/login.html',
}


def load_core(manifest_sha):
    encoded = (BASE / 'manifest.json').read_bytes()
    if hashlib.sha256(encoded).hexdigest() != manifest_sha:
        raise RuntimeError('Manifest SHA-256 mismatch')
    manifest = json.loads(encoded)
    for name, expected in [('install.py', manifest['wrapper_sha256']),
                           ('install-oauth-20261031.py', manifest['installer_sha256'])]:
        source = BASE / name
        if source.is_symlink() or source.resolve() != source or hashlib.sha256(source.read_bytes()).hexdigest() != expected:
            raise RuntimeError('Installer SHA-256 mismatch')
    spec = importlib.util.spec_from_file_location('oauth_release_core', BASE / 'install-oauth-20261031.py')
    core = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(core)
    core.API, core.FRONTEND, core.NGINX = API, FRONTEND, {}
    core.TARGETS = {**API, **FRONTEND}
    manifest, payload = core.load_package(manifest_sha)
    return core, manifest, payload


def snapshot(core, manifest, payload):
    directory = Path(tempfile.mkdtemp(prefix='smartplate-oauth-services-', dir='/root'))
    os.chmod(directory, 0o700)
    entries = []
    for name, target in core.TARGETS.items():
        path = core.safe_path(Path(target))
        body, info = path.read_bytes(), path.stat()
        if core.digest(body) != manifest['files'][name]['old_sha256']:
            raise RuntimeError('Target changed before snapshot: ' + name)
        entries.append({'name': name, 'target': target, 'old_sha256': core.digest(body),
                        'new_sha256': core.digest(payload[name]), 'mode': stat.S_IMODE(info.st_mode),
                        'uid': info.st_uid, 'gid': info.st_gid})
        core.atomic_write(directory / 'old' / name, body, mode=0o600)
        core.atomic_write(directory / 'new' / name, payload[name], mode=0o600)
    checkpoint = core.CHECKPOINT.read_bytes()
    if core.digest(checkpoint) != manifest['checkpoint_script_sha256']:
        raise RuntimeError('Checkpoint helper changed')
    core.atomic_write(directory / 'checkpoint.sh', checkpoint, mode=0o600)
    state = {'version': 1, 'commit': manifest['commit'], 'entries': entries, 'status': 'prepared'}
    core.save_state(directory, state)
    return directory, state


def load_state(core, manifest, directory):
    directory = Path(directory)
    if directory.parent != Path('/root') or not directory.name.startswith('smartplate-oauth-services-') or directory.resolve() != directory or directory.is_symlink():
        raise RuntimeError('Unexpected rollback directory')
    info = directory.stat()
    if info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o700:
        raise RuntimeError('Rollback directory must be root-only')
    state = json.loads(core.safe_path(directory / 'state.json').read_text())
    if state.get('version') != 1 or state.get('commit') != manifest['commit'] or len(state.get('entries', [])) != len(core.TARGETS) or {e['name']: e['target'] for e in state['entries']} != core.TARGETS:
        raise RuntimeError('Unexpected rollback scope')
    return directory, state


def provider_redirects():
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    opener = urllib.request.build_opener(NoRedirect())
    for service in ['mail_ru', 'ok_ru']:
        try:
            opener.open('http://127.0.0.1:3000/auth/oauth/vk?provider=' + service, timeout=10)
            raise RuntimeError('Provider did not redirect')
        except urllib.error.HTTPError as error:
            target = urllib.parse.urlparse(error.headers.get('Location', ''))
            query = urllib.parse.parse_qs(target.query)
            if error.code != 302 or target.scheme != 'https' or target.netloc != 'id.vk.ru' or query.get('provider') != [service] or query.get('prompt') != ['login'] or query.get('code_challenge_method') != ['s256']:
                raise RuntimeError('Provider redirect smoke failed')


def verify(core, manifest):
    pid = core.verify_api()
    provider_redirects()
    for name, target in core.TARGETS.items():
        path = core.safe_path(Path(target))
        info = path.stat()
        if core.digest(path.read_bytes()) != manifest['files'][name]['new_sha256'] or (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) != (0, 0, 0o644):
            raise RuntimeError('Installed file/metadata mismatch: ' + name)
        if name in FRONTEND:
            with urllib.request.urlopen(core.PLATFORM + '/' + name.removeprefix('platform/') + '?release=oauth-services', timeout=15) as response:
                if core.digest(response.read()) != manifest['files'][name]['new_sha256']:
                    raise RuntimeError('Public file hash mismatch: ' + name)
    return pid


def apply(core, manifest, payload):
    core.preflight(manifest, payload)  # Code-only: no credentials or environment file.
    directory, state = snapshot(core, manifest, payload)
    print('OAUTH_SERVICES_BACKUP=' + str(directory), flush=True)
    result = core.run('/bin/bash', str(directory / 'checkpoint.sh'), '--create')
    if 'CHECKPOINT_OK' not in result:
        raise RuntimeError('Checkpoint failed; production unchanged')
    print(result, flush=True)
    entries = {entry['name']: entry for entry in state['entries']}
    try:
        for name in API:
            core.checked_install(directory, entries[name])
        core.restart_api()
        core.verify_api()
        provider_redirects()
        print('OAUTH_SERVICES_API_OK', flush=True)
        for name in FRONTEND:
            core.checked_install(directory, entries[name])
        pid = verify(core, manifest)
        state['status'] = 'installed'
        core.save_state(directory, state)
        print(json.dumps({'marker': 'OAUTH_SERVICES_LIVE_OK', 'commit': manifest['commit'], 'api_pid': pid,
                          'files': len(core.TARGETS), 'real_provider_login_verified': False}), flush=True)
    except BaseException:
        core.rollback(directory)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=['check', 'apply', 'verify', 'rollback'])
    parser.add_argument('--manifest-sha256', required=True)
    parser.add_argument('--state', type=Path)
    options = parser.parse_args()
    signal.signal(signal.SIGTERM, lambda signum, frame: (_ for _ in ()).throw(RuntimeError('Release interrupted')))
    core, manifest, payload = load_core(options.manifest_sha256)
    core.load_state = lambda directory: load_state(core, manifest, directory)
    if options.phase == 'check':
        pid, _ = core.preflight(manifest, payload)
        print(json.dumps({'marker': 'OAUTH_SERVICES_PREFLIGHT_OK', 'api_pid': pid, 'files': len(core.TARGETS)}))
        return
    if os.geteuid() != 0:
        raise RuntimeError('Use interactive sudo in Timeweb. Never pass a password to this script.')
    fd = os.open('/run/lock/smartplate-oauth-release.lock', os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(fd)
        if info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o600:
            raise RuntimeError('Unexpected release lock')
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if options.phase == 'apply':
            apply(core, manifest, payload)
        elif options.phase == 'verify':
            print(json.dumps({'marker': 'OAUTH_SERVICES_VERIFIED', 'api_pid': verify(core, manifest)}))
        else:
            if options.state is None:
                raise RuntimeError('Rollback state directory is required')
            core.rollback(options.state)
    finally:
        os.close(fd)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('OAUTH_SERVICES_REFUSED: ' + str(error), flush=True)
        raise SystemExit(1)
