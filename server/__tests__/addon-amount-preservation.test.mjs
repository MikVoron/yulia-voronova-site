import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

describe('sidebar add-on amount preservation', () => {
  it('keeps the amount as an editable recipe-editor field', () => {
    const editor = read('platform/recipe-editor.js');
    expect(editor).toContain("addAddItem(type, it.name || '', it.amount || ''");
    expect(editor).toContain('data-field="amount"');
    expect(editor).toContain('if (amount) obj.amount = amount;');
  });

  it('does not let a stale editor erase a stored amount on save', () => {
    const route = read('server/src/routes/content.js');
    expect(route).toContain('function preserveAddonAmounts(incoming, stored)');
    expect(route).toContain("['add_protein', 'add_fat', 'add_carbs', 'add_fiber'].forEach(field => {");
    expect(route).toContain('r[field] = preserveAddonAmounts(r[field], beforeResult.rows[0][field]);');
  });
});
