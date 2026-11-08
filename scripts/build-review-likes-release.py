#!/usr/bin/env python3
"""Package committed likes files against a hash-verified live snapshot."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('release', Path(__file__).with_name('install-review-likes-20261108.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def main():
    if git('status', '--porcelain', '--untracked-files=no').strip():
        raise RuntimeError('Commit release changes before packaging')
    commit = git('rev-parse', 'HEAD').decode().strip()
    baseline_dir = ROOT / '.local/production-before'
    rows = json.loads((baseline_dir / 'manifest.json').read_text())
    baseline = {row['path']: row for row in rows}
    expected = set(release.TARGETS) | set(release.UNCHANGED)
    if len(rows) != len(expected) or set(baseline) != expected:
        raise RuntimeError('Unexpected baseline scope')
    for name, row in baseline.items():
        path = baseline_dir / name
        if (digest(path.read_bytes()) if path.exists() else None) != row['sha256']:
            raise RuntimeError('Baseline mismatch: ' + name)
    output = ROOT / '.local' / ('review-likes-release-' + commit[:12])
    output.mkdir(exist_ok=False)
    files = []
    for name in release.TARGETS:
        data = git('show', 'HEAD:' + name)
        target = output / 'payload' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        files.append({'path': name, 'old_sha256': baseline[name]['sha256'], 'new_sha256': digest(data)})
    installer = git('show', 'HEAD:scripts/install-review-likes-20261108.py')
    (output / 'install.py').write_bytes(installer)
    manifest = {'release': release.REL, 'commit': commit, 'files': files,
        'unchanged': [{'path': name, 'sha256': baseline[name]['sha256']} for name in release.UNCHANGED],
        'installer_sha256': digest(installer)}
    data = (json.dumps(manifest, indent=2) + '\n').encode()
    (output / 'manifest.json').write_bytes(data)
    archive = output.with_suffix('.tgz')
    with tarfile.open(archive, 'w:gz') as stream:
        for path in sorted(output.rglob('*')):
            if path.is_file():
                stream.add(path, arcname=path.relative_to(output).as_posix(), recursive=False)
    report = {'commit': commit, 'output': str(output), 'archive': str(archive), 'manifest_sha256': digest(data), 'archive_sha256': digest(archive.read_bytes())}
    (ROOT / '.local/review-likes-build.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
