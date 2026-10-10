#!/usr/bin/env node
// Asks the app's own model for the words behind the Word tiles and Five letters games and writes
// src/data/model-words.json, which scripts/build-words.mjs folds into src/data/words.json. Scrabble word lists
// are licensed, so instead the tutor model that ships in the app (light-german-tutor-phone-v25) names the
// everyday adjectives, verbs, adverbs and nouns a learner meets at each level, and every word has to survive
// three independent checks before it is kept:
//
//   1. lists    – per level and topic the model lists words with an English meaning; only a word the model
//                 volunteers this way is ever a candidate (nothing is scraped or guessed);
//   2. judge    – asked on its own, with a JSON schema, the model gives the word's dictionary form, part of
//                 speech and meaning: the form has to be the candidate itself (so inflected forms such as
//                 "kühle" are dropped, or re-judged as "kühlen"), the part of speech the one the list was asked
//                 for, and the two meanings have to agree on at least one word;
//   3. usage    – where the two meanings disagree, the app's own "What does X mean and how do I use it?" prompt
//                 has to use the word in a German sentence and give a meaning that agrees with one of them.
//
// Nouns are additionally required to be attested by the lexicon's gender table (.model-cache/lexicon.json), which
// stays the authority on gender; an infinitive has to end in -en/-ern/-eln, and an adjective or adverb that is
// another kept word plus an ending ("schneller") is dropped as that word's form. Verbs get their principal
// parts from the model too, but the answer is trusted only when it is exactly the weak pattern (`regular`);
// build-words.mjs prefers the lexicon's and composed parts (aufstehen from stehen) and gives the rest their
// present tense only. The model is a lenient judge on its own (it will explain almost any string), which is why
// no single answer is trusted; build-words.mjs adds one more check against the app's own texts.
//
// Needs the release GGUF served locally (the phone cannot be asked at build time):
//
//   curl -o /tmp/v25.gguf https://lichtgwcst001.blob.core.windows.net/models/light-german-tutor-phone-v25/gguf/light-german-tutor-phone-v25-Q5_K_M.gguf
//   llama-server -m /tmp/v25.gguf --port 8080 -ngl 99 -c 16384 --parallel 8 -fa on
//   PARALLEL=8 node scripts/model-words.mjs  (about an hour on an M2 Pro; answers are cached in .model-cache/, so a rerun
//                                             after a rule change replays them and needs no server; SMOKE=1 tries two topics)
//
// Sampling is greedy with a fixed seed and the system prompt is the app's, so the run is reproducible for a given
// llama.cpp build and GGUF.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { IRREGULAR_FULL, isRegularParts, normaliseParts, separablePrefix } from './lib/verbs.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const data = join(here, '..', 'src', 'data');
const cacheDir = join(here, '..', '.model-cache');
const read = (name) => JSON.parse(readFileSync(join(data, name), 'utf8'));

const SERVER = process.env.LLAMA_SERVER ?? 'http://127.0.0.1:8080';
const PARALLEL = Number(process.env.PARALLEL ?? 4);
const MODEL_NAME = 'light-german-tutor-phone-v25-Q5_K_M';
const SEED = 7;
/** SMOKE=1 runs two topics at A1 only and writes next to the cache, to try prompt changes without the full run. */
const SMOKE = Boolean(process.env.SMOKE);
const OUT = SMOKE ? join(cacheDir, 'model-words-smoke.json') : join(data, 'model-words.json');

const model = read('model.json');
const fullPath = join(cacheDir, 'lexicon.json');
if (!existsSync(fullPath)) {
  console.error('no .model-cache/lexicon.json: run scripts/build-data.mjs first (nouns are checked against its gender table)');
  process.exit(1);
}
const lexicon = JSON.parse(readFileSync(fullPath, 'utf8'));
const check = lexicon.check ?? {};
const lexiconVerbs = Object.fromEntries(lexicon.verbs.map((v) => [v.infinitive, normaliseParts(v)]));
const KNOWN_FORMS = new Set(IRREGULAR_FULL);

// ------------------------------------------------------------------------------------------------
// talking to llama-server, with every answer cached by its request
// ------------------------------------------------------------------------------------------------

const cachePath = join(cacheDir, 'model-words-cache.json');
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
let dirty = 0;
const saveCache = () => {
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cachePath, JSON.stringify(cache));
  dirty = 0;
};

