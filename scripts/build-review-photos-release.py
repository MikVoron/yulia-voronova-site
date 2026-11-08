#!/usr/bin/env python3
"""Build an exact-file release against the independently captured live baseline."""
import hashlib,importlib.util,json,subprocess,tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('release',Path(__file__).with_name('install-review-photos-release.py'))
release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)
def digest(data):return hashlib.sha256(data).hexdigest()
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT)
def main():
 if git('status','--porcelain','--untracked-files=no').strip():raise RuntimeError('Commit changes before packaging')
 commit=git('rev-parse','HEAD').decode().strip();output=ROOT/'.local'/('review-photos-release-'+commit[:12]);output.mkdir(exist_ok=False)
 before=ROOT/'.local/production-before';baseline=json.loads((before/'manifest.json').read_text());old={item['path']:item['sha256'] for item in baseline}
 for item in baseline:
  if digest((before/item['path']).read_bytes())!=item['sha256']:raise RuntimeError('Captured baseline hash mismatch')
 files=[];targets=[]
 def write(name,data):
  file=output/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(data);files.append({'file':name,'sha256':digest(data)})
 for source in ['install-review-photos-release.py','test-review-photos-release.py']:write('scripts/'+source,git('show','HEAD:scripts/'+source))
 write('install.py',git('show','HEAD:scripts/install-review-photos-release.py'))
 for name in release.TARGETS:
  if name=='env':continue
  if name.startswith('nginx/'):
   data=(before/name).read_bytes();needle=b'    location / {'
   if data.count(needle)!=1:raise RuntimeError('Expected one general API location')
   snippet=git('show','HEAD:server/nginx/review-photo-upload.conf')
   data=data.replace(needle,snippet+b'\n'+needle)
  else:data=git('show','HEAD:'+name)
  write('payload/'+name,data);targets.append({'name':name,'beforeSha256':old.get(name),'afterSha256':digest(data)})
 unchanged=[{'path':'/var/www/smartplate-api/'+name,'sha256':old['server/'+name]} for name in ['package.json','package-lock.json']]
 unchanged.append({'path':'/etc/nginx/snippets/smartplate-api-proxy.conf','sha256':old['nginx-snippets/smartplate-api-proxy.conf']})
 manifest={'release':'review-photos-release-20261108','commit':commit,'files':files,'targets':targets,'unchanged':unchanged}
 data=(json.dumps(manifest,indent=2)+'\n').encode();(output/'manifest.json').write_bytes(data)
 archive=output.with_suffix('.tgz')
 with tarfile.open(archive,'w:gz') as stream:
  for file in sorted(output.rglob('*')):
   if file.is_file():stream.add(file,arcname=file.relative_to(output).as_posix(),recursive=False)
 report={'output':str(output),'archive':str(archive),'commit':commit,'manifestSha256':digest(data),'archiveSha256':digest(archive.read_bytes())}
 (ROOT/'.local/release-build.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
if __name__=='__main__':main()
