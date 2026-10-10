// Checks a UI string catalog (src/i18n/locales/<lang>.json) against the English reference: every key present and
// known, placeholders kept, plural objects with the categories of that language, nothing empty. Prints how many
// values are still identical to English (cognates are fine; a large number means untranslated keys).
//   node scripts/i18n-ui-check.mjs <lang> [more langs…]
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const en = read('src/i18n/locales/en.json');

// the CLDR categories src/i18n/plural.ts can produce for each language; 'other' is always required
const CATEGORIES = {
  de: ['one', 'other'],
  fr: ['one', 'other'],
  es: ['one', 'other'],
  it: ['one', 'other'],
  pt: ['one', 'other'],
  tr: ['one', 'other'],
  pl: ['one', 'few', 'many', 'other'],
  ru: ['one', 'few', 'many', 'other'],
  uk: ['one', 'few', 'many', 'other'],
  ar: ['zero', 'one', 'two', 'few', 'many', 'other'],
  zh: ['other'],
};
// English values that are German on purpose (feedback words, labels of German things); they must stay as they are
const KEEP = new Set(['common.german', 'drill.nearlyRight', 'drill.resultGood', 'drill.resultKeepGoing', 'drill.right', 'grammar.inGerman']);

const PLACEHOLDER = /\{(\w+)\}/g;
const placeholders = (s) => [...new Set([...s.matchAll(PLACEHOLDER)].map((m) => m[1]))].sort().join(',');

let failed = false;
for (const lang of process.argv.slice(2)) {
  const cats = CATEGORIES[lang];
  if (!cats) {
    console.log(`${lang}: not an app language`);
    failed = true;
    continue;
  }
  let dst;
  try {
    dst = read(`src/i18n/locales/${lang}.json`);
  } catch (e) {
    console.log(`${lang}: cannot read catalog: ${e.message}`);
    failed = true;
    continue;
  }
  const problems = [];
  let same = 0;
  let missing = 0;
  for (const key of Object.keys(dst)) if (!(key in en)) problems.push(`${key}: not in en.json`);
  for (const [key, ref] of Object.entries(en)) {
    const val = dst[key];
    if (val === undefined) {
      missing++;
      continue;
    }
    const refText = typeof ref === 'string' ? ref : ref.other;
    if (typeof ref === 'string') {
      if (typeof val !== 'string') {
        problems.push(`${key}: must be a string`);
        continue;
      }
      if (!val.trim()) problems.push(`${key}: empty`);
      if (placeholders(val) !== placeholders(ref)) problems.push(`${key}: placeholders {${placeholders(val)}} ≠ {${placeholders(ref)}}`);
      if (val === ref && !KEEP.has(key)) same++;
      if (KEEP.has(key) && val !== ref) problems.push(`${key}: must stay "${ref}"`);
    } else {
      if (!val || typeof val !== 'object') {
        problems.push(`${key}: must be a plural object with ${cats.join('/')}`);
        continue;
      }
      if (!('other' in val)) problems.push(`${key}: plural object needs "other"`);
      for (const [cat, text] of Object.entries(val)) {
        if (!cats.includes(cat)) problems.push(`${key}.${cat}: ${lang} has no category "${cat}" (${cats.join('/')})`);
        if (typeof text !== 'string' || !text.trim()) problems.push(`${key}.${cat}: empty`);
        // a form may drop {count} ("one apple"), but must not invent placeholders
        else if (placeholders(text).split(',').some((p) => p && !placeholders(refText).split(',').includes(p))) problems.push(`${key}.${cat}: unknown placeholder`);
      }
      const missingCats = cats.filter((c) => !(c in val));
      if (missingCats.length) problems.push(`${key}: plural object lacks ${missingCats.join('/')}`);
      if (val.other === refText) same++;
    }
  }
  if (missing) problems.unshift(`${missing} keys missing`);
  const total = Object.keys(en).length;
  console.log(`${lang}: ${total - missing}/${total} keys, ${same} identical to English, ${problems.length} problems`);
  for (const p of problems.slice(0, 30)) console.log(`  ${p}`);
  if (problems.length > 30) console.log(`  … ${problems.length - 30} more`);
  if (problems.length) failed = true;
}
process.exit(failed ? 1 : 0);
