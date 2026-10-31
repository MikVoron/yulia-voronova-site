#!/usr/bin/env python3
"""Hash-guarded OAuth release: checkpoint, CSP, API/config, then static HTML."""
import argparse
import fcntl
import hashlib
from http.cookies import SimpleCookie
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = Path(__file__).resolve().parent
API = {
    'server/src/oauth-accounts.js': '/var/www/smartplate-api/src/oauth-accounts.js',
    'server/src/routes/oauth.js': '/var/www/smartplate-api/src/routes/oauth.js',
}
FRONTEND = {
    'platform/oauth-login.css': '/var/www/smartplate-platform/oauth-login.css',
    'platform/vendor/vkid/LICENSE': '/var/www/smartplate-platform/vendor/vkid/LICENSE',
    'platform/vendor/vkid/sdk-2.6.1.js': '/var/www/smartplate-platform/vendor/vkid/sdk-2.6.1.js',
    'platform/oauth-login.js': '/var/www/smartplate-platform/oauth-login.js',
    'platform/vk-one-tap.js': '/var/www/smartplate-platform/vk-one-tap.js',
    'platform/auth-callback.js': '/var/www/smartplate-platform/auth-callback.js',
    'platform/auth-callback.html': '/var/www/smartplate-platform/auth-callback.html',
    'platform/login.html': '/var/www/smartplate-platform/login.html',
}
NGINX = {'server/nginx/plate.voronova.online': '/etc/nginx/sites-available/plate.voronova.online'}
TARGETS = {**NGINX, **API, **FRONTEND}
ENV_FILE = Path('/var/www/smartplate-api/.env')
CREDENTIALS = Path('/root/smartplate-oauth-20261031/candidate.env')
CHECKPOINT = Path('/home/smartplate-admin/api-checkpoint-20260909.sh')
API_BASE = 'https://api.voronova.online'
PLATFORM = 'https://plate.voronova.online'
DESIRED = {
    'VK_APP_ID': '54502528', 'VK_OAUTH_ENABLED': 'true', 'VK_ONETAP_ENABLED': 'true',
    'VK_REDIRECT': API_BASE + '/auth/oauth/vk/callback',
    'YANDEX_CLIENT_ID': 'ba3a2fd849a246df8b5abb5be356c9f1', 'YANDEX_OAUTH_ENABLED': 'true',
    'YANDEX_REDIRECT': API_BASE + '/auth/oauth/yandex/callback', 'PLATFORM_URL': PLATFORM,
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def safe_path(path, allow_missing=False):
    path = Path(path)
    if not path.is_absolute() or path.is_symlink() or path.resolve() != path:
        raise RuntimeError('Unsafe path: ' + str(path))
    if not allow_missing and not path.is_file():
        raise RuntimeError('Missing file: ' + str(path))
    if path.exists() and not path.is_file():
        raise RuntimeError('Not a regular file: ' + str(path))
    return path


def current_hash(path):
    path = safe_path(path, allow_missing=True)
    return digest(path.read_bytes()) if path.exists() else None


def run(*args, cwd=None):
    result = subprocess.run(args, cwd=cwd, check=False, capture_output=True, text=True, timeout=180)
    if result.returncode:
        # Never dump captured PM2/environment/DB output on failure.
        raise RuntimeError('Command failed: ' + str(args[0]))
    return result.stdout.strip()


def atomic_write(path, data, mode=0o644, uid=0, gid=0):
    path = safe_path(path, allow_missing=True)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
    if path.parent.resolve() != path.parent:
        raise RuntimeError('Unsafe parent directory')
    fd, temporary = tempfile.mkstemp(prefix='.oauth-release-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), mode)
            os.fchown(stream.fileno(), uid, gid)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def load_package(manifest_hash):
    data = safe_path(BASE / 'manifest.json').read_bytes()
    if digest(data) != manifest_hash:
        raise RuntimeError('Manifest SHA-256 mismatch')
    manifest = json.loads(data)
    if manifest.get('version') != 1 or set(manifest.get('files', {})) != set(TARGETS):
        raise RuntimeError('Unexpected release scope')
    if digest(safe_path(Path(__file__).resolve()).read_bytes()) != manifest['installer_sha256']:
        raise RuntimeError('Installer SHA-256 mismatch')
    payload = {}
    for name, entry in manifest['files'].items():
        body = safe_path(BASE / 'payload' / name).read_bytes()
        if digest(body) != entry['new_sha256']:
            raise RuntimeError('Payload SHA-256 mismatch: ' + name)
        payload[name] = body
    return manifest, payload


def environment_values(secret_data):
    values = {}
    for line in secret_data.decode('utf-8').splitlines():
        if not line or line.startswith('#'):
            continue
        key, separator, value = line.partition('=')
        if not separator or key in values or key not in set(DESIRED) | {'YANDEX_CLIENT_SECRET'}:
            raise RuntimeError('Unexpected staged credentials format')
        values[key] = value
    if values.get('VK_APP_ID') != DESIRED['VK_APP_ID'] or values.get('YANDEX_CLIENT_ID') != DESIRED['YANDEX_CLIENT_ID']:
        raise RuntimeError('Staged application IDs do not match the approved applications')
    secret = values.get('YANDEX_CLIENT_SECRET', '')
    if not re.fullmatch(r'[A-Za-z0-9._~-]{16,256}', secret):
        raise RuntimeError('Staged Yandex secret is missing or malformed')
    return {**DESIRED, 'YANDEX_CLIENT_SECRET': secret}


def merge_environment(old_data, values):
    text = old_data.decode('utf-8')
    kept = []
    for line in text.splitlines(keepends=True):
        matched = re.match(r'^\ufeff?\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=(.*)', line)
        if matched and matched[1] in values:
            value = matched[2].strip()
            if value.startswith(('"', "'")) and not value.endswith(value[0]):
                raise RuntimeError('Multiline OAuth configuration requires explicit review')
            continue
        kept.append(line)
    prefix = ''.join(kept)
    if prefix and not prefix.endswith('\n'):
        prefix += '\n'
    return (prefix + ''.join(key + '=' + value + '\n' for key, value in values.items())).encode('utf-8')


def health():
    with urllib.request.urlopen('http://127.0.0.1:3000/health', timeout=8) as response:
        data = json.load(response)
    if data.get('status') != 'ok' or data.get('db') != 'ok':
        raise RuntimeError('API health is not ok')


def api_identity():
    matches = []
    for line in run('ps', '-eo', 'pid=,uid=,gid=,args=').splitlines():
        parts = line.split(None, 3)
        if len(parts) == 4 and parts[3] == 'node /var/www/smartplate-api/index.js':
            matches.append(parts)
    if len(matches) != 1 or matches[0][1:3] != ['997', '997']:
        raise RuntimeError('Expected one API process with UID/GID 997')
    return int(matches[0][0])


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


def pm2_and_database_check(values):
    apps = json.loads(run('/usr/bin/env', 'PM2_HOME=/root/.pm2', '/usr/bin/pm2', 'jlist'))
    matches = [app for app in apps if app.get('name') == 'smartplate-api']
    if len(matches) != 1:
        raise RuntimeError('Expected one PM2 application')
    manager = matches[0]['pm2_env']
    if manager.get('pm_cwd') != str(ENV_FILE.parent):
        raise RuntimeError('Unexpected PM2 working directory')
    env = {**manager.get('env', {}), **{key: manager[key] for key in values if key in manager}}
    conflicts = [key for key, value in values.items() if key in env and str(env[key]) != value]
    if conflicts:
        raise RuntimeError('PM2 overrides OAuth configuration: ' + ','.join(conflicts))
    probe = """
const fs=require('fs'); const parsed=require('dotenv').parse(fs.readFileSync('.env'));
const pool=new (require('pg').Pool)({connectionString:parsed.DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:5000});
(async()=>{try{const c=await pool.connect();try{await c.query('BEGIN READ ONLY');
const cols=await c.query(\"SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('users','auth_accounts')\");
const required={users:['id','email','display_name','role','is_blocked'],auth_accounts:['user_id','provider','provider_id']};
for(const [table,names] of Object.entries(required))for(const name of names)if(!cols.rows.some(r=>r.table_name===table&&r.column_name===name))throw Error('schema');
const unique=await c.query(\"SELECT EXISTS(SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attname='email' WHERE i.indrelid='public.users'::regclass AND i.indisunique AND i.indnkeyatts=1 AND i.indkey[0]=a.attnum AND i.indpred IS NULL AND i.indexprs IS NULL) AS ok\");
if(!unique.rows[0].ok)throw Error('unique');await c.query('ROLLBACK');console.log('OAUTH_DATABASE_SCHEMA_OK');
}finally{c.release()}}catch(e){console.error('OAUTH_DATABASE_SCHEMA_REFUSED');process.exitCode=1}finally{await pool.end()}})();
"""
    if run('/usr/bin/node', '-e', probe, cwd=str(ENV_FILE.parent)) != 'OAUTH_DATABASE_SCHEMA_OK':
        raise RuntimeError('OAuth database schema check failed')


def preflight(manifest, payload, privileged=False):
    for name, destination in TARGETS.items():
        if current_hash(Path(destination)) != manifest['files'][name]['old_sha256']:
            raise RuntimeError('Production target changed: ' + name)
        if Path(destination).exists():
            info = Path(destination).stat()
            if info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o644:
                raise RuntimeError('Unexpected target ownership/mode: ' + name)
        if name.endswith('.js'):
            run('/usr/bin/node', '--check', str(BASE / 'payload' / name))
    if current_hash(CHECKPOINT) != manifest['checkpoint_script_sha256']:
        raise RuntimeError('Checkpoint helper changed')
    health()
    pid = api_identity()
    if privileged:
        secret_path = safe_path(CREDENTIALS)
        info = secret_path.stat()
        if info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o600:
            raise RuntimeError('Staged credentials must be root-only')
        info = safe_path(ENV_FILE).stat()
        if info.st_uid != 0 or info.st_gid != 997 or stat.S_IMODE(info.st_mode) != 0o640:
            raise RuntimeError('Unexpected live environment permissions')
        values = environment_values(secret_path.read_bytes())
        pm2_and_database_check(values)
        return pid, merge_environment(ENV_FILE.read_bytes(), values)
    return pid, None


def verify_public_csp():
    with urllib.request.urlopen(PLATFORM + '/login.html', timeout=15) as response:
        policy = response.headers.get('Content-Security-Policy', '')
    directives = dict((parts[0], parts[1:]) for parts in (part.strip().split() for part in policy.split(';')) if parts)
    if any('https://id.vk.ru' not in directives.get(name, []) for name in ['connect-src', 'frame-src', 'child-src']):
        raise RuntimeError('Public CSP is not ready for VK ID')


def verify_api():
    health()
    pid = api_identity()
    with urllib.request.urlopen(API_BASE + '/auth/oauth/providers', timeout=15) as response:
        if json.load(response) != {'vk': True, 'yandex': True, 'vkOneTap': True}:
            raise RuntimeError('OAuth capability check failed')
    request = urllib.request.Request(API_BASE + '/auth/oauth/vk/config', headers={'Origin': PLATFORM})
    with urllib.request.urlopen(request, timeout=15) as response:
        config = json.load(response)
        cookie = SimpleCookie()
        for value in response.headers.get_all('Set-Cookie', []):
            cookie.load(value)
        if response.headers.get('Access-Control-Allow-Origin') != PLATFORM or response.headers.get('Access-Control-Allow-Credentials') != 'true':
            raise RuntimeError('OAuth CORS credentials check failed')
        if config.get('appId') != int(DESIRED['VK_APP_ID']) or config.get('redirectUrl') != DESIRED['VK_REDIRECT'] or not re.fullmatch(r'[a-f0-9]{48}', config.get('state', '')):
            raise RuntimeError('One Tap application configuration is not ready')
        context = cookie.get('oauth_widget_vk_' + config['state'])
        if context is None or not context['httponly'] or not context['secure']:
            raise RuntimeError('One Tap private context cookie is not ready')
        verifier = context.value.split('.')[0]
        import base64
        expected = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
        if config.get('codeChallenge') != expected or 'codeVerifier' in config:
            raise RuntimeError('One Tap PKCE configuration check failed')
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    opener = urllib.request.build_opener(NoRedirect())
    for provider, expected in [('vk', DESIRED['VK_APP_ID']), ('yandex', DESIRED['YANDEX_CLIENT_ID'])]:
        try:
            opener.open(API_BASE + '/auth/oauth/' + provider, timeout=15)
            raise RuntimeError('OAuth did not redirect')
        except urllib.error.HTTPError as error:
            location = urllib.parse.urlparse(error.headers.get('Location', ''))
            query = urllib.parse.parse_qs(location.query)
            expected_host = 'id.vk.ru' if provider == 'vk' else 'oauth.yandex.ru'
            if error.code != 302 or location.scheme != 'https' or location.netloc != expected_host or query.get('client_id') != [expected] or query.get('redirect_uri') != [API_BASE + '/auth/oauth/' + provider + '/callback']:
                raise RuntimeError('OAuth redirect settings do not match: ' + provider)
            if provider == 'vk' and (query.get('code_challenge_method') != ['s256'] or not re.fullmatch(r'[A-Za-z0-9_-]{43}', query.get('code_challenge', [''])[0])):
                raise RuntimeError('VK PKCE challenge is not ready')
    return pid


def verify_install(manifest):
    for name, destination in TARGETS.items():
        if current_hash(Path(destination)) != manifest['files'][name]['new_sha256']:
            raise RuntimeError('Installed hash mismatch: ' + name)
    verify_public_csp()
    pid = verify_api()
    for name in FRONTEND:
        url = PLATFORM + '/' + name.removeprefix('platform/')
        with urllib.request.urlopen(url, timeout=20) as response:
            if digest(response.read()) != manifest['files'][name]['new_sha256']:
                raise RuntimeError('Served hash mismatch: ' + name)
    return pid


def save_state(directory, state):
    atomic_write(directory / 'state.json', json.dumps(state, indent=2).encode(), mode=0o600)


def snapshot(manifest, payload, new_environment):
    directory = Path(tempfile.mkdtemp(prefix='smartplate-oauth-release-', dir='/root'))
    os.chmod(directory, 0o700)
    entries = []
    for name, destination in TARGETS.items():
        path = safe_path(Path(destination), allow_missing=True)
        old = path.read_bytes() if path.exists() else None
        info = path.stat() if path.exists() else None
        entries.append({'name': name, 'target': destination, 'old_sha256': digest(old) if old is not None else None,
                        'new_sha256': digest(payload[name]), 'mode': stat.S_IMODE(info.st_mode) if info else 0o644,
                        'uid': info.st_uid if info else 0, 'gid': info.st_gid if info else 0})
        if old is not None:
            atomic_write(directory / 'old' / name, old, mode=0o600)
        atomic_write(directory / 'new' / name, payload[name], mode=0o600)
    info = ENV_FILE.stat()
    entries.append({'name': 'environment', 'target': str(ENV_FILE), 'old_sha256': digest(ENV_FILE.read_bytes()),
                    'new_sha256': digest(new_environment), 'mode': stat.S_IMODE(info.st_mode), 'uid': info.st_uid, 'gid': info.st_gid})
    atomic_write(directory / 'old/environment', ENV_FILE.read_bytes(), mode=0o600)
    atomic_write(directory / 'new/environment', new_environment, mode=0o600)
    atomic_write(directory / 'checkpoint.sh', CHECKPOINT.read_bytes(), mode=0o600)
    state = {'version': 1, 'commit': manifest['commit'], 'entries': entries, 'status': 'prepared'}
    save_state(directory, state)
    return directory, state


def checked_install(directory, entry):
    path = Path(entry['target'])
    if current_hash(path) != entry['old_sha256']:
        raise RuntimeError('Target changed immediately before install: ' + entry['name'])
    body = safe_path(directory / 'new' / entry['name']).read_bytes()
    if digest(body) != entry['new_sha256']:
        raise RuntimeError('Private payload changed')
    atomic_write(path, body, mode=0o640 if entry['name'] == 'environment' else 0o644,
                 gid=997 if entry['name'] == 'environment' else 0)
    if current_hash(path) != entry['new_sha256']:
        raise RuntimeError('Installed file hash mismatch')


def load_state(directory):
    directory = Path(directory)
    if directory.parent != Path('/root') or not directory.name.startswith('smartplate-oauth-release-') or directory.resolve() != directory or directory.is_symlink():
        raise RuntimeError('Unexpected rollback directory')
    if directory.stat().st_uid != 0 or stat.S_IMODE(directory.stat().st_mode) != 0o700:
        raise RuntimeError('Rollback directory must be root-only')
    state = json.loads(safe_path(directory / 'state.json').read_text())
    allowed = {**TARGETS, 'environment': str(ENV_FILE)}
    if state.get('version') != 1 or len(state.get('entries', [])) != len(allowed) or {entry['name']: entry['target'] for entry in state['entries']} != allowed:
        raise RuntimeError('Unexpected rollback scope')
    return directory, state


def rollback(directory):
    directory, state = load_state(directory)
    for entry in state['entries']:
        actual = current_hash(Path(entry['target']))
        if actual not in [entry['old_sha256'], entry['new_sha256']]:
            raise RuntimeError('Rollback refused over a concurrent change: ' + entry['name'])
        if actual != entry['old_sha256'] and entry['old_sha256'] is not None:
            if digest(safe_path(directory / 'old' / entry['name']).read_bytes()) != entry['old_sha256']:
                raise RuntimeError('Rollback copy changed')
    changed = []
    for entry in reversed(state['entries']):
        target = Path(entry['target'])
        if current_hash(target) == entry['old_sha256']:
            continue
        if entry['old_sha256'] is None:
            safe_path(target).unlink()
        else:
            body = safe_path(directory / 'old' / entry['name']).read_bytes()
            if digest(body) != entry['old_sha256']:
                raise RuntimeError('Rollback copy changed')
            atomic_write(target, body, mode=entry['mode'], uid=entry['uid'], gid=entry['gid'])
        changed.append(entry['name'])
    if any(name in NGINX for name in changed):
        run('/usr/sbin/nginx', '-t')
        run('/bin/systemctl', 'reload', 'nginx')
    if any(name in API or name == 'environment' for name in changed):
        restart_api()
    health()
    api_identity()
    state['status'] = 'rolled_back'
    save_state(directory, state)
    print('OAUTH_RELEASE_ROLLED_BACK', flush=True)


def apply(manifest, payload):
    pid, new_environment = preflight(manifest, payload, privileged=True)
    directory, state = snapshot(manifest, payload, new_environment)
    print('OAUTH_BACKUP=' + str(directory), flush=True)
    # The reviewed helper makes a private files+DB checkpoint and never restores DB.
    if digest((directory / 'checkpoint.sh').read_bytes()) != manifest['checkpoint_script_sha256']:
        raise RuntimeError('Private checkpoint helper mismatch')
    checkpoint = subprocess.run(['/bin/bash', str(directory / 'checkpoint.sh'), '--create'], capture_output=True, text=True, timeout=600)
    if checkpoint.returncode or 'CHECKPOINT_OK' not in checkpoint.stdout:
        raise RuntimeError('Fresh checkpoint failed; production unchanged')
    print(checkpoint.stdout, flush=True)
    entries = {entry['name']: entry for entry in state['entries']}
    try:
        for name in NGINX:
            checked_install(directory, entries[name])
        run('/usr/sbin/nginx', '-t')
        run('/bin/systemctl', 'reload', 'nginx')
        verify_public_csp()
        if api_identity() != pid:
            raise RuntimeError('API process changed during the CSP-only phase')
        print('OAUTH_CSP_INSTALLED', flush=True)
        state['status'] = 'csp_installed'
        save_state(directory, state)

        for name in API:
            checked_install(directory, entries[name])
        checked_install(directory, entries['environment'])
        restart_api()
        verify_api()
        print('OAUTH_API_INSTALLED', flush=True)
        state['status'] = 'api_installed'
        save_state(directory, state)

        for name in FRONTEND:
            checked_install(directory, entries[name])
        final_pid = verify_install(manifest)
        state['status'] = 'installed'
        state['api_pid'] = final_pid
        save_state(directory, state)
        print(json.dumps({'marker': 'OAUTH_RELEASE_INSTALLED', 'commit': manifest['commit'], 'api_pid': final_pid,
                          'backup': str(directory), 'provider_login_verified': False}), flush=True)
    except BaseException:
        print('OAUTH_RELEASE_FAILED; restoring only this release files/config, never the database', flush=True)
        rollback(directory)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=['check', 'apply', 'verify', 'rollback'])
    parser.add_argument('--manifest-sha256', required=True)
    parser.add_argument('--state', type=Path)
    options = parser.parse_args()
    manifest, payload = load_package(options.manifest_sha256)
    if options.phase == 'check':
        pid, _ = preflight(manifest, payload)
        print(json.dumps({'marker': 'OAUTH_RELEASE_PREFLIGHT_OK', 'api_pid': pid, 'files': len(TARGETS)}))
        return
    if os.geteuid() != 0:
        raise RuntimeError('Use interactive sudo on the VPS. Never pass a password to this script.')
    lock_fd = os.open('/run/lock/smartplate-oauth-release.lock', os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(lock_fd)
        if info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o600:
            raise RuntimeError('Unexpected release-lock ownership/mode')
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if options.phase == 'apply':
            apply(manifest, payload)
        elif options.phase == 'verify':
            print(json.dumps({'marker': 'OAUTH_RELEASE_VERIFIED', 'api_pid': verify_install(manifest), 'commit': manifest['commit']}))
        else:
            if options.state is None:
                raise RuntimeError('A root-owned rollback directory is required')
            rollback(options.state)
    finally:
        os.close(lock_fd)


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, lambda signum, frame: (_ for _ in ()).throw(RuntimeError('Release interrupted')))
    try:
        main()
    except Exception as error:
        print('OAUTH_RELEASE_REFUSED: ' + str(error), flush=True)
        raise SystemExit(1)
