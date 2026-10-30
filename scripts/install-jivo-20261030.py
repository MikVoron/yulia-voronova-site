#!/usr/bin/env python3
"""Guarded static Jivo installation. Does not change API, database or permissions."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import urllib.request

BASE = Path(__file__).resolve().parent
PLATFORM = Path('/var/www/smartplate-platform')
NAMES = {'index.html', 'recipe.html', 'category.html', 'ingredient.html',
         'cabinet.html', 'login.html', 'cabinet.js',
         'personal-data-processing-policy.html', 'jivo-chat-modal.js', 'jivo-chat-modal.css'}
TARGETS = {'platform/' + name: PLATFORM / name for name in NAMES}
CONFIG = 'server/nginx/plate.voronova.online'
TARGETS[CONFIG] = Path('/etc/nginx/sites-available/plate.voronova.online')
PUBLIC_ORIGIN = 'https://plate.voronova.online'
SEO_DOCUMENTS = {
    'recipe.html': '/recipe.html?id=hummus',
    'category.html': '/category.html',
    'ingredient.html': '/ingredient.html?id=pumpkin',
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(*args):
    return subprocess.run(args, text=True, capture_output=True, check=True, timeout=30).stdout.strip()


def safe(path, optional=False):
    if path.is_symlink() or path.resolve() != path or (path.exists() and not path.is_file()):
        raise RuntimeError('Unexpected path: ' + str(path))
    if not optional and not path.is_file():
        raise RuntimeError('Missing file: ' + str(path))


def current(path):
    safe(path, optional=True)
    return sha(path) if path.exists() else None


def health_pid():
    with urllib.request.urlopen('http://127.0.0.1:3000/health', timeout=10) as response:
        status = json.load(response)
    if status.get('status') != 'ok' or status.get('db') != 'ok':
        raise RuntimeError('API health failed')
    rows = [line.split(None, 3) for line in run('ps', '-eo', 'pid=,uid=,gid=,args=').splitlines()]
    matches = [row for row in rows if len(row) == 4 and row[3] == 'node /var/www/smartplate-api/index.js']
    if len(matches) != 1 or matches[0][1:3] != ['997', '997']:
        raise RuntimeError('Unexpected API process identity')
    return int(matches[0][0])


def public_bytes(url):
    suffix = ('&' if '?' in url else '?') + 'jivo_release=' + str(time.time_ns())
    try:
        with urllib.request.urlopen(url + suffix, timeout=30) as response:
            if response.status != 200:
                raise RuntimeError('Public response failed: ' + url)
            return response.read()
    except Exception as error:
        raise RuntimeError('Public request failed: ' + url) from error


def public_hash(url):
    return hashlib.sha256(public_bytes(url)).hexdigest()


def verify_public_file(name, digest, origin=PUBLIC_ORIGIN):
    if name not in SEO_DOCUMENTS:
        if public_hash(origin + '/' + name) != digest:
            raise RuntimeError('Public file mismatch: ' + name)
        return
    path = SEO_DOCUMENTS[name]
    document = public_bytes(origin + path).decode('utf-8')
    # These responses vary by database content and SEO rendering. The installed
    # template is still hash-checked; verify the actual chat wiring in the HTML.
    required = ['jivo-chat-modal.js?v=20261030-jivo',
                'jivo-chat-modal.css?v=20261030-jivo',
                'data-support-open', 'https://voronova.online/support-chat.html',
                'id="smartplate-page-schema"']
    if any(value not in document for value in required) or re.search(r'tawk\.to|tawk-chat-modal|data-tawk-open', document):
        raise RuntimeError('Rendered chat wiring mismatch: ' + path)
    canonicals = re.findall(r'<link\s+rel=["\']canonical["\']\s+href=["\']([^"\']+)["\']', document, re.I)
    expected = PUBLIC_ORIGIN + path
    if expected not in canonicals:
        raise RuntimeError('Rendered canonical mismatch: ' + path)


def read_policies(path):
    rows = re.findall(r'add_header (Content-Security-Policy(?:-Report-Only)?) "([^"]+)"', path.read_text())
    required = {'Content-Security-Policy', 'Content-Security-Policy-Report-Only'}
    if len(rows) != 2 or {name for name, value in rows} != required:
        raise RuntimeError('Expected exactly two CSP headers in configuration')
    return dict(rows)


def wait_public_policies(expected, url=PUBLIC_ORIGIN + '/login.html', timeout=15, interval=.25, evidence=None):
    started = time.monotonic()
    deadline = started + timeout
    observations = []
    consecutive = 0
    try:
        while True:
            request = urllib.request.Request(url + ('&' if '?' in url else '?') + 'jivo_csp=' + str(time.time_ns()),
                                             headers={'Connection': 'close', 'Cache-Control': 'no-cache'})
            actual = {}
            try:
                with urllib.request.urlopen(request, timeout=min(3, max(.1, deadline - time.monotonic()))) as response:
                    response.read()
                    actual = {name: response.headers.get_all(name, []) for name in expected}
                matches = all(len(actual[name]) == 1 and ' '.join(actual[name][0].split()) == ' '.join(value.split())
                              for name, value in expected.items())
                observations.append({'elapsed_ms': round((time.monotonic() - started) * 1000, 1), 'headers': actual, 'match': matches})
            except Exception as error:
                matches = False
                observations.append({'elapsed_ms': round((time.monotonic() - started) * 1000, 1), 'error': str(error), 'match': False})
            consecutive = consecutive + 1 if matches else 0
            if consecutive >= 2:
                return {'attempts': len(observations), 'elapsed_ms': observations[-1]['elapsed_ms']}
            if time.monotonic() >= deadline:
                summary = {name: [next((part.strip() for part in value.split(';') if part.strip().startswith('frame-src ')), '(no frame-src)')
                                  for value in values] for name, values in actual.items()}
                raise RuntimeError('Served CSP did not converge to the exact configured policies: ' + json.dumps(summary))
            time.sleep(min(interval, max(0, deadline - time.monotonic())))
    finally:
        if evidence is not None:
            evidence.write_text(json.dumps(observations, indent=2))


def atomic_copy(source, target):
    descriptor, name = tempfile.mkstemp(prefix='.jivo-', dir=target.parent)
    temporary = Path(name)
    try:
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(source.read_bytes())
            stream.flush()
            os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), 0o644)
            os.fchown(stream.fileno(), 0, 0)
        os.replace(temporary, target)
        directory = os.open(target.parent, os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if temporary.exists():
            temporary.unlink()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest-sha', required=True)
    parser.add_argument('--check', action='store_true')
    options = parser.parse_args()
    manifest_path = BASE / 'manifest.json'
    safe(manifest_path)
    if sha(manifest_path) != options.manifest_sha:
        raise RuntimeError('Manifest hash mismatch')
    manifest = json.loads(manifest_path.read_text())
    entries = manifest['files']
    if set(entries) != set(TARGETS):
        raise RuntimeError('Unexpected release scope')
    for name, target in TARGETS.items():
        source = BASE / 'payload' / name
        safe(source)
        if sha(source) != entries[name]['new_sha256']:
            raise RuntimeError('Payload hash mismatch: ' + name)
        if current(target) not in (entries[name]['old_sha256'], entries[name]['new_sha256']):
            raise RuntimeError('Production changed since preflight: ' + name)
        if name.endswith('.js'):
            run('/usr/bin/node', '--check', str(source))
    pid_before = health_pid()
    expected_policies = read_policies(BASE / 'payload' / CONFIG)
    prior_policies = read_policies(TARGETS[CONFIG])
    if options.check:
        print(json.dumps({'marker': 'JIVO_PREFLIGHT_OK', 'files': len(entries), 'api_pid': pid_before, 'commit': manifest['commit']}))
        return
    if os.geteuid() != 0:
        raise RuntimeError('Installation requires interactive sudo')
    for name, digest in manifest['public_dependencies'].items():
        if public_hash('https://voronova.online/' + name) != digest:
            raise RuntimeError('Publish the public chat page first: ' + name)
    backup = Path(tempfile.mkdtemp(prefix='smartplate-jivo-20261030-', dir='/root'))
    os.chmod(backup, 0o700)
    changed = []
    for name, target in TARGETS.items():
        if current(target) == entries[name]['new_sha256']:
            continue
        changed.append(name)
        if target.exists():
            previous = backup / 'old' / name
            previous.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, previous)
            if sha(previous) != entries[name]['old_sha256']:
                raise RuntimeError('Backup hash mismatch: ' + name)
        staged = backup / 'new' / name
        staged.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(BASE / 'payload' / name, staged)
        if sha(staged) != entries[name]['new_sha256']:
            raise RuntimeError('Snapshot hash mismatch: ' + name)
    (backup / 'manifest.json').write_bytes(manifest_path.read_bytes())
    print('BACKUP=' + str(backup), flush=True)
    installed = []
    ordered = sorted(changed, key=lambda name: (name == CONFIG, name.endswith('.html'), name))
    try:
        for name in ordered:
            if current(TARGETS[name]) != entries[name]['old_sha256']:
                raise RuntimeError('Concurrent production change: ' + name)
            atomic_copy(backup / 'new' / name, TARGETS[name])
            installed.append(name)
        run('/usr/sbin/nginx', '-t')
        run('/usr/bin/systemctl', 'reload', 'nginx')
        policy_result = wait_public_policies(expected_policies, evidence=backup / 'installed-csp-observations.json')
        print('JIVO_CSP_READY ' + json.dumps(policy_result), flush=True)
        for name, target in TARGETS.items():
            stat = target.stat()
            if sha(target) != entries[name]['new_sha256'] or (stat.st_uid, stat.st_gid, stat.st_mode & 0o777) != (0, 0, 0o644):
                raise RuntimeError('Installed file mismatch: ' + name)
            if name.startswith('platform/'):
                verify_public_file(name[9:], entries[name]['new_sha256'])
        if health_pid() != pid_before:
            raise RuntimeError('API process changed during static release')
    except Exception:
        for name in reversed(installed):
            target = TARGETS[name]
            if current(target) != entries[name]['new_sha256']:
                raise RuntimeError('Rollback blocked by concurrent change: ' + name)
            if entries[name]['old_sha256'] is None:
                target.unlink()
            else:
                atomic_copy(backup / 'old' / name, target)
            if current(target) != entries[name]['old_sha256']:
                raise RuntimeError('Rollback hash mismatch: ' + name)
        run('/usr/sbin/nginx', '-t')
        run('/usr/bin/systemctl', 'reload', 'nginx')
        wait_public_policies(prior_policies, evidence=backup / 'rollback-csp-observations.json')
        print('JIVO_ROLLED_BACK', flush=True)
        raise
    result = {'marker': 'JIVO_LIVE_OK', 'files': len(entries), 'api_pid': pid_before, 'commit': manifest['commit'], 'backup': str(backup), 'csp': policy_result}
    (backup / 'receipt.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result))


if __name__ == '__main__':
    main()
