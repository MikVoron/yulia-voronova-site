'use strict';
const sharp = require('sharp');
sharp.cache(false);
sharp.concurrency(1);

function kind(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png';
  if (buffer.toString('ascii',0,4) === 'RIFF' && buffer.toString('ascii',8,12) === 'WEBP') return 'webp';
  if (buffer.toString('ascii',4,8) === 'ftyp' && /^(heic|heix|hevc|hevx|mif1|msf1)$/.test(buffer.toString('ascii',8,12))) return 'heic';
  throw new Error('Выберите фотографию JPEG, PNG, WebP или HEIC.');
}
async function convert(input, maxPixels) {
  const format = kind(input);
  let source = input, options = { limitInputPixels: maxPixels, failOn: 'warning' };
  if (format === 'heic') {
    // Decode in this short-lived process: HEIC support does not depend on the
    // host libvips build and cannot block the API event loop.
    const decode = require('heic-decode');
    const images = await decode.all({ buffer: input });
    try {
      const first = images[0];
      if (!first || !first.width || !first.height || first.width * first.height > maxPixels) throw new Error('Фотография слишком большая. Выберите снимок до 50 мегапикселей.');
      const decoded = await first.decode();
      source = Buffer.from(decoded.data);
      options = { raw: { width: decoded.width, height: decoded.height, channels: 4 }, limitInputPixels: maxPixels };
    } finally { images.dispose(); }
  }
  const meta = await sharp(source, options).metadata();
  if (!meta.width || !meta.height || meta.width * meta.height > maxPixels || (meta.pages || 1) > 1) throw new Error('Выберите обычную фотографию до 50 мегапикселей, без анимации.');
  const { data: main, info } = await sharp(source, options).rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78, effort: 3 }).toBuffer({ resolveWithObject: true });
  const thumb = await sharp(main).resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true }).webp({ quality: 72, effort: 2 }).toBuffer();
  if (main.length + thumb.length > 2 * 1024 * 1024) throw new Error('Не удалось уменьшить фотографию. Попробуйте другой снимок.');
  // sharp strips EXIF/GPS/ICC metadata unless explicitly requested.
  return { main, thumb, width: info.width, height: info.height, bytes: main.length + thumb.length };
}
if (require.main === module) process.once('message', async ({ input, maxPixels }) => {
  try { const result=await convert(input,maxPixels); process.send({ ...result,peakRssKiB:process.resourceUsage().maxRSS }); }
  catch (error) { process.send({ error: /^(Выберите|Фотография|Не удалось)/.test(error.message) ? error.message : 'Не удалось прочитать фотографию. Попробуйте другой снимок.' }); }
});
module.exports = { kind, convert };
