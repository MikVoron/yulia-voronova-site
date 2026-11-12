"""Run as an ordinary user. All installation targets and operations are fixtures."""
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

installer = Path(__file__).with_name('install.py')
if not installer.exists():
    installer = Path(__file__).resolve().parents[1] / 'install-news-title.py'
spec = importlib.util.spec_from_file_location('news_installer', installer)
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(prefix='news-title-test-')
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        self.rows = []
        allowed = {}
        for file in ['server/src/routes/content.js', 'platform/admin.js']:
            target, source = self.root / 'live' / file, self.root / 'runtime' / file
            target.parent.mkdir(parents=True, exist_ok=True)
            source.parent.mkdir(parents=True, exist_ok=True)
            target.write_text('// prior\n')
            source.write_text('// next\n')
            allowed[file] = str(target)
            self.rows.append({'file': file, 'target': str(target), 'before': release.sha(target), 'after': release.sha(source)})
        migration = self.root / 'runtime' / release.MIGRATION
        migration.parent.mkdir(parents=True, exist_ok=True)
        migration.write_text('ALTER TABLE news ADD COLUMN IF NOT EXISTS title VARCHAR(200);\n')
        self.plan = {'files': self.rows, 'migration': {'file': release.MIGRATION, 'sha256': release.sha(migration)}}
        for key, value in [('BASE', self.root), ('ALLOWED', allowed), ('LOCK', self.root / 'lock'), ('BACKUP_DIR', str(self.root))]:
            patcher = patch.object(release, key, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        patcher = patch.object(release, 'run', return_value='CHECKPOINT_OK\n')
        self.run = patcher.start()
        self.addCleanup(patcher.stop)
        self.hash = self.save_plan()
        self.migration = migration

    def save_plan(self):
        manifest = self.root / 'manifest.json'
        manifest.write_text(json.dumps(self.plan))
        return release.sha(manifest)

    def install_fixture(self, verify_error=False, restart_error=False):
        events = []
        def copy(source, target):
            events.append('copy:' + ('api' if '/server/' in str(target) else 'frontend'))
            shutil.copyfile(source, target)
        def restart():
            events.append('restart')
            if restart_error and events.count('restart') == 1:
                raise RuntimeError('synthetic restart failure')
            return 456
        def verify(rows):
            events.append('verify')
            if verify_error:
                raise RuntimeError('synthetic HTTP verification failure')
            return 456
        with patch.object(release.os, 'geteuid', return_value=0), \
             patch.object(release, 'migrate', side_effect=lambda file: events.append('migrate')) as migration, \
             patch.object(release, 'atomic_copy', side_effect=copy), \
             patch.object(release, 'restart', side_effect=restart), \
             patch.object(release, 'title_contract'), \
             patch.object(release, 'verify', side_effect=verify):
            release.install(self.rows, self.migration)
        return events

    def test_valid_exact_plan(self):
        rows, migration = release.load_plan(self.hash)
        self.assertEqual(rows, self.rows)
        self.assertEqual(migration, self.migration)

    def test_changed_manifest(self):
        with self.assertRaisesRegex(RuntimeError, 'Manifest changed'):
            release.load_plan('0' * 64)

    def test_expanded_scope(self):
        self.plan['files'].append(dict(self.rows[0], file='server/other.js'))
        with self.assertRaisesRegex(RuntimeError, 'Unexpected runtime scope'):
            release.load_plan(self.save_plan())

    def test_migration_tampering(self):
        self.migration.write_text('SELECT 1;')
        with self.assertRaisesRegex(RuntimeError, 'Migration changed'):
            release.load_plan(self.hash)

    def test_payload_tampering(self):
        (self.root / 'runtime' / self.rows[0]['file']).write_text('// altered')
        with self.assertRaisesRegex(RuntimeError, 'Payload mismatch'):
            release.load_plan(self.hash)

    def test_production_drift(self):
        Path(self.rows[0]['target']).write_text('// concurrent deployment')
        with self.assertRaisesRegex(RuntimeError, 'production drift'):
            release.load_plan(self.hash)

    def test_symlink_payload(self):
        source = self.root / 'runtime' / self.rows[0]['file']
        content = self.root / 'redirect'
        content.write_bytes(source.read_bytes())
        source.unlink()
        source.symlink_to(content)
        with self.assertRaisesRegex(RuntimeError, 'Unexpected file or resolved path'):
            release.load_plan(self.hash)

    def test_partial_install_refused(self):
        shutil.copyfile(self.root / 'runtime' / self.rows[0]['file'], self.rows[0]['target'])
        with self.assertRaisesRegex(RuntimeError, 'Partial or concurrent installation'):
            self.install_fixture()
        self.run.assert_not_called()

    def test_install_order_and_complete_payload(self):
        events = self.install_fixture()
        self.assertEqual(events, ['migrate', 'copy:api', 'restart', 'copy:frontend', 'verify'])
        self.assertTrue(all(release.sha(row['target']) == row['after'] for row in self.rows))

    def test_restart_failure_restores_files(self):
        with self.assertRaisesRegex(RuntimeError, 'synthetic restart failure'):
            self.install_fixture(restart_error=True)
        self.assertTrue(all(release.sha(row['target']) == row['before'] for row in self.rows))

    def test_http_failure_restores_files(self):
        with self.assertRaisesRegex(RuntimeError, 'synthetic HTTP verification failure'):
            self.install_fixture(verify_error=True)
        self.assertTrue(all(release.sha(row['target']) == row['before'] for row in self.rows))

    def test_already_installed_does_not_migrate_or_restart(self):
        for row in self.rows:
            shutil.copyfile(self.root / 'runtime' / row['file'], row['target'])
        self.assertEqual(self.install_fixture(), ['verify'])
        self.run.assert_not_called()

    def test_migration_probes_only_temporary_rows(self):
        calls = []
        with patch.object(release, 'news_snapshot', return_value='unchanged'), \
             patch.object(release, 'sql', side_effect=lambda text: calls.append(text) or ('character varying:200' if 'information_schema' in text else '')):
            release.migrate(self.migration)
        self.assertIn('CREATE TEMP TABLE news_title_probe', calls[0])
        self.assertIn("VALUES (-1,'news'", calls[0])
        self.assertTrue(calls[0].endswith('ROLLBACK;'))
        self.assertTrue(calls[1].endswith('COMMIT;'))
        self.assertNotIn('DROP COLUMN', ''.join(calls))

    def test_rendered_html_matches_renderer_instead_of_raw_template(self):
        row = {'file': 'platform/category.html', 'target': '/fixture/category.html', 'after': 'unused'}
        html = b'<html>Server metadata ' + release.CACHE_KEY + b'</html>'
        with patch.object(release, 'public_response', return_value=(html, 'text/html')) as response:
            release.verify_public_asset(row, {'category.html': ('local-render', 'public-page')}, installed=True)
        self.assertEqual(response.call_args_list[0].args, ('local-render',))
        self.assertEqual(response.call_args_list[1].args, ('public-page',))

    def test_rendered_public_mismatch_is_rejected(self):
        row = {'file': 'platform/index.html', 'target': '/fixture/index.html', 'after': 'unused'}
        with patch.object(release, 'public_response', side_effect=[
                (b'expected', 'text/html'), (b'wrong page', 'text/html'), (b'expected', 'text/html')]):
            with self.assertRaisesRegex(RuntimeError, 'Public rendered hash mismatch'):
                release.verify_public_asset(row, {'index.html': ('local', 'public')}, installed=True)

    def test_old_cache_key_on_rendered_page_is_rejected(self):
        row = {'file': 'platform/category.html', 'target': '/fixture/category.html', 'after': 'unused'}
        with patch.object(release, 'public_response', return_value=(b'old HTML', 'text/html')):
            with self.assertRaisesRegex(RuntimeError, 'old shared client'):
                release.verify_public_asset(row, {'category.html': ('local', 'public')}, installed=True)

    def test_rendered_non_html_response_is_rejected(self):
        row = {'file': 'platform/category.html', 'target': '/fixture/category.html', 'after': 'unused'}
        with patch.object(release, 'public_response', return_value=(release.CACHE_KEY, 'application/json')):
            with self.assertRaisesRegex(RuntimeError, 'Expected rendered HTML'):
                release.verify_public_asset(row, {'category.html': ('local', 'public')}, installed=True)

    def test_static_bytes_still_require_exact_hash(self):
        row = self.rows[1]
        # admin.js is protected and checked separately; use the same fixture
        # bytes at a public static path to verify the static hash rule.
        row = dict(row, file='platform/example.js', target=str(self.root / 'example.js'))
        Path(row['target']).write_text('// prior\n')
        with patch.object(release, 'public_response', return_value=(b'// next\n', 'text/javascript')):
            release.verify_public_asset(row, {}, installed=True)
        with patch.object(release, 'public_response', return_value=(b'// corrupted\n', 'text/javascript')):
            with self.assertRaisesRegex(RuntimeError, 'Public static hash mismatch'):
                release.verify_public_asset(row, {}, installed=True)

    def test_preflight_accepts_current_rendered_cache_version(self):
        row = {'file': 'platform/category.html', 'target': '/fixture/category.html', 'after': 'unused'}
        with patch.object(release, 'public_response', return_value=(b'current old HTML', 'text/html')):
            release.verify_public_asset(row, {'category.html': ('local', 'public')}, installed=False)

    def test_targets_use_actual_published_links(self):
        home = b'<a href="recipe.html?id=published-recipe">Recipe</a><a href="ingredient.html?id=published-ingredient">Ingredient</a>'
        with patch.object(release, 'public_response', return_value=(home, 'text/html')):
            targets = release.rendered_targets()
        self.assertIn('id=published-recipe', targets['recipe.html'][1])
        self.assertIn('id=published-ingredient', targets['ingredient.html'][1])
        self.assertEqual(set(targets), set(release.SEO_ROUTES))

    def test_missing_published_links_prevents_installation(self):
        with patch.object(release, 'public_response', return_value=(b'<html></html>', 'text/html')):
            with self.assertRaisesRegex(RuntimeError, 'No current published link'):
                release.rendered_targets()


if __name__ == '__main__':
    unittest.main()
