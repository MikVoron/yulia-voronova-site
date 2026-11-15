import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'install-review-reply-notifications.py'
spec = importlib.util.spec_from_file_location('reply_release', SCRIPT)
i = importlib.util.module_from_spec(spec)
spec.loader.exec_module(i)


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.base = self.root / 'package'
        self.base.mkdir()
        self.targets = self.root / 'installed'
        self.targets.mkdir()
        self.backups = self.root / 'backups'
        self.backups.mkdir()
        files = ['server/src/new.js', 'server/src/content.js', 'platform/cabinet.html']
        self.allowed = {name: str(self.targets / Path(name).name) for name in files}
        rows = []
        for n, name in enumerate(files):
            source = self.base / 'runtime' / name
            source.parent.mkdir(parents=True, exist_ok=True)
            source.write_text('after-' + str(n))
            target = Path(self.allowed[name])
            if n:
                target.write_text('before-' + str(n))
            rows.append({'file': name, 'target': str(target), 'before': i.sha(target) if target.exists() else None, 'after': i.sha(source)})
        migration = self.base / 'runtime' / i.MIGRATION
        migration.parent.mkdir(parents=True, exist_ok=True)
        migration.write_text('BEGIN; SELECT 1; COMMIT;')
        self.plan = {'release': i.RELEASE, 'commit': 'fixture', 'files': rows, 'installer_sha256': i.sha(SCRIPT),
                     'migration': {'file': i.MIGRATION, 'sha256': i.sha(migration)}}
        self.write_manifest()
        self.patches = [patch.object(i, 'BASE', self.base), patch.object(i, 'ALLOWED', self.allowed),
                        patch.object(i, 'API_FILES', files[:2]), patch.object(i, 'run', return_value='CHECKPOINT_OK'),
                        patch.object(i, 'health', return_value=123), patch.object(i, 'restart', return_value=124),
                        patch.object(i, 'sql', return_value=''), patch.object(i, 'backup_directory', return_value=self.backups),
                        patch.object(i.os, 'geteuid', return_value=0)]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        self.tmp.cleanup()

    def write_manifest(self):
        (self.base / 'manifest.json').write_text(json.dumps(self.plan))
        self.manifest_sha = i.sha(self.base / 'manifest.json')

    def test_payload_tamper_and_production_drift(self):
        i.load(self.manifest_sha)
        source = self.base / 'runtime' / self.plan['files'][0]['file']
        source.write_text('tampered')
        with self.assertRaisesRegex(RuntimeError, 'drift or payload'):
            i.load(self.manifest_sha)
        source.write_text('after-0')
        Path(self.plan['files'][1]['target']).write_text('concurrent change')
        with self.assertRaisesRegex(RuntimeError, 'drift or payload'):
            i.load(self.manifest_sha)

    def test_manifest_installer_migration_and_scope_guards(self):
        with self.assertRaisesRegex(RuntimeError, 'Manifest hash'):
            i.load('wrong')
        self.plan['installer_sha256'] = 'changed'
        self.write_manifest()
        with self.assertRaisesRegex(RuntimeError, 'Installer changed'):
            i.load(self.manifest_sha)
        self.plan['installer_sha256'] = i.sha(SCRIPT)
        self.plan['files'].reverse()
        self.write_manifest()
        with self.assertRaisesRegex(RuntimeError, 'scope'):
            i.load(self.manifest_sha)

    def test_migration_tamper(self):
        (self.base / 'runtime' / i.MIGRATION).write_text('changed')
        with self.assertRaisesRegex(RuntimeError, 'migration'):
            i.load(self.manifest_sha)

    def test_symlink_guard(self):
        link = self.root / 'symlink'
        link.symlink_to(self.base / 'manifest.json')
        with self.assertRaisesRegex(RuntimeError, 'Unexpected path'):
            i.safe(link)

    def test_api_first_order_checkpoint_and_rollback_migration_rehearsal(self):
        operations = []
        def copy(source, target):
            operations.append(Path(target).name)
            shutil.copyfile(source, target)
        with patch.object(i, 'atomic_copy', side_effect=copy), patch.object(i, 'verify', return_value={'api_pid': 124}), patch.object(i, 'restart', side_effect=lambda: operations.append('restart')):
            result = i.install(self.plan, self.manifest_sha)
        self.assertEqual(result['marker'], 'REVIEW_REPLY_NOTIFICATIONS_RELEASE_OK')
        self.assertEqual(operations, ['new.js', 'content.js', 'restart', 'cabinet.html'])
        self.assertIn('ROLLBACK;', i.sql.call_args_list[0].args[0])
        self.assertIn('COMMIT;', i.sql.call_args_list[1].args[0])
        self.assertTrue(any('api-checkpoint' in str(c) for c in i.run.call_args_list))

    def test_failure_restores_old_files_and_removes_new_module(self):
        with patch.object(i, 'atomic_copy', side_effect=lambda s,t: shutil.copyfile(s,t)), patch.object(i, 'verify', side_effect=RuntimeError('fixture verification failure')):
            with self.assertRaisesRegex(RuntimeError, 'fixture verification failure'):
                i.install(self.plan, self.manifest_sha)
        self.assertFalse(Path(self.plan['files'][0]['target']).exists())
        self.assertEqual(Path(self.plan['files'][1]['target']).read_text(), 'before-1')
        self.assertEqual(Path(self.plan['files'][2]['target']).read_text(), 'before-2')

    def test_concurrent_change_prevents_rollback_over_it(self):
        def fail(plan):
            Path(plan['files'][1]['target']).write_text('new concurrent change')
            raise RuntimeError('fixture error')
        with patch.object(i, 'atomic_copy', side_effect=lambda s,t: shutil.copyfile(s,t)), patch.object(i, 'verify', side_effect=fail):
            with self.assertRaisesRegex(RuntimeError, 'Concurrent changes'):
                i.install(self.plan, self.manifest_sha)
        self.assertEqual(Path(self.plan['files'][1]['target']).read_text(), 'new concurrent change')

    def test_partial_installation_stops(self):
        first = self.plan['files'][0]
        shutil.copyfile(self.base / 'runtime' / first['file'], first['target'])
        with self.assertRaisesRegex(RuntimeError, 'Partial installation'):
            i.install(self.plan, self.manifest_sha)


if __name__ == '__main__':
    unittest.main()
