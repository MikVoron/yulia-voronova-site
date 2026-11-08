#!/usr/bin/env python3
"""Encrypted DB+photo snapshot. Fixed production paths; no secret output."""
import argparse,datetime,hashlib,json,os,re,shlex,shutil,stat,subprocess,tarfile,tempfile,uuid
from pathlib import Path
try:import fcntl
except ImportError:fcntl=None

PHOTOS=Path('/var/lib/smartplate/review-photos')
BACKUPS=Path('/opt/voronova/photo-backups')
CREDS=Path('/opt/voronova/.b2-credentials')
PASSPHRASE=Path('/opt/voronova/.gpg-passphrase')
ENDPOINT='https://s3.eu-central-003.backblazeb2.com'
BUCKET='voronova-backups'
PREFIX='db/photos/'
UUID=re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
OBJECT=re.compile(r'^db/photos/smartplate_photos_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_[0-9a-f]{8}\.tar\.gpg$')

class BackupError(RuntimeError):pass
def sha(file):
    digest=hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):digest.update(block)
    return digest.hexdigest()
def clean_env():return {'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','HOME':'/nonexistent'}
def validate_executables():
    for program in ('/usr/sbin/runuser','psql','pg_dump','pg_restore','gpg','gpgconf','aws'):
        if shutil.which(program,path=clean_env()['PATH']) is None:raise BackupError('EXECUTABLE_MISSING_'+Path(program).name)
def execute(args,**options):
    options.setdefault('stdout',subprocess.PIPE);options.setdefault('stderr',subprocess.PIPE)
    try:return subprocess.run(args,check=True,timeout=options.pop('timeout',180),env=options.pop('env',clean_env()),**options).stdout
    except FileNotFoundError as error:raise BackupError('EXECUTABLE_MISSING_'+Path(str(args[0])).name) from error
    except subprocess.SubprocessError as error:raise BackupError('SUBPROCESS_'+Path(str(args[0])).name) from error
def protected_file(file):
    info=file.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=0o600:raise BackupError('CREDENTIAL_PERMISSIONS')
def credentials(text):
    values={}
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith('#'):continue
        match=re.fullmatch(r'\s*(?:export\s+)?(B2_KEY_ID|B2_APP_KEY|B2_ENDPOINT)\s*=\s*(.*?)\s*',line)
        if not match or match[1] in values:raise BackupError('CREDENTIAL_FORMAT')
        tokens=shlex.split(match[2],posix=True)
        if len(tokens)!=1 or any(ch in tokens[0] for ch in '\x00\r\n$`\\'):raise BackupError('CREDENTIAL_FORMAT')
        values[match[1]]=tokens[0]
    if not values.get('B2_KEY_ID') or not values.get('B2_APP_KEY') or values.get('B2_ENDPOINT',ENDPOINT)!=ENDPOINT:raise BackupError('CREDENTIAL_FIELDS')
    return values

class Database:
    def __init__(self,host='/var/run/postgresql',port=5432,user='postgres',name='smartplate_db',prefix=('/usr/sbin/runuser','-u','postgres','--')):
        self.host,self.port,self.user,self.name,self.prefix=host,port,user,name,list(prefix)
    def command(self,program,*extra):return [*self.prefix,program,'-w','-h',self.host,'-p',str(self.port),'-U',self.user,*extra]
    def query(self,sql):return execute(self.command('psql','-X','-v','ON_ERROR_STOP=1','-qAt','-d',self.name),input=sql.encode()).decode().strip()
    def dump(self,destination):
        with destination.open('xb') as output:
            execute(self.command('pg_dump','--format=custom','-d',self.name),stdout=output)
    def lock(self):
        exists=self.query("SELECT to_regclass('public.review_photos') IS NOT NULL;")=='t'
        args=self.command('psql','-X','-v','ON_ERROR_STOP=1','-qAt','-d',self.name)
        child=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=clean_env())
        sql="BEGIN;SET lock_timeout='10s';SET statement_timeout='20s';SET idle_in_transaction_session_timeout='180s';DO $$BEGIN PERFORM pg_advisory_xact_lock(81743043);END;$$;"
        if exists:sql+='LOCK TABLE review_photos IN SHARE MODE;'
        child.stdin.write((sql+"SELECT 'PHOTO_SNAPSHOT_LOCKED';\n").encode());child.stdin.flush()
        if child.stdout.readline().strip()!=b'PHOTO_SNAPSHOT_LOCKED':
            child.communicate(timeout=15);raise BackupError('DATABASE_SNAPSHOT_LOCK')
        return child,exists
    @staticmethod
    def check_locked(child):
        if child.poll() is not None:raise BackupError('DATABASE_LOCK_EXPIRED')
        child.stdin.write(b"SELECT 'PHOTO_SNAPSHOT_STILL_LOCKED';\n");child.stdin.flush()
        if child.stdout.readline().strip()!=b'PHOTO_SNAPSHOT_STILL_LOCKED':raise BackupError('DATABASE_LOCK_EXPIRED')
    @staticmethod
    def unlock(child):
        if child.poll() is None:
            try:child.communicate(input=b'ROLLBACK;\n\\q\n',timeout=15)
            except subprocess.SubprocessError:child.kill();child.communicate();raise BackupError('DATABASE_UNLOCK')

