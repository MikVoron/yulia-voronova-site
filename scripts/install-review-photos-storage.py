#!/usr/bin/env python3
"""Add private storage, isolated codecs and backup job. Does not enable the API."""
import argparse,hashlib,importlib.util,json,os,re,shutil,stat,subprocess,tempfile,uuid
from pathlib import Path
try:import fcntl
except ImportError:fcntl=None

BASE=Path(__file__).resolve().parent
READY=Path('/home/smartplate-admin/release-staging/review-photos-readiness-e8b9e4b488d3')
READY_SHA='572356ad84c5abe2a1c23cd298167c842a1028d2db2375403d20b6cf45a5eb36'
CHECKPOINTS=Path('/root/smartplate-rollbacks')
CODECS=Path('/var/lib/smartplate-photo-codecs')
PHOTOS=Path('/var/lib/smartplate/review-photos')
HELPER=Path('/opt/voronova/review-photos-backup.py')
CRON=Path('/etc/cron.d/smartplate-review-photos-backup')
LOG=Path('/var/log/voronova-photo-backup.log')
CRON_BODY=b'SHELL=/bin/sh\nPATH=/usr/bin:/bin\n30 3 * * * root /usr/bin/python3 /opt/voronova/review-photos-backup.py >> /var/log/voronova-photo-backup.log 2>&1\n'

def digest(data):return hashlib.sha256(data).hexdigest()
def sha(file):return digest(file.read_bytes())
def safe_relative(name):
    if not isinstance(name,str):raise RuntimeError('Unsafe relative path')
    value=Path(name)
    if '\\' in name or ':' in name or name.startswith('/') or value.is_absolute() or '..' in value.parts or not value.parts:raise RuntimeError('Unsafe relative path')
    return value
def execute(args,timeout=60,**options):
    try:return subprocess.run(args,check=True,capture_output=True,timeout=timeout,**options).stdout
    except subprocess.SubprocessError as error:raise RuntimeError('Subprocess check failed: '+Path(str(args[0])).name) from error
def identity():
    health=json.loads(execute(['curl','-fsS','http://127.0.0.1:3000/health']))
    if health.get('status')!='ok' or health.get('db')!='ok':raise RuntimeError('API not healthy')
    rows=[line.split(None,3) for line in execute(['ps','-eo','pid=,uid=,gid=,args=']).decode().splitlines()]
    found=[row for row in rows if len(row)==4 and row[3]=='node /var/www/smartplate-api/index.js']
    if len(found)!=1 or found[0][1:3]!=['997','997']:raise RuntimeError('Unexpected API identity')
    return found[0][0]
def verify_manifest(expected):
    if sha(BASE/'manifest.json')!=expected:raise RuntimeError('Manifest SHA-256 mismatch')
    manifest=json.loads((BASE/'manifest.json').read_text())
    if manifest.get('release')!='review-photos-storage-20261108':raise RuntimeError('Wrong storage release')
    if sha(READY/'manifest.json')!=READY_SHA:raise RuntimeError('Readiness manifest drift')
    source_manifest=json.loads((READY/'manifest.json').read_text())
    allowed={entry['file']:entry['sha256'] for entry in source_manifest['files']}
    for entry in manifest['files']:
        file=BASE/safe_relative(entry['file'])
        if file.is_symlink() or not file.resolve().is_relative_to(BASE) or sha(file)!=entry['sha256']:raise RuntimeError('Storage payload drift')
    for name in ['readiness.py','fixtures/example.heic']:
        if sha(READY/name)!=allowed[name]:raise RuntimeError('Readiness support file drift')
    paths=set();size=0
    if len(manifest['codecFiles'])>4000:raise RuntimeError('Unexpected codec file count')
    for entry in manifest['codecFiles']:
        name=entry['path'];safe_relative(name)
        if name in paths:raise RuntimeError('Duplicate codec file')
        paths.add(name);file=READY/'codecs'/name
        if not file.resolve().is_relative_to(READY/'codecs') or not file.is_file() or sha(file)!=entry['sha256']:raise RuntimeError('Codec source drift')
        size+=file.stat().st_size
    if size>256*1024*1024 or not {'package.json','package-lock.json'}.issubset(paths):raise RuntimeError('Unexpected codec component')
    if sha(READY/'codecs/package.json')!=allowed['codecs/package.json'] or sha(READY/'codecs/package-lock.json')!=allowed['codecs/package-lock.json']:raise RuntimeError('Codec lock drift')
    component=digest(json.dumps(manifest['codecFiles'],sort_keys=True,separators=(',',':')).encode())
    if component!=manifest['codecComponentSha256']:raise RuntimeError('Codec component identity mismatch')
    return manifest,component
