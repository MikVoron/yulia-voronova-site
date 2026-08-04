import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('optional protein add-on for soups', () => {
  it('marks the soups protein rule optional without replacing its existing configuration', () => {
    const migration = read('server/migrate-soup-protein-optional-2026-08-04.sql');
    expect(migration).toContain("WHERE id = 'soups'");
    expect(migration).toContain("COALESCE(auto_addons->'protein', '{}'::jsonb) || '{\"optional\": true}'::jsonb");
  });

  it('shows optional protein but excludes it from balance gating', () => {
    const recipePage = read('platform/recipe-page.js');
    expect(recipePage).toContain('_balRequired = _balCats.filter(c => !c.optional);');
    expect(recipePage).toContain('title = optional ? (group.label || meta.shortLabel || meta.title) : meta.title;');
    expect(recipePage).toContain("cat.optional ? 'Добавьте, если хотите больше сытости.'");
    expect(recipePage).toContain('const hasAdds = _balRequired.length > 0;');
  });

  it('keeps the category setting editable in the admin', () => {
    expect(read('platform/admin.html')).toContain('id="cat-aa-protein-optional"');
    expect(read('platform/admin.js')).toContain('body.auto_addons[s.key].optional = true;');
  });
});
