#!/usr/bin/env python3
"""Scoped photo release with a protected checkpoint and independent rollback timer."""
import argparse,contextlib,hashlib,json,os,re,stat,subprocess,tempfile,time,urllib.error,urllib.parse,urllib.request,uuid
from pathlib import Path
try:import fcntl
except ImportError:fcntl=None

BASE=Path(__file__).resolve().parent
CHECKPOINTS=Path('/root/smartplate-review-photos')
API=Path('/var/www/smartplate-api');FRONT=Path('/var/www/smartplate-platform')
ENV=API/'.env';NGINX=Path('/etc/nginx/sites-enabled/api.voronova.online')
PHOTOS=Path('/var/lib/smartplate/review-photos')
CODECS=Path('/var/lib/smartplate-photo-codecs/codec-612dc9263eea61be52a0')
STORAGE_RECEIPT=CHECKPOINTS/'review-photo-storage-35bx0em5/result.json'
STORAGE_MANIFEST_SHA='dfa8694d1cab6cf96d38ce403086bfa13f25d5d5937aea7444a9c1308ea7f1e1'
FEATURE_KEYS=('REVIEW_PHOTOS_ENABLED','REVIEW_PHOTOS_DIR','REVIEW_PHOTO_CODECS_DIR')
API_FILES=['src/review-photo-codecs.js','src/review-photo-storage.js','src/review-photo-worker.js','src/review-photos.js','src/routes/review-photos.js','src/email.js','migrations/043_review_photos.sql','index.js']
FRONT_FILES=['review-photos.css','review-photos.js','admin-review-photos.js','review-discussions.js','recipe-page.js','admin.js','category.html','ingredient.html','recipe.html','admin.html']
TARGETS={**{'server/'+name:API/name for name in API_FILES},**{'platform/'+name:FRONT/name for name in FRONT_FILES},'nginx/api.voronova.online':NGINX,'env':ENV}
TERMINAL={'confirmed','rolled_back'}

def sha(file):return hashlib.sha256(file.read_bytes()).hexdigest() if file.exists() else None
def safe_file(file):
    if file.is_symlink() or (file.exists() and not file.is_file()):raise RuntimeError('Unsafe file: '+file.name)
def relative(name):
    if not isinstance(name,str) or name.startswith('/') or '\\' in name or ':' in name or '..' in Path(name).parts:raise RuntimeError('Unsafe payload path')
    return Path(name)
def execute(args,timeout=40,**options):
    options.setdefault('stdout',subprocess.PIPE);options.setdefault('stderr',subprocess.PIPE)
    try:return subprocess.run(args,check=True,timeout=timeout,env=options.pop('env',{'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','HOME':'/nonexistent'}),**options).stdout
    except FileNotFoundError as error:raise RuntimeError('Missing executable: '+Path(args[0]).name) from error
    except subprocess.SubprocessError as error:raise RuntimeError('Command failed: '+Path(args[0]).name) from error
