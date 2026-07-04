import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const platform = path.resolve(here, '../../platform');
const read = file => fs.readFileSync(path.join(platform, file), 'utf8');
const indexHtml = read('index.html');

function guestTourScript() {
  const start = indexHtml.indexOf("const GUEST_TOUR_COMPLETED_KEY = 'smartplate_guest_tour_completed_v1';");
  const end = indexHtml.indexOf('// Skeleton в #recommended-block', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return indexHtml.slice(start, end);
}

function createHarness({ completed = false, forced = false, reducedMotion = false, storageThrows = false } = {}) {
  const classes = new Set();
  const focusCalls = [];
  const replaceCalls = [];
  const scrollCalls = [];
  const listeners = {};
  const values = new Map(completed ? [['smartplate_guest_tour_completed_v1', '1']] : []);
  const location = {
    href: `https://app.voronova.online/${forced ? '?guestTour=1' : ''}`,
    search: forced ? '?guestTour=1' : '',
  };
  const elements = {
    'guest-onboarding': {
      getBoundingClientRect() { return { top: 24 }; },
    },
    'guest-onboarding-title': {
      focus(options) { focusCalls.push({ id: 'guest-onboarding-title', options }); },
    },
    'guest-tour-trigger': {
      focus(options) { focusCalls.push({ id: 'guest-tour-trigger', options }); },
    },
  };
  const context = vm.createContext({
    URL,
    URLSearchParams,
    location,
    localStorage: {
      getItem(key) {
        if (storageThrows) throw new Error('storage unavailable');
        return values.get(key) || null;
      },
      setItem(key, value) {
        if (storageThrows) throw new Error('storage unavailable');
        values.set(key, String(value));
      },
    },
    history: {
      state: { preserved: true },
      replaceState(state, _title, next) {
        replaceCalls.push({ state, next });
        const nextUrl = new URL(next, location.href);
        location.href = nextUrl.href;
        location.search = nextUrl.search;
      },
    },
    document: {
      documentElement: {
        classList: {
          add(...names) { names.forEach(name => classes.add(name)); },
          remove(...names) { names.forEach(name => classes.delete(name)); },
        },
      },
      body: {
        classList: {
          add(...names) { names.forEach(name => classes.add(name)); },
          remove(...names) { names.forEach(name => classes.delete(name)); },
          toggle(name, force) {
            if (force) classes.add(name);
            else classes.delete(name);
            return force;
          },
          contains(name) { return classes.has(name); },
        },
      },
      getElementById(id) { return elements[id] || null; },
      querySelector(selector) {
        if (selector === '.sp-header') return { getBoundingClientRect() { return { height: 96 }; } };
        return null;
      },
    },
    window: {
      scrollY: 500,
      addEventListener(type, listener) { listeners[type] = listener; },
      matchMedia() { return { matches: reducedMotion }; },
      scrollTo(options) { scrollCalls.push(options); },
    },
    requestAnimationFrame(callback) { callback(); },
  });

  vm.runInContext(guestTourScript(), context, { filename: 'index.html:guest-tour' });
  return { classes, context, focusCalls, listeners, location, replaceCalls, scrollCalls, values };
}

describe('SmartPlate feedback plan 6 contracts', () => {
  it('shows onboarding on the first visit before async content loading', () => {
    const harness = createHarness();

    expect(harness.classes.has('sp-guest-onboarding-active')).toBe(true);
    expect(harness.scrollCalls).toHaveLength(0);
    expect(indexHtml).toContain('function primeGuestTourVisibility()');
    expect(indexHtml.indexOf('primeGuestTourVisibility')).toBeLessThan(indexHtml.indexOf('href="style-v4.css'));
    expect(indexHtml).toContain("document.documentElement.classList.add('sp-guest-tour-preview')");
    expect(indexHtml).toContain("document.documentElement.classList.remove('sp-guest-tour-preview')");
    expect(indexHtml.indexOf('updateGuestOnboardingVisibility();')).toBeLessThan(indexHtml.indexOf('loadContent().then'));
    expect(indexHtml).toMatch(/\.sp-guest-onboarding\s*\{[\s\S]*?display:\s*none/);
    expect(indexHtml).toMatch(/\.sp-guest-onboarding-active \.sp-guest-onboarding\s*\{\s*display:\s*block/);
  });

  it('collapses, persists completion, cleans the URL, and returns focus without scrolling', () => {
    const harness = createHarness({ forced: true });

    vm.runInContext('completeGuestTour(); updateGuestOnboardingVisibility();', harness.context);

    expect(harness.values.get('smartplate_guest_tour_completed_v1')).toBe('1');
    expect(harness.classes.has('sp-guest-onboarding-active')).toBe(false);
    expect(harness.location.search).toBe('');
    expect(harness.replaceCalls).toHaveLength(1);
    expect(harness.replaceCalls[0].state).toEqual({ preserved: true });
    expect(harness.focusCalls.at(-1)).toEqual({ id: 'guest-tour-trigger', options: { preventScroll: true } });
    expect(harness.scrollCalls).toHaveLength(0);
  });

  it('does not restore onboarding on reload after completion', () => {
    const harness = createHarness({ completed: true });
    expect(harness.classes.has('sp-guest-onboarding-active')).toBe(false);
  });

  it('reopens the same onboarding without resetting stored data', () => {
    const harness = createHarness({ completed: true });

    vm.runInContext('openGuestTour();', harness.context);

    expect(harness.classes.has('sp-guest-onboarding-active')).toBe(true);
    expect(harness.values.get('smartplate_guest_tour_completed_v1')).toBe('1');
    expect(harness.location.search).toBe('?guestTour=1');
    expect(harness.replaceCalls).toHaveLength(1);
    expect(harness.focusCalls.at(-1)).toEqual({ id: 'guest-onboarding-title', options: { preventScroll: true } });
    expect(harness.scrollCalls).toEqual([{ top: 416, behavior: 'smooth' }]);
    expect(indexHtml.match(/id="guest-onboarding"/g)).toHaveLength(1);
  });

  it('opens without animation when reduced motion is requested', () => {
    const harness = createHarness({ completed: true, reducedMotion: true });

    vm.runInContext('openGuestTour();', harness.context);

    expect(harness.scrollCalls).toEqual([{ top: 416, behavior: 'auto' }]);
  });

  it('supports a direct guestTour URL and back/forward URL state without extra history entries', () => {
    const harness = createHarness({ completed: true, forced: true });
    expect(harness.classes.has('sp-guest-onboarding-active')).toBe(true);

    harness.location.href = 'https://app.voronova.online/';
    harness.location.search = '';
    harness.listeners.popstate();
    expect(harness.classes.has('sp-guest-onboarding-active')).toBe(false);

    harness.location.href = 'https://app.voronova.online/?guestTour=1';
    harness.location.search = '?guestTour=1';
    harness.listeners.popstate();
    expect(harness.classes.has('sp-guest-onboarding-active')).toBe(true);
    expect(harness.replaceCalls).toHaveLength(0);
  });

  it('keeps the page usable when localStorage is unavailable', () => {
    const harness = createHarness({ storageThrows: true });
    expect(harness.classes.has('sp-guest-onboarding-active')).toBe(true);

    expect(() => vm.runInContext('completeGuestTour(); updateGuestOnboardingVisibility();', harness.context)).not.toThrow();
    expect(harness.classes.has('sp-guest-onboarding-active')).toBe(false);
  });

  it('keeps the recipe guestHelp route and access logic unchanged', () => {
    const recipe = read('recipe.html');
    const tourCode = guestTourScript();

    expect(indexHtml).toContain('recipe.html?id=cutlets-chickpea-mushroom-dill&guestHelp=1&guestTour=1');
    expect(recipe).toContain("guestHelpParams.get('guestHelp') === '1'");
    expect(recipe).toContain("guestHelpParams.get('guestTour') === '1'");
    expect(recipe).toContain("localStorage.getItem('smartplate_guest_tour_completed_v1') === '1'");
    expect(recipe).toContain('href="index.html?guestTour=1"');
    expect(recipe).toContain('} else if (!Auth.canViewRecipe(r)) {');
    expect(tourCode).not.toContain('Auth.');
  });

  it('provides the approved copy and visible keyboard focus locally on the homepage', () => {
    expect(indexHtml).toContain('onclick="completeGuestTour()">Свернуть</button>');
    expect(indexHtml).toContain('id="guest-tour-trigger" type="button" onclick="openGuestTour()">Как это работает?</button>');
    expect(indexHtml).toContain('id="guest-onboarding-title" tabindex="-1"');
    expect(indexHtml).toContain('.sp-guest-tour-reopen:focus-visible');
    expect(indexHtml).toContain('.sp-guest-title:focus');
    expect(indexHtml).not.toContain('onclick="completeGuestTour()">Больше не показывать</button>');
  });
});
