"""Disposable filesystem tests. No sudo, production DB or SMTP is called."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import shutil

spec = importlib.util.spec_from_file_location('photo_installer', Path(__file__).resolve().parents[1] / 'install-photo-results.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='photo-result-installer-test-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.base = self.root / 'stage'
        self.base.mkdir()
        self.rows = []
        self.allowed = {}
        for index, (file, _) in enumerate(installer.ALLOWED.items()):
            target = self.root / 'live' / file
            target.parent.mkdir(parents=True, exist_ok=True)
            before = None if file.endswith('/review-photo-results.js') else b'old runtime\n'
            if before is not None:
                target.write_bytes(before)
            source = self.base / 'runtime' / file
            source.parent.mkdir(parents=True, exist_ok=True)
            source.write_bytes(b'new runtime\n')
            self.allowed[file] = str(target)
            self.rows.append({'file': file, 'target': str(target), 'before': installer.sha(target) if before else None, 'after': installer.sha(source)})
        self.plan = {'files': self.rows}
        for key, file in [('migration', installer.MIGRATION), ('helper', installer.HELPER)]:
            source = self.base / 'runtime' / file
            source.parent.mkdir(parents=True, exist_ok=True)
            source.write_text('fixture')
            self.plan[key] = {'file': file, 'sha256': installer.sha(source)}
        self.manifest = self.base / 'manifest.json'
        self.manifest.write_text(json.dumps(self.plan))
        self.hash = installer.sha(self.manifest)
        self.patches = [patch.object(installer, 'BASE', self.base), patch.object(installer, 'ALLOWED', self.allowed),
                        patch.object(installer, 'LOCK', self.root / 'lock'), patch.object(installer, 'BACKUP_ROOT', self.root),
                        patch.object(installer.os, 'geteuid', return_value=0), patch.object(installer, 'run', return_value='CHECKPOINT_OK'),
                        patch.object(installer, 'sql'), patch.object(installer, 'restart'), patch.object(installer, 'health', return_value=123)]
        for item in self.patches:
            item.start()
            self.addCleanup(item.stop)

    def copy(self, source, target):
        shutil.copyfile(source, target)

    def test_rejects_drift_before_any_mutation(self):
        Path(self.rows[0]['target']).write_text('unexpected change')
        with self.assertRaisesRegex(RuntimeError, 'drift'):
            installer.load(self.hash)
        installer.sql.assert_not_called()

    def test_rejects_changed_manifest_payload_and_symlink(self):
        self.assertEqual(len(installer.load(self.hash)), 6)
        source = self.base / 'runtime' / self.rows[0]['file']
        source.write_text('tampered')
        with self.assertRaisesRegex(RuntimeError, 'payload changed'):
            installer.load(self.hash)
        source.unlink()
        source.symlink_to(Path(self.rows[0]['target']))
        with self.assertRaisesRegex(RuntimeError, 'Unexpected file'):
            installer.load(self.hash)

    def test_rolls_back_files_including_new_module_without_sending_email(self):
        with patch.object(installer, 'atomic_copy', side_effect=self.copy), patch.object(installer, 'verify', side_effect=RuntimeError('verification failed')), patch.object(installer, 'zhenya') as mail, contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(RuntimeError, 'verification failed'):
                installer.install(self.rows, True, self.hash)
            mail.assert_not_called()
        for row in self.rows:
            target = Path(row['target'])
            if row['before'] is None:
                self.assertFalse(target.exists())
            else:
                self.assertEqual(installer.sha(target), row['before'])
        self.assertEqual(installer.sql.call_count, 1)  # Additive schema is retained.

    def test_mail_failure_keeps_verified_release_installed(self):
        with patch.object(installer, 'atomic_copy', side_effect=self.copy), patch.object(installer, 'verify', return_value=123), patch.object(installer, 'zhenya', side_effect=RuntimeError('ambiguous user')) as mail, contextlib.redirect_stdout(io.StringIO()) as output:
            installer.install(self.rows, True, self.hash)
            mail.assert_called_once()
        self.assertIn('PHOTO_RESULTS_RELEASE_OK', output.getvalue())
        self.assertIn('ZHENYA_EMAIL_PENDING', output.getvalue())
        for row in self.rows:
            self.assertEqual(installer.sha(row['target']), row['after'])


if __name__ == '__main__':
    unittest.main()
