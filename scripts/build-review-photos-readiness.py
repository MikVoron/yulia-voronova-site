#!/usr/bin/env python3
"""Build an exact Git-blob readiness bundle; no credentials or production data."""
import hashlib,json,subprocess,tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
PAYLOAD=[
 'server/index.js','server/src/email.js','server/src/review-photo-codecs.js',
 'server/src/review-photo-storage.js','server/src/review-photo-worker.js',
 'server/src/review-photos.js','server/src/routes/review-photos.js','server/migrations/043_review_photos.sql',
 'platform/admin.html','platform/admin.js','platform/admin-review-photos.js','platform/category.html',
 'platform/ingredient.html','platform/recipe.html','platform/recipe-page.js','platform/review-discussions.js',
 'platform/review-photos.css','platform/review-photos.js',
]
EXTRAS={
 'codecs/package.json':'server/photo-codecs/package.json',
 'codecs/package-lock.json':'server/photo-codecs/package-lock.json',
 'readiness.py':'scripts/review-photos-readiness.py',
 'prepare-linux.sh':'scripts/prepare-review-photos-linux.sh',
 'scripts/linux-probe.cjs':'scripts/review-photos-linux-probe.cjs',
}
def sha(data):return hashlib.sha256(data).hexdigest()
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT)
def main():
 if git('status','--porcelain','--untracked-files=no').strip():raise RuntimeError('Commit changes before packaging')
 commit=git('rev-parse','HEAD').decode().strip();output=ROOT/'.local'/('review-photos-readiness-'+commit[:12])
 output.mkdir(parents=True,exist_ok=False);files=[]
 def write(name,data):
  target=output/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data);files.append({'file':name,'sha256':sha(data)})
 for name in PAYLOAD:write('payload/'+name,git('show','HEAD:'+name))
 for name,source in EXTRAS.items():write(name,git('show','HEAD:'+source))
 write('fixtures/example.heic',(ROOT/'.local/example.heic').read_bytes())
 baseline=json.loads((ROOT/'.local/production-before/manifest.json').read_text())
 known={item['path'] for item in baseline}
 baseline.extend({'path':name,'sha256':None} for name in PAYLOAD if name not in known)
 manifest={'release':'review-photos-20261108-readiness','commit':commit,'files':files,'baseline':[{'path':item['path'],'sha256':item['sha256']} for item in baseline]}
 body=(json.dumps(manifest,indent=2)+'\n').encode();(output/'manifest.json').write_bytes(body)
 archive=output.with_suffix('.tgz')
 with tarfile.open(archive,'w:gz') as stream:
  for file in sorted(output.rglob('*')):
   if file.is_file():stream.add(file,arcname=file.relative_to(output).as_posix(),recursive=False)
 result={'output':str(output),'archive':str(archive),'commit':commit,'manifestSha256':sha(body),'archiveSha256':sha(archive.read_bytes()),'files':len(files)}
 (ROOT/'.local/readiness-build.json').write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps(result))
if __name__=='__main__':main()
