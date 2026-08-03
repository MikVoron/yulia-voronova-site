import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const categoryPage = fs.readFileSync(path.join(root, 'platform', 'category-page.js'), 'utf8');
const recipePage = fs.readFileSync(path.join(root, 'platform', 'recipe-page.js'), 'utf8');

describe('recipe review reply UI', () => {
  it('waits for the deleted review to disappear before offering a new one', () => {
    expect(categoryPage).toContain('await loadCommentsFromAPI(commentsRecipeId);');
    expect(categoryPage).toContain('Отзыв удалён. Можно оставить новый.');
    expect(recipePage).toContain('await loadReviews();');
    expect(recipePage).toContain('let _reviewFormMarkup = null;');
    expect(recipePage).toContain('formWrap.innerHTML = _reviewFormMarkup;');
  });

  it('shows public author replies and exposes the admin-only reply action', () => {
    expect(categoryPage).toContain('Ответ Юлии');
    expect(categoryPage).toContain('data-category-action="submit-review-reply"');
    expect(categoryPage).toContain("Auth.api('/admin/reviews/' + id + '/reply'");
    expect(recipePage).toContain('Ответ Юлии');
    expect(recipePage).toContain('data-recipe-action="submit-review-reply"');
    expect(recipePage).toContain("Auth.api('/admin/reviews/' + id + '/reply'");
  });
});
