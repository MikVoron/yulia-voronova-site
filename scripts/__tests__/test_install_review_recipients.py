"""Release guards and rollback against temporary files only; Linux required."""
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'install-review-recipients-20261115.py'
spec = importlib.util.spec_from_file_location('review_recipient_installer', SCRIPT)
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class InstallerTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix='review-recipient-test-')
        self.addCleanup(directory.cleanup)
        self.base = Path(directory.name)
        self.targets = {}
        rows = {}
        for name in installer.FILES:
            target = self.base / 'production' / name
            source = self.base / 'payload' / name
            target.parent.mkdir(parents=True, exist_ok=True)
            source.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b'before ' + name.encode())
            source.write_bytes(b'after ' + name.encode())
            self.targets[name] = target
            rows[name] = {'before': installer.common.sha(target), 'after': installer.common.sha(source)}
        self.manifest = {'release': installer.RELEASE, 'commit': 'test-only',
                         'installer_sha256': installer.common.sha(SCRIPT), 'files': rows}
        self.write_manifest()
        self.backups = self.base / 'backups'
        self.backups.mkdir()
        for name, value in [('BASE', self.base), ('TARGETS', self.targets)]:
            mocked = patch.object(installer, name, value)
            mocked.start()
            self.addCleanup(mocked.stop)

    def write_manifest(self):
        file = self.base / 'manifest.json'
        file.write_text(json.dumps(self.manifest))
        self.manifest_sha = installer.common.sha(file)

    def preflight(self):
        with patch.object(installer.common, 'run'), patch.object(installer.common, 'health', return_value=99):
            return installer.preflight(self.manifest_sha)

    def apply(self, verifier):
        with patch.object(installer.os, 'geteuid', return_value=0), \
             patch.object(installer.common, 'backup_directory', return_value=self.backups), \
             patch.object(installer.common, 'atomic_copy', side_effect=shutil.copyfile) as copy, \
             patch.object(installer.common, 'restart', return_value=99) as restart, \
             patch.object(installer, 'verify', side_effect=verifier):
            try:
                return installer.apply(self.manifest)
            finally:
                self.restart_count = restart.call_count
                self.install_order = [args[0][1] for args in copy.call_args_list]

    def test_manifest_tamper_is_rejected(self):
        (self.base / 'manifest.json').write_text('{}')
        with self.assertRaisesRegex(RuntimeError, 'Manifest hash mismatch'):
            self.preflight()

    def test_payload_tamper_is_rejected(self):
        (self.base / 'payload' / installer.API).write_bytes(b'tampered')
        with self.assertRaisesRegex(RuntimeError, 'Payload hash mismatch'):
            self.preflight()

    def test_scope_expansion_is_rejected(self):
        self.manifest['files']['server/.env'] = {}
        self.write_manifest()
        with self.assertRaisesRegex(RuntimeError, 'Unexpected release scope'):
            self.preflight()

    def test_concurrent_production_changes_are_rejected(self):
        self.targets[installer.API].write_bytes(b'concurrent update')
        with self.assertRaisesRegex(RuntimeError, 'Production changed'):
            self.preflight()

    def test_requires_sudo(self):
        with patch.object(installer.os, 'geteuid', return_value=1000):
            with self.assertRaisesRegex(RuntimeError, 'interactive sudo'):
                installer.apply(self.manifest)

    def test_installs_api_first_and_preserves_all_previous_files(self):
        self.preflight()
        result = self.apply(lambda manifest: {'api_pid': 99})
        self.assertEqual(result['marker'], 'REVIEW_RECIPIENTS_RELEASE_OK')
        self.assertEqual(self.install_order[0], self.targets[installer.API])
        self.assertEqual(self.restart_count, 1)
        for name in installer.FILES:
            self.assertEqual(installer.common.sha(self.targets[name]), self.manifest['files'][name]['after'])
            self.assertEqual(installer.common.sha(Path(result['backup']) / 'before' / name), self.manifest['files'][name]['before'])

    def test_rolls_back_all_installed_files_on_failed_verification(self):
        def failed(manifest):
            raise RuntimeError('failed verification')
        with self.assertRaisesRegex(RuntimeError, 'failed verification'):
            self.apply(failed)
        self.assertEqual(self.restart_count, 2)
        for name in installer.FILES:
            self.assertEqual(installer.common.sha(self.targets[name]), self.manifest['files'][name]['before'])

    def test_does_not_roll_back_over_concurrent_updates(self):
        def failed(manifest):
            self.targets[installer.FILES[-1]].write_bytes(b'concurrent update')
            raise RuntimeError('failed verification')
        with self.assertRaisesRegex(RuntimeError, 'Refusing rollback'):
            self.apply(failed)
        self.assertEqual(self.targets[installer.FILES[-1]].read_bytes(), b'concurrent update')

    def test_accepts_real_names_and_the_genuinely_missing_name(self):
        for review in ({'author': 'Женя', 'authorName': 'Женя'},
                       {'author': 'Аноним', 'authorName': None},
                       {'author': 'Аноним', 'authorName': 'Аноним'}):
            with patch.object(installer, 'FILES', [installer.API]), \
                 patch.object(installer.common, 'fetch', return_value=[review]):
                installer.public_contract(self.manifest, True)

    def test_rejects_a_missing_or_incorrect_name_field(self):
        for review in ({'author': 'Женя'}, {'author': 'Женя', 'authorName': None},
                       {'author': 'Женя', 'authorName': ''}):
            with patch.object(installer, 'FILES', [installer.API]), \
                 patch.object(installer.common, 'fetch', return_value=[review]):
                with self.assertRaisesRegex(RuntimeError, 'author-name contract'):
                    installer.public_contract(self.manifest, True)


if __name__ == '__main__':
    unittest.main()
