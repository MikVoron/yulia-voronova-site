import hashlib,importlib.util,json,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('photo_readiness',Path(__file__).with_name('review-photos-readiness.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class ReadinessTests(unittest.TestCase):
 def setUp(self):
  self.temporary=tempfile.TemporaryDirectory(prefix='photo-readiness-test-');self.root=Path(self.temporary.name).resolve()
  module.BASE=self.root/'stage';module.API=self.root/'api';module.BASE.mkdir();module.API.mkdir()
  (module.BASE/'payload.js').write_text('const photo = true;');(module.API/'index.js').write_text('live API')
  self.manifest={'release':'review-photos-20261108-readiness','files':[{'file':'payload.js','sha256':module.sha(module.BASE/'payload.js')}],'baseline':[{'path':'server/index.js','sha256':module.sha(module.API/'index.js')}]}
 def tearDown(self):self.temporary.cleanup()
 def save(self):
  file=module.BASE/'manifest.json';file.write_text(json.dumps(self.manifest));return module.sha(file)
 def test_accepts_exact_staging_and_live_baseline(self):module.validate(self.save())
 def test_rejects_payload_tampering(self):
  digest=self.save();(module.BASE/'payload.js').write_text('tampered')
  with self.assertRaisesRegex(RuntimeError,'Staging drift'):module.validate(digest)
 def test_rejects_production_drift(self):
  digest=self.save();(module.API/'index.js').write_text('new live API')
  with self.assertRaisesRegex(RuntimeError,'Production changed'):module.validate(digest)
 def test_rejects_path_escape_even_with_matching_manifest_hash(self):
  outside=self.root/'outside';outside.write_text('outside staging')
  self.manifest['files']=[{'file':'../outside','sha256':module.sha(outside)}]
  with self.assertRaisesRegex(RuntimeError,'Unsafe staged file'):module.validate(self.save())
if __name__=='__main__':unittest.main()
