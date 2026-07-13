import fs from 'node:fs';
import path from 'node:path';

export function readPlatformSource(platformDir, file) {
  const source = fs.readFileSync(path.join(platformDir, file), 'utf8');
  if (!file.endsWith('.html')) return source;

  return source.replace(/<script[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi, (tag, src) => {
    if (!src.includes('20260713-csp-external-scripts')) return tag;
    const scriptName = src.split('?')[0];
    const script = fs.readFileSync(path.join(platformDir, scriptName), 'utf8');
    return `${tag}\n${script}`;
  });
}
