// Checks a content overlay (src/data/i18n/<lang>.json) against en.source.json: same keys, same array lengths,
// no empty strings, German words and placeholders kept. Usage: node scripts/i18n-content-check.mjs fr [es ...]
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = JSON.parse(readFileSync(join(root, 'src/data/i18n/en.source.json'), 'utf8'));
let failed = false;
for (const lang of process.argv.slice(2)) {
  const problems = [];
  let strings = 0;
  let same = 0;
  const target = JSON.parse(readFileSync(join(root, `src/data/i18n/${lang}.json`), 'utf8'));
  const walk = (src, dst, path) => {
    if (typeof src === 'string' || src === null) {
      if (src === null) {
        if (dst !== null && dst !== undefined) problems.push(`${path}: must be null`);
        return;
      }
      strings += 1;
      if (typeof dst !== 'string') return problems.push(`${path}: missing`);
      if (!dst.trim()) return problems.push(`${path}: empty`);
      if (dst === src && src.split(' ').length > 2) same += 1;
      return;
    }
    if (Array.isArray(src)) {
      if (!Array.isArray(dst)) return problems.push(`${path}: must be an array of ${src.length}`);
      if (dst.length !== src.length) problems.push(`${path}: ${dst.length} items, source has ${src.length}`);
      src.forEach((v, i) => walk(v, dst[i], `${path}[${i}]`));
      return;
    }
    if (!dst || typeof dst !== 'object') return problems.push(`${path}: missing object`);
    for (const k of Object.keys(dst)) if (!(k in src)) problems.push(`${path}.${k}: not in the source`);
    for (const [k, v] of Object.entries(src)) walk(v, dst[k], `${path}.${k}`);
  };
  walk(source, target, lang);
  const shown = problems.slice(0, 25);
  console.log(`${lang}: ${strings - problems.filter((p) => p.endsWith(': missing')).length}/${strings} strings, ${same} left in English, ${problems.length} problems`);
  for (const p of shown) console.log(`  ${p}`);
  if (problems.length > shown.length) console.log(`  … ${problems.length - shown.length} more`);
  if (problems.length) failed = true;
}
process.exit(failed ? 1 : 0);
