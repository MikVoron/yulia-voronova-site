import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  buildRecipeSnapshot,
  changedRecipeFields,
  recordRecipeRevision,
} = require('../src/recipe-history');

describe('recipe history', () => {
  it('stores canonical categories and ignores updated_at as a business change', () => {
    const before = buildRecipeSnapshot(
      { id: 'grechotto', ingredients: [{ name: 'сок', swap: 'водка' }], updated_at: new Date(0) },
      ['mains', 'dinner']
    );
    const after = buildRecipeSnapshot(
      { id: 'grechotto', ingredients: [{ name: 'сок' }], updated_at: new Date(1) },
      ['dinner', 'mains']
    );

    expect(before.categories).toEqual(['dinner', 'mains']);
    expect(changedRecipeFields(before, after)).toEqual(['ingredients']);
  });

  it('requires the caller transaction client for the revision insert', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    await recordRecipeRevision(client, {
      recipeId: 'grechotto', action: 'update', beforeData: { name: 'A' }, afterData: { name: 'B' },
      changedFields: ['name'], adminUserId: 'admin-id', requestId: 'req-1'
    });

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO recipe_revisions'),
      expect.arrayContaining(['grechotto', 'update', '{"name":"A"}', '{"name":"B"}', ['name'], 'admin-id', 'req-1'])
    );
  });
});
