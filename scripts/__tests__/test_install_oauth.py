"""Unprivileged Linux rehearsal. Production paths/services/DB are never used."""
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from http.client import HTTPMessage
from unittest.mock import patch

MODULE_PATH = Path(__file__).resolve().parents[1] / 'install-oauth-20261031.py'
spec = importlib.util.spec_from_file_location('oauth_installer', MODULE_PATH)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
SECRET = 'isolated-secret-do-not-print-0123456789'


class OAuthInstallerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='smartplate-oauth-install-test-')
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.stage = self.base / 'stage'
        self.stage.mkdir()
        self.api = {'server/src/oauth-accounts.js': str(self.base / 'api/accounts.js'), 'server/src/routes/oauth.js': str(self.base / 'api/oauth.js')}
        self.frontend = {'platform/login.html': str(self.base / 'platform/login.html')}
        self.nginx = {'server/nginx/plate.voronova.online': str(self.base / 'nginx/plate')}
        self.targets = {**self.nginx, **self.api, **self.frontend}
        self.env = self.base / 'api/.env'
        for path in self.targets.values():
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        for name, path in self.targets.items():
            if 'accounts.js' not in name:
                Path(path).write_bytes(('old-' + name).encode())
                os.chmod(path, 0o644)
        self.old_env = b'SMTP_PASS="keep this literal"\nJWT_SECRET=leave_untouched\nYANDEX_CLIENT_SECRET=old\n'
        self.env.write_bytes(self.old_env)
        os.chmod(self.env, 0o640)
        self.checkpoint = self.base / 'checkpoint.sh'
        self.checkpoint.write_text("#!/bin/bash\nprintf 'CHECKPOINT_OK\\n'\n")
        self.payload = {name: ('new-' + name).encode() for name in self.targets}
        self.manifest = {'version': 1, 'commit': 'test-commit', 'checkpoint_script_sha256': helper.digest(self.checkpoint.read_bytes()),
                         'files': {name: {'old_sha256': helper.current_hash(Path(path)), 'new_sha256': helper.digest(self.payload[name])} for name, path in self.targets.items()}}
        self.new_env = helper.merge_environment(self.old_env, {**helper.DESIRED, 'YANDEX_CLIENT_SECRET': SECRET})
        self.actual_mkdtemp = tempfile.mkdtemp
        self.install_order = []
        self.real_checked_install = helper.checked_install
        patches = [
            patch.object(helper, 'BASE', self.stage), patch.object(helper, 'API', self.api), patch.object(helper, 'FRONTEND', self.frontend),
            patch.object(helper, 'NGINX', self.nginx), patch.object(helper, 'TARGETS', self.targets), patch.object(helper, 'ENV_FILE', self.env),
            patch.object(helper, 'CHECKPOINT', self.checkpoint), patch.object(helper.os, 'fchown', lambda *args: None),
            patch.object(helper.tempfile, 'mkdtemp', lambda prefix, dir: self.actual_mkdtemp(prefix=prefix, dir=self.base)),
            patch.object(helper, 'preflight', return_value=(100, self.new_env)), patch.object(helper, 'health'),
            patch.object(helper, 'api_identity', return_value=100), patch.object(helper, 'restart_api', return_value=101),
            patch.object(helper, 'verify_api', return_value=101), patch.object(helper, 'verify_public_csp'),
            patch.object(helper, 'verify_install', return_value=101), patch.object(helper, 'run', return_value=''),
            patch.object(helper, 'load_state', side_effect=lambda directory: (Path(directory), json.loads((Path(directory) / 'state.json').read_text()))),
            patch.object(helper, 'checked_install', side_effect=self.install)
        ]
        for item in patches:
            item.start()
            self.addCleanup(item.stop)

    def install(self, directory, entry):
        self.install_order.append(entry['name'])
        return self.real_checked_install(directory, entry)

    def assert_original(self):
        for name, target in self.targets.items():
            self.assertEqual(helper.current_hash(Path(target)), self.manifest['files'][name]['old_sha256'])
        self.assertEqual(self.env.read_bytes(), self.old_env)

    def apply(self):
        output = io.StringIO()
        try:
            with contextlib.redirect_stdout(output):
                helper.apply(self.manifest, self.payload)
        finally:
            self.assertNotIn(SECRET, output.getvalue())
            self.output = output.getvalue()

    def test_success_orders_phases_and_keeps_secret_private(self):
        self.apply()
        self.assertEqual(self.install_order, [*self.nginx, *self.api, 'environment', *self.frontend])
        self.assertIn('OAUTH_RELEASE_INSTALLED', self.output)
        self.assertIn('"provider_login_verified": false', self.output)
        for name, target in self.targets.items():
            self.assertEqual(Path(target).read_bytes(), self.payload[name])
        self.assertEqual(self.env.read_bytes(), self.new_env)
        self.assertEqual(self.env.stat().st_mode & 0o777, 0o640)
        directory = next(self.base.glob('smartplate-oauth-release-*'))
        self.assertEqual(directory.stat().st_mode & 0o777, 0o700)
        self.assertEqual((directory / 'old/environment').stat().st_mode & 0o777, 0o600)
        self.assertEqual((directory / 'new/environment').stat().st_mode & 0o777, 0o600)
        self.assertEqual(json.loads((directory / 'state.json').read_text())['status'], 'installed')

    def test_bad_nginx_rolls_back_before_touching_api_or_environment(self):
        calls = 0
        def command(*args, **kwargs):
            nonlocal calls
            if args[:2] == ('/usr/sbin/nginx', '-t'):
                calls += 1
                if calls == 1:
                    raise RuntimeError('synthetic nginx failure')
            return ''
        helper.run.side_effect = command
        with self.assertRaises(RuntimeError):
            self.apply()
        self.assert_original()
        helper.restart_api.assert_not_called()
        self.assertIn('OAUTH_RELEASE_ROLLED_BACK', self.output)

    def test_bad_api_restores_config_code_and_environment(self):
        helper.verify_api.side_effect = RuntimeError('synthetic API failure')
        with self.assertRaises(RuntimeError):
            self.apply()
        self.assert_original()
        self.assertEqual(helper.restart_api.call_count, 2)
        self.assertNotIn('platform/login.html', self.install_order)

    def test_failed_frontend_verification_rolls_back_the_entire_release(self):
        helper.verify_install.side_effect = RuntimeError('synthetic served-hash mismatch')
        with self.assertRaises(RuntimeError):
            self.apply()
        self.assert_original()
        self.assertIn('OAUTH_RELEASE_ROLLED_BACK', self.output)

    def test_checkpoint_failure_leaves_production_untouched(self):
        self.checkpoint.write_text('#!/bin/bash\nexit 1\n')
        self.manifest['checkpoint_script_sha256'] = helper.digest(self.checkpoint.read_bytes())
        with self.assertRaises(RuntimeError):
            self.apply()
        self.assert_original()
        self.assertEqual(self.install_order, [])
        helper.run.assert_not_called()

    def test_preflight_refusal_precedes_any_mutation(self):
        helper.preflight.side_effect = RuntimeError('synthetic old-hash mismatch')
        with self.assertRaises(RuntimeError):
            self.apply()
        self.assert_original()
        self.assertEqual(self.install_order, [])
        self.assertEqual(list(self.base.glob('smartplate-oauth-release-*')), [])

    def test_concurrent_file_change_is_never_overwritten_by_rollback(self):
        directory, state = helper.snapshot(self.manifest, self.payload, self.new_env)
        for entry in state['entries']:
            self.real_checked_install(directory, entry)
        target = Path(next(iter(self.frontend.values())))
        target.write_bytes(b'concurrent-release')
        with self.assertRaisesRegex(RuntimeError, 'concurrent change'):
            helper.rollback(directory)
        self.assertEqual(target.read_bytes(), b'concurrent-release')
        self.assertEqual(self.env.read_bytes(), self.new_env)

    def test_corrupted_backup_is_detected_before_any_rollback_write(self):
        directory, state = helper.snapshot(self.manifest, self.payload, self.new_env)
        for entry in state['entries']:
            self.real_checked_install(directory, entry)
        (directory / 'old/environment').write_bytes(b'corrupt')
        with self.assertRaisesRegex(RuntimeError, 'Rollback copy changed'):
            helper.rollback(directory)
        self.assertEqual(self.env.read_bytes(), self.new_env)
        self.assertEqual(Path(next(iter(self.frontend.values()))).read_bytes(), self.payload[next(iter(self.frontend))])

    def test_symbolic_link_target_is_refused(self):
        victim = self.base / 'victim'
        victim.write_bytes(b'untouched')
        link = self.base / 'symlink'
        link.symlink_to(victim)
        with self.assertRaisesRegex(RuntimeError, 'Unsafe path'):
            helper.atomic_write(link, b'bad')
        self.assertEqual(victim.read_bytes(), b'untouched')

    def test_environment_merge_preserves_unrelated_literal_values(self):
        values = {**helper.DESIRED, 'YANDEX_CLIENT_SECRET': SECRET}
        body = helper.merge_environment(self.old_env + b'export VK_APP_ID=old\nVK_APP_ID=duplicate\n', values)
        self.assertIn(b'SMTP_PASS="keep this literal"\nJWT_SECRET=leave_untouched\n', body)
        self.assertEqual(body.count(b'VK_APP_ID='), 1)
        self.assertNotIn(b'YANDEX_CLIENT_SECRET=old', body)
        self.assertEqual(body.count(SECRET.encode()), 1)

    def test_multiline_oauth_environment_is_refused(self):
        with self.assertRaises(RuntimeError):
            helper.merge_environment(b'YANDEX_CLIENT_SECRET="two\nlines"\n', {'YANDEX_CLIENT_SECRET': SECRET})

    def test_bad_credentials_do_not_expose_their_value(self):
        bodies = [b'YANDEX_CLIENT_SECRET=bad', ('VK_APP_ID=54502528\nYANDEX_CLIENT_ID=wrong\nYANDEX_CLIENT_SECRET=' + SECRET).encode()]
        for body in bodies:
            with self.assertRaises(RuntimeError) as caught:
                helper.environment_values(body)
            self.assertNotIn(SECRET, str(caught.exception))

    def test_pm2_override_refusal_reports_only_the_key_name(self):
        helper.run.return_value = json.dumps([{'name': 'smartplate-api', 'pm2_env': {'pm_cwd': str(self.env.parent), 'env': {'YANDEX_CLIENT_SECRET': 'different-private-value'}}}])
        with self.assertRaises(RuntimeError) as caught:
            helper.pm2_and_database_check({'YANDEX_CLIENT_SECRET': SECRET})
        self.assertIn('YANDEX_CLIENT_SECRET', str(caught.exception))
        self.assertNotIn(SECRET, str(caught.exception))
        self.assertNotIn('different-private-value', str(caught.exception))

    def package(self):
        manifest = {**self.manifest, 'installer_sha256': helper.digest(MODULE_PATH.read_bytes())}
        for name, body in self.payload.items():
            path = self.stage / 'payload' / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(body)
        encoded = json.dumps(manifest).encode()
        (self.stage / 'manifest.json').write_bytes(encoded)
        return helper.digest(encoded)

    def test_valid_package_is_bound_to_exact_installer_and_payload(self):
        manifest, payload = helper.load_package(self.package())
        self.assertEqual(manifest['commit'], 'test-commit')
        self.assertEqual(payload, self.payload)

    def test_changed_manifest_is_refused(self):
        self.package()
        with self.assertRaisesRegex(RuntimeError, 'Manifest SHA-256 mismatch'):
            helper.load_package('0' * 64)

    def test_changed_payload_is_refused(self):
        sha = self.package()
        (self.stage / 'payload' / next(iter(self.frontend))).write_bytes(b'unreviewed')
        with self.assertRaisesRegex(RuntimeError, 'Payload SHA-256 mismatch'):
            helper.load_package(sha)

    def test_manifest_cannot_extend_release_scope(self):
        self.package()
        path = self.stage / 'manifest.json'
        data = json.loads(path.read_text())
        data['files']['unrelated/path'] = {'old_sha256': None, 'new_sha256': '0' * 64}
        encoded = json.dumps(data).encode()
        path.write_bytes(encoded)
        with self.assertRaisesRegex(RuntimeError, 'Unexpected release scope'):
            helper.load_package(helper.digest(encoded))

    def test_symlink_payload_is_refused(self):
        sha = self.package()
        target = self.stage / 'payload' / next(iter(self.frontend))
        target.unlink()
        target.symlink_to(self.env)
        with self.assertRaisesRegex(RuntimeError, 'Unsafe path'):
            helper.load_package(sha)