def snapshot(database,photos,temporary):
    holder,has_photos=database.lock()
    try:
        identifiers=json.loads(database.query("SELECT COALESCE(json_agg(id ORDER BY id),'[]'::json) FROM review_photos WHERE review_id IS NOT NULL AND status IN ('pending','approved') AND files_deleted_at IS NULL;")) if has_photos else []
        if any(not isinstance(value,str) or not UUID.fullmatch(value) for value in identifiers):raise BackupError('PHOTO_ID')
        dump=temporary/'database.dump';database.dump(dump)
        execute(['pg_restore','--list',str(dump)])
        entries=[{'path':'database.dump','sha256':sha(dump),'bytes':dump.stat().st_size}]
        archive=temporary/'snapshot.tar'
        with tarfile.open(archive,'w') as stream:
            stream.add(dump,arcname='database.dump',recursive=False)
            for identifier in identifiers:
                directory=photos/identifier
                if directory.is_symlink():raise BackupError('PHOTO_DIRECTORY_SYMLINK')
                for variant in ('main.webp','thumb.webp'):
                    file=directory/variant;info=file.lstat()
                    if not stat.S_ISREG(info.st_mode) or info.st_size>2*1024*1024:raise BackupError('PHOTO_FILE')
                    name='photos/'+identifier+'/'+variant
                    entries.append({'path':name,'sha256':sha(file),'bytes':info.st_size})
                    stream.add(file,arcname=name,recursive=False)
            manifest={'version':1,'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'photos':len(identifiers),'photoSchemaPresent':has_photos,'files':entries}
            metadata=temporary/'manifest.json';metadata.write_text(json.dumps(manifest,sort_keys=True)+'\n')
            stream.add(metadata,arcname='manifest.json',recursive=False)
        database.check_locked(holder)
        return archive,manifest
    finally:database.unlock(holder)

def encrypt_and_verify(archive,destination,passphrase,temporary):
    gnupg=temporary/'gnupg';gnupg.mkdir(mode=0o700)
    common=['gpg','--no-options','--homedir',str(gnupg),'--batch','--yes','--no-tty','--pinentry-mode','loopback','--passphrase-file',str(passphrase)]
    try:
        execute([*common,'--symmetric','--cipher-algo','AES256','--output',str(destination),str(archive)])
        decrypted=temporary/'verified.tar'
        execute([*common,'--output',str(decrypted),'--decrypt',str(destination)])
        if sha(decrypted)!=sha(archive):raise BackupError('ENCRYPTED_ROUNDTRIP')
    finally:
        subprocess.run(['gpgconf','--homedir',str(gnupg),'--kill','gpg-agent'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=15,env=clean_env())

class Cloud:
    def __init__(self,values):
        self.env={**clean_env(),'AWS_ACCESS_KEY_ID':values['B2_KEY_ID'],'AWS_SECRET_ACCESS_KEY':values['B2_APP_KEY'],'AWS_EC2_METADATA_DISABLED':'true'}
    def command(self,*args):return ['aws','--endpoint-url',ENDPOINT,*args]
    def upload(self,file,key):
        digest=sha(file)
        execute(self.command('s3','cp',str(file),'s3://'+BUCKET+'/'+key,'--only-show-errors','--metadata','sha256='+digest),env=self.env,timeout=300)
        head=json.loads(execute(self.command('s3api','head-object','--bucket',BUCKET,'--key',key),env=self.env))
        if head['ContentLength']!=file.stat().st_size or head.get('Metadata',{}).get('sha256')!=digest:raise BackupError('CLOUD_HEAD_MISMATCH')
    def download_verify(self,file,key,temporary):
        downloaded=temporary/'remote-check.gpg'
        execute(self.command('s3','cp','s3://'+BUCKET+'/'+key,str(downloaded),'--only-show-errors'),env=self.env,timeout=300)
        if sha(downloaded)!=sha(file):raise BackupError('CLOUD_DOWNLOAD_MISMATCH')
    def rotate(self,now):
        data=json.loads(execute(self.command('s3api','list-objects-v2','--bucket',BUCKET,'--prefix',PREFIX,'--max-items','1000'),env=self.env))
        for item in data.get('Contents',[]):
            if OBJECT.fullmatch(item['Key']) and datetime.datetime.fromisoformat(item['LastModified'].replace('Z','+00:00'))<now-datetime.timedelta(days=30):
                execute(self.command('s3api','delete-object','--bucket',BUCKET,'--key',item['Key']),env=self.env)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--verify-remote',action='store_true');parser.add_argument('--check-tools',action='store_true');args=parser.parse_args()
    validate_executables()
    if args.check_tools:print('REVIEW_PHOTOS_BACKUP_TOOLS_OK');return
    if fcntl is None:raise BackupError('LINUX_REQUIRED')
    if os.geteuid()!=0:raise BackupError('ROOT_REQUIRED')
    os.umask(0o077)
    for file in (CREDS,PASSPHRASE):protected_file(file)
    photo_info=PHOTOS.lstat()
    if not stat.S_ISDIR(photo_info.st_mode) or (photo_info.st_uid,photo_info.st_gid,stat.S_IMODE(photo_info.st_mode))!=(997,997,0o700):raise BackupError('PHOTO_STORAGE')
    BACKUPS.mkdir(mode=0o700,exist_ok=True)
    info=BACKUPS.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=0o700:raise BackupError('BACKUP_DIRECTORY')
    if shutil.disk_usage(BACKUPS).free<8*1024**3:raise BackupError('BACKUP_FREE_SPACE')
    lock_path=Path('/run/lock/smartplate-review-photos-backup.lock')
    descriptor=os.open(lock_path,os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
    with os.fdopen(descriptor,'r+') as lock:
        info=os.fstat(lock.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=0o600:raise BackupError('BACKUP_LOCK_PERMISSIONS')
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise BackupError('ALREADY_RUNNING')
        now=datetime.datetime.now(datetime.timezone.utc);name='smartplate_photos_'+now.strftime('%Y-%m-%d_%H-%M-%S')+'_'+uuid.uuid4().hex[:8]+'.tar.gpg'
        destination=BACKUPS/name
        try:
            with tempfile.TemporaryDirectory(prefix='smartplate-photo-backup-') as folder:
                temporary=Path(folder);os.chmod(temporary,0o700)
                archive,manifest=snapshot(Database(),PHOTOS,temporary)
                encrypt_and_verify(archive,destination,PASSPHRASE,temporary)
                cloud=Cloud(credentials(CREDS.read_text()));key=PREFIX+name
                cloud.upload(destination,key)
                if args.verify_remote:cloud.download_verify(destination,key,temporary)
                cloud.rotate(now)
            files=sorted((p for p in BACKUPS.glob('smartplate_photos_*.tar.gpg') if re.fullmatch(r'smartplate_photos_[0-9_-]+_[0-9a-f]{8}\.tar\.gpg',p.name)),key=lambda p:p.name,reverse=True)
            for old in files[3:]:old.unlink()
            report={'backup':name,'bytes':destination.stat().st_size,'photos':manifest['photos'],'photoSchemaPresent':manifest['photoSchemaPresent'],'archiveRoundtripVerified':True,'remoteHeadVerified':True,'remoteDownloadedAndMatched':args.verify_remote,'fullDatabaseRestored':False}
            (BACKUPS/'last-success.json').write_text(json.dumps(report,sort_keys=True)+'\n')
            print('REVIEW_PHOTOS_BACKUP_OK '+json.dumps(report,sort_keys=True))
        except Exception:
            # An incomplete attempt must not count as a valid retained snapshot.
            if destination.exists():destination.rename(destination.with_name(destination.name+'.failed'))
            raise
if __name__=='__main__':
    try:main()
    except Exception as error:
        print('REVIEW_PHOTOS_BACKUP_FAILED '+(str(error) if isinstance(error,BackupError) else type(error).__name__))
        raise SystemExit(1)
