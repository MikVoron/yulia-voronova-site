"""Unprivileged private PostgreSQL cluster; production files are read only."""
import json,os,pathlib,shutil,subprocess,tempfile
P=pathlib.Path(__file__).resolve().parent
B=pathlib.Path('/usr/lib/postgresql/16/bin')
def run(args,input=None,env=None):
    r=subprocess.run([str(x) for x in args],input=input,text=True,capture_output=True,env=env)
    if r.returncode: raise RuntimeError(r.stderr[-3000:]+r.stdout[-1000:])
    return r.stdout
assert os.geteuid()!=0, 'Rehearse as the unprivileged administrator'
root=pathlib.Path(tempfile.mkdtemp(prefix='seo-nav-rehearsal-',dir='/tmp')).resolve()
started=False
try:
    run([B/'initdb','-D',root/'db','-A','trust','--no-locale','--encoding=UTF8'])
    run([B/'pg_ctl','-D',root/'db','-l',root/'postgres.log','-o',f"-k {root} -p 55437 -c listen_addresses=''",'-w','start']);started=True
    args=[B/'psql','-h',root,'-p','55437','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1']
    def sql(value): return run(args,input=value)
    sql("""
CREATE TABLE recipes(id text PRIMARY KEY,name text,photo text,steps jsonb,ingredients jsonb,
 main_ingredients text[],is_published boolean,is_free boolean,access_level text,
 time_min int,time_label text,difficulty text,kcal int,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE categories(id text PRIMARY KEY,name text,description text,emoji text,cover_recipe_id text,sort_order int);
CREATE TABLE recipe_categories(recipe_id text,category_id text);
CREATE TABLE reviews(id serial PRIMARY KEY,recipe_id text,stars int);
CREATE TABLE ingredient_catalog(id text,name text);
INSERT INTO recipes(id,name,photo,steps,ingredients,main_ingredients,is_published,is_free,access_level,time_min,kcal)
VALUES ('side-bulgur','Булгур','images/recipes/side-bulgur'||chr(92)||'side-bulgur-cover.webp',
 jsonb_build_array('first',jsonb_build_object('text','second','photo','images/recipes/side-bulgur'||chr(92)||'side-bulgur-2.webp'),'last'),
 '[{"name":"Булгур"}]',ARRAY['bulgur'],true,true,'free',15,100),
 ('trial','Пробный','images/trial.webp','["SECRET STEP"]','["SECRET INGREDIENT"]',ARRAY['bulgur'],true,false,'trial',20,200),
 ('hidden','UNPUBLISHED','images/hidden.webp','[]','[]',ARRAY['private-ingredient'],false,false,'pro',10,100);
INSERT INTO categories VALUES ('sides','Гарниры','Описание','🍚','side-bulgur',1),('private','PRIVATE CATEGORY','','',NULL,2);
INSERT INTO recipe_categories VALUES ('side-bulgur','sides'),('trial','sides'),('hidden','private');
INSERT INTO reviews(recipe_id,stars) VALUES ('side-bulgur',5),('trial',4),('hidden',5);
INSERT INTO ingredient_catalog VALUES ('bulgur','Булгур'),('private-ingredient','PRIVATE INGREDIENT');
""")
    before=json.loads(sql("SELECT row_to_json(r) FROM recipes r WHERE id='side-bulgur';"))
    migration=(P/'bulgur.sql').read_text()
    sql(migration.replace('\nCOMMIT;','\nROLLBACK;'))
    assert json.loads(sql("SELECT row_to_json(r) FROM recipes r WHERE id='side-bulgur';"))==before
    sql(migration);after=json.loads(sql("SELECT row_to_json(r) FROM recipes r WHERE id='side-bulgur';"))
    expected=json.loads(json.dumps(before));expected['photo']=expected['photo'].replace('\\','/');expected['steps'][1]['photo']=expected['steps'][1]['photo'].replace('\\','/')
    expected['updated_at']=after['updated_at'];assert after==expected
    sql(migration);assert json.loads(sql("SELECT row_to_json(r) FROM recipes r WHERE id='side-bulgur';"))==after
    sql("UPDATE recipes SET photo='images/later-edit.webp' WHERE id='side-bulgur';")
    try: sql(migration)
    except RuntimeError: pass
    else: raise AssertionError('Missing guard for later edits')
    sql("UPDATE recipes SET photo='images/recipes/side-bulgur/side-bulgur-cover.webp' WHERE id='side-bulgur';")
    node=r'''
const fs=require('node:fs'),Module=require('node:module'),{execFileSync}=require('node:child_process');
const virtual='/var/www/smartplate-api/src/home-seo.js',m=new Module(virtual,module);m.filename=virtual;m.paths=Module._nodeModulePaths('/var/www/smartplate-api/src');m._compile(fs.readFileSync(process.argv[2],'utf8'),virtual);
const db={query:async sql=>({rows:JSON.parse(execFileSync('/usr/lib/postgresql/16/bin/psql',['-h',process.env.PRIVATE_PG_SOCKET,'-p','55437','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1','-c',`SELECT COALESCE(json_agg(t),'[]'::json) FROM (${sql}) t`],{encoding:'utf8'}))})};
(async()=>{const data=await m.exports.loadHomeData(db);if(data.categories.length!==1||data.popular.length!==2||data.ingredients.length!==1)throw Error('Unexpected published selection');
let html=m.exports.renderHomeDocument(fs.readFileSync(process.argv[3],'utf8'),data);
for(const secret of ['UNPUBLISHED','SECRET STEP','SECRET INGREDIENT','PRIVATE CATEGORY','PRIVATE INGREDIENT'])if(html.includes(secret))throw Error('Leaked '+secret);
if(!html.includes('href="recipe.html?id=trial"')||!html.includes('href="ingredient.html?id=bulgur"'))throw Error('Missing public links');
console.log('PRIVATE_PG_SELECTION_AND_RENDER_OK')})().catch(e=>{console.error(e.message);process.exitCode=1});
'''
    (root/'test.cjs').write_text(node)
    env=dict(os.environ);env['PRIVATE_PG_SOCKET']=str(root)
    print(run(['/usr/bin/node',root/'test.cjs',P/'payload/home-seo.js',P/'payload/index.html'],env=env),end='')
    print('SQL_DRY_RUN_ATOMICITY_IDEMPOTENCY_LATER_EDIT_GUARD_OK')
finally:
    if started: run([B/'pg_ctl','-D',root/'db','-m','fast','-w','stop'])
    assert root.parent==pathlib.Path('/tmp') and root.name.startswith('seo-nav-rehearsal-')
    shutil.rmtree(root)
    print('PRIVATE_PG_CLEANUP_OK; production DB and services unchanged')
