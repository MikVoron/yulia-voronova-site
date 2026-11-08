import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../platform/data-v2.js', import.meta.url), 'utf8');
const updatesSource = source.slice(source.indexOf('const ContentUpdates ='), source.indexOf('\ndocument.addEventListener', source.indexOf('const ContentUpdates =')));
const item = id => ({ id, type: 'recipe', recipe_id: 'recipe-' + id });
function client({ items = [1, 2, 3, 4, 5].map(item), likes = [], failWrite = false, token = 'token' } = {}) {
    let unread = items.slice();
    let unreadLikes = likes.slice();
    const button = { setAttribute: vi.fn(), focus: vi.fn() };
    const error = { hidden: true, textContent: '' };
    const panel = { classList: { remove: vi.fn() }, querySelectorAll: () => [], querySelector: () => error };
    const wrap = { hidden: false };
    const badge = { textContent: '' };
    const nodes = { 'sp-updates': wrap, 'sp-updates-btn': button, 'sp-updates-panel': panel, 'sp-updates-count': badge, 'user-badge': button };
    const api = vi.fn(async (path, options) => {
        const isLike = path.startsWith('/content/review-like-notifications');
        if (!options) return { ok: true, json: async () => isLike ? { items: unreadLikes.slice(), hasMore: false } : unread.slice() };
        if (failWrite) return { ok: false };
        const ids = path.endsWith('/read') && options.body ? options.body.ids : [Number(path.split('/')[3])];
        if (isLike) unreadLikes = unreadLikes.filter(row => !ids.includes(row.id));
        else unread = unread.filter(row => !ids.includes(row.id));
        return { ok: true, json: async () => ({ ok: true }) };
    });
    const context = vm.createContext({ Auth: { getToken: () => token, api }, document: { getElementById: id => nodes[id] } });
    vm.runInContext(updatesSource + '\nglobalThis.updates = ContentUpdates;', context);
    const updates = context.updates;
    updates._ensureUi = () => wrap;
    updates._render = vi.fn();
    return { updates, api, wrap, badge, error, unread: () => unread, unreadLikes: () => unreadLikes };
}

describe('content update read state', () => {
    it('keeps likes with matching news IDs unread when a recipe opens, and batches both lists on close', async () => {
        const c = client({ likes: [{ id: 1, recipe_id: 'recipe-1', review_id: 17 }] });
        await c.updates.recipeOpened('recipe-1');
        expect(c.badge.textContent).toBe('5');
        expect(c.unreadLikes()).toHaveLength(1);
        expect(c.unread()).toHaveLength(4);
        await c.updates.closeAndRead();
        expect(c.unread()).toHaveLength(0);expect(c.unreadLikes()).toHaveLength(0);
        expect(c.wrap.hidden).toBe(true);
        expect(c.api).toHaveBeenCalledWith('/content/review-like-notifications/read', { method: 'POST', body: { ids: [1] } });
    });
    it('reading one like does not acknowledge news with the same numeric ID', async () => {
        const c = client({ likes: [{ id: 1, review_id: 17 }] });await c.updates.refresh();
        await c.updates.markRead(1, 'review_like');
        expect(c.badge.textContent).toBe('5');expect(c.unread()).toHaveLength(5);expect(c.unreadLikes()).toHaveLength(0);
    });
    it('counts the complete list beyond the former five item limit', async () => {
        const c = client({ items: Array.from({ length: 24 }, (_, i) => item(i + 1)) });
        await c.updates.refresh();
        expect(c.api).toHaveBeenCalledWith('/content/updates?all=1');
        expect(c.badge.textContent).toBe('24');
        expect(c.updates._items).toHaveLength(24);
    });
    it('opening one recipe changes five to four, including a direct recipe visit', async () => {
        const c = client();
        await c.updates.recipeOpened('recipe-1');
        expect(c.badge.textContent).toBe('4');
        expect(c.unread().map(row => row.id)).toEqual([2, 3, 4, 5]);
        await c.updates.refresh();
        expect(c.badge.textContent).toBe('4');
    });
    it('handles opening a recipe during an in-flight list request', async () => {
        const c = client();
        await Promise.all([c.updates.refresh(), c.updates.recipeOpened('recipe-1')]);
        expect(c.badge.textContent).toBe('4');
        expect(c.api.mock.calls.filter(([, options]) => options)).toHaveLength(1);
    });
    it('marks all announcements of the opened recipe, leaving others unread', async () => {
        const c = client({ items: [item(1), { ...item(2), recipe_id: 'recipe-1' }, item(3)] });
        await c.updates.recipeOpened('recipe-1');
        expect(c.unread().map(row => row.id)).toEqual([3]);
    });
    it('closing acknowledges only the visible snapshot, keeping newly published news', async () => {
        const c = client();
        await c.updates.refresh();
        // Simulate a new announcement arriving on the server after the list opened.
        c.unread().push(item(6));
        await c.updates.closeAndRead();
        expect(c.wrap.hidden).toBe(true);
        expect(c.unread().map(row => row.id)).toEqual([6]);
        await c.updates.refresh();
        expect(c.badge.textContent).toBe('1');
    });
    it('dismissal alone and guests do not acknowledge recipes', async () => {
        const c = client();
        await c.updates.refresh(); c.updates._close();
        expect(c.unread()).toHaveLength(5);
        const guest = client({ token: null });
        await guest.updates.refresh(); await guest.updates.recipeOpened('recipe-1');
        expect(guest.api).not.toHaveBeenCalled();
    });
    it('keeps the badge and reports a failed close without pretending to save', async () => {
        const c = client({ failWrite: true });
        await c.updates.refresh(); await c.updates.closeAndRead();
        expect(c.wrap.hidden).toBe(false);
        expect(c.badge.textContent).toBe('5');
        expect(c.error.hidden).toBe(false);
        expect(c.unread()).toHaveLength(5);
    });
    it('removes a clicked announcement immediately and does not restore stale responses', async () => {
        const c = client(); await c.updates.refresh();
        await c.updates.markRead(1);
        c.updates._apply([1, 2, 3, 4, 5].map(item));
        expect(c.badge.textContent).toBe('4');
    });
});
