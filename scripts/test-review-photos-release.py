"""Release fault tests use temporary files; never connect to production."""
import hashlib,importlib.util,json,os,subprocess,sys,tempfile,time,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('photo_release',Path(__file__).with_name('install-review-photos-release.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class ReleaseTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='photo-release-test-');self.root=Path(self.temp.name).resolve();self.stack=[]
  for name,value in [('BASE',self.root/'checkpoint'),('TARGETS',{'server/source.js':self.root/'live/source.js','platform/new.js':self.root/'live/new.js','env':self.root/'live/.env'}),('ENV',self.root/'live/.env')]:
   item=patch.object(module,name,value);item.start();self.stack.append(item)
  module.BASE.mkdir();(self.root/'live').mkdir();module.TARGETS['server/source.js'].write_bytes(b'old');module.ENV.write_bytes(b'SECRET=never-log-this\n')
  # Keep fixture files owned by the caller, including unprivileged Linux runs.
  actual=module.atomic_bytes
  def own(target,data,mode=0o644,uid=0,gid=0):return actual(target,data,mode,os.getuid() if hasattr(os,'getuid') else 0,os.getgid() if hasattr(os,'getgid') else 0)
  item=patch.object(module,'atomic_bytes',side_effect=own);item.start();self.stack.append(item)
 def tearDown(self):
  for item in reversed(self.stack):item.stop()
  self.temp.cleanup()
 def plan(self):
  result=[]
  for name,target in module.TARGETS.items():
   old=target.read_bytes() if target.exists() else None;new=('new '+name).encode()
   if old is not None:
    file=module.BASE/'previous'/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(old)
   file=module.BASE/'payload'/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(new)
   result.append({'name':name,'beforeSha256':hashlib.sha256(old).hexdigest() if old is not None else None,'afterSha256':hashlib.sha256(new).hexdigest(),'previous':{'mode':0o600,'uid':0,'gid':0} if old is not None else None,'mode':0o600,'uid':0,'gid':0})
  (module.BASE/'plan.json').write_text(json.dumps(result));module.save_state({'phase':'armed','touched':[],'unit':'fixture','deadlineMonotonic':time.monotonic()+900});return result
 def test_environment_appends_only_three_settings_and_preserves_original(self):
  old=b'EXISTING="keep-value"\r\n';new=module.environment_bytes(old)
  self.assertTrue(new.startswith(old));self.assertEqual(len(new.splitlines()),4);self.assertIn(b'REVIEW_PHOTOS_ENABLED=1\r\n',new)
 def test_environment_refuses_any_existing_photo_setting(self):
  for key in module.FEATURE_KEYS:
   with self.assertRaisesRegex(RuntimeError,'Existing photo'):module.environment_bytes((' export '+key+'=0\n').encode())
 def test_environment_adds_missing_last_newline(self):self.assertTrue(module.environment_bytes(b'A=b').startswith(b'A=b\nREVIEW_'))
 def test_rejects_payload_path_escape(self):
  for name in ['../secret','/etc/passwd','C:/secret','dir\\secret']:
   with self.assertRaises(RuntimeError):module.relative(name)
 def test_migration_boundaries_and_schema_contract(self):
  self.assertEqual(module.migration_body('BEGIN; SELECT 1; COMMIT;'),' SELECT 1; ')
  with self.assertRaises(RuntimeError):module.migration_body('SELECT 1;')
  with patch.object(module,'psql',return_value='t') as query:
   module.migration_schema_check();self.assertIn("table_name='review_photos')=15",query.call_args_list[0].args[0])
 @unittest.skipIf(module.fcntl is None,'Linux file locking')
 def test_installed_old_new_and_private_environment_restore(self):
  plan=self.plan()
  with patch.object(module,'timer_active',return_value=True):module.install_names(list(module.TARGETS),plan)
  module.restore_entries(plan,module.load_state())
  self.assertEqual(module.TARGETS['server/source.js'].read_bytes(),b'old');self.assertFalse(module.TARGETS['platform/new.js'].exists());self.assertEqual(module.ENV.read_bytes(),b'SECRET=never-log-this\n')
 @unittest.skipIf(module.fcntl is None,'Linux file locking')
 def test_crash_before_atomic_write_is_journalled_and_restorable(self):
  plan=self.plan()
  actual=module.atomic_bytes
  def crash(target,*args,**kwargs):
   if target==module.TARGETS['server/source.js']:raise RuntimeError('simulated termination before write')
   return actual(target,*args,**kwargs)
  with patch.object(module,'timer_active',return_value=True),patch.object(module,'atomic_bytes',side_effect=crash):
   with self.assertRaisesRegex(RuntimeError,'simulated'):module.install_names(['server/source.js'],plan)
  self.assertEqual(module.load_state()['touched'],['server/source.js']);module.restore_entries(plan,module.load_state());self.assertEqual(module.TARGETS['server/source.js'].read_bytes(),b'old')
 def test_rollback_refuses_unrelated_drift_before_restoring_any_file(self):
  plan=self.plan();module.TARGETS['server/source.js'].write_bytes(b'external change')
  with self.assertRaisesRegex(RuntimeError,'unrelated'):module.restore_entries(plan,{'touched':['server/source.js','env']})
  self.assertEqual(module.TARGETS['server/source.js'].read_bytes(),b'external change')
 def test_checkpoint_drift_is_rejected(self):
  plan=self.plan();module.TARGETS['server/source.js'].write_bytes(b'new server/source.js');(module.BASE/'previous/server/source.js').write_bytes(b'tampered')
  with self.assertRaisesRegex(RuntimeError,'checkpoint drift'):module.restore_entries(plan,{'touched':['server/source.js']})
 @unittest.skipIf(module.fcntl is None,'Linux file locking')
 def test_rollback_restores_files_restarts_and_marks_terminal_before_timer_stop(self):
  plan=self.plan()
  with patch.object(module,'timer_active',return_value=True):module.install_names(list(module.TARGETS),plan)
  def stopped(state):self.assertEqual(module.load_state()['phase'],'rolled_back')
  with patch.object(module,'protected_checkpoint'),patch.object(module,'restart_api') as restart,patch.object(module,'api_identity',return_value='997'),patch.object(module,'stop_timer',side_effect=stopped):module.rollback()
  restart.assert_called_once();self.assertFalse(module.TARGETS['platform/new.js'].exists())
 @unittest.skipIf(module.fcntl is None,'Linux file locking')
 def test_queued_rollback_cannot_revert_confirmed_release(self):
  self.plan();state=module.load_state();state['phase']='confirmed';module.save_state(state)
  with patch.object(module,'protected_checkpoint'),patch.object(module,'restore_entries') as restore:module.rollback()
  restore.assert_not_called();self.assertEqual(module.load_state()['phase'],'confirmed')
 def test_cannot_write_after_deadline_or_terminal_decision(self):
  for phase,deadline in [('confirmed',time.monotonic()+900),('rolled_back',time.monotonic()+900),('rolling_back',time.monotonic()+900),('applying',time.monotonic()+119)]:
   with patch.object(module,'timer_active',return_value=True),self.assertRaises(RuntimeError):module.require_open({'phase':phase,'deadlineMonotonic':deadline})
  with patch.object(module,'timer_active',return_value=False),self.assertRaises(RuntimeError):module.require_open({'phase':'armed','deadlineMonotonic':time.monotonic()+900})
 def test_corrupt_payload_cannot_replace_existing_source(self):
  plan=self.plan();(module.BASE/'payload/server/source.js').write_bytes(b'wrong')
  if module.fcntl is None:return
  with patch.object(module,'timer_active',return_value=True),self.assertRaisesRegex(RuntimeError,'payload drift'):module.install_names(['server/source.js'],plan)
  self.assertEqual(module.TARGETS['server/source.js'].read_bytes(),b'old')
 @unittest.skipIf(module.fcntl is None,'Linux process interruption')
 def test_process_killed_after_first_write_can_be_rolled_back_by_separate_process(self):
  self.plan();source=str(Path(__file__).with_name('install-review-photos-release.py').resolve());settings={'base':str(module.BASE),'targets':{name:str(path) for name,path in module.TARGETS.items()}}
  setup="import importlib.util,json,os,time;from pathlib import Path;s=importlib.util.spec_from_file_location('release',"+repr(source)+");m=importlib.util.module_from_spec(s);s.loader.exec_module(m);c=json.loads("+repr(json.dumps(settings))+");m.BASE=Path(c['base']);m.TARGETS={k:Path(v) for k,v in c['targets'].items()};m.timer_active=lambda state:True;actual=m.atomic_bytes;m.atomic_bytes=lambda target,data,mode=420,uid=0,gid=0:actual(target,data,mode,os.getuid(),os.getgid());"
  child=subprocess.Popen([sys.executable,'-c',setup+"m.install_names(['server/source.js','platform/new.js'],m.load_plan());(m.BASE/'written').touch();time.sleep(60)"])
  try:
   for attempt in range(100):
    if (module.BASE/'written').exists():break
    if child.poll() is not None:self.fail('Fixture writer exited before interruption')
    time.sleep(.03)
   self.assertTrue((module.BASE/'written').exists());child.kill();child.wait(timeout=5)
   subprocess.run([sys.executable,'-c',setup+"m.protected_checkpoint=lambda:None;m.restart_api=lambda:None;m.api_identity=lambda:'997';m.stop_timer=lambda state:None;m.rollback()"],check=True,capture_output=True,timeout=10)
   self.assertEqual(module.load_state()['phase'],'rolled_back');self.assertEqual(module.TARGETS['server/source.js'].read_bytes(),b'old');self.assertFalse(module.TARGETS['platform/new.js'].exists())
  finally:
   if child.poll() is None:child.kill();child.wait(timeout=5)
if __name__=='__main__':unittest.main(verbosity=2)
