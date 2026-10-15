import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { REVIEW_AVATAR_PACK, reviewAvatar, assignReviewAvatar } = require('../src/review-avatars');

describe('persistent food avatars', () => {
  it('cycles through all 15 approved icons, beginning with avocado', () => {
    expect(REVIEW_AVATAR_PACK).toHaveLength(15);
    expect(new Set(REVIEW_AVATAR_PACK).size).toBe(15);
    expect(REVIEW_AVATAR_PACK).not.toContain('cucumber');
    for (let position = 0; position < 31; position++) {
      expect(reviewAvatar({ display_name: null, review_avatar_position: String(position) }))
        .toBe('https://app.voronova.online/images/review-avatars/' + REVIEW_AVATAR_PACK[position % 15] + '.svg');
    }
    for (const icon of REVIEW_AVATAR_PACK) {
      const svg = fs.readFileSync(new URL('../../platform/images/review-avatars/' + icon + '.svg', import.meta.url), 'utf8');
      expect(svg).toContain('viewBox="0 0 48 48"');
    }
  });

  it('a newly uploaded personal avatar overrides the food icon without changing assignment', () => {
    const row = { display_name: null, avatar: null, review_avatar_position: '0' };
    expect(reviewAvatar(row)).toMatch(/avocado\.svg$/);
    row.avatar = 'data:image/jpeg;base64,user-photo';
    expect(reviewAvatar(row)).toBe(row.avatar);
    row.avatar = null;
    expect(reviewAvatar(row)).toMatch(/avocado\.svg$/);
  });

  it('preserves initials for named users, handles empty names and rejects invalid positions', () => {
    expect(reviewAvatar({ display_name: 'Анна', review_avatar_position: '0' })).toBeNull();
    expect(reviewAvatar({ display_name: '  ', review_avatar_position: '1' })).toMatch(/spinach\.svg$/);
    for (const position of [null, undefined, '-1', '1.5', 'bad']) {
      expect(reviewAvatar({ review_avatar_position: position })).toBeNull();
    }
    expect(reviewAvatar({ review_avatar_position: '9007199254740993' })).toMatch(/\.svg$/);
  });

  it('reuses one user assignment for new reviews rather than advancing the counter', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ display_name: null }] })
      .mockResolvedValueOnce({ rows: [{ position: '3' }] });
    await assignReviewAvatar({ query }, 'u-1');
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('FOR NO KEY UPDATE');
    expect(query.mock.calls[1][1]).toEqual(['u-1']);
  });

  it('reserves the next position for a new anonymous reviewer inside the caller transaction', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ display_name: '' }] })
      .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ position: '7' }] })
      .mockResolvedValueOnce({ rows: [] });
    await assignReviewAvatar({ query }, 'u-2');
    expect(query.mock.calls[2][0]).toContain('UPDATE review_avatar_counter');
    expect(query.mock.calls[3][1]).toEqual(['u-2', '7']);
  });

  it('named reviewers do not consume an anonymous avatar', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ display_name: 'Мишель' }] });
    await assignReviewAvatar({ query }, 'u-3');
    expect(query).toHaveBeenCalledTimes(1);
  });
});
