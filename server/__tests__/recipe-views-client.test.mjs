import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';

const source = readFileSync(new URL('../../platform/recipe-views.js', import.meta.url), 'utf8');
function browser({ storage = new Map(), user = null, token = null, visible = true, unavailable = false, fail = false } = {}) {
    const listeners = new Map();
    const api = vi.fn(() => fail ? Promise.reject(new Error('offline')) : Promise.resolve());
    const window = { crypto: { randomUUID }, localStorage: {
        getItem: key => { if (unavailable) throw new Error('blocked'); return storage.get(key); },
        setItem: (key, value) => storage.set(key, value)
    } };
    const document = {
        visibilityState: visible ? 'visible' : 'hidden',
        addEventListener: (key, fn) => listeners.set(key, fn),
        removeEventListener: key => listeners.delete(key)
    };
    vm.runInNewContext(source, { window, document, Auth: { api, getUser: () => user, getToken: () => token } });
    return { track: window.SmartPlateRecipeViews.track, api, storage, document, listeners };
}
const recipe = { id: 'recipe-1' };

describe('recipe view client', () => {
    it('counts repeated hook calls once per page, and reloads as separate openings with the same guest ID', () => {
        const first = browser(); first.track(recipe, 'full'); first.track(recipe, 'full');
        expect(first.api).toHaveBeenCalledTimes(1);
        const second = browser({ storage: first.storage }); second.track(recipe, 'full');
        const a = first.api.mock.calls[0][1].body;
        const b = second.api.mock.calls[0][1].body;
        expect(a.visitor_id).toBe(b.visitor_id);
        expect(a.event_id).not.toBe(b.event_id);
        expect(a.view_mode).toBe('full');
    });
    it('waits for a visible tab and sends exactly once after visibility changes', () => {
        const b = browser({ visible: false }); b.track(recipe, 'preview');
        expect(b.api).not.toHaveBeenCalled();
        b.listeners.get('visibilitychange')();
        expect(b.api).not.toHaveBeenCalled();
        b.document.visibilityState = 'visible'; b.listeners.get('visibilitychange')();
        expect(b.api).toHaveBeenCalledTimes(1);
        expect(b.listeners.size).toBe(0);
        expect(b.api.mock.calls[0][1].body.view_mode).toBe('preview');
    });
    it('skips admin, nonexistent recipes and ingredient sublists', () => {
        const admin = browser({ user: { role: 'admin' } }); admin.track(recipe, 'full');
        const guest = browser(); guest.track(null, 'full'); guest.track({ ...recipe, isSublist: true }, 'full');
        expect(admin.api).not.toHaveBeenCalled(); expect(guest.api).not.toHaveBeenCalled();
    });
    it('does not inflate anonymous uniques when storage is unavailable', () => {
        const b = browser({ unavailable: true }); expect(() => b.track(recipe, 'full')).not.toThrow();
        expect(b.api).not.toHaveBeenCalled();
    });
    it('tracks an account even when guest storage is unavailable', () => {
        const b = browser({ unavailable: true, user: { role: 'user' }, token: 'valid' }); b.track(recipe, 'full');
        expect(b.api).toHaveBeenCalledTimes(1);
        expect(b.api.mock.calls[0][1].body).not.toHaveProperty('visitor_id');
    });
    it('does not interrupt a recipe on network errors', async () => {
        const b = browser({ fail: true }); expect(() => b.track(recipe, 'full')).not.toThrow();
        await Promise.resolve();
    });
});
