#!/usr/bin/env python3
"""Exercise actual nginx reload on a private loopback port, without sudo."""
import hashlib
import importlib.util
import json
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import urllib.request

base = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('oauth_installer', base / 'install-oauth-20261031.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
production = Path('/etc/nginx/sites-available/plate.voronova.online')
before = hashlib.sha256(production.read_bytes()).hexdigest()
old = helper.configured_policies(production.read_text())
new = {name: value.replace("connect-src 'self'", "connect-src https://id.vk.ru 'self'")
       for name, value in old.items()}
assert old != new
rows = []
with tempfile.TemporaryDirectory(prefix='oauth-nginx-reload-') as temporary:
    directory = Path(temporary)
    config = directory / 'nginx.conf'
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]

    def write_config(policies):
        headers = '\n'.join('add_header ' + name + ' "' + value + '" always;' for name, value in policies.items())
        config.write_text('worker_processes 1;\npid ' + str(directory / 'nginx.pid') + ';\nerror_log ' + str(directory / 'error.log') + ' notice;\n'
                          'events { worker_connections 32; }\nhttp { access_log off; server { listen 127.0.0.1:' + str(port) + '; '
                          + headers + ' return 200 "ready"; } }\n')

    def nginx(*args):
        subprocess.run(['/usr/sbin/nginx', '-p', str(directory) + '/', '-c', str(config), *args],
                       check=True, capture_output=True, timeout=10)

    url = 'http://127.0.0.1:' + str(port) + '/login.html'
    try:
        write_config(old)
        nginx()
        helper.wait_public_policies(old, url=url, timeout=5)
        for number in range(8):
            expected = new if number % 2 == 0 else old
            write_config(expected)
            nginx('-s', 'reload')
            with urllib.request.urlopen(url, timeout=2) as response:
                first_matches = all(response.headers.get_all(name) == [value] for name, value in expected.items())
            result = helper.wait_public_policies(expected, url=url, timeout=5)
            for _ in range(3):
                with urllib.request.urlopen(url, timeout=2) as response:
                    assert all(response.headers.get_all(name) == [value] for name, value in expected.items())
            rows.append({'reload': number + 1, 'first_response_matches': first_matches, **result})
    finally:
        if (directory / 'nginx.pid').exists():
            nginx('-s', 'quit')
            for _ in range(50):
                if not (directory / 'nginx.pid').exists():
                    break
                time.sleep(0.1)
            assert not (directory / 'nginx.pid').exists(), 'Isolated nginx did not stop'
        assert hashlib.sha256(production.read_bytes()).hexdigest() == before
print(json.dumps({'marker': 'OAUTH_NGINX_RELOAD_REHEARSAL_OK', 'production_config_unchanged': True,
                  'reloads': rows, 'stale_first_responses': sum(not row['first_response_matches'] for row in rows)}, indent=2))
