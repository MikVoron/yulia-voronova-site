import {it,expect,afterEach} from 'vitest';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const require=createRequire(import.meta.url),{loadCodec}=require('../src/review-photo-codecs');
const previous=process.env.REVIEW_PHOTO_CODECS_DIR;
let temporary;
afterEach(async()=>{
  if(previous===undefined)delete process.env.REVIEW_PHOTO_CODECS_DIR;else process.env.REVIEW_PHOTO_CODECS_DIR=previous;
  if(temporary){const resolved=path.resolve(temporary);if(!resolved.startsWith(path.join(path.resolve(os.tmpdir()),'smartplate-photo-codec-')))throw new Error('Unsafe cleanup');await fs.rm(resolved,{recursive:true,force:true});temporary=null;}
});
it('uses only the configured codec component and never falls back to the global API dependency tree',async()=>{
  temporary=await fs.mkdtemp(path.join(os.tmpdir(),'smartplate-photo-codec-'));
  await fs.mkdir(path.join(temporary,'node_modules/sharp'),{recursive:true});
  await fs.writeFile(path.join(temporary,'package.json'),'{}');
  await fs.writeFile(path.join(temporary,'node_modules/sharp/index.js'),'module.exports={isolatedFixture:true};');
  process.env.REVIEW_PHOTO_CODECS_DIR=temporary;
  expect(loadCodec('sharp')).toEqual({isolatedFixture:true});
  expect(()=>loadCodec('heic-decode')).toThrow();
  expect(()=>loadCodec('node:fs')).toThrow('Unsupported photo codec');
});
it('retains the normal development installation and rejects relative production paths',()=>{
  delete process.env.REVIEW_PHOTO_CODECS_DIR;expect(loadCodec('sharp').versions.sharp).toBe('0.35.5');
  process.env.REVIEW_PHOTO_CODECS_DIR='relative';expect(()=>loadCodec('sharp')).toThrow('must be absolute');
});