/** The server is needed only for answers the cache does not have: a rerun after a rule change needs none. */
let health;
const serverUp = () => {
  health ??= fetch(`${SERVER}/health`).then((r) => r.ok, () => false).then((ok) => {
    if (ok) return;
    console.error(`\nno llama-server at ${SERVER}; see the header of this script for how to start it`);
    process.exit(1);
  });
  return health;
};

async function ask(user, { maxTokens = 300, schema = null } = {}) {
  const body = {
    messages: [
      { role: 'system', content: model.system_prompt },
      { role: 'user', content: user },
    ],
    temperature: 0,
    top_k: 1,
    seed: SEED,
    max_tokens: maxTokens,
  };
  if (schema) body.response_format = { type: 'json_schema', json_schema: { name: 'answer', schema } };
  const key = createHash('sha1').update(JSON.stringify(body)).digest('hex');
  if (key in cache) return cache[key];
  await serverUp();
  for (let attempt = 0; ; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 180_000);
      const res = await fetch(`${SERVER}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const json = await res.json();
      const content = json.choices?.[0]?.message?.content ?? '';
      cache[key] = content;
      if ((dirty += 1) >= 25) saveCache();
      return content;
    } catch (e) {
      if (attempt >= 2) throw e;
      console.warn(`retrying after: ${e instanceof Error ? e.message : e}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

/** Runs `work(item)` over `items` with PARALLEL in flight, printing progress. */
async function pool(label, items, work) {
  let next = 0;
  let done = 0;
  const started = Date.now();
  const results = new Array(items.length);
  const report = () => {
    const elapsed = (Date.now() - started) / 1000;
    const rate = done / Math.max(elapsed, 1);
    const eta = rate > 0 ? Math.round((items.length - done) / rate) : 0;
    process.stdout.write(`\r${label}: ${done}/${items.length}  (${Math.round(elapsed)}s, ~${eta}s left)   `);
  };
  const worker = async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await work(items[i]);
      done += 1;
      if (done % 5 === 0 || done === items.length) report();
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  process.stdout.write('\n');
  return results;
}

// ------------------------------------------------------------------------------------------------
// 1. lists: per level and topic, the words the model volunteers
// ------------------------------------------------------------------------------------------------

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
/** Topics and the level from which they are asked about. */
const TOPICS = [
  ['everyday life and daily routines', 'A1'],
  ['family and friends', 'A1'],
  ['food, drinks and cooking', 'A1'],
  ['the home, rooms and furniture', 'A1'],
  ['shopping and money', 'A1'],
  ['time, days and the calendar', 'A1'],
  ['the body and health', 'A1'],
  ['clothes and colours', 'A1'],
  ['the weather and the seasons', 'A1'],
  ['travel, transport and directions', 'A1'],
  ['school and learning', 'A1'],
  ['hobbies, sport and free time', 'A1'],
  ['animals and nature', 'A1'],
  ['work and the office', 'A2'],
  ['feelings and character', 'A2'],
  ['the city, shops and services', 'A2'],
  ['technology, phones and media', 'A2'],
  ['celebrations and holidays', 'A2'],
  ['housing, renting and moving', 'B1'],
  ['relationships and communication', 'B1'],
  ['culture, music, film and books', 'B1'],
  ['the environment and the climate', 'B1'],
  ['news, politics and society', 'B2'],
  ['business, the economy and law', 'B2'],
  ['science and research', 'B2'],
  ['history and traditions', 'B2'],
  ['opinions, arguments and debate', 'B2'],
  ['abstract ideas and philosophy', 'C1'],
  ['literature and academic writing', 'C1'],
  ['bureaucracy and formal letters', 'C1'],
];
const CLASSES = {
  adj: { ask: 'adjectives', form: 'adjective – English meaning' },
  verb: { ask: 'verbs (infinitives)', form: 'infinitive – English meaning' },
  noun: { ask: 'nouns', form: 'der/die/das Noun – English meaning' },
  adv: { ask: 'adverbs and other small words', form: 'word – English meaning' },
};
/** Adverbs do not belong to a topic; they are asked for by kind instead, once per level. */
const ADVERB_KINDS = ['time and frequency', 'place and direction', 'manner and degree', 'connecting sentences and ideas', 'expressing an opinion or attitude (modal particles included)'];

const listPrompt = (cls, topic, level) =>
  cls === 'adv'
    ? `List 12 German adverbs and other small words for ${topic}, suitable for level ${level}. One per line, in the form: ${CLASSES.adv.form}. No numbering, no example sentences.`
    : `List 12 German ${CLASSES[cls].ask} for talking about ${topic}, suitable for level ${level}. One per line, in the form: ${CLASSES[cls].form}. No numbering, no example sentences.`;

/** "der Vater, -¨ – father", "sich freuen auf – to look forward to", "3. müde – tired": the word, its article and its meaning. */
const LINE = /^[\s\-*•]*(?:\d+[.)]\s*)?(?:(der|die|das)\s+)?(?:sich\s+)?([A-Za-zÄÖÜäöüß]+)(?:\s+(?:an|auf|aus|bei|für|in|mit|nach|über|um|von|vor|zu))?(?:\s*\([^)]*\)|,\s*[-¨]*[a-zäöüß]*)?\s*[–—:-]\s*(.+?)\s*$/;
const LOWER = /^[a-zäöüß]{2,15}$/;
const CAPITAL = /^[A-ZÄÖÜ][a-zäöüß]{1,14}$/;
const cefr = (level) => LEVELS.indexOf(level);