def ensure_directory(path,uid=0,gid=0,mode=0o755):
    if path.is_symlink():raise RuntimeError('Directory is a symlink')
    if path.exists():
        info=path.stat()
        if not path.is_dir() or (info.st_uid,info.st_gid,stat.S_IMODE(info.st_mode))!=(uid,gid,mode):raise RuntimeError('Unexpected directory ownership or mode: '+str(path))
    else:
        path.mkdir(mode=mode);os.chown(path,uid,gid);os.chmod(path,mode)
def atomic_write(file,data,mode):
    if file.is_symlink() or (file.exists() and not file.is_file()):raise RuntimeError('Unsafe file target')
    if file.exists():
        info=file.stat()
        if info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=mode or file.read_bytes()!=data:raise RuntimeError('Existing file differs: '+str(file))
        return
    fd,name=tempfile.mkstemp(prefix='.photo-storage-',dir=file.parent)
    try:
        with os.fdopen(fd,'wb') as stream:stream.write(data);stream.flush();os.fsync(stream.fileno());os.fchmod(stream.fileno(),mode);os.fchown(stream.fileno(),0,0)
        os.replace(name,file)
    finally:
        if os.path.exists(name):os.unlink(name)
def protect(manifest,component,expected):
    ensure_directory(CHECKPOINTS,mode=0o700)
    checkpoint=Path(tempfile.mkdtemp(prefix='review-photo-storage-',dir=CHECKPOINTS));os.chmod(checkpoint,0o700)
    for entry in manifest['files']:
        source=BASE/entry['file'];target=checkpoint/entry['file'];target.parent.mkdir(parents=True,exist_ok=True)
        data=source.read_bytes()
        if digest(data)!=entry['sha256']:raise RuntimeError('Payload changed while protecting')
        target.write_bytes(data);target.chmod(0o600)
    (checkpoint/'manifest.json').write_bytes((BASE/'manifest.json').read_bytes());(checkpoint/'manifest.json').chmod(0o600)
    old=json.loads((READY/'manifest.json').read_text());support={item['file']:item['sha256'] for item in old['files']}
    for name in ('readiness.py','fixtures/example.heic'):
        data=(READY/name).read_bytes()
        if digest(data)!=support[name]:raise RuntimeError('Readiness support changed')
        target=checkpoint/'support'/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data);target.chmod(0o600)
    for entry in manifest['codecFiles']:
        target=checkpoint/'codecs'/entry['path'];target.parent.mkdir(parents=True,exist_ok=True);data=(READY/'codecs'/entry['path']).read_bytes()
        if digest(data)!=entry['sha256']:raise RuntimeError('Codec changed while protecting')
        target.write_bytes(data);target.chmod(0o600)
    print('REVIEW_PHOTOS_STORAGE_CHECKPOINT '+str(checkpoint),flush=True)
    os.execv('/usr/bin/python3',['/usr/bin/python3',str(checkpoint/'install.py'),'--manifest-sha',expected,'--protected'])
