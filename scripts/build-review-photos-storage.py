#!/usr/bin/env python3
import hashlib,json,subprocess,tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
SOURCES=['review-photos-backup.py','install-review-photos-storage.py','test-review-photos-backup.py','test-review-photos-storage.py','review-photos-backup-fixture.py','test-review-photos-backup-linux.sh']
def sha(data):return hashlib.sha256(data).hexdigest()
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT)
def main():
 if git('status','--porcelain','--untracked-files=no').strip():raise RuntimeError('Commit changes before packaging')
 commit=git('rev-parse','HEAD').decode().strip();output=ROOT/'.local'/('review-photos-storage-'+commit[:12]);output.mkdir(exist_ok=False);entries=[]
 def write(name,body):
  file=output/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(body);entries.append({'file':name,'sha256':sha(body)})
 for name in SOURCES:write('scripts/'+name,git('show','HEAD:scripts/'+name))
 write('install.py',git('show','HEAD:scripts/install-review-photos-storage.py'));write('backup.py',git('show','HEAD:scripts/review-photos-backup.py'))
 codecs=json.loads((ROOT/'.local/photo-codec-files.json').read_text())
 manifest={'release':'review-photos-storage-20261108','commit':commit,'files':entries,'codecFiles':codecs,'codecComponentSha256':sha(json.dumps(codecs,sort_keys=True,separators=(',',':')).encode())}
 data=(json.dumps(manifest,indent=2)+'\n').encode();(output/'manifest.json').write_bytes(data)
 archive=output.with_suffix('.tgz')
 with tarfile.open(archive,'w:gz') as stream:
  for file in sorted(output.rglob('*')):
   if file.is_file():stream.add(file,arcname=file.relative_to(output).as_posix(),recursive=False)
 result={'output':str(output),'archive':str(archive),'commit':commit,'manifestSha256':sha(data),'archiveSha256':sha(archive.read_bytes()),'codecComponentSha256':manifest['codecComponentSha256']}
 (ROOT/'.local/storage-build.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
if __name__=='__main__':main()
