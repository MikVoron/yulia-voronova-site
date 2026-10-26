#!/usr/bin/env python3
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('installer', Path(__file__).with_name('install-review-discussions-20261026.py'))
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class ScopedReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.source = self.root / 'source'
        self.target = self.root / 'target'
        self.source.write_text('new')
        self.target.write_text('old')

    def tearDown(self):
        self.temp.cleanup()

    def test_refuses_unexpected_production_bytes(self):
        with self.assertRaisesRegex(RuntimeError, 'changed since preflight'):
            installer.verify_target(self.target, {installer.sha(self.source)})
        self.assertEqual(self.target.read_text(), 'old')

    def test_atomic_install_and_no_temporary_files(self):
        installer.atomic_install(self.source, self.target)
        self.assertEqual(self.target.read_text(), 'new')
        self.assertEqual(list(self.root.glob('.review-discussions-*')), [])

    def test_refuses_symlink_destination(self):
        link = self.root / 'link'
        link.symlink_to(self.target)
        with self.assertRaisesRegex(RuntimeError, 'Unexpected path'):
            installer.atomic_install(self.source, link)
        self.assertEqual(self.target.read_text(), 'old')

    def test_rollback_restores_existing_and_removes_new_file(self):
        new_target = self.root / 'new-file'
        previous = self.root / 'previous/existing'
        previous.parent.mkdir()
        previous.write_text('old')
        old_sha = installer.sha(self.target)
        installer.atomic_install(self.source, self.target)
        installer.atomic_install(self.source, new_target)
        entries = {'existing': {'old_sha256': old_sha, 'new_sha256': installer.sha(self.source)},
                   'new': {'old_sha256': None, 'new_sha256': installer.sha(self.source)}}
        with patch.object(installer, 'TARGETS', {'existing': self.target, 'new': new_target}):
            installer.rollback_files(['existing', 'new'], entries, self.root)
        self.assertEqual(self.target.read_text(), 'old')
        self.assertFalse(new_target.exists())

    def test_rollback_refuses_to_overwrite_a_concurrent_change(self):
        self.target.write_text('someone else changed this')
        entries = {'existing': {'old_sha256': 'old-hash', 'new_sha256': installer.sha(self.source)}}
        with patch.object(installer, 'TARGETS', {'existing': self.target}):
            with self.assertRaisesRegex(RuntimeError, 'changed since preflight'):
                installer.rollback_files(['existing'], entries, self.root)
        self.assertEqual(self.target.read_text(), 'someone else changed this')

    def test_dry_run_has_no_embedded_commit(self):
        sql = '-- additive\nBEGIN;\nCREATE TABLE test(id int);\nCOMMIT;\n'
        body = installer.migration_body(sql)
        self.assertNotIn('COMMIT;', body)
        self.assertNotIn('BEGIN;', body)
        self.assertIn('CREATE TABLE test', body)

    def test_rejects_ambiguous_transaction_boundaries(self):
        with self.assertRaisesRegex(RuntimeError, 'transaction boundaries'):
            installer.migration_body('BEGIN; COMMIT; COMMIT;')

    def test_api_identity_requires_expected_uid_gid(self):
        with patch.object(installer, 'run', return_value='123 0 0 node /var/www/smartplate-api/index.js'):
            with self.assertRaisesRegex(RuntimeError, 'UID/GID 997'):
                installer.api_identity()
        with patch.object(installer, 'run', return_value='123 997 997 node /var/www/smartplate-api/index.js'):
            self.assertEqual(installer.api_identity(), '123')


if __name__ == '__main__':
    unittest.main()
