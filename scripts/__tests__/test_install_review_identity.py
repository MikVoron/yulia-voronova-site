"""Temporary-file guard and rollback checks; no production services or writes."""
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'install-review-identity-20261115.py'
spec = importlib.util.spec_from_file_location('review_identity_installer', SCRIPT)
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='review-identity-test-')
        self.addCleanup(self.directory.cleanup)
        self.base = Path(self.directory.name)
        self.target = self.base / 'production.js'
        self.before = installer.OLD_FIELDS + b'\n' + installer.OLD_FLAG + b'\n'
        self.after = self.before.replace(installer.OLD_FIELDS, installer.NEW_FIELDS).replace(installer.OLD_FLAG, installer.NEW_FLAG)
        self.target.write_bytes(self.before)
        (self.base / 'before.js').write_bytes(self.before)
        self.source = self.base / 'payload' / installer.NAME
        self.source.parent.mkdir(parents=True)
        self.source.write_bytes(self.after)
        self.manifest = {'release': installer.RELEASE, 'commit': 'test-commit', 'smoke_recipe': 'fixture',
                         'installer_sha256': installer.sha(SCRIPT),
                         'files': {installer.NAME: {'before': installer.sha(self.target), 'after': installer.sha(self.source)}}}
        (self.base / 'manifest.json').write_text(json.dumps(self.manifest))
        self.manifest_sha = installer.sha(self.base / 'manifest.json')
        self.backups = self.base / 'backups'
        self.backups.mkdir()
        for name, value in [('BASE', self.base), ('TARGET', self.target)]:
            mocked = patch.object(installer, name, value)
            mocked.start()
            self.addCleanup(mocked.stop)

    def preflight(self):
        with patch.object(installer, 'run'), patch.object(installer, 'health', return_value=99):
            return installer.preflight(self.manifest_sha)

    def apply(self, verifier):
        with patch.object(installer.os, 'geteuid', return_value=0), \
             patch.object(installer, 'backup_directory', return_value=self.backups), \
             patch.object(installer, 'atomic_copy', side_effect=shutil.copyfile), \
             patch.object(installer, 'restart', return_value=99) as restart, \
             patch.object(installer, 'verify', side_effect=verifier):
            try:
                return installer.apply(self.manifest, self.source)
            finally:
                self.restart_count = restart.call_count

    def test_accepts_only_the_exact_identity_patch(self):
        self.preflight()
        with self.assertRaisesRegex(RuntimeError, 'outside the identity fix'):
            installer.exact_patch(self.before, self.after + b'// unrelated change')

    def test_rejects_a_tampered_manifest(self):
        with self.assertRaisesRegex(RuntimeError, 'Manifest hash mismatch'):
            installer.preflight('0' * 64)

    def test_rejects_a_tampered_payload(self):
        self.source.write_bytes(self.after + b'// tampered')
        with self.assertRaisesRegex(RuntimeError, 'Staged file hash mismatch'):
            self.preflight()

    def test_rejects_concurrent_production_changes(self):
        self.target.write_bytes(b'unrelated production update')
        with self.assertRaisesRegex(RuntimeError, 'Production changed'):
            self.preflight()

    def test_requires_privilege_before_installing(self):
        with patch.object(installer.os, 'geteuid', return_value=1000):
            with self.assertRaisesRegex(RuntimeError, 'interactive sudo'):
                installer.apply(self.manifest, self.source)
        self.assertEqual(self.target.read_bytes(), self.before)

    def test_installs_and_keeps_a_protected_snapshot(self):
        result = self.apply(lambda manifest: {'api_pid': 99})
        self.assertEqual(result['marker'], 'REVIEW_IDENTITY_RELEASE_OK')
        self.assertEqual(self.target.read_bytes(), self.after)
        self.assertEqual((Path(result['backup']) / 'before.js').read_bytes(), self.before)
        self.assertEqual(self.restart_count, 1)

    def test_rolls_back_when_post_install_verification_fails(self):
        with self.assertRaisesRegex(RuntimeError, 'failed verification'):
            self.apply(lambda manifest: (_ for _ in ()).throw(RuntimeError('failed verification')))
        self.assertEqual(self.target.read_bytes(), self.before)
        self.assertEqual(self.restart_count, 2)

    def test_does_not_overwrite_a_concurrent_change_during_rollback(self):
        def changed(manifest):
            self.target.write_bytes(b'concurrent update')
            raise RuntimeError('failed verification')
        with self.assertRaisesRegex(RuntimeError, 'Refusing rollback'):
            self.apply(changed)
        self.assertEqual(self.target.read_bytes(), b'concurrent update')


if __name__ == '__main__':
    unittest.main()