class PublicPolicyTests(unittest.TestCase):
    expected = {'Content-Security-Policy': "default-src 'self'; frame-src https://id.vk.ru",
                'Content-Security-Policy-Report-Only': "default-src 'self'; frame-src https://id.vk.ru"}

    def response(self, values=None, duplicate=False):
        headers = HTTPMessage()
        for name, value in (values or self.expected).items():
            headers.add_header(name, value)
        if duplicate:
            headers.add_header('Content-Security-Policy', "default-src 'none'")
        response = unittest.mock.MagicMock()
        response.__enter__.return_value.headers = headers
        return response

    def test_reload_waits_for_two_consecutive_exact_policies(self):
        old = {name: "default-src 'self'" for name in self.expected}
        rows = [self.response(old), self.response(), self.response(old), self.response(), self.response()]
        with patch.object(helper.urllib.request, 'urlopen', side_effect=rows) as fetch, patch.object(helper.time, 'sleep'):
            result = helper.wait_public_policies(self.expected)
        self.assertEqual(result['attempts'], 5)
        urls = [call.args[0].full_url for call in fetch.call_args_list]
        self.assertEqual(len(set(urls)), 5)
        self.assertTrue(all('oauth_csp=' in url for url in urls))
        self.assertEqual(fetch.call_args.args[0].get_header('Connection'), 'close')
        self.assertEqual(fetch.call_args.args[0].get_header('Cache-control'), 'no-cache')

    def test_stale_report_only_policy_is_refused(self):
        values = {**self.expected, 'Content-Security-Policy-Report-Only': "default-src 'none'"}
        with patch.object(helper.urllib.request, 'urlopen', return_value=self.response(values)):
            with self.assertRaisesRegex(RuntimeError, 'both exact configured policies'):
                helper.wait_public_policies(self.expected, timeout=0)

    def test_duplicate_enforcement_header_is_refused(self):
        with patch.object(helper.urllib.request, 'urlopen', return_value=self.response(duplicate=True)):
            with self.assertRaises(RuntimeError):
                helper.wait_public_policies(self.expected, timeout=0)

    def test_transient_reload_connection_failure_can_recover(self):
        rows = [helper.urllib.error.URLError('temporary reload'), self.response(), self.response()]
        with patch.object(helper.urllib.request, 'urlopen', side_effect=rows), patch.object(helper.time, 'sleep'):
            self.assertEqual(helper.wait_public_policies(self.expected)['attempts'], 3)

    def test_permanent_connection_failure_times_out(self):
        with patch.object(helper.urllib.request, 'urlopen', side_effect=helper.urllib.error.URLError('unavailable')):
            with self.assertRaises(RuntimeError):
                helper.wait_public_policies(self.expected, timeout=0)

    def test_duplicate_configured_policies_are_refused(self):
        source = '\n'.join('add_header ' + name + ' "' + value + '" always;' for name, value in self.expected.items())
        self.assertEqual(helper.configured_policies(source), self.expected)
        with self.assertRaises(RuntimeError):
            helper.configured_policies(source + '\n' + source)


if __name__ == '__main__':
    unittest.main()
