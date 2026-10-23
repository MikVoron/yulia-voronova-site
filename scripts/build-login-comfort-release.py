#!/usr/bin/env python3
"""Snapshot only the four reviewed runtime files into a code-only release package."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

BASELINES = {
    'platform/login.html': '69e4614fd42a6e249e77756377540e73ad7d926e1d26696e6619a58e4c79becb',
    'platform/login.css': 'f346edcb8e5d9fc194069a4d4b0ec6b8e6e392c5f2949314d3dc3214efa9f7d1',
    'platform/login.js': '3fb3e1ae305b1c3ff3343e41f93d32a3013ceedf99745711013c685317dbbbda',
    'server/src/routes/auth.js': '3550097bdebdc6dff5d872e69c1797d901f8827ce589a47e7143939e0e056601',
}
parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
source = args.source.resolve()
output = args.output.resolve()
output.mkdir(parents=True, exist_ok=True)
files = []
for name, previous_hash in BASELINES.items():
    data = (source / name).read_bytes()
    target = output / 'payload' / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    files.append({'path': name, 'old_sha256': previous_hash, 'new_sha256': hashlib.sha256(data).hexdigest()})
commit = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
manifest = {'release': 'login-comfort-20261023', 'commit': commit, 'files': files}
manifest_file = output / 'manifest.json'
manifest_file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
shutil.copyfile(source / 'scripts/install-login-comfort-20261023.py', output / 'install.py')
print(json.dumps({'package': str(output), 'commit': commit, 'manifest_sha256': hashlib.sha256(manifest_file.read_bytes()).hexdigest()}))