/** candidate word -> { cls, levels: Set, glosses: string[] } */
const candidates = new Map();
const addCandidate = (word, cls, level, gloss) => {
  const key = `${cls}:${word}`;
  const c = candidates.get(key) ?? { word, cls, level, glosses: [] };
  if (cefr(level) < cefr(c.level)) c.level = level;
  if (gloss && !c.glosses.includes(gloss)) c.glosses.push(gloss);
  candidates.set(key, c);
};

function parseList(answer, cls, level) {
  let n = 0;
  for (const line of answer.split('\n')) {
    const m = LINE.exec(line.replace(/\*\*/g, ''));
    if (!m) continue;
    const [, article, raw, gloss] = m;
    if (cls === 'noun') {
      const word = raw[0].toUpperCase() + raw.slice(1);
      if (!CAPITAL.test(word) || !article) continue;
      addCandidate(word, cls, level, gloss);
    } else {
      const word = raw.toLowerCase();
      if (!LOWER.test(word)) continue;
      if (cls === 'verb' && !/n$/.test(word)) continue;
      addCandidate(word, cls, level, gloss);
    }
    n += 1;
  }
  return n;
}

// ------------------------------------------------------------------------------------------------
// 2. judge: the word on its own, in a fixed shape
// ------------------------------------------------------------------------------------------------

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    is_german_word: { type: 'boolean' },
    dictionary_form: { type: 'string' },
    part_of_speech: { type: 'string', enum: ['noun', 'verb', 'adjective', 'adverb', 'other'] },
    english_meaning: { type: 'string' },
  },
  required: ['is_german_word', 'dictionary_form', 'part_of_speech', 'english_meaning'],
  additionalProperties: false,
};
const judgePrompt = (word) =>
  `Is "${word}" a real German word? Give its dictionary form (infinitive for verbs, base form for adjectives, singular with capital letter for nouns), its part of speech and its English meaning.`;

async function judge(word) {
  const raw = await ask(judgePrompt(word), { maxTokens: 160, schema: JUDGE_SCHEMA });
  try {
    const j = JSON.parse(raw);
    return { ok: Boolean(j.is_german_word), form: String(j.dictionary_form ?? '').trim(), pos: j.part_of_speech, gloss: String(j.english_meaning ?? '').trim() };
  } catch {
    return null;
  }
}

/** Which of our classes a judged part of speech may land in, given the class the list was asked for. */
function finalClass(asked, pos) {
  if (asked === 'noun') return pos === 'noun' ? 'noun' : null;
  if (asked === 'verb') return pos === 'verb' ? 'verb' : null;
  if (pos === 'adjective') return 'adj';
  if (pos === 'adverb') return 'adv';
  if (pos === 'other' && asked === 'adv') return 'other';
  return null;
}

// ------------------------------------------------------------------------------------------------
// meanings: do two glosses say the same thing?
// ------------------------------------------------------------------------------------------------

const STOP = new Set('to a an the of be or and sth something someone somebody sb in on at for with very is are it one its by from as into up out off'.split(' '));
const stemEn = (w) => w.replace(/(ingly|ing|edly|ed|ies|es|ly|s)$/, '').replace(/(.)\1$/, '$1');
const glossWords = (g) =>
  new Set(
    g
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .split(/[^a-z]+/)
      .filter((w) => w.length > 1 && !STOP.has(w))
      .map(stemEn),
  );