def load_readiness():
    spec=importlib.util.spec_from_file_location('protected_photo_readiness',BASE/'support/readiness.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);module.BASE=READY
    module.validate(READY_SHA)
    return module
def probe(component):
    fixture=CODECS/('.photo-probe-'+uuid.uuid4().hex+'.heic');fixture.write_bytes((BASE/'support/fixtures/example.heic').read_bytes());fixture.chmod(0o644)
    marker=PHOTOS/('.access-probe-'+uuid.uuid4().hex)
    code="const fs=require('fs');const r=require('module').createRequire("+json.dumps(str(component/'package.json'))+");const sharp=r('sharp'),decode=r('heic-decode');(async()=>{await sharp({create:{width:64,height:64,channels:3,background:'orange'}}).webp().toBuffer();const image=await decode({buffer:fs.readFileSync("+json.dumps(str(fixture))+")});if(!image.width||!image.height)throw Error('decode');const p="+json.dumps(str(marker))+";try{fs.writeFileSync(p,'storage-probe',{flag:'wx',mode:0o600});if(fs.readFileSync(p,'utf8')!=='storage-probe')throw Error('storage')}finally{if(fs.existsSync(p))fs.unlinkSync(p)}console.log('UID997_PHOTO_CODECS_AND_STORAGE_OK')})().catch(()=>process.exit(1));"
    try:
        output=execute(['runuser','-u','smartplate-api','-g','smartplate-api','--','env','-i','PATH=/usr/bin:/bin','HOME=/nonexistent','/usr/bin/node','--max-old-space-size=192','-e',code])
        if output.strip()!=b'UID997_PHOTO_CODECS_AND_STORAGE_OK':raise RuntimeError('UID997 probe failed')
    finally:fixture.unlink(missing_ok=True)
def apply(manifest,component):
    info=BASE.stat()
    if BASE.parent!=CHECKPOINTS or not BASE.name.startswith('review-photo-storage-') or info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=0o700:raise RuntimeError('Protected checkpoint required')
    ready=load_readiness();pid=identity()
    if sha(Path('/opt/voronova/backup.sh'))!=ready.BACKUP_SHA:raise RuntimeError('Original backup changed')
    for entry in manifest['codecFiles']:
        if sha(BASE/'codecs'/entry['path'])!=entry['sha256']:raise RuntimeError('Protected codec drift')
    ensure_directory(Path('/var/lib/smartplate'));ensure_directory(PHOTOS,997,997,0o700)
    ensure_directory(CODECS);runtime=CODECS/('codec-'+component[:20]);ensure_directory(runtime)
    for entry in manifest['codecFiles']:
        file=runtime/safe_relative(entry['path'])
        for directory in reversed(list(file.parent.parents)):
            if directory==runtime or directory.is_relative_to(runtime):ensure_directory(directory)
        ensure_directory(file.parent);atomic_write(file,(BASE/'codecs'/entry['path']).read_bytes(),0o644)
    probe(runtime)
    ensure_directory(Path('/opt/voronova/photo-backups'),mode=0o700)
    atomic_write(HELPER,(BASE/'backup.py').read_bytes(),0o750)
    if LOG.exists():
        info=LOG.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=0o600:raise RuntimeError('Unexpected backup log')
    else:atomic_write(LOG,b'',0o600)
    # Install the recurring job only after an encrypted B2 copy has been fetched
    # back and matched. The existing database backup job is left in place.
    attempt=subprocess.run(['/usr/bin/python3',str(HELPER),'--verify-remote'],capture_output=True,timeout=600)
    backup_output=attempt.stdout.decode(errors='replace').strip()
    if attempt.returncode:
        code=backup_output.removeprefix('REVIEW_PHOTOS_BACKUP_FAILED ')
        raise RuntimeError('Initial backup failed: '+(code if re.fullmatch(r'[A-Za-z0-9_]+',code) else 'BACKUP_CHECK_FAILED'))
    if not backup_output.startswith('REVIEW_PHOTOS_BACKUP_OK '):raise RuntimeError('Initial remote backup not verified')
    backup=json.loads(backup_output.removeprefix('REVIEW_PHOTOS_BACKUP_OK '))
    if not backup.get('remoteDownloadedAndMatched') or not backup.get('archiveRoundtripVerified'):raise RuntimeError('Initial backup roundtrip failed')
    atomic_write(CRON,CRON_BODY,0o644)
    ready.validate(READY_SHA)
    if identity()!=pid:raise RuntimeError('API process changed during storage preparation')
    result={'photoDirectory':str(PHOTOS),'codecDirectory':str(runtime),'codecsAndStorageUid997Verified':True,'backupCronInstalled':True,'backup':backup,'apiPid':pid,'productionApiUnchanged':True,'featureEnabled':False,'checkpoint':str(BASE)}
    (BASE/'result.json').write_text(json.dumps(result,sort_keys=True)+'\n');(BASE/'result.json').chmod(0o600)
    print('REVIEW_PHOTOS_STORAGE_PREPARED '+json.dumps(result,sort_keys=True),flush=True)
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--manifest-sha',required=True);parser.add_argument('--protected',action='store_true');parser.add_argument('--check',action='store_true');args=parser.parse_args()
    manifest,component=verify_manifest(args.manifest_sha)
    if args.check:
        execute(['/usr/bin/python3',str(READY/'readiness.py'),'--manifest-sha',READY_SHA]);identity()
        print('REVIEW_PHOTOS_STORAGE_BUNDLE_OK '+json.dumps({'codecComponentSha256':component,'files':len(manifest['files']),'codecFiles':len(manifest['codecFiles']),'productionChanged':False}));return
    if fcntl is None:raise RuntimeError('Linux required')
    if os.geteuid()!=0:raise RuntimeError('Interactive sudo required')
    os.umask(0o077)
    if not args.protected:protect(manifest,component,args.manifest_sha)
    descriptor=os.open('/run/lock/smartplate-review-photos-storage.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    with os.fdopen(descriptor,'r+') as lock:
        info=os.fstat(lock.fileno())
        if info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=0o600:raise RuntimeError('Storage lock permissions')
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        apply(manifest,component)
if __name__=='__main__':
    try:main()
    except Exception as error:
        print('REVIEW_PHOTOS_STORAGE_FAILED '+(str(error) if isinstance(error,RuntimeError) else type(error).__name__),flush=True)
        raise SystemExit(1)
