"""Regression: public SEO responses differ from the hash-checked disk template."""
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import os
from pathlib import Path
import threading
import unittest
from urllib.parse import parse_qs, urlsplit

spec = importlib.util.spec_from_file_location('jivo_installer', os.environ.get('JIVO_INSTALLER_PATH', Path(__file__).with_name('install-jivo-20261030.py')))
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


def document(path):
    return ('<html><head><title>Dynamic SEO title</title>'
            '<link rel="canonical" href="https://plate.voronova.online' + path + '">'
            '<script id="smartplate-page-schema" type="application/ld+json">{}</script>'
            '<link rel="stylesheet" href="jivo-chat-modal.css?v=20261030-jivo"></head>'
            '<body><a data-support-open href="https://voronova.online/support-chat.html">Support</a>'
            '<script src="jivo-chat-modal.js?v=20261030-jivo"></script></body></html>').encode()


class PublicVerificationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                cls.requests.append(self.path)
                parts = urlsplit(self.path)
                query = parse_qs(parts.query)
                name = parts.path[1:]
                path = installer.SEO_DOCUMENTS.get(name)
                valid = (name == 'recipe.html' and query.get('id') == ['hummus'] or
                         name == 'ingredient.html' and query.get('id') == ['pumpkin'] or
                         name == 'category.html')
                if cls.force_404 or name in installer.SEO_DOCUMENTS and not valid:
                    self.send_error(404)
                    return
                body = document(path) if path else b'exact static bytes'
                if cls.bad_wiring:
                    body = body.replace(b'jivo-chat-modal.js', b'tawk-chat-modal.js')
                if cls.bad_canonical:
                    body = body.replace(b'id=pumpkin', b'id=incorrect')
                self.send_response(200)
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.origin = 'http://127.0.0.1:' + str(cls.server.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        self.__class__.force_404 = False
        self.__class__.bad_wiring = False
        self.__class__.bad_canonical = False
        self.__class__.requests = []

    def test_rendered_documents_use_valid_urls_and_need_not_match_template_hash(self):
        for name in installer.SEO_DOCUMENTS:
            with self.subTest(name=name):
                installer.verify_public_file(name, 'unrendered-template-hash', self.origin)
                parsed = urlsplit(self.requests[-1])
                self.assertIn('jivo_release', parse_qs(parsed.query))
                if name == 'ingredient.html':
                    self.assertEqual(parse_qs(parsed.query)['id'], ['pumpkin'])

    def test_stale_chat_in_rendered_html_is_rejected(self):
        self.__class__.bad_wiring = True
        with self.assertRaisesRegex(RuntimeError, 'Rendered chat wiring mismatch'):
            installer.verify_public_file('ingredient.html', 'irrelevant', self.origin)

    def test_wrong_rendered_canonical_is_rejected(self):
        self.__class__.bad_canonical = True
        with self.assertRaisesRegex(RuntimeError, 'Rendered canonical mismatch'):
            installer.verify_public_file('ingredient.html', 'irrelevant', self.origin)

    def test_static_assets_still_require_exact_bytes(self):
        digest = hashlib.sha256(b'exact static bytes').hexdigest()
        installer.verify_public_file('cabinet.js', digest, self.origin)
        with self.assertRaisesRegex(RuntimeError, 'Public file mismatch: cabinet.js'):
            installer.verify_public_file('cabinet.js', 'wrong', self.origin)

    def test_failed_public_request_reports_the_actual_url(self):
        self.__class__.force_404 = True
        with self.assertRaisesRegex(RuntimeError, r'ingredient\.html\?id=pumpkin') as failure:
            installer.verify_public_file('ingredient.html', 'irrelevant', self.origin)
        self.assertEqual(failure.exception.__cause__.code, 404)


if __name__ == '__main__':
    unittest.main()