const agree = (a, b) => {
  const A = glossWords(a);
  const B = glossWords(b);
  for (const w of A) if (B.has(w)) return true;
  return false;
};
/** A gloss for the word list: the shortest sense of the judge's answer, trimmed to a phrase. */
const tidy = (g) =>
  g
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[.;!]+$/, '')
    .trim();

// ------------------------------------------------------------------------------------------------
// 3. usage: the app's own word prompt as a tiebreaker (src/harness/promptTexts.ts)
// ------------------------------------------------------------------------------------------------

const wordPrompt = (word, level) => `What does "${word}" mean and how do I use it? Give two short example sentences with translations. I'm at ${level} level.`;
const fold = (s) => s.toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');

function usageOf(answer, word, cls) {
  const lines = answer.split('\n').filter((l) => l.trim());
  const first = lines[0] ?? '';
  const rest = lines.slice(1).join('\n');
  // '"Vertraut" is an adjective meaning "familiar" or "acquainted" – you use it…', '"wohl" means probably or likely, like…'
  const means = /\b(?:means?|meaning)\s+(.+?)(?:\s[–—-]\s|[.;:!]|,\s+(?:like|a|an|the|and|which|so|you|used|often)\b|$)/i.exec(first);
  const gloss = means ? tidy(means[1].replace(/["“”]/g, '')) : '';
  // a separable verb is split in a sentence ("ziehe … an"), so its base verb has to appear
  let base = word;
  if (cls === 'verb') {
    const prefix = separablePrefix(word);
    base = prefix ? word.slice(prefix.length) : word;
  }
  let stem = cls === 'verb' ? base.replace(/(e)?n$/, '') : word.replace(/e$/, '');
  stem = fold(stem).slice(0, Math.max(3, Math.ceil(stem.length * 0.7)));
  const used = fold(rest).includes(stem);
  return { gloss, used };
}

// ------------------------------------------------------------------------------------------------
// 4. verb parts
// ------------------------------------------------------------------------------------------------

const PARTS_SCHEMA = {
  type: 'object',
  properties: {
    present_er_sie_es: { type: 'string' },
    praeteritum_er_sie_es: { type: 'string' },
    partizip_2: { type: 'string' },
    auxiliary: { type: 'string', enum: ['haben', 'sein'] },
    regular: { type: 'boolean' },
  },
  required: ['present_er_sie_es', 'praeteritum_er_sie_es', 'partizip_2', 'auxiliary', 'regular'],
  additionalProperties: false,
};
const partsPrompt = (verb) =>
  `Give the forms of the German verb "${verb}": the er/sie/es present tense, the er/sie/es Präteritum, the Partizip II, the auxiliary (haben or sein) and whether it is a regular (weak) verb.`;

async function partsOf(verb) {
  const raw = await ask(partsPrompt(verb), { maxTokens: 160, schema: PARTS_SCHEMA });
  try {
    const j = JSON.parse(raw);
    const clean = (f) => String(f ?? '').toLowerCase().replace(/^(er|sie|es)\s+/, '').replace(/^(hat|ist)\s+/, '').trim();
    return normaliseParts({ infinitive: verb, present_3sg: clean(j.present_er_sie_es), preterite: clean(j.praeteritum_er_sie_es), participle: clean(j.partizip_2), auxiliary: j.auxiliary });
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------------------------------------
// run
// ------------------------------------------------------------------------------------------------


const stats = { lists: 0, listed: 0, candidates: 0, judged: 0, rejudged: 0, usageChecked: 0, kept: {}, rejected: {}, verbs: {} };
const VERBOSE = Boolean(process.env.VERBOSE);
const rejections = [];
const reject = (why, word = '') => {
  stats.rejected[why] = (stats.rejected[why] ?? 0) + 1;
  if (VERBOSE && word) rejections.push(`${word}: ${why}`);
};

const listJobs = [];
const levels = SMOKE ? ['A1'] : LEVELS;
const topics = SMOKE ? TOPICS.slice(0, 2) : TOPICS;
for (const level of levels) {
  for (const [topic, from] of topics) if (cefr(from) <= cefr(level)) for (const cls of ['adj', 'verb', 'noun']) listJobs.push({ cls, topic, level });
  for (const kind of SMOKE ? ADVERB_KINDS.slice(0, 1) : ADVERB_KINDS) listJobs.push({ cls: 'adv', topic: kind, level });
}
stats.lists = listJobs.length;
await pool('lists', listJobs, async ({ cls, topic, level }) => {
  const answer = await ask(listPrompt(cls, topic, level), { maxTokens: 260 });
  stats.listed += parseList(answer, cls, level);
});
stats.candidates = candidates.size;
saveCache();

const kept = new Map(); // lemma -> entry
const judgedWords = new Set();
const secondRound = [];

async function consider(c, round) {
  const { word, cls } = c;
  judgedWords.add(`${cls}:${word}`);
  if (cls !== 'noun' && KNOWN_FORMS.has(word)) return reject('form of sein/haben/werden/modal', word);
  if (cls === 'noun' && !check[word]) return reject('noun not in the lexicon gender table', word);
  const j = await judge(word);
  stats.judged += 1;
  if (!j) return reject('judge answer unreadable', word);
  if (!j.ok) return reject('judge: not a word', word);
  // a noun's existence and gender are the lexicon table's call (checked above), the judge only vets its meaning;
  // for the other classes the judge's dictionary form has to be the word itself
  const form = cls === 'noun' ? word : j.form.toLowerCase().replace(/^(sich|zu)\s+/, '');
  if (form !== word) {
    // the model listed an inflected form: its dictionary form becomes a candidate of its own, once
    const target = cls === 'noun' ? form : form.toLowerCase();
    const shape = cls === 'noun' ? CAPITAL.test(target) : LOWER.test(target);
    if (round === 1 && shape && !judgedWords.has(`${cls}:${target}`) && !candidates.has(`${cls}:${target}`)) {
      secondRound.push({ word: target, cls, level: c.level, glosses: [...c.glosses, j.gloss] });
    }
    return reject('dictionary form differs', `${word} → ${j.form}`);
  }
  const final = cls === 'noun' ? 'noun' : finalClass(cls, j.pos);
  if (!final) return reject(`part of speech: asked ${cls}, judged ${j.pos}`, word);
  // an infinitive ends in -en, -ern or -eln (tun and sein are lexicon verbs): "return" and "sustain" are not German
  if (final === 'verb' && !/(en|ern|eln)$/.test(word)) return reject('verb not an infinitive', word);

  let gloss = null;
  const listGlosses = c.glosses.filter(Boolean);
  // the judge's gloss is the tidiest, unless it read a noun as something else ("Essen" as "to eat"): then the list's
  const judgeGlossUsable = cls !== 'noun' || (j.pos === 'noun' && !/^to\s/.test(j.gloss));
  const agreeing = listGlosses.find((g) => agree(g, j.gloss));
  if (agreeing) gloss = tidy(judgeGlossUsable ? j.gloss : agreeing);
  else {
    const answer = await ask(wordPrompt(word, cefr(c.level) <= 0 ? 'A2' : c.level), { maxTokens: 260 });
    stats.usageChecked += 1;
    const u = usageOf(answer, word, final);
    if (!u.used) return reject('usage: word not used in an example', word);
    const listAgreeing = u.gloss ? listGlosses.find((g) => agree(g, u.gloss)) : undefined;
    if (listAgreeing) gloss = tidy(listAgreeing);
    else if (u.gloss && agree(u.gloss, j.gloss)) gloss = tidy(judgeGlossUsable ? j.gloss : u.gloss);
    else return reject('meanings disagree', `${word}: list ${JSON.stringify(listGlosses)} judge ${JSON.stringify(j.gloss)} usage ${JSON.stringify(u.gloss)}`);
  }
  if (!gloss) return reject('no meaning', word);
  if (/not a word/i.test(gloss)) return reject('judge: not a word', word);
  if (final === 'noun' && /^to\s/.test(gloss)) return reject('noun with a verb meaning', word);
  if (final === 'verb' && !/^to\s/.test(gloss)) gloss = `to ${gloss.replace(/^to\s+/, '')}`;
  const prior = kept.get(word);
  if (prior) {
    // the same word listed as an adjective and an adverb: the adjective wins (it is the one that inflects)
    if (prior.pos === 'adj' || final === prior.pos) return;
    if (final === 'adj') kept.set(word, { ...prior, pos: 'adj' });
    return;
  }
  kept.set(word, { pos: final, gloss, level: c.level });
  stats.kept[final] = (stats.kept[final] ?? 0) + 1;
}

await pool('judge', [...candidates.values()], (c) => consider(c, 1));
saveCache();
if (secondRound.length) {
  stats.rejudged = secondRound.length;
  await pool('judge (dictionary forms)', secondRound, (c) => consider(c, 2));
  saveCache();
}

// the judge waves inflected forms through when the base is common ("schneller" as a dictionary form): an adjective
// or adverb that is another kept word plus a declension or comparison ending is that word's form, not a lemma
const unumlaut = (w) => w.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u');
const inflects = (pos) => pos === 'adj' || pos === 'adv' || pos === 'other';
for (const [word, entry] of [...kept]) {
  if (!inflects(entry.pos)) continue;
  const m = word.match(/^(.{3,}?)(e|er|en|em|es|ere|eren|erer|erem|eres|ste|sten|ster|stem|stes|este|esten|ester|estem|estes)$/);
  if (!m) continue;
  const base = [m[1], unumlaut(m[1])].find((b) => b !== word && kept.has(b) && inflects(kept.get(b).pos));
  if (!base) continue;
  kept.delete(word);
  stats.kept[entry.pos] -= 1;
  reject('inflected form of another kept word', `${word} → ${base}`);
}

// verbs: principal parts. The lexicon's own verbs calibrate the model (how often it agrees with the table); for
// the other verbs the answer is trusted only when it is exactly the weak pattern — asked for a rarer strong verb
// the model invents ("joggen → gelaufen", "anrufen → gecallt"), so no irregular parts are taken from it; such
// verbs get their present tense only in build-words.mjs, unless they are a known verb with a prefix.
const verbs = [...kept.entries()].filter(([, e]) => e.pos === 'verb').map(([w]) => w);
const calibration = SMOKE ? Object.keys(lexiconVerbs).slice(0, 12) : Object.keys(lexiconVerbs);
let agreeCount = 0;
let weakStrong = 0;
await pool('verb parts (lexicon, calibration)', calibration, async (verb) => {
  const p = await partsOf(verb);
  const truth = lexiconVerbs[verb];
  if (p && p.present_3sg === truth.present_3sg && p.preterite === truth.preterite && p.participle === truth.participle) agreeCount += 1;
  if (p && isRegularParts(verb, p) && !isRegularParts(verb, truth)) weakStrong += 1;
});
stats.verbs.calibration = `${agreeCount}/${calibration.length} lexicon verbs with all three parts as in the table, ${weakStrong} strong verbs given weak forms`;
await pool('verb parts', verbs, async (verb) => {
  const entry = kept.get(verb);
  if (lexiconVerbs[verb]) {
    entry.inLexicon = true;
    return;
  }
  const p = await partsOf(verb);
  if (p && isRegularParts(verb, p)) entry.regular = true;
  else entry.unsure = true;
});
saveCache();
stats.verbs.regular = verbs.filter((v) => kept.get(v).regular).length;
stats.verbs.inLexicon = verbs.filter((v) => kept.get(v).inLexicon).length;
stats.verbs.presentOnly = verbs.filter((v) => kept.get(v).unsure).length;

// ------------------------------------------------------------------------------------------------
// write
// ------------------------------------------------------------------------------------------------

const sort = (a, b) => a.localeCompare(b, 'de');
const lemmas = [...kept.keys()].sort(sort);
const lines = lemmas.map((lemma) => {
  const e = kept.get(lemma);
  const out = { pos: e.pos, gloss: e.gloss, level: e.level };
  if (e.regular) out.regular = true;
  return `    ${JSON.stringify(lemma)}: ${JSON.stringify(out)}`;
});
const header = {
  note: `Words named by the app's own model (${MODEL_NAME}) when asked, per level and topic, for the adjectives, verbs, adverbs and nouns a learner meets, each confirmed by a second, independent question about the word alone and, where the two meanings disagreed, by the app's own word prompt; nouns only where the lexicon's gender table attests them. Generated by scripts/model-words.mjs; build-words.mjs inflects these by rule into words.json. Glosses are the model's and may be imperfect; regular marks verbs whose principal parts, as the model gave them, were exactly the weak pattern (the only parts it is trusted with).`,
  model: MODEL_NAME,
  generated: new Date().toISOString().slice(0, 10),
  stats,
};
const headerJson = JSON.stringify(header, null, 2).replace(/\n}$/, ',\n');
writeFileSync(OUT, `${headerJson}  "words": {\n${lines.join(',\n')}\n  }\n}\n`);
saveCache();
if (VERBOSE) console.error(rejections.sort().join('\n'));
console.log(JSON.stringify(stats, null, 2));
console.log(`${OUT}: ${lemmas.length} words`);
