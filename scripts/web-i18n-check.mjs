// Validates a translated web/i18n file against its English source (the learning pages, see web/build.mjs).
//   node scripts/web-i18n-check.mjs strings <lang>   -> web/i18n/strings.<lang>.json against strings.en.json
//   node scripts/web-i18n-check.mjs exams <lang>     -> web/i18n/exams.<lang>.json against exams.en.json
// Checks: same keys; placeholders {x} and [label](key) link keys preserved; for exams the same heading/items
// structure and the same multiset of numbers per item (digits must survive translation unchanged).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'i18n');
const [kind, lang] = process.argv.slice(2);
const read = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const src = read(`${kind}.en.json`);
const out = read(`${kind}.${lang}.json`);
const problems = [];
const ph = (s) => (String(s).match(/\{[a-zA-Z0-9]+\}/g) || []).sort().join(' ');
const links = (s) => (String(s).match(/\]\(([a-zA-Z]+)\)/g) || []).sort().join(' ');
const nums = (s) => (String(s).match(/\d+(?:[.,]\d+)*/g) || []).map((n) => n.replace(/[.,]/g, '')).sort().join(' ');

for (const k of Object.keys(src)) {
  if (k.startsWith('_')) continue;
  if (!(k in out)) { problems.push(`${k}: missing`); continue; }
  if (kind === 'strings') {
    if (typeof out[k] !== 'string' || !out[k].trim()) problems.push(`${k}: empty`);
    if (ph(src[k]) !== ph(out[k])) problems.push(`${k}: placeholders ${ph(src[k])} -> ${ph(out[k])}`);
    if (links(src[k]) !== links(out[k])) problems.push(`${k}: links ${links(src[k])} -> ${links(out[k])}`);
    if (out[k] === src[k] && src[k].length > 12 && !/^(Eszett|telc|Goethe|BAMF|TestDaF|ÖSD)/.test(src[k])) problems.push(`${k}: untranslated`);
  } else {
    const s = src[k]; const o = out[k];
    if (!o || typeof o.heading !== 'string' || !Array.isArray(o.items)) { problems.push(`${k}: shape`); continue; }
    if (o.items.length !== s.items.length) { problems.push(`${k}: ${s.items.length} items -> ${o.items.length}`); continue; }
    s.items.forEach((item, i) => { if (nums(item) !== nums(o.items[i])) problems.push(`${k}[${i}]: numbers ${nums(item)} -> ${nums(o.items[i])}`); });
  }
}
for (const k of Object.keys(out)) if (!(k in src) && !k.startsWith('_')) problems.push(`${k}: unknown key`);
console.log(`${kind} ${lang}: ${problems.length} problems`);
for (const p of problems) console.log(' ', p);
process.exit(problems.length ? 1 : 0);
