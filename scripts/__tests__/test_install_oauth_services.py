"""Unprivileged Linux rehearsal with no production paths, services or DB."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1]


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / filename)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


helper = module('oauth_services', 'install-oauth-services-20261031.py')


class ServicesReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='oauth-services-rehearsal-')
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.core = module('oauth_core', 'install-oauth-20261031.py')
        self.api = {'server/src/routes/oauth.js': str(self.base / 'api/oauth.js')}
        self.frontend = {'platform/oauth-login.css': str(self.base / 'frontend/oauth-login.css'),
                         'platform/oauth-login.js': str(self.base / 'frontend/oauth-login.js'),
                         'platform/login.html': str(self.base / 'frontend/login.html')}
        self.targets = {**self.api, **self.frontend}
        self.core.API, self.core.FRONTEND, self.core.NGINX = self.api, self.frontend, {}
        self.core.TARGETS = self.targets
        self.core.ENV_FILE = self.base / 'must-not-read-environment'
        self.old, self.payload = {}, {}
        for name, target in self.targets.items():
            path = Path(target)
            path.parent.mkdir(parents=True, exist_ok=True)
            self.old[name] = ('old-' + name).encode()
            self.payload[name] = ('new-' + name).encode()
            path.write_bytes(self.old[name])
        self.core.CHECKPOINT = self.base / 'checkpoint.sh'
        self.core.CHECKPOINT.write_text('synthetic checkpoint only')
        self.manifest = {'commit': 'synthetic-release', 'checkpoint_script_sha256': self.core.digest(self.core.CHECKPOINT.read_bytes()),
                         'files': {name: {'old_sha256': self.core.digest(self.old[name]), 'new_sha256': self.core.digest(self.payload[name])} for name in self.targets}}
        self.actual_mkdtemp = tempfile.mkdtemp
        patches = [patch.object(helper, 'API', self.api), patch.object(helper, 'FRONTEND', self.frontend),
                   patch.object(helper.tempfile, 'mkdtemp', lambda prefix, dir: self.actual_mkdtemp(prefix=prefix, dir=self.base)),
                   patch.object(self.core.os, 'fchown', lambda *args: None),
                   patch.object(self.core, 'preflight', return_value=(1, None)),
                   patch.object(self.core, 'health'), patch.object(self.core, 'api_identity', return_value=1),
                   patch.object(self.core, 'restart_api', return_value=2), patch.object(self.core, 'verify_api', return_value=2),
                   patch.object(self.core, 'run', return_value='CHECKPOINT_OK'), patch.object(helper, 'provider_redirects'),
                   patch.object(helper, 'verify', return_value=2),
                   patch.object(self.core, 'load_state', side_effect=lambda directory: (Path(directory), json.loads((Path(directory) / 'state.json').read_text())))]
        for item in patches:
            item.start()
            self.addCleanup(item.stop)

    def apply(self):
        with contextlib.redirect_stdout(io.StringIO()):
            helper.apply(self.core, self.manifest, self.payload)

    def assert_original(self):
        for name, target in self.targets.items():
            self.assertEqual(Path(target).read_bytes(), self.old[name])
        self.assertFalse(self.core.ENV_FILE.exists())

    def test_success_installs_api_then_assets_then_html_without_environment(self):
        order = []
        original = self.core.checked_install
        with patch.object(self.core, 'checked_install', side_effect=lambda directory, entry: (order.append(entry['name']), original(directory, entry))):
            self.apply()
        self.assertEqual(order, list(self.targets))
        self.core.restart_api.assert_called_once()
        self.assertFalse(self.core.ENV_FILE.exists())
        for name, target in self.targets.items():
            self.assertEqual(Path(target).read_bytes(), self.payload[name])

    def test_failed_api_smoke_restores_api_before_frontend(self):
        self.core.verify_api.side_effect = RuntimeError('synthetic API failure')
        with self.assertRaises(RuntimeError): self.apply()
        self.assert_original()
        self.assertEqual(self.core.restart_api.call_count, 2)

    def test_failed_public_verification_restores_entire_scoped_release(self):
        helper.verify.side_effect = RuntimeError('synthetic public mismatch')
        with self.assertRaises(RuntimeError): self.apply()
        self.assert_original()
        self.assertEqual(self.core.restart_api.call_count, 2)

    def test_checkpoint_failure_leaves_live_files_untouched(self):
        self.core.run.side_effect = RuntimeError('synthetic checkpoint failure')
        with self.assertRaises(RuntimeError): self.apply()
        self.assert_original()
        self.core.restart_api.assert_not_called()

    def test_changed_snapshot_baseline_is_refused(self):
        self.manifest['files'][next(iter(self.api))]['old_sha256'] = '0' * 64
        with self.assertRaisesRegex(RuntimeError, 'changed before snapshot'): self.apply()
        self.assert_original()
        self.core.restart_api.assert_not_called()

    def test_concurrent_frontend_change_is_not_overwritten(self):
        target = Path(next(iter(self.frontend.values())))
        self.core.verify_api.side_effect = lambda: target.write_bytes(b'concurrent-change')
        with self.assertRaisesRegex(RuntimeError, 'concurrent change'): self.apply()
        self.assertEqual(target.read_bytes(), b'concurrent-change')


if __name__ == '__main__':
    unittest.main()