def sync_directory(directory):
    if os.name=='nt':return
    descriptor=os.open(directory,os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(descriptor)
    finally:os.close(descriptor)
def atomic_bytes(target,data,mode=0o644,uid=0,gid=0):
    safe_file(target);target.parent.mkdir(parents=True,exist_ok=True)
    descriptor,name=tempfile.mkstemp(prefix='.review-photo-release-',dir=target.parent)
    try:
        with os.fdopen(descriptor,'wb') as stream:
            stream.write(data);stream.flush();os.fsync(stream.fileno());os.fchmod(stream.fileno(),mode)
            if hasattr(os,'fchown'):os.fchown(stream.fileno(),uid,gid)
        os.replace(name,target);sync_directory(target.parent)
    finally:
        if os.path.exists(name):os.unlink(name)
def save_state(state):atomic_bytes(BASE/'state.json',(json.dumps(state,sort_keys=True)+'\n').encode(),0o600,os.getuid() if hasattr(os,'getuid') else 0,os.getgid() if hasattr(os,'getgid') else 0)
def load_state():return json.loads((BASE/'state.json').read_text())
def load_plan():return json.loads((BASE/'plan.json').read_text())
@contextlib.contextmanager
def locked():
    if fcntl is None:raise RuntimeError('Linux required')
    descriptor=os.open(BASE/'release.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    with os.fdopen(descriptor,'r+') as stream:
        fcntl.flock(stream,fcntl.LOCK_EX);yield
def fetch(path,method='GET',body=None,public=False):
    url=path if public else 'http://127.0.0.1:3000'+path
    request=urllib.request.Request(url,data=body,method=method,headers={'Cache-Control':'no-cache','Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(request,timeout=12) as response:return response.status,response.read()
    except urllib.error.HTTPError as error:return error.code,error.read()
def api_identity():
    status,body=fetch('/health');health=json.loads(body)
    if status!=200 or health.get('status')!='ok' or health.get('db')!='ok':raise RuntimeError('API health failed')
    rows=[line.split(None,3) for line in execute(['/usr/bin/ps','-eo','pid=,uid=,gid=,args=']).decode().splitlines()]
    found=[row for row in rows if len(row)==4 and row[3]=='node /var/www/smartplate-api/index.js']
    if len(found)!=1 or found[0][1:3]!=['997','997']:raise RuntimeError('API UID/GID must be 997')
    return found[0][0]
def restart_api():
    execute(['/usr/bin/env','PM2_HOME=/root/.pm2','/usr/bin/pm2','restart','smartplate-api'],env={'PATH':'/usr/bin:/bin','PM2_HOME':'/root/.pm2','HOME':'/root'},timeout=35)
    for attempt in range(30):
        try:return api_identity()
        except Exception:
            if attempt==29:raise
            time.sleep(.5)
def psql(sql):return execute(['/usr/sbin/runuser','-u','postgres','--','/usr/bin/psql','-w','-X','-v','ON_ERROR_STOP=1','-qAt','-h','/var/run/postgresql','-U','postgres','-d','smartplate_db'],input=sql.encode()).decode().strip()
def migration_body(text):
    if text.count('BEGIN;')!=1 or text.count('COMMIT;')!=1:raise RuntimeError('Unexpected migration boundaries')
    return text.replace('BEGIN;','',1).replace('COMMIT;','',1)
def environment_bytes(original):
    text=original.decode('utf-8')
    if re.search(r'^\s*(?:export\s+)?(?:'+ '|'.join(FEATURE_KEYS)+r')\s*=',text,re.M):raise RuntimeError('Existing photo environment settings require review')
    newline='\r\n' if '\r\n' in text else '\n'
    suffix=newline.join(['REVIEW_PHOTOS_ENABLED=1','REVIEW_PHOTOS_DIR='+str(PHOTOS),'REVIEW_PHOTO_CODECS_DIR='+str(CODECS),''])
    return (text+('' if text.endswith(('\n','\r')) else newline)+suffix).encode()
def validate_bundle(expected,baseline=True):
    if sha(BASE/'manifest.json')!=expected:raise RuntimeError('Release manifest mismatch')
    manifest=json.loads((BASE/'manifest.json').read_text())
    if manifest.get('release')!='review-photos-release-20261108' or len(manifest['targets'])!=len(TARGETS)-1 or {entry['name'] for entry in manifest['targets']}!=set(TARGETS)-{'env'}:raise RuntimeError('Unexpected release scope')
    names=[entry['file'] for entry in manifest['files']]
    required={'install.py','scripts/install-review-photos-release.py','scripts/test-review-photos-release.py'}|{'payload/'+name for name in set(TARGETS)-{'env'}}
    if len(names)!=len(set(names)) or set(names)!=required:raise RuntimeError('Unexpected payload scope')
    digests={entry['file']:entry['sha256'] for entry in manifest['files']}
    if digests['install.py']!=digests['scripts/install-review-photos-release.py']:raise RuntimeError('Installer copy mismatch')
    if any(digests['payload/'+entry['name']]!=entry['afterSha256'] for entry in manifest['targets']):raise RuntimeError('Target/payload contract mismatch')
    if {entry['path'] for entry in manifest['unchanged']}!={str(API/'package.json'),str(API/'package-lock.json'),'/etc/nginx/snippets/smartplate-api-proxy.conf'}:raise RuntimeError('Unexpected unchanged scope')
    for entry in manifest['files']:
        file=BASE/relative(entry['file']);safe_file(file)
        if not file.resolve().is_relative_to(BASE) or sha(file)!=entry['sha256']:raise RuntimeError('Payload hash mismatch')
    if baseline:
        for entry in manifest['targets']:
            target=TARGETS[entry['name']];safe_file(target)
            if sha(target)!=entry['beforeSha256']:raise RuntimeError('Production drift: '+entry['name'])
    for entry in manifest['unchanged']:
        target=Path(entry['path']);safe_file(target)
        if sha(target)!=entry['sha256']:raise RuntimeError('Unrelated dependency/configuration drift')
    return manifest
def validate_storage():
    info=STORAGE_RECEIPT.stat()
    if info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=0o600:raise RuntimeError('Storage receipt permissions')
    receipt=json.loads(STORAGE_RECEIPT.read_text())
    if receipt.get('codecDirectory')!=str(CODECS) or receipt.get('photoDirectory')!=str(PHOTOS) or not receipt.get('codecsAndStorageUid997Verified') or not receipt.get('backupCronInstalled') or not receipt.get('backup',{}).get('remoteDownloadedAndMatched'):raise RuntimeError('Storage/backup receipt not accepted')
    source=STORAGE_RECEIPT.parent/'manifest.json'
    if sha(source)!=STORAGE_MANIFEST_SHA:raise RuntimeError('Protected storage manifest mismatch')
    for entry in json.loads(source.read_text())['codecFiles']:
        file=CODECS/relative(entry['path']);safe_file(file)
        if sha(file)!=entry['sha256'] or file.stat().st_uid!=0 or stat.S_IMODE(file.stat().st_mode)&0o022:raise RuntimeError('Installed codec drift')
    photo=PHOTOS.stat()
    if PHOTOS.is_symlink() or (photo.st_uid,photo.st_gid,stat.S_IMODE(photo.st_mode))!=(997,997,0o700):raise RuntimeError('Photo storage permissions')
def protected_checkpoint():
    info=BASE.stat()
    if BASE.parent!=CHECKPOINTS or not BASE.name.startswith('review-photo-release-') or info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=0o700:raise RuntimeError('Protected release checkpoint required')
def protect(manifest,expected):
    info=CHECKPOINTS.stat()
    if CHECKPOINTS.is_symlink() or info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=0o700:raise RuntimeError('Private photo checkpoint root required')
    checkpoint=Path(tempfile.mkdtemp(prefix='review-photo-release-',dir=CHECKPOINTS));os.chmod(checkpoint,0o700)
    for entry in manifest['files']:
        data=(BASE/entry['file']).read_bytes()
        if hashlib.sha256(data).hexdigest()!=entry['sha256']:raise RuntimeError('Payload changed during protection')
        target=checkpoint/entry['file'];target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data);target.chmod(0o600)
    (checkpoint/'manifest.json').write_bytes((BASE/'manifest.json').read_bytes());(checkpoint/'manifest.json').chmod(0o600)
    print('REVIEW_PHOTOS_RELEASE_CHECKPOINT '+str(checkpoint),flush=True)
    os.execv('/usr/bin/python3',['/usr/bin/python3',str(checkpoint/'install.py'),'--manifest-sha',expected,'--protected'])
def make_plan(manifest):
    entries=[]
    for entry in manifest['targets']:
        name=entry['name'];target=TARGETS[name];safe_file(target);previous=None
        if target.exists():
            info=target.stat()
            if info.st_uid!=0 or stat.S_IMODE(info.st_mode)&0o022:raise RuntimeError('Live source is not root protected')
            previous={'mode':stat.S_IMODE(info.st_mode),'uid':info.st_uid,'gid':info.st_gid}
            saved=BASE/'previous'/relative(name);saved.parent.mkdir(parents=True,exist_ok=True);saved.write_bytes(target.read_bytes());saved.chmod(0o600)
            if sha(saved)!=entry['beforeSha256']:raise RuntimeError('Checkpoint drift')
        entries.append({**entry,'previous':previous,'mode':0o644,'uid':0,'gid':0})
    safe_file(ENV);info=ENV.stat()
    if (info.st_uid,info.st_gid,stat.S_IMODE(info.st_mode))!=(0,997,0o640):raise RuntimeError('Env permissions')
    original=ENV.read_bytes();updated=environment_bytes(original)
    for name,data in [('previous/env',original),('payload/env',updated)]:
        file=BASE/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(data);file.chmod(0o600)
    entries.append({'name':'env','beforeSha256':hashlib.sha256(original).hexdigest(),'afterSha256':hashlib.sha256(updated).hexdigest(),'previous':{'mode':0o640,'uid':0,'gid':997},'mode':0o640,'uid':0,'gid':997})
    atomic_bytes(BASE/'plan.json',(json.dumps(entries,sort_keys=True)+'\n').encode(),0o600)
    return entries
def timer_active(state):
    unit=state['unit']+'.timer'
    return execute(['/usr/bin/systemctl','show','-p','ActiveState','--value',unit]).strip()==b'active'
def require_open(state):
    if state['phase'] in TERMINAL or state['phase']=='rolling_back':raise RuntimeError('Release already terminal or rolling back')
    if time.monotonic()>=state['deadlineMonotonic']-120 or not timer_active(state):raise RuntimeError('Rollback timer inactive or safety margin exhausted')
def arm_timer(state):
    save_state(state)
    execute(['/usr/bin/systemd-run','--quiet','--collect','--unit='+state['unit'],'--on-active=15m','--timer-property=AccuracySec=1s','--property=Type=oneshot','/usr/bin/python3',str(BASE/'install.py'),'--rollback'])
    if not timer_active(state):raise RuntimeError('Rollback timer did not become active')
    state['phase']='armed';save_state(state)
def stop_timer(state):execute(['/usr/bin/systemctl','stop',state['unit']+'.timer'],timeout=15)
def probe_independent_timer():
    unit='smartplate-photo-timer-probe-'+uuid.uuid4().hex[:12];marker=BASE/'timer-probe.ok'
    execute(['/usr/bin/systemd-run','--quiet','--collect','--unit='+unit,'--on-active=2s','--timer-property=AccuracySec=100ms','--property=Type=oneshot','/usr/bin/touch',str(marker)])
    try:
        for attempt in range(40):
            if marker.is_file():return
            time.sleep(.25)
        raise RuntimeError('Independent systemd timer probe failed')
    finally:
        try:execute(['/usr/bin/systemctl','stop',unit+'.timer'],timeout=15)
        except RuntimeError:
            if not marker.is_file():raise
def install_names(names,plan):
    entries={entry['name']:entry for entry in plan}
    with locked():
        state=load_state();require_open(state);state['phase']='applying';save_state(state)
        for name in names:
            entry=entries[name];target=TARGETS[name];safe_file(target)
            if sha(target)!=entry['beforeSha256']:raise RuntimeError('Target changed before install: '+name)
            if name not in state['touched']:state['touched'].append(name);save_state(state)
            data=(BASE/'payload'/relative(name)).read_bytes()
            if hashlib.sha256(data).hexdigest()!=entry['afterSha256']:raise RuntimeError('Protected payload drift')
            atomic_bytes(target,data,entry['mode'],entry['uid'],entry['gid'])
            if sha(target)!=entry['afterSha256']:raise RuntimeError('Installed hash mismatch: '+name)
def restore_entries(plan,state):
    entries={entry['name']:entry for entry in plan}
    for name in state['touched']:
        entry=entries[name];target=TARGETS[name];safe_file(target)
        if sha(target) not in {entry['beforeSha256'],entry['afterSha256']}:raise RuntimeError('Refusing rollback over unrelated changes: '+name)
    for name in reversed(state['touched']):
        entry=entries[name];target=TARGETS[name]
        if sha(target)==entry['beforeSha256']:continue
        if entry['beforeSha256'] is None:target.unlink();sync_directory(target.parent)
        else:
            saved=BASE/'previous'/relative(name)
            if sha(saved)!=entry['beforeSha256']:raise RuntimeError('Rollback checkpoint drift')
            meta=entry['previous'];atomic_bytes(target,saved.read_bytes(),meta['mode'],meta['uid'],meta['gid'])
        if sha(target)!=entry['beforeSha256']:raise RuntimeError('Rollback verification failed')
def rollback():
    protected_checkpoint()
    with locked():
        state=load_state()
        if state['phase'] in TERMINAL:return
        state['phase']='rolling_back';save_state(state);plan=load_plan()
        restore_entries(plan,state)
        if 'nginx/api.voronova.online' in state['touched']:
            execute(['/usr/sbin/nginx','-t']);execute(['/usr/bin/systemctl','reload','nginx'])
        if any(name.startswith('server/') or name=='env' for name in state['touched']):restart_api()
        api_identity();state['phase']='rolled_back';save_state(state)
    stop_timer(state)
    print('REVIEW_PHOTOS_FILES_ROLLED_BACK additive photo tables and user files retained',flush=True)
def migration_schema_check():
    sql="SELECT (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='review_photos')=15 AND (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='review_photo_notifications')=8;"
    if psql(sql)!='t':raise RuntimeError('Photo schema column contract failed')
    psql("BEGIN;SET LOCAL ROLE smartplate;SELECT id,review_id,user_id,request_id,batch_id,input_sha256,status,width,height,bytes,reason,created_at,moderated_at,moderated_by,files_deleted_at FROM review_photos LIMIT 0;SELECT user_id,batch_id,review_id,due_at,attempts,lease_id,lease_until,sent_at FROM review_photo_notifications LIMIT 0;ROLLBACK;")
def smoke_api():
    status,body=fetch('/content/review-photos/config');config=json.loads(body)
    if status!=200 or config!={'enabled':True,'maxPhotos':3,'maxInputBytes':20*1024*1024}:raise RuntimeError('Photo config smoke failed')
    for method,path,body in [('GET','/admin/review-photos',None),('DELETE','/content/review-photos/'+str(uuid.uuid4()),None),('PUT','/content/reviews/1/photos/'+str(uuid.uuid4())+'?batchId='+str(uuid.uuid4()),b'x')]:
        if fetch(path,method,body)[0]!=401:raise RuntimeError('Photo authentication smoke failed')
    if fetch('/content/review-photos/'+str(uuid.uuid4())+'/thumb')[0]!=404:raise RuntimeError('Private image not-found smoke failed')
    status,body=fetch('/content/review-photos?reviewIds=1')
    if status!=200 or not isinstance(json.loads(body).get('photos'),list):raise RuntimeError('Photo list/database access smoke failed')
def verify_installed(manifest,plan):
    for entry in plan:
        if sha(TARGETS[entry['name']])!=entry['afterSha256']:raise RuntimeError('Installed file drift')
    for entry in manifest['unchanged']:
        if sha(Path(entry['path']))!=entry['sha256']:raise RuntimeError('Unrelated dependency/configuration drift')
def public_smoke(manifest):
    origin='https://plate.voronova.online';marker='?photo_release='+manifest['commit'][:12]
    for entry in manifest['targets']:
        if not entry['name'].startswith('platform/') or entry['name'].endswith('.html'):continue
        name=entry['name'].removeprefix('platform/')
        status,body=fetch(origin+'/'+name+marker,public=True)
        if name.startswith('admin'):
            if status!=401:raise RuntimeError('Admin basic-auth guard changed')
        elif status!=200 or hashlib.sha256(body).hexdigest()!=entry['afterSha256']:raise RuntimeError('Public asset mismatch: '+name)
    for page in ['recipe.html?id='+urllib.parse.quote(psql("SELECT id FROM recipes WHERE is_published=true AND access_level='free' ORDER BY sort_order LIMIT 1;")), 'category.html?cat='+urllib.parse.quote(psql('SELECT id FROM categories ORDER BY sort_order LIMIT 1;')), 'ingredient.html?id=oatmeal']:
        status,body=fetch(origin+'/'+page+'&photo_release='+manifest['commit'][:12],public=True)
        if status!=200 or b'review-photos.js?v=20261108' not in body or b'review-photos.css?v=20261108' not in body:raise RuntimeError('Public HTML photo assets missing')
    if fetch(origin+'/admin.html'+marker,public=True)[0]!=401:raise RuntimeError('Admin HTML guard changed')
    status,body=fetch('https://api.voronova.online/content/review-photos/config'+marker,public=True)
    if status!=200 or json.loads(body).get('enabled') is not True:raise RuntimeError('Public photo API not enabled')
def candidate_nginx_test():
    root=BASE/'nginx-test';root.mkdir(exist_ok=True)
    text='error_log '+str(root/'error.log')+';\npid '+str(root/'nginx.pid')+';\nevents {}\nhttp {\nlimit_conn_zone $binary_remote_addr zone=smartplate_conn:1m;\n'
    for zone in ['smartplate_auth','smartplate_payment','smartplate_feedback','smartplate_admin','smartplate_api']:text+='limit_req_zone $binary_remote_addr zone='+zone+':1m rate=100r/s;\n'
    text+='include '+str(BASE/'payload/nginx/api.voronova.online')+';\n}\n'
    file=root/'candidate.conf';file.write_text(text);execute(['/usr/sbin/nginx','-t','-c',str(file),'-p',str(root)])
def apply(manifest):
    protected_checkpoint();validate_storage();old_pid=api_identity();plan=make_plan(manifest)
    if any(item.split(b'=',1)[0] in {key.encode() for key in FEATURE_KEYS} for item in Path('/proc/'+old_pid+'/environ').read_bytes().split(b'\0')):raise RuntimeError('Photo keys already in process launch environment')
    with (BASE/'database.dump').open('xb') as output:execute(['/usr/sbin/runuser','-u','postgres','--','/usr/bin/pg_dump','-w','-h','/var/run/postgresql','-U','postgres','-Fc','smartplate_db'],stdout=output,timeout=90)
    execute(['/usr/bin/pg_restore','--list',str(BASE/'database.dump')]);candidate_nginx_test();probe_independent_timer()
    for entry in manifest['targets']:
        if entry['name'].endswith('.js'):execute(['/usr/bin/node','--check',str(BASE/'payload'/entry['name'])])
    body=migration_body((BASE/'payload/server/migrations/043_review_photos.sql').read_text())
    psql("BEGIN;SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='30s';"+body+'ROLLBACK;')
    state={'phase':'prepared','touched':[],'unit':'smartplate-photo-rollback-'+uuid.uuid4().hex[:12],'deadlineMonotonic':time.monotonic()+900,'oldApiPid':old_pid}
    arm_timer(state)
    try:
        with locked():
            state=load_state();require_open(state)
            psql("BEGIN;SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='30s';"+body+'COMMIT;');migration_schema_check()
            state['schemaApplied']=True;save_state(state)
        print('REVIEW_PHOTOS_SCHEMA_READY',flush=True)
        result=execute(['/usr/bin/python3','/opt/voronova/review-photos-backup.py','--verify-remote'],timeout=600).decode().strip()
        if not result.startswith('REVIEW_PHOTOS_BACKUP_OK '):raise RuntimeError('Photo-schema backup not confirmed')
        backup=json.loads(result.removeprefix('REVIEW_PHOTOS_BACKUP_OK '))
        if not all(backup.get(key) for key in ['photoSchemaPresent','archiveRoundtripVerified','remoteDownloadedAndMatched','remoteHeadVerified']):raise RuntimeError('Photo-schema backup verification incomplete')
        print('REVIEW_PHOTOS_SCHEMA_BACKUP_OK',flush=True)
        install_names(['server/'+name for name in API_FILES]+['env','nginx/api.voronova.online'],plan)
        with locked():
            state=load_state();require_open(state);restart_api();execute(['/usr/sbin/nginx','-t']);execute(['/usr/bin/systemctl','reload','nginx']);smoke_api()
        install_names(['platform/'+name for name in FRONT_FILES],plan)
        verify_installed(manifest,plan);public_smoke(manifest);pid=api_identity()
        with locked():
            state=load_state();require_open(state);verify_installed(manifest,plan);smoke_api();state['phase']='confirmed';state['apiPid']=pid;save_state(state)
        timer_stopped=False
        try:stop_timer(state);timer_stopped=True
        except RuntimeError:print('REVIEW_PHOTOS_TIMER_CLEANUP_PENDING confirmed rollback is a no-op',flush=True)
        report={'commit':manifest['commit'],'apiPid':pid,'apiUid':997,'featureEnabled':True,'installedFilesVerified':len(plan),'publicAssetsVerified':True,'rollbackTimerCancelled':timer_stopped,'checkpoint':str(BASE)}
        atomic_bytes(BASE/'result.json',(json.dumps(report,sort_keys=True)+'\n').encode(),0o600)
        print('REVIEW_PHOTOS_RELEASE_OK '+json.dumps(report,sort_keys=True),flush=True)
    except Exception:
        rollback();raise
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--manifest-sha');parser.add_argument('--protected',action='store_true');parser.add_argument('--check',action='store_true');parser.add_argument('--rollback',action='store_true');args=parser.parse_args()
    if args.rollback:
        if os.geteuid()!=0:raise RuntimeError('Root rollback required')
        rollback();return
    manifest=validate_bundle(args.manifest_sha)
    if args.check:
        api_identity();print('REVIEW_PHOTOS_RELEASE_BUNDLE_OK '+json.dumps({'files':len(manifest['targets']),'productionChanged':False}));return
    if fcntl is None or os.geteuid()!=0:raise RuntimeError('Interactive root installation required')
    os.umask(0o077)
    if not args.protected:protect(manifest,args.manifest_sha)
    apply(manifest)
if __name__=='__main__':
    try:main()
    except Exception as error:
        print('REVIEW_PHOTOS_RELEASE_FAILED '+(str(error) if isinstance(error,RuntimeError) else type(error).__name__),flush=True);raise SystemExit(1)
