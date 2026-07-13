import fs from 'node:fs';
import path from 'node:path';

export function readPlatformSource(platformDir, file) {
  const source = fs.readFileSync(path.join(platformDir, file), 'utf8');
  if (!file.endsWith('.html')) return source;

  const externalizedInlineScripts = new Set([
    'auth-callback.js',
    'category-page.js',
    'index-bootstrap.js',
    'index-page.js',
    'ingredient-page.js',
    'login.js',
    'popup-preview.js',
    'recipe-editor-access-level.js',
    'recipe-editor.js',
    'recipe-page.js'
  ]);

  return source.replace(/<script[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi, (tag, src) => {
    const scriptName = src.split('?')[0];
    if (!externalizedInlineScripts.has(scriptName)) return tag;
    const script = fs.readFileSync(path.join(platformDir, scriptName), 'utf8');
    return `${tag}\n${script}`;
  });
}
