#!/usr/bin/env python3
"""Reproduce invalid ingredient URLs and verify public probes before any write."""
import contextlib
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
import urllib.error
import urllib.parse
import urllib.request

SOURCE = Path(__file__).with_name('install-review-like-style-20261108.py')
CSS = b'.discussion-like { background: transparent; }'
MARKER = b'review-discussions.css?v=20261108-like-spacing'


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        query = urllib.parse.parse_qs(url.query)
        self.server.requests.append(self.path)
        contexts = {'/recipe.html': ('id', 'cutlets-chicken-nuggets-cornflakes'), '/category.html': ('cat', 'cutlets'), '/ingredient.html': ('id', 'chicken')}
        if url.path == self.server.fail_path:
            self.send_error(404)
            return
        if url.path == '/review-discussions.css':
            body = CSS
        elif url.path in contexts:
            key, value = contexts[url.path]
            if query.get(key) != [value]:
                self.send_error(404)
                return
            body = b'<html><link href="' + (MARKER if self.server.has_marker else b'other.css') + b'"></html>'
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class PublicProbeTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location('style_release', SOURCE)
        self.m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.m)
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.server.requests = []
        self.server.fail_path = None
        self.server.has_marker = True
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.m.PUBLIC_ORIGIN = 'http://127.0.0.1:' + str(self.server.server_port)

    def fixture(self):
        temporary = tempfile.TemporaryDirectory(prefix='review-like-style-fixture-')
        self.addCleanup(temporary.cleanup)
        m = self.m
        m.BASE = Path(temporary.name).resolve() / 'staging'
        m.ROOT = Path(temporary.name).resolve() / 'live'
        (m.BASE / 'payload').mkdir(parents=True)
        m.ROOT.mkdir()
        rows = {}
        for name in m.NAMES:
            (m.ROOT / name).write_bytes(b'old ' + name.encode())
            (m.BASE / 'payload' / name).write_bytes(CSS if name.endswith('.css') else b'new ' + name.encode())
            rows[name] = {'old_sha256': m.sha(m.ROOT / name), 'new_sha256': m.sha(m.BASE / 'payload' / name)}
        (m.BASE / 'manifest.json').write_text(json.dumps({'files': rows, 'commit': 'fixture'}))
        m.MANIFEST_SHA = m.sha(m.BASE / 'manifest.json')
        return rows

    def test_old_ingredient_url_reproduces_404(self):
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(self.m.PUBLIC_ORIGIN + '/ingredient.html?release=3ece43be')
        self.assertEqual(error.exception.code, 404)

    def test_all_correct_contexts_pass(self):
        for name in self.m.NAMES:
            self.assertTrue(self.m.public_matches(name, hashlib.sha256(CSS).hexdigest()))
        self.assertTrue(any('ingredient.html?id=chicken&' in path for path in self.server.requests))
        self.assertTrue(any('category.html?cat=cutlets&' in path for path in self.server.requests))

    def test_css_hash_and_html_marker_are_checked(self):
        self.assertFalse(self.m.public_matches('review-discussions.css', '0' * 64))
        self.server.has_marker = False
        self.assertFalse(self.m.public_matches('ingredient.html', 'unused-for-rendered-html'))

    def test_preflight_reads_all_public_urls_without_writes(self):
        rows = self.fixture()
        with patch('sys.argv', ['install.py', '--check']), patch.object(self.m, 'health'), patch.object(self.m, 'pid', return_value=616693), patch.object(self.m, 'atomic_copy') as install, contextlib.redirect_stdout(io.StringIO()) as output:
            self.m.main()
        install.assert_not_called()
        self.assertEqual(len(self.server.requests), 4)
        self.assertIn('REVIEW_LIKE_STYLE_PREFLIGHT_OK', output.getvalue())
        for name, row in rows.items():
            self.assertEqual(self.m.sha(self.m.ROOT / name), row['old_sha256'])

    def test_failed_public_probe_stops_apply_before_privileged_writes(self):
        rows = self.fixture()
        self.server.fail_path = '/ingredient.html'
        with patch('sys.argv', ['install.py']), patch.object(self.m, 'health'), patch.object(self.m, 'pid', return_value=616693), patch.object(self.m, 'atomic_copy') as install:
            with self.assertRaisesRegex(RuntimeError, r'ingredient.html\?id=chicken.*HTTP 404'):
                self.m.main()
        install.assert_not_called()
        for name, row in rows.items():
            self.assertEqual(self.m.sha(self.m.ROOT / name), row['old_sha256'])

    def test_wrong_html_stops_preflight_before_writes(self):
        self.fixture()
        self.server.has_marker = False
        with patch('sys.argv', ['install.py', '--check']), patch.object(self.m, 'health'), patch.object(self.m, 'pid', return_value=616693), patch.object(self.m, 'atomic_copy') as install:
            with self.assertRaisesRegex(RuntimeError, 'lacks the discussion stylesheet'):
                self.m.main()
        install.assert_not_called()


if __name__ == '__main__':
    unittest.main()
