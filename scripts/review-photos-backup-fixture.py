#!/usr/bin/env python3
"""Synthetic PostgreSQL+GPG roundtrip. No production data, B2 or credentials."""
import importlib.util,json,os,subprocess,tarfile,tempfile,uuid
from pathlib import Path
spec=importlib.util.spec_from_file_location('photo_backup',Path(__file__).with_name('review-photos-backup.py'))
backup=importlib.util.module_from_spec(spec);spec.loader.exec_module(backup)
socket=os.environ['PHOTO_BACKUP_TEST_SOCKET']
if not socket.startswith('/tmp/smartplate-photo-backup.') or not socket.endswith('/socket'):raise RuntimeError('Only disposable fixture socket is allowed')
class FixtureDatabase(backup.Database):
 def dump(self,destination):
  assert self.query('SELECT pg_try_advisory_xact_lock(81743043);')=='f'
  attempt=subprocess.run(self.command('psql','-X','-v','ON_ERROR_STOP=1','-qAt','-d',self.name),input=b"SET lock_timeout='200ms';UPDATE review_photos SET status='deleted';",capture_output=True,env=backup.clean_env())
  assert attempt.returncode and b'lock timeout' in attempt.stderr
  super().dump(destination)
db=FixtureDatabase(host=socket,port=59481,user=os.environ['USER'],name='postgres',prefix=())
identifier=str(uuid.uuid4())
db.query("CREATE TABLE review_photos(id uuid PRIMARY KEY,review_id int,status text,files_deleted_at timestamptz);CREATE TABLE fixture_value(n int);INSERT INTO fixture_value VALUES(7);INSERT INTO review_photos VALUES('"+identifier+"',1,'pending',NULL);")
with tempfile.TemporaryDirectory(prefix='photo-backup-fixture-') as folder:
 root=Path(folder);photos=root/'photos';photos.mkdir();item=photos/identifier;item.mkdir()
 (item/'main.webp').write_bytes(b'fixture-main');(item/'thumb.webp').write_bytes(b'fixture-thumb')
 work=root/'work';work.mkdir();archive,manifest=backup.snapshot(db,photos,work)
 passphrase=root/'passphrase';passphrase.write_text(uuid.uuid4().hex+'\n');passphrase.chmod(0o600)
 encrypted=root/'snapshot.tar.gpg';backup.encrypt_and_verify(archive,encrypted,passphrase,work)
 assert backup.sha(archive)==backup.sha(work/'verified.tar')
 with tarfile.open(work/'verified.tar') as stream:
  assert stream.extractfile('photos/'+identifier+'/main.webp').read()==b'fixture-main'
  restored=root/'restored.dump';restored.write_bytes(stream.extractfile('database.dump').read())
 backup.execute(db.command('createdb','photo_backup_restored'))
 backup.execute(db.command('pg_restore','-d','photo_backup_restored',str(restored)))
 target=backup.Database(host=socket,port=59481,user=os.environ['USER'],name='photo_backup_restored',prefix=())
 assert target.query('SELECT n FROM fixture_value;')=='7'
 assert target.query('SELECT status FROM review_photos;')=='pending'
 print('REVIEW_PHOTOS_BACKUP_FIXTURE_OK '+json.dumps({'syntheticDatabaseRestored':True,'photoBytesRestored':True,'encryptedRoundtrip':True,'concurrentPhotoWritesBlocked':True,'productionDatabaseConnected':False,'cloudUsed':False,'photos':manifest['photos']}))
