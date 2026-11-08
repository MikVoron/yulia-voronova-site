'use strict';
// One small image at a time; does not need a database, browser or SMTP.
const assert=require('node:assert/strict');
const sharp=require('../server/node_modules/sharp');
const {processImage}=require('../server/src/review-photo-storage');
const fs=require('node:fs/promises');
async function run(){
  const input=await sharp({create:{width:1800,height:900,channels:3,background:'#d79352'}}).jpeg().withMetadata({orientation:6}).toBuffer();
  const result=await processImage(input),meta=await sharp(result.main).metadata(),thumb=await sharp(result.thumb).metadata();
  assert.equal(meta.width,600);assert.equal(meta.height,1200);assert.equal(meta.format,'webp');
  assert.equal(meta.exif,undefined);assert.equal(meta.orientation,undefined);assert.equal(thumb.height,320);
  assert.ok(result.bytes<=2*1024*1024);
  for(const invalid of [Buffer.from('<svg onload="alert(1)"></svg>'),Buffer.from('GIF89a'),Buffer.from([255,216,255,0,1])]){
    await assert.rejects(processImage(invalid),error=>error.statusCode===422);
  }
  const oversized=Buffer.from(input),sof=oversized.indexOf(Buffer.from([0xff,0xc0]));
  assert.ok(sof>=0);oversized.writeUInt16BE(10000,sof+5);oversized.writeUInt16BE(10000,sof+7);
  await assert.rejects(processImage(oversized),error=>error.statusCode===422);
  console.log('REVIEW_PHOTO_IMAGES_OK '+JSON.stringify({inputBytes:input.length,storedBytes:result.bytes,width:meta.width,height:meta.height,peakRssMiB:Math.ceil(result.peakRssKiB/1024)}));
  if(process.argv[2]){
    const heic=await fs.readFile(process.argv[2]),started=Date.now(),converted=await processImage(heic),heicMeta=await sharp(converted.main).metadata();
    assert.equal(heicMeta.format,'webp');assert.ok(heicMeta.width<=1200&&heicMeta.height<=1200);assert.equal(heicMeta.exif,undefined);
    console.log('REVIEW_PHOTO_HEIC_OK '+JSON.stringify({inputBytes:heic.length,storedBytes:converted.bytes,width:heicMeta.width,height:heicMeta.height,elapsedMs:Date.now()-started,peakRssMiB:Math.ceil(converted.peakRssKiB/1024)}));
  }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
