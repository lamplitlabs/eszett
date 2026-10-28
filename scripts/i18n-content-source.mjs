// Writes src/data/i18n/en.source.json: every English content string a learner reads, in the overlay shape of
// src/i18n/content.ts (ContentOverlay). Translators turn it into src/data/i18n/<lang>.json; `node
// scripts/i18n-content-check.mjs <lang>` verifies the result.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const grammar = read('src/data/grammar.json');
const scenes = read('src/data/scenes.json');
const rules = read('src/data/rules.json');
const lexicon = read('src/data/lexicon-core.json');
const path = read('src/data/path.json');
const rulesTs = readFileSync(join(root, 'src/harness/rules.ts'), 'utf8');
const levelsTs = readFileSync(join(root, 'src/harness/levels.ts'), 'utf8');
const writingTs = readFileSync(join(root, 'src/harness/writing.ts'), 'utf8');
const togetherTs = readFileSync(join(root, 'src/harness/together.ts'), 'utf8');

const out = { grammar: {}, scenes: {}, rules: {}, ruleTitles: {}, lexicon: {}, levels: {}, writing: {}, path: {} };
for (const c of grammar) out.grammar[c.key] = { title: c.title_en, rule: c.rule_en, examples: c.examples.map(([, en]) => en), pitfalls: c.pitfalls.map((p) => p.why_en) };
for (const s of scenes) {
  out.scenes[s.key] = {
    situation: s.situation_en,
    role: s.role_en,
    learner: s.learner_en,
    facts: s.facts.map((f) => f.label_en),
    opening: s.opening_gloss ?? null,
    beats: (s.beats ?? []).map((b) => b.gloss ?? null),
  };
}
for (const [kind, t] of Object.entries(rules)) out.rules[kind] = t.en;
const titles = rulesTs.slice(rulesTs.indexOf('const TITLES'), rulesTs.indexOf('};', rulesTs.indexOf('const TITLES')));
for (const m of titles.matchAll(/^\s*'?([\w-]+)'?: \['((?:[^'\\]|\\.)*)', '(?:[^'\\]|\\.)*'\],?$/gm)) out.ruleTitles[m[1]] = m[2].replace(/\\'/g, "'");
for (const n of lexicon.nouns) out.lexicon[n.lemma] = n.meaning;
for (const v of lexicon.verbs) out.lexicon[v.infinitive] = v.meaning;
// the bundled Taboo cards carry their own English meaning; the core lexicon's wording wins where both know the word
const taboo = togetherTs.slice(togetherTs.indexOf('const BUNDLED_TABOO'), togetherTs.indexOf('\n];', togetherTs.indexOf('const BUNDLED_TABOO')));
for (const m of taboo.matchAll(/^\s*\['(?:der|die|das)', '([^']+)', '([^']+)', '(?:A1|A2|B1|B2|C1|C2)'/gm)) out.lexicon[m[1]] ??= m[2];
const levels = levelsTs.slice(levelsTs.indexOf('export const LEVEL_INFO'));
for (const m of levels.matchAll(/(A1|A2|B1|B2|C1|C2): \{\s*level: '\w+',\s*name: '((?:[^'\\]|\\.)*)',\s*canDo: '((?:[^'\\]|\\.)*)',\s*example: '(?:[^'\\]|\\.)*',\s*exampleGloss: '((?:[^'\\]|\\.)*)',/g)) {
  out.levels[m[1]] = { name: m[2], canDo: m[3], exampleGloss: m[4] };
}
// the writing tasks: title, the task in English, the content points in order (the German text ships with the task)
const tasks = writingTs.slice(writingTs.indexOf('export const WRITE_TASKS'), writingTs.indexOf('\n];', writingTs.indexOf('export const WRITE_TASKS')));
const str = "'((?:[^'\\\\]|\\\\.)*)'";
for (const block of tasks.split(/\n  \{\n/).slice(1)) {
  const id = block.match(new RegExp(`id: ${str}`))[1];
  const title = block.match(new RegExp(`\\n    title: ${str}`))[1];
  const prompt = block.match(new RegExp(`\\n    prompt: ${str}`))[1];
  const points = [...block.matchAll(new RegExp(`\\{ en: ${str},`, 'g'))].map((m) => m[1]);
  const unescape = (x) => x.replace(/\\'/g, "'");
  out.writing[id] = { title: unescape(title), prompt: unescape(prompt), points: points.map(unescape) };
}
// the learning path: a unit's title and goal, and per step the question (ask) or situation (ownScene) it carries
for (const u of path) out.path[u.key] = { title: u.title_en, goal: u.goal_en, steps: u.steps.map((s) => (s.kind === 'ask' ? s.question_en : s.kind === 'ownScene' ? s.situation_en : null)) };
writeFileSync(join(root, 'src/data/i18n/en.source.json'), `${JSON.stringify(out, null, 2)}\n`);
const count = (x) => (typeof x === 'string' ? 1 : x && typeof x === 'object' ? Object.values(x).reduce((a, v) => a + count(v), 0) : 0);
const words = (x) => (typeof x === 'string' ? x.split(/\s+/).length : x && typeof x === 'object' ? Object.values(x).reduce((a, v) => a + words(v), 0) : 0);
console.log(`strings: ${count(out)}, words: ${words(out)}; ruleTitles: ${Object.keys(out.ruleTitles).length}, levels: ${Object.keys(out.levels).length}`);
