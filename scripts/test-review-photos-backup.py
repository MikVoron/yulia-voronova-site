import importlib.util,io,json,os,tarfile,tempfile,unittest,uuid
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('photo_backup',Path(__file__).with_name('review-photos-backup.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class FakeDatabase:
 def __init__(self,identifier):self.identifier=identifier;self.released=False
 def lock(self):return self,True
 def poll(self):return None
 def check_locked(self,holder):pass
 def query(self,sql):return json.dumps([self.identifier])
 def dump(self,file):file.write_bytes(b'PGDMP-fixture')
 def unlock(self,holder):self.released=True
class BackupTests(unittest.TestCase):
 def test_production_switch_user_binary_does_not_depend_on_sanitized_path(self):
  command=module.Database().command('psql','--version')
  self.assertEqual(command[0],'/usr/sbin/runuser')
  self.assertNotIn('/usr/sbin',module.clean_env()['PATH'].split(':'))
 def test_missing_executable_has_an_actionable_safe_error(self):
  with patch.object(module.subprocess,'run',side_effect=FileNotFoundError('private details')):
   with self.assertRaisesRegex(module.BackupError,'^EXECUTABLE_MISSING_runuser$'):module.execute(['/usr/sbin/runuser','--version'])
 def test_tool_preflight_uses_the_same_restricted_path(self):
  with patch.object(module.shutil,'which',return_value=None) as lookup:
   with self.assertRaisesRegex(module.BackupError,'^EXECUTABLE_MISSING_runuser$'):module.validate_executables()
  lookup.assert_called_once_with('/usr/sbin/runuser',path=module.clean_env()['PATH'])
 def test_credentials_are_parsed_as_literals_and_never_evaluated(self):
  self.assertEqual(module.credentials("export B2_KEY_ID='key-id'\nB2_APP_KEY=secret+/=\n"),{'B2_KEY_ID':'key-id','B2_APP_KEY':'secret+/='})
  for value in ["B2_KEY_ID=$(echo bad)\nB2_APP_KEY=x",'B2_KEY_ID=x\nB2_APP_KEY=x\nEXTRA=x','B2_KEY_ID=x\nB2_KEY_ID=y\nB2_APP_KEY=x','B2_KEY_ID=x\nB2_APP_KEY=x\nB2_ENDPOINT=https://attacker.invalid']:
   with self.assertRaises(module.BackupError):module.credentials(value)
 def test_snapshot_contains_exact_db_and_photo_bytes_with_checksums(self):
  with tempfile.TemporaryDirectory(prefix='photo-backup-unit-') as folder:
   root=Path(folder);photos=root/'photos';photos.mkdir();work=root/'work';work.mkdir();identifier=str(uuid.uuid4());item=photos/identifier;item.mkdir()
   (item/'main.webp').write_bytes(b'main');(item/'thumb.webp').write_bytes(b'thumb');database=FakeDatabase(identifier)
   with patch.object(module,'execute',return_value=b'fixture TOC'):archive,manifest=module.snapshot(database,photos,work)
   self.assertTrue(database.released);self.assertEqual(manifest['photos'],1)
   with tarfile.open(archive) as stream:
    self.assertEqual(set(stream.getnames()),{'database.dump','photos/'+identifier+'/main.webp','photos/'+identifier+'/thumb.webp','manifest.json'})
    self.assertEqual(stream.extractfile('photos/'+identifier+'/main.webp').read(),b'main')
    for entry in manifest['files']:self.assertEqual(module.hashlib.sha256(stream.extractfile(entry['path']).read()).hexdigest(),entry['sha256'])
 def test_snapshot_releases_db_lock_when_an_active_file_is_missing(self):
  with tempfile.TemporaryDirectory(prefix='photo-backup-unit-') as folder:
   root=Path(folder);database=FakeDatabase(str(uuid.uuid4()))
   with patch.object(module,'execute',return_value=b'fixture TOC'):
    with self.assertRaises(FileNotFoundError):module.snapshot(database,root,root)
   self.assertTrue(database.released)
 def test_cloud_verification_and_retention_use_only_the_dedicated_prefix(self):
  self.assertTrue(module.OBJECT.fullmatch('db/photos/smartplate_photos_2026-11-08_03-30-00_1234abcd.tar.gpg'))
  for key in ['db/smartplate_db_2026-11-08.dump.gpg','db/photos/other.tar.gpg','photos/smartplate_photos_2026-11-08_03-30-00_1234abcd.tar.gpg']:
   self.assertIsNone(module.OBJECT.fullmatch(key))
if __name__=='__main__':unittest.main()
