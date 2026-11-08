import importlib.util,json,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('photo_storage_install',Path(__file__).with_name('install-review-photos-storage.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class StorageTests(unittest.TestCase):
 def setUp(self):
  self.temporary=tempfile.TemporaryDirectory(prefix='photo-storage-test-');root=Path(self.temporary.name).resolve()
  module.BASE=root/'stage';module.READY=root/'ready';module.BASE.mkdir();module.READY.mkdir()
  (module.BASE/'install.py').write_text('installer')
  old=[]
  for name,body in [('readiness.py','readiness'),('fixtures/example.heic','fixture'),('codecs/package.json','{}'),('codecs/package-lock.json','{}')]:
   file=module.READY/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_text(body);old.append({'file':name,'sha256':module.sha(file)})
  (module.READY/'manifest.json').write_text(json.dumps({'files':old}));module.READY_SHA=module.sha(module.READY/'manifest.json')
  codecs=[{'path':name,'sha256':module.sha(module.READY/'codecs'/name)} for name in ['package-lock.json','package.json']]
  self.manifest={'release':'review-photos-storage-20261108','files':[{'file':'install.py','sha256':module.sha(module.BASE/'install.py')}],'codecFiles':codecs,'codecComponentSha256':module.digest(json.dumps(codecs,sort_keys=True,separators=(',',':')).encode())}
 def tearDown(self):self.temporary.cleanup()
 def save(self):
  file=module.BASE/'manifest.json';file.write_text(json.dumps(self.manifest));return module.sha(file)
 def test_accepts_pinned_source_component_and_payload(self):module.verify_manifest(self.save())
 def test_rejects_codec_source_modified_after_manifest(self):
  digest=self.save();(module.READY/'codecs/package.json').write_text('changed')
  with self.assertRaisesRegex(RuntimeError,'Codec source drift'):module.verify_manifest(digest)
 def test_rejects_duplicate_or_escaping_component_paths(self):
  self.manifest['codecFiles'].append(self.manifest['codecFiles'][0])
  with self.assertRaisesRegex(RuntimeError,'Duplicate codec'):module.verify_manifest(self.save())
  for name in ['../outside','/etc/passwd','folder\\outside']:
   with self.assertRaises(RuntimeError):module.safe_relative(name)
 def test_rejects_payload_tampering_before_any_install(self):
  digest=self.save();(module.BASE/'install.py').write_text('changed')
  with self.assertRaisesRegex(RuntimeError,'Storage payload drift'):module.verify_manifest(digest)
if __name__=='__main__':unittest.main()
