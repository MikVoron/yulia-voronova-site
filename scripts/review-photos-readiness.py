#!/usr/bin/env python3
"""Read-only admission report. No install/restart/migration/secret output."""
import argparse,hashlib,json,os,stat,subprocess
from pathlib import Path

BASE=Path(__file__).resolve().parent
API=Path('/var/www/smartplate-api')
FRONT=Path('/var/www/smartplate-platform')
BACKUP=Path('/opt/voronova/backup.sh')
BACKUP_SHA='ce8b3726411ec8914213b7a70b84a4623ee1e041ad8229cfc098c44876950056'
def sha(file):return hashlib.sha256(file.read_bytes()).hexdigest()
def run(*args,**kwargs):return subprocess.run(args,check=True,text=True,capture_output=True,timeout=20,**kwargs).stdout.strip()
def target(name):
    if '..' in Path(name).parts or '\\' in name or name.startswith('/'):raise RuntimeError('Unsafe target path')
    if name.startswith('server/'):return API/name.removeprefix('server/')
    if name.startswith('platform/'):return FRONT/name.removeprefix('platform/')
    if name=='nginx/api.voronova.online':return Path('/etc/nginx/sites-enabled/api.voronova.online')
    if name=='nginx-snippets/smartplate-api-proxy.conf':return Path('/etc/nginx/snippets/smartplate-api-proxy.conf')
    raise RuntimeError('Unexpected manifest target')
def validate(manifest_hash):
    if sha(BASE/'manifest.json')!=manifest_hash:raise RuntimeError('Manifest hash mismatch')
    manifest=json.loads((BASE/'manifest.json').read_text())
    if manifest['release']!='review-photos-20261108-readiness':raise RuntimeError('Unexpected release')
    for item in manifest['files']:
        file=BASE/item['file']
        if file.is_symlink() or not file.resolve().is_relative_to(BASE):raise RuntimeError('Unsafe staged file')
        if sha(file)!=item['sha256']:raise RuntimeError('Staging drift: '+item['file'])
    changed=[]
    for item in manifest['baseline']:
        live=target(item['path'])
        if live.is_symlink() or (live.exists() and not live.is_file()):raise RuntimeError('Unsafe live target: '+item['path'])
        actual=sha(live) if live.is_file() else None
        if actual!=item['sha256']:changed.append(item['path'])
    if changed:raise RuntimeError('Production changed since capture: '+', '.join(changed))
    return manifest
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--manifest-sha',required=True);parser.add_argument('--root-check',action='store_true');args=parser.parse_args()
    validate(args.manifest_sha)
    health=json.loads(run('curl','-fsS','http://127.0.0.1:3000/health'))
    if health.get('status')!='ok' or health.get('db')!='ok':raise RuntimeError('API not healthy')
    report={'baselineMatches':True,'payloadHashesMatch':True,'apiHealthy':True,'productionChanged':False,'rootChecked':False}
    if args.root_check:
        if os.geteuid()!=0:raise RuntimeError('Root check requires interactive sudo')
        env=API/'.env';info=env.stat()
        if (info.st_uid,info.st_gid,stat.S_IMODE(info.st_mode))!=(0,997,0o640):raise RuntimeError('Unexpected API env permissions')
        keys=('REVIEW_PHOTOS_ENABLED','REVIEW_PHOTOS_DIR','REVIEW_PHOTO_CODECS_DIR')
        text=env.read_text();report['existingPhotoSettings']=[key for key in keys if any(line.startswith(key+'=') for line in text.splitlines())]
        report['backupScriptMatchesKnownVersion']=sha(BACKUP)==BACKUP_SHA
        report['backupCredentialPermissionsValid']=all(path.stat().st_uid==0 and stat.S_IMODE(path.stat().st_mode)==0o600 for path in [Path('/opt/voronova/.b2-credentials'),Path('/opt/voronova/.gpg-passphrase')])
        sql="SELECT json_build_object('reviews',to_regclass('public.reviews') IS NOT NULL,'comments',to_regclass('public.review_comments') IS NOT NULL,'photos',to_regclass('public.review_photos') IS NOT NULL,'photoNotifications',to_regclass('public.review_photo_notifications') IS NOT NULL);"
        report['schema']=json.loads(run('runuser','-u','postgres','--','psql','-X','-v','ON_ERROR_STOP=1','-d','smartplate_db','-At',input=sql))
        run('/usr/sbin/nginx','-t')
        cron=run('crontab','-l')
        report['rootBackupCronPresent']=any('/opt/voronova/backup.sh' in line and not line.lstrip().startswith('#') for line in cron.splitlines())
        report['rootChecked']=True
    print('REVIEW_PHOTOS_READINESS_OK '+json.dumps(report,sort_keys=True))
if __name__=='__main__':
    try:main()
    except Exception as error:
        # Never include subprocess output; it may contain deployment secrets.
        if isinstance(error,subprocess.SubprocessError):print('REVIEW_PHOTOS_READINESS_FAILED subprocess check failed')
        else:print('REVIEW_PHOTOS_READINESS_FAILED '+str(error))
        raise SystemExit(1)
