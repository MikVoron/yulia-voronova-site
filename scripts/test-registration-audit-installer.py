"""Exercise the installer on disposable files without root or production access."""
import builtins
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
import urllib.error
from unittest.mock import patch


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='registration-audit-installer-test-')
        self.root = Path(self.temp.name)
        script = Path(__file__).with_name('install-registration-audit.py')
        spec = importlib.util.spec_from_file_location('registration_audit_installer', script)
        self.installer = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.installer)
        module = self.installer
        module.BASE = self.root
        self.rows = []
        for name in module.ALLOWED:
            target = self.root / 'installed' / name
            source = self.root / 'runtime' / name
            target.parent.mkdir(parents=True, exist_ok=True)
            source.parent.mkdir(parents=True, exist_ok=True)
            target.write_text('before:' + name)
            source.write_text('after:' + name)
            self.rows.append({'file': name, 'target': str(target),
                              'before': module.sha(target), 'after': module.sha(source)})
        module.ALLOWED = {row['file']: row['target'] for row in self.rows}
        manifest = self.root / 'manifest.json'
        manifest.write_text(json.dumps({'commit': 'synthetic-fixture', 'files': self.rows}))
        self.args = ['install.py', '--manifest-sha', module.sha(manifest)]
        self.restarts = 0
        self.checkpoint_ok = True
        self.fail_verify = False
        original_mkdtemp = tempfile.mkdtemp

        def mkdtemp(*args, **kwargs):
            if kwargs.get('dir') == '/root':
                kwargs['dir'] = self.root
            return original_mkdtemp(*args, **kwargs)

        def open_file(file, *args, **kwargs):
            if str(file) == '/run/lock/smartplate-registration-audit.lock':
                file = self.root / 'fixture.lock'
            return builtins.open(file, *args, **kwargs)

        def run(args, timeout=180):
            if '--create' in args:
                return 'CHECKPOINT_OK' if self.checkpoint_ok else 'checkpoint failed'
            return ''

        def restart():
            self.restarts += 1
            return 123

        def verify(rows):
            self.assertEqual(rows, self.rows)
            for row in rows:
                self.assertEqual(module.sha(row['target']), row['after'])
            if self.fail_verify:
                raise RuntimeError('simulated post-install failure')
            return 123

        module.run = run
        module.health = lambda: 123
        module.api_contract = lambda: None
        module.protected_admin_assets = lambda rows: None
        module.restart = restart
        module.verify = verify
        module.open = open_file
        self.patches = [patch.object(module.os, 'geteuid', return_value=0),
                        patch.object(module.os, 'fchown'),
                        patch.object(module.tempfile, 'mkdtemp', side_effect=mkdtemp)]
        for item in self.patches:
            item.start()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    def invoke(self, *args):
        with patch.object(sys, 'argv', self.args + list(args)):
            self.installer.main()

    def assert_before(self):
        for row in self.rows:
            self.assertEqual(self.installer.sha(row['target']), row['before'])

    def test_preflight_leaves_files_untouched(self):
        self.invoke('--check')
        self.assert_before()
        self.assertEqual(self.restarts, 0)

    def test_success_installs_four_files_and_restarts_once(self):
        self.invoke()
        self.installer.verify(self.rows)
        self.assertEqual(self.restarts, 1)
        backups = list(self.root.glob('smartplate-registration-audit-20261110-*'))
        self.assertEqual(len(backups), 1)
        for row in self.rows:
            self.assertEqual(self.installer.sha(backups[0] / 'before' / row['file']), row['before'])
        self.invoke()
        self.assertEqual(self.restarts, 1, 'An already-installed release must not restart again')

    def test_failed_verification_rolls_back_all_files(self):
        self.fail_verify = True
        with self.assertRaisesRegex(RuntimeError, 'simulated post-install failure'):
            self.invoke()
        self.assert_before()
        self.assertEqual(self.restarts, 2)

    def test_checkpoint_failure_prevents_installation(self):
        self.checkpoint_ok = False
        with self.assertRaisesRegex(RuntimeError, 'Checkpoint did not complete'):
            self.invoke()
        self.assert_before()
        self.assertEqual(self.restarts, 0)

    def test_stale_manifest_is_rejected(self):
        (self.root / 'manifest.json').write_text('{}')
        with self.assertRaisesRegex(RuntimeError, 'Manifest changed'):
            self.invoke()
        self.assert_before()

    def test_changed_payload_is_rejected(self):
        (self.root / 'runtime' / self.rows[0]['file']).write_text('changed payload')
        with self.assertRaisesRegex(RuntimeError, 'Payload mismatch'):
            self.invoke()
        self.assert_before()

    def test_production_drift_is_preserved(self):
        target = Path(self.rows[0]['target'])
        target.write_text('concurrent change')
        with self.assertRaisesRegex(RuntimeError, 'production drift'):
            self.invoke()
        self.assertEqual(target.read_text(), 'concurrent change')
        self.assertEqual(self.restarts, 0)

    def test_partial_installation_is_rejected(self):
        row = self.rows[0]
        shutil.copyfile(self.root / 'runtime' / row['file'], row['target'])
        with self.assertRaisesRegex(RuntimeError, 'Partial or concurrent installation'):
            self.invoke()
        self.assertEqual(self.restarts, 0)

    def test_missing_basic_barrier_prevents_installation(self):
        def fail(rows):
            raise RuntimeError('missing Basic authentication')
        self.installer.protected_admin_assets = fail
        with self.assertRaisesRegex(RuntimeError, 'missing Basic authentication'):
            self.invoke()
        self.assert_before()
        self.assertEqual(self.restarts, 0)


class ProtectedAssetTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location(
            'registration_audit_http', Path(__file__).with_name('install-registration-audit.py'))
        self.installer = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.installer)
        self.url = 'https://plate.voronova.online/admin.js?v=fixture'

    def test_expected_basic_challenge_is_accepted(self):
        error = urllib.error.HTTPError(self.url, 401, 'Unauthorized',
                                       {'WWW-Authenticate': 'Basic realm="SmartPlate administration"'}, None)
        with patch.object(self.installer.urllib.request, 'urlopen', side_effect=error):
            self.installer.protected_admin_asset(self.url)

    def test_wrong_authentication_challenge_is_rejected(self):
        error = urllib.error.HTTPError(self.url, 401, 'Unauthorized',
                                       {'WWW-Authenticate': 'Bearer realm="API"'}, None)
        with patch.object(self.installer.urllib.request, 'urlopen', side_effect=error):
            with self.assertRaisesRegex(RuntimeError, 'Expected HTTP 401 with Basic challenge'):
                self.installer.protected_admin_asset(self.url)

    def test_other_http_errors_are_rejected(self):
        for status in [403, 404, 500]:
            with self.subTest(status=status):
                error = urllib.error.HTTPError(self.url, status, 'Error', {}, None)
                with patch.object(self.installer.urllib.request, 'urlopen', side_effect=error):
                    with self.assertRaisesRegex(RuntimeError, 'Expected HTTP 401 with Basic challenge'):
                        self.installer.protected_admin_asset(self.url)

    def test_unprotected_success_is_rejected(self):
        from unittest.mock import MagicMock
        with patch.object(self.installer.urllib.request, 'urlopen', return_value=MagicMock()):
            with self.assertRaisesRegex(RuntimeError, 'unexpectedly accessible'):
                self.installer.protected_admin_asset(self.url)


if __name__ == '__main__':
    unittest.main()
