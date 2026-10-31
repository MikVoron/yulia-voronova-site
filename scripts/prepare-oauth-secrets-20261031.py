#!/usr/bin/env python3
"""Stage OAuth credentials privately; never touch the live .env or restart API."""
import argparse
import getpass
import hashlib
import os
from pathlib import Path
import re
import stat
import sys

DIRECTORY = Path('/root/smartplate-oauth-20261031')
FILENAME = 'candidate.env'
YANDEX_CLIENT_ID = 'ba3a2fd849a246df8b5abb5be356c9f1'
VK_APP_ID = '54502528'


def candidate_text(secret):
    if not isinstance(secret, str) or not re.fullmatch(r'[A-Za-z0-9._~-]{16,256}', secret):
        raise ValueError('Unexpected secret format. Copy Client secret from Yandex OAuth.')
    return (
        '# Staged credentials only. Not loaded by the running API.\n'
        f'VK_APP_ID={VK_APP_ID}\n'
        'VK_OAUTH_ENABLED=false\n'
        'VK_REDIRECT=https://api.voronova.online/auth/oauth/vk/callback\n'
        f'YANDEX_CLIENT_ID={YANDEX_CLIENT_ID}\n'
        f'YANDEX_CLIENT_SECRET={secret}\n'
        'YANDEX_OAUTH_ENABLED=false\n'
        'YANDEX_REDIRECT=https://api.voronova.online/auth/oauth/yandex/callback\n'
    )


def private_directory(directory):
    directory = Path(directory)
    if directory.is_symlink() or directory.resolve() != directory:
        raise RuntimeError('Refusing a symbolic-link directory.')
    try:
        directory.mkdir(mode=0o700)
    except FileExistsError:
        pass
    info = directory.lstat()
    if (not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid()
            or stat.S_IMODE(info.st_mode) != 0o700):
        raise RuntimeError('Staging directory must be owned by this user with mode 700.')
    return directory


def write_candidate(directory, secret):
    text = candidate_text(secret)
    directory = private_directory(directory)
    target = directory / FILENAME
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
    except BaseException:
        target.unlink()
        raise
    return target


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--script-sha256', required=True)
    options = parser.parse_args(argv)
    if hashlib.sha256(Path(__file__).read_bytes()).hexdigest() != options.script_sha256:
        raise RuntimeError('Script SHA-256 mismatch.')
    if os.name != 'posix' or os.geteuid() != 0:
        raise RuntimeError('Run on the VPS using interactive sudo.')
    if not sys.stdin.isatty():
        raise RuntimeError('An interactive terminal is required. Do not pipe a secret.')
    directory = private_directory(DIRECTORY)
    target = directory / FILENAME
    if target.exists() or target.is_symlink():
        raise RuntimeError('Credentials are already staged. Existing file was not changed.')
    secret = getpass.getpass('Yandex Client secret (hidden input): ')
    write_candidate(directory, secret)
    print('OAUTH_CREDENTIALS_STAGED')
    print('Live configuration unchanged. No API restart performed.')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
