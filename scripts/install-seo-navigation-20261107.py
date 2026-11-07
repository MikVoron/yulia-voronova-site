import copy,fcntl,hashlib,json,os,pathlib,shutil,subprocess,sys,tempfile,time,urllib.request,uuid
P=pathlib.Path(__file__).resolve().parent
ALLOWED={
 '/var/www/smartplate-api/src/home-seo.js',
 '/var/www/smartplate-api/src/routes/content.js',
 '/var/www/smartplate-platform/index-page.js',
 '/var/www/smartplate-platform/index.html',
 '/etc/nginx/sites-available/plate.voronova.online',
}
def run(args,input=None,timeout=180):
    r=subprocess.run([str(x) for x in args],input=input,text=True,capture_output=True,timeout=timeout)
    if r.returncode: raise RuntimeError(f'{args[0]} failed: {r.stderr[-2500:]} {r.stdout[-1000:]}')
    return r.stdout
def digest(p): return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def psql(sql):
    return run(['/usr/sbin/runuser','-u','postgres','--','/usr/bin/psql','-X','-qAt','-v','ON_ERROR_STOP=1','-d','smartplate_db'],input=sql)
def row(): return json.loads(psql("SELECT row_to_json(r) FROM recipes r WHERE id='side-bulgur';"))
def fetch(url):
    with urllib.request.urlopen(url,timeout=20) as r: return r.read().decode('utf-8')
def healthy():
    d=json.loads(fetch('http://127.0.0.1:3000/health'))
    assert d.get('status')=='ok' and d.get('db')=='ok',d
    lines=[s.split(None,3) for s in run(['/usr/bin/ps','-eo','pid=,uid=,gid=,args=']).splitlines()]
    app=[s for s in lines if len(s)==4 and s[3]=='node /var/www/smartplate-api/index.js']
    assert len(app)==1 and app[0][1:3]==['997','997'], 'Unexpected API identity'
def restart():
    run(['/usr/bin/env','PM2_HOME=/root/.pm2','/usr/bin/pm2','restart','smartplate-api'])
    for attempt in range(30):
        try: healthy(); return
        except Exception:
            if attempt==29: raise
            time.sleep(0.5)
def validate():
    for line in (P/'SHA256SUMS').read_text().splitlines():
        sha,name=line.split('  ',1); f=P/name
        assert f.resolve().is_relative_to(P) and not f.is_symlink()
        assert digest(f)==sha, f'Package mismatch: {name}'
    m=json.loads((P/'manifest.json').read_text())
    assert m['release']=='seo-navigation-20261107'
    assert {x['target'] for x in m['files']}==ALLOWED and len(m['files'])==5
    for x in m['files']: assert digest(P/'payload'/x['name'])==x['after']
    return m

PREFLIGHT=r'''
const fs=require('node:fs'), Module=require('node:module'), {execFileSync}=require('node:child_process');
const virtual='/var/www/smartplate-api/src/home-seo.js';
const mod=new Module(virtual,module);mod.filename=virtual;mod.paths=Module._nodeModulePaths('/var/www/smartplate-api/src');
mod._compile(fs.readFileSync(process.argv[2],'utf8'),virtual);
const db={query:async sql=>{const out=execFileSync('/usr/sbin/runuser',['-u','postgres','--','/usr/bin/psql','-X','-qAt','-v','ON_ERROR_STOP=1','-d','smartplate_db','-c',`BEGIN READ ONLY; SELECT COALESCE(json_agg(t),'[]'::json) FROM (${sql}) t; COMMIT;`],{encoding:'utf8'});return{rows:JSON.parse(out)}}};
(async()=>{const data=await mod.exports.loadHomeData(db);
if(!data.categories.length||!data.popular.length||!data.ingredients.length)throw Error('Unexpected empty navigation');
const html=mod.exports.renderHomeDocument(fs.readFileSync(process.argv[3],'utf8'),data);
for(const needle of ['href="recipe.html?id=','href="ingredient.html?id=','href="category.html?cat='])if(!html.includes(needle))throw Error('Missing '+needle);
console.log(JSON.stringify({categories:data.categories.length,popular:data.popular.length,ingredients:data.ingredients.length}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
'''

def verify_served(m):
    for u in ['https://plate.voronova.online/','https://plate.voronova.online/index.html']:
        body=fetch(u)
        for needle in ['href="recipe.html?id=','href="ingredient.html?id=','href="category.html?cat=','index-page.js?v=20261107-server-navigation']:
            assert needle in body, (u,needle)
        assert '<link rel="canonical" href="https://plate.voronova.online/">' in body
    assert 'href="ingredient.html?id=' in fetch('https://plate.voronova.online/category.html')
    js=fetch('https://plate.voronova.online/index-page.js?v=20261107-server-navigation')
    spec=next(x for x in m['files'] if x['name']=='index-page.js')
    assert hashlib.sha256(js.encode()).hexdigest()==spec['after']
    recipe=next(r for r in json.loads(fetch('https://plate.voronova.online/api/content/recipes')) if r['id']=='side-bulgur')
    assert recipe['photo']=='images/recipes/side-bulgur/side-bulgur-cover.webp'
    assert recipe['steps'][1]['photo']=='images/recipes/side-bulgur/side-bulgur-2.webp'
    assert '\\' not in json.loads(__import__('re').search(r'<script id="smartplate-page-schema" type="application/ld\+json">(.*?)</script>',
        fetch('https://plate.voronova.online/recipe.html?id=side-bulgur'),__import__('re').S).group(1))['image'][0]
    for u in ['https://api.voronova.online/health','https://plate.voronova.online/sitemap.xml']:
        assert fetch(u)

