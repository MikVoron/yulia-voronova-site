'use strict';
const path=require('node:path');
const {createRequire}=require('node:module');
const supported=new Set(['sharp','heic-decode']);
function loadCodec(name){
  if(!supported.has(name))throw new Error('Unsupported photo codec');
  const directory=process.env.REVIEW_PHOTO_CODECS_DIR;
  if(!directory)return require(name);
  if(!path.isAbsolute(directory))throw new Error('REVIEW_PHOTO_CODECS_DIR must be absolute');
  // Production may install just these codecs in an immutable versioned component
  // without replacing the existing API's dependency tree or PM2 launch settings.
  return createRequire(path.join(directory,'package.json'))(path.join(directory,'node_modules',name));
}
module.exports={loadCodec};
