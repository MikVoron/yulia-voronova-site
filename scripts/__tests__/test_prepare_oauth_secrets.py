"""Run on Linux as an unprivileged user; all writes use a disposable directory."""
import contextlib
import hashlib
import importlib.util
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

MODULE_PATH = Path(__file__).resolve().parents[1] / 'prepare-oauth-secrets-20261031.py'
spec = importlib.util.spec_from_file_location('oauth_secret_preparation', MODULE_PATH)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
SECRET = 'isolated-test-secret-0123456789'


class SecretPreparationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='smartplate-oauth-helper-test-')
        self.addCleanup(self.temporary.cleanup)
        self.directory = Path(self.temporary.name) / 'private'

    def test_private_file_and_disabled_flags_without_secret_output(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            target = helper.write_candidate(self.directory, SECRET)
        self.assertEqual(self.directory.stat().st_mode & 0o777, 0o700)
        self.assertEqual(target.stat().st_mode & 0o777, 0o600)
        self.assertIn('YANDEX_CLIENT_SECRET=' + SECRET, target.read_text())
        self.assertIn('VK_OAUTH_ENABLED=false\n', target.read_text())
        self.assertIn('YANDEX_OAUTH_ENABLED=false\n', target.read_text())
        self.assertNotIn('VK_APP_SECRET', target.read_text())
        self.assertNotIn(SECRET, output.getvalue())

    def test_never_overwrites_an_existing_candidate(self):
        target = helper.write_candidate(self.directory, SECRET)
        old = target.read_bytes()
        with self.assertRaises(FileExistsError):
            helper.write_candidate(self.directory, 'another-isolated-test-secret')
        self.assertEqual(target.read_bytes(), old)

    def test_rejects_symlink_directory(self):
        real = Path(self.temporary.name) / 'real'
        real.mkdir(mode=0o700)
        self.directory.symlink_to(real, target_is_directory=True)
        with self.assertRaises(RuntimeError):
            helper.write_candidate(self.directory, SECRET)
        self.assertFalse((real / helper.FILENAME).exists())

    def test_rejects_symlink_file_without_touching_destination(self):
        helper.private_directory(self.directory)
        other = Path(self.temporary.name) / 'other'
        other.write_text('untouched')
        (self.directory / helper.FILENAME).symlink_to(other)
        with self.assertRaises(FileExistsError):
            helper.write_candidate(self.directory, SECRET)
        self.assertEqual(other.read_text(), 'untouched')

    def test_refuses_a_directory_with_broad_permissions(self):
        self.directory.mkdir(mode=0o755)
        with self.assertRaises(RuntimeError):
            helper.write_candidate(self.directory, SECRET)
        self.assertFalse((self.directory / helper.FILENAME).exists())

    def test_rejects_invalid_secret_without_writing_it(self):
        for secret in ['', 'short', SECRET + '\nVK_OAUTH_ENABLED=true', SECRET + ' ', SECRET + '"']:
            with self.assertRaises(ValueError) as error:
                helper.write_candidate(self.directory, secret)
            self.assertNotIn(SECRET, str(error.exception))
        self.assertFalse(self.directory.exists())

    def test_cli_refuses_unprivileged_execution_before_asking_for_secret(self):
        sha = hashlib.sha256(MODULE_PATH.read_bytes()).hexdigest()
        with patch.object(helper.os, 'geteuid', return_value=1000), patch.object(helper.getpass, 'getpass') as prompt:
            with self.assertRaises(RuntimeError):
                helper.main(['--script-sha256', sha])
        prompt.assert_not_called()

    def test_cli_refuses_noninteractive_input(self):
        sha = hashlib.sha256(MODULE_PATH.read_bytes()).hexdigest()
        with patch.object(helper.os, 'geteuid', return_value=0), patch.object(helper.sys.stdin, 'isatty', return_value=False), patch.object(helper.getpass, 'getpass') as prompt:
            with self.assertRaises(RuntimeError):
                helper.main(['--script-sha256', sha])
        prompt.assert_not_called()

    def test_cli_refuses_a_changed_script(self):
        with self.assertRaises(RuntimeError):
            helper.main(['--script-sha256', '0' * 64])


if __name__ == '__main__':
    unittest.main()
