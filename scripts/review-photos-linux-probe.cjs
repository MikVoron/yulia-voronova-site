'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'..');
process.env.REVIEW_PHOTO_CODECS_DIR=path.join(base,'codecs');
const {loadCodec}=require(path.join(base,'payload/server/src/review-photo-codecs'));
const sharp=loadCodec('sharp');
const {processImage}=require(path.join(base,'payload/server/src/review-photo-storage'));
async function run(){
  const results=[];
  const jpeg=await sharp({create:{width:4000,height:3000,channels:3,background:'#a57241'}}).jpeg().withMetadata({orientation:6}).toBuffer();
  for(const [name,input] of [['jpeg-12mp',jpeg],['heic-sample',await fs.readFile(path.join(base,'fixtures/example.heic'))]]){
    const started=Date.now(),photo=await processImage(input),meta=await sharp(photo.main).metadata();
    assert.ok(meta.width<=1200&&meta.height<=1200);assert.equal(meta.format,'webp');assert.equal(meta.exif,undefined);
    results.push({name,inputBytes:input.length,outputBytes:photo.bytes,width:meta.width,height:meta.height,elapsedMs:Date.now()-started,peakRssKiB:photo.peakRssKiB});
  }
  await assert.rejects(processImage(Buffer.from('<svg/>')),error=>error.statusCode===422);
  const report={node:process.version,sharp:sharp.versions.sharp,platform:process.platform,results};
  await fs.writeFile(path.join(base,'linux-probe.json'),JSON.stringify(report,null,2)+'\n');
  console.log('REVIEW_PHOTOS_LINUX_CODECS_OK '+JSON.stringify(report));
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