def literal(value):
    data=json.dumps(value,ensure_ascii=False);tag='$json_'+uuid.uuid4().hex+'$'
    return tag+data+tag+'::jsonb'
def main():
    m=validate()
    if sys.argv[1:]==['--validate-only']: print('SEO_NAVIGATION_PACKAGE_OK');return
    assert not sys.argv[1:] and os.geteuid()==0, 'Run through sudo in the server console'
    os.umask(0o077)
    with open('/run/lock/smartplate-seo-navigation.lock','w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        healthy()
        for x in m['files']:
            t=pathlib.Path(x['target'])
            assert not t.is_symlink()
            assert (digest(t) if t.exists() else None)==x['before'], f'Production changed: {t}'
        assert pathlib.Path('/root/.pm2/pm2.pid').exists(), 'PM2 owner changed; review deployment command'
        preflight=P/'preflight.cjs';preflight.write_text(PREFLIGHT)
        print('NAVIGATION_READ_ONLY_PREFLIGHT '+run(['/usr/bin/node',preflight,P/'payload/home-seo.js',P/'payload/index.html']).strip(),flush=True)
        checkpoint=run(['/bin/bash','/home/smartplate-admin/api-checkpoint-20260909.sh','--create'],timeout=300)
        assert 'CHECKPOINT_OK' in checkpoint;print(checkpoint,flush=True)
        backup=pathlib.Path(tempfile.mkdtemp(prefix='seo-navigation-20261107-',dir='/var/backups/smartplate'))
        before=row();(backup/'bulgur-before.json').write_text(json.dumps(before,ensure_ascii=False))
        for x in m['files']:
            if pathlib.Path(x['target']).exists(): shutil.copy2(x['target'],backup/x['name'])
        (backup/'manifest.json').write_text(json.dumps(m,indent=2))
        sql=(P/'bulgur.sql').read_text()
        assert sql.count('\nCOMMIT;')==1
        psql(sql.replace('\nCOMMIT;','\nROLLBACK;'))
        assert row()==before, 'Dry run changed the recipe'
        print(f'Backup: {backup}; SQL_DRY_RUN_OK',flush=True)
        expected=copy.deepcopy(before)
        expected['photo']='images/recipes/side-bulgur/side-bulgur-cover.webp'
        expected['steps'][1]['photo']='images/recipes/side-bulgur/side-bulgur-2.webp'
        rollback=f"""BEGIN;
DO $rollback$ DECLARE original jsonb := {literal(before)}; expected jsonb := {literal(expected)}; current_row jsonb;
BEGIN SELECT to_jsonb(r) INTO current_row FROM recipes r WHERE id='side-bulgur' FOR UPDATE;
IF current_row - 'updated_at' IS NOT DISTINCT FROM original - 'updated_at' THEN RETURN; END IF;
IF current_row - 'updated_at' IS DISTINCT FROM expected - 'updated_at' THEN RAISE EXCEPTION 'Later recipe edits prevent automatic rollback'; END IF;
UPDATE recipes SET photo=original->>'photo',steps=original->'steps',updated_at=(original->>'updated_at')::timestamptz WHERE id='side-bulgur';
END $rollback$; COMMIT;"""
        (backup/'rollback.sql').write_text(rollback)
        installed=False
        try:
            psql(sql);after=row()
            (backup/'bulgur-after.json').write_text(json.dumps(after,ensure_ascii=False))
            for x in m['files']:
                t=pathlib.Path(x['target'])
                assert (digest(t) if t.exists() else None)==x['before'], f'Production changed during preparation: {t}'
            installed=True
            # API and frontend first; nginx starts routing home only after API is ready.
            for x in m['files']:
                run(['/usr/bin/install','-o','root','-g','root','-m','644',P/'payload'/x['name'],x['target']])
            run(['/usr/sbin/nginx','-t']);restart();run(['/usr/bin/systemctl','reload','nginx'])
            for attempt in range(6):
                try: verify_served(m);break
                except Exception:
                    if attempt==5: raise
                    time.sleep(1)
            for x in m['files']: assert digest(x['target'])==x['after']
            healthy()
        except Exception:
            if installed:
                for x in reversed(m['files']):
                    if x['before'] is None: pathlib.Path(x['target']).unlink(missing_ok=True)
                    else: run(['/usr/bin/install','-o','root','-g','root','-m','644',backup/x['name'],x['target']])
                run(['/usr/sbin/nginx','-t']);restart();run(['/usr/bin/systemctl','reload','nginx'])
            psql((backup/'rollback.sql').read_text())
            print(f'INSTALL_FAILED; scoped rollback attempted; backup={backup}',flush=True)
            raise
        print(f'SEO_NAVIGATION_RELEASE_OK commit={m["commit"]} backup={backup}',flush=True)
if __name__=='__main__': main()
