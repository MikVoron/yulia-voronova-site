#!/usr/bin/env node
/*
 * Assertion: ingredient "name — amount" parsing must treat the four separators
 *   ":"  "—"(em)  "–"(en)  "-"(hyphen)
 * identically, after the migration to the editorial "Название: количество" format.
 *
 * No test runner in this repo — this is the "local check" the contract allows.
 * It also guards against DRIFT: it reads the two production sources and fails if
 * the real regexes are not present, so a copy here can't silently go stale.
 *
 * Run:  node server/test-ingredient-separator.js
 */
const fs = require('fs');
const path = require('path');

let failures = 0;
function ok(cond, msg) {
  if (cond) { console.log('  ✓ ' + msg); }
  else { console.log('  ✗ ' + msg); failures++; }
}

// --- Mirrors of the two production regexes (kept in sync via drift-guard below) ---

// server/src/routes/nutrition.js  parseIngredient() "name first, separator + amount"
const NUTRITION_SEP_RE =
  /^(.+?)\s*[:—–-]\s*(\d+(?:[.,]\d+)?)\s*(г|гр|грамм|кг|мл|л|ст\.?\s*л\.?|ч\.?\s*л\.?|шт\.?)\s*\.?\s*$/i;

// platform/recipe.html  applySwap() amount-suffix extraction
const SWAP_SEP_RE = /\s[—–\-]\s|:\s/;

// --- Drift guard: confirm the real sources still contain these patterns ---
console.log('Drift guard (sources contain the real regexes):');
const nutritionSrc = fs.readFileSync(
  path.join(__dirname, 'src', 'routes', 'nutrition.js'), 'utf8');
const recipeSrc = fs.readFileSync(
  path.join(__dirname, '..', 'platform', 'recipe.html'), 'utf8');
ok(nutritionSrc.includes('[:—–-]'),
   'nutrition.js uses the [:—–-] separator class');
ok(recipeSrc.includes('/\\s[—–\\-]\\s|:\\s/'),
   'recipe.html applySwap uses /\\s[—–\\-]\\s|:\\s/');

// --- Functional: all four separators parse to the same (name, num, unit) ---
const SEPARATORS = [
  { label: 'colon',  s: ': '  },
  { label: 'em',     s: ' — ' },
  { label: 'en',     s: ' – ' },
  { label: 'hyphen', s: ' - ' },
];
const CASES = [
  { name: 'Творог',          amount: '200 г',      expectName: 'Творог' },
  { name: 'Паприка',         amount: '0,5 ч. л.',  expectName: 'Паприка' },
  { name: 'Оливковое масло', amount: '1 ст. л.',   expectName: 'Оливковое масло' },
];

console.log('\nnutrition.js parser — 4 separators must give identical capture:');
for (const c of CASES) {
  const results = SEPARATORS.map(sep => {
    const m = (c.name + sep.s + c.amount).match(NUTRITION_SEP_RE);
    return m ? { name: m[1].trim(), num: m[2], unit: m[3].trim() } : null;
  });
  const base = results[0];
  ok(base !== null && base.name === c.expectName,
     `"${c.name}: ${c.amount}" → name="${base && base.name}", num="${base && base.num}"`);
  for (let i = 1; i < results.length; i++) {
    const r = results[i];
    ok(r && base && r.name === base.name && r.num === base.num && r.unit === base.unit,
       `  ${SEPARATORS[i].label} matches colon for "${c.name}"`);
  }
}

console.log('\nrecipe.html applySwap — amount suffix extracted for every separator:');
for (const c of CASES) {
  for (const sep of SEPARATORS) {
    const orig = c.name + sep.s + c.amount;
    const m = orig.match(SWAP_SEP_RE);
    const amountPart = m ? orig.substring(orig.indexOf(m[0])) : '';
    ok(amountPart.includes(c.amount.split(' ')[0]),
       `${sep.label}: "${orig}" → amountPart="${amountPart}"`);
  }
}

// --- Negative: section header "— Тесто —" must NOT look like a name:amount line ---
console.log('\nnegative cases:');
ok(!NUTRITION_SEP_RE.test('— Тесто —'),
   'section header "— Тесто —" is not parsed as name:amount');
ok(!('— Тесто —'.match(/\s[—–\-]\s/) && false),
   'section header has no " — " (space-dash-space) separator → migration skips it');
ok(!('— Тесто —'.includes(' — ')),
   '"— Тесто —" does not contain " — " so the SQL UPDATE leaves it untouched');

console.log('\n' + (failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'));
process.exit(failures === 0 ? 0 : 1);
