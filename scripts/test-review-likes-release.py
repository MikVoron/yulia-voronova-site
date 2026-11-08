#!/usr/bin/env python3
"""Installer fault tests in temporary directories; never production DB or files."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).with_name('install-review-likes-20261108.py')


class InstallerTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location('likes_release_test', SOURCE)
        self.m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.m)
        self.temp = tempfile.TemporaryDirectory(prefix='review-likes-installer-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        m = self.m
        m.BASE = self.root / 'staging'
        m.BASE.mkdir()
        m.__file__ = str(m.BASE / 'install.py')
        Path(m.__file__).write_text('fixture installer')
        m.TARGETS = {name: self.root / 'live' / name for name in m.TARGETS}
        m.UNCHANGED = {name: self.root / 'live' / name for name in m.UNCHANGED}
        m.ROLLBACKS = self.root / 'checkpoints'
        entries = []
        for name, target in m.TARGETS.items():
            target.parent.mkdir(parents=True, exist_ok=True)
            is_new = name in ['platform/review-like-settings.js', 'server/src/review-likes.js', m.MIGRATION]
            if not is_new:
                target.write_text('previous ' + name)
            source = m.BASE / 'payload' / name
            source.parent.mkdir(parents=True, exist_ok=True)
            source.write_text('BEGIN;\nSELECT 1;\nCOMMIT;' if name == m.MIGRATION else 'new ' + name)
            entries.append({'path': name, 'old_sha256': m.sha(target), 'new_sha256': m.sha(source)})
        guards = []
        for name, target in m.UNCHANGED.items():
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text('unchanged ' + name)
            guards.append({'path': name, 'sha256': m.sha(target)})
        self.manifest = {'release': m.REL, 'commit': 'a' * 40, 'files': entries, 'unchanged': guards, 'installer_sha256': m.sha(Path(m.__file__))}
        self.write_manifest()
        self.events = []
        for name, value in [('health', None), ('identity', '123'), ('run', ''), ('restart', '456'), ('api_smoke', None), ('public_smoke', None)]:
            obj = patch.object(m, name, return_value=value).start()
            self.addCleanup(patch.stopall)
            if name in ['restart', 'api_smoke', 'public_smoke']:
                obj.side_effect = lambda *args, event=name, value=value: self.events.append(event) or value

    def write_manifest(self):
        (self.m.BASE / 'manifest.json').write_text(json.dumps(self.manifest))
        self.digest = self.m.sha(self.m.BASE / 'manifest.json')

    def apply_fixture(self, fail_public=False):
        m = self.m
        actual_stat = Path.stat
        def stat(path, *args, **kwargs):
            result = actual_stat(path, *args, **kwargs)
            if path == m.ROLLBACKS:
                values = list(result)
                values[4] = 0
                return os.stat_result(values)
            return result
        def sql(text):
            self.events.append('sql:' + text)
            return 't' if 'bool_and' in text else '1'
        def process(args, **kwargs):
            if args[0] != '/usr/sbin/runuser' or '/usr/bin/pg_dump' not in args:
                raise AssertionError('Unexpected process in fixture')
            kwargs['stdout'].write(b'fixture dump')
            return subprocess.CompletedProcess(args, 0)
        def install(source, target):
            self.events.append('install:' + str(target))
            shutil.copyfile(source, target)
        with patch.object(m.os, 'geteuid', return_value=0, create=True), patch.object(m.os, 'fchmod', create=True), patch.object(Path, 'stat', stat), patch.object(m, 'psql', side_effect=sql), patch.object(m.subprocess, 'run', side_effect=process), patch.object(m, 'atomic_install', side_effect=install):
            if fail_public:
                m.public_smoke.side_effect = RuntimeError('public verification failed')
            m.apply(self.digest)

    def test_preflight_and_exact_scope(self):
        manifest, entries = self.m.preflight(self.digest)
        self.assertEqual(len(entries), 20)
        self.assertEqual(manifest['commit'], 'a' * 40)

    def test_manifest_and_installer_tampering(self):
        with self.assertRaises(RuntimeError):
            self.m.preflight('0' * 64)
        Path(self.m.__file__).write_text('tampered')
        with self.assertRaises(RuntimeError):
            self.m.preflight(self.digest)

    def test_payload_and_production_drift(self):
        name = 'platform/data-v2.js'
        (self.m.BASE / 'payload' / name).write_text('tampered')
        with self.assertRaises(RuntimeError):
            self.m.preflight(self.digest)
        (self.m.BASE / 'payload' / name).write_text('new ' + name)
        self.m.TARGETS[name].write_text('independent live edit')
        with self.assertRaises(RuntimeError):
            self.m.preflight(self.digest)

    def test_unchanged_photo_dependencies_guard(self):
        self.m.UNCHANGED['server/src/review-photos.js'].write_text('changed photo code')
        with self.assertRaises(RuntimeError):
            self.m.preflight(self.digest)

    def test_scope_extension_rejected(self):
        self.manifest['files'].append(self.manifest['files'][0])
        self.write_manifest()
        with self.assertRaises(RuntimeError):
            self.m.preflight(self.digest)

    def test_no_root_no_install(self):
        with patch.object(self.m.os, 'geteuid', return_value=1000, create=True), self.assertRaises(RuntimeError):
            self.m.apply(self.digest)

    def test_migration_boundaries(self):
        self.assertEqual(self.m.migration_body('BEGIN;SELECT 1;COMMIT;'), 'SELECT 1;')
        with self.assertRaises(RuntimeError):
            self.m.migration_body('BEGIN;BEGIN;COMMIT;')

    def test_successful_order_and_checkpoint(self):
        self.apply_fixture()
        self.assertLess(self.events.index('restart'), self.events.index('api_smoke'))
        first_frontend = next(i for i, event in enumerate(self.events) if event.startswith('install:') and '/platform/' in event.replace('\\', '/'))
        self.assertLess(self.events.index('api_smoke'), first_frontend)
        for entry in self.manifest['files']:
            self.assertEqual(self.m.sha(self.m.TARGETS[entry['path']]), entry['new_sha256'])
        self.assertEqual(len(list(self.m.ROLLBACKS.glob('*/database.dump'))), 1)

    def test_failed_public_check_rolls_back_only_installed_files(self):
        with self.assertRaisesRegex(RuntimeError, 'public verification failed'):
            self.apply_fixture(fail_public=True)
        for entry in self.manifest['files']:
            self.assertEqual(self.m.sha(self.m.TARGETS[entry['path']]), entry['old_sha256'])
        self.assertEqual(self.events.count('restart'), 2)

    def test_rollback_refuses_intervening_changes(self):
        name = 'platform/data-v2.js'
        self.m.TARGETS[name].write_text('later independent edit')
        entries = {row['path']: row for row in self.manifest['files']}
        with self.assertRaises(RuntimeError):
            self.m.rollback([name], entries, self.root / 'checkpoint')


if __name__ == '__main__':
    unittest.main()
