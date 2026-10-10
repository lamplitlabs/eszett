// Drills whose answers are known before the learner types: numbers, clock times, dates, prices and
// ordinals come from the rule engines; articles, plurals, meanings and verb forms come from the verified
// lexicon. The model is never asked what the right answer is; it is asked to explain a mistake.

import {
  clockToGerman,
  compact,
  dateToGerman,
  matchesAny,
  matchesExactly,
  MONTHS,
  normalise,
  numberToGerman,
  ordinalToGerman,
  priceToGerman,
} from './engines';
import { AUX_VARIES, GENUS_ARTICLE, nounsUpTo, type Article, type LexiconIndex, type LexNoun, type LexVerb } from './lexicon';
import { t } from '../i18n';
import { cefrOf, type Level } from './levels';

export interface Rng {
  next(): number;
  int(lo: number, hi: number): number;
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: readonly T[]): T[];
}

/** Deterministic PRNG (mulberry32): reproducible drills in tests, fresh ones in the app. */
export function makeRng(seed = Date.now()): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle: (arr) => {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
  return rng;
}

export type DrillCategory =
  | 'article'
  | 'plural'
  | 'meaning'
  | 'verbs'
  | 'numbers'
  | 'clock'
  | 'dates'
  | 'prices'
  | 'ordinals'
  | 'sentence';

export type AnswerMode = 'articles' | 'choice' | 'text';

export interface Drill {
  id: string;
  category: DrillCategory;
  mode: AnswerMode;
  /** The instruction, in the learner's interface language. */
  instruction: string;
  /** The big German (or figure) the learner works on. */
  cue: string;
  /** A line under the cue: a meaning, a gloss, a form name. */
  sub?: string;
  /** Multiple-choice options (articles or meanings). */
  options?: string[];
  /** Every accepted answer; `groups` means one alternative from every group. */
  accept: string[];
  groups?: string[][];
  /** The canonical answer shown after a miss. */
  answer: string;
  /** A deterministic rule hint (never written by the model). */
  hint: string;
  /** For the lexicon drills: the noun or verb, so the app can save it or ask the tutor about it. */
  noun?: LexNoun;
  verb?: LexVerb;
  /** The text to read aloud after answering (the German answer in context). */
  speak?: string;
}

let counter = 0;
const id = () => `d${Date.now().toString(36)}${(counter += 1)}`;

// ------------------------------------------------------------------------------------------------
// gender rules of thumb, shown only when they predict the right article for this noun
// ------------------------------------------------------------------------------------------------

// the rules of thumb, as keys of the string catalog (src/i18n/locales/en.json, `drills.gender*`)
const GENDER_RULES: { re: RegExp; article: Article; rule: string }[] = [
  { re: /(ung|heit|keit|schaft|ion|tät|ik|ur|enz|anz|ei)$/, article: 'die', rule: 'drills.genderUng' },
  { re: /(chen|lein)$/, article: 'das', rule: 'drills.genderChen' },
  { re: /(ment|um|ma)$/, article: 'das', rule: 'drills.genderMent' },
  { re: /(ling|ismus|or|ist|ant)$/, article: 'der', rule: 'drills.genderLing' },
  { re: /^Ge.{3,}e?$/, article: 'das', rule: 'drills.genderGe' },
  { re: /in$/, article: 'die', rule: 'drills.genderIn' },
  { re: /e$/, article: 'die', rule: 'drills.genderE' },
  { re: /(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|januar|februar|april|mai|juni|juli|august|september|oktober|november|dezember|sommer|winter|herbst|frühling)$/i, article: 'der', rule: 'drills.genderDays' },
];

export function genderRule(noun: LexNoun, lex: LexiconIndex | null = null): string | null {
  const article = GENUS_ARTICLE[noun.genus];
  // a compound takes the gender of its last part (das Rad -> das Fahrrad), checked against the lexicon
  const split = lex?.compoundSplit(noun.lemma);
  if (split) {
    const last = lex?.articlesOf(split.last) ?? [];
    if (last.length === 1 && last[0] === article) return t('drills.hintCompound', { last: `${article} ${split.last}`, whole: `${article} ${noun.lemma}` });
  }
  for (const r of GENDER_RULES) {
    if (r.re.test(noun.lemma)) return r.article === article ? t(r.rule) : null;
  }
  return null;
}

// ------------------------------------------------------------------------------------------------
// lexicon drills
// ------------------------------------------------------------------------------------------------

export function drillArticle(noun: LexNoun, lex: LexiconIndex | null = null): Drill {
  const article = GENUS_ARTICLE[noun.genus];
  return {
    id: id(),
    category: 'article',
    mode: 'articles',
    instruction: t('drills.instrArticle'),
    cue: noun.lemma,
    sub: noun.meaning,
    options: ['der', 'die', 'das'],
    accept: [article],
    answer: `${article} ${noun.lemma}`,
    hint: genderRule(noun, lex) ?? t('drills.hintArticleDefault'),
    noun,
    speak: `${article} ${noun.lemma}`,
  };
}

export function drillPlural(noun: LexNoun): Drill {
  const article = GENUS_ARTICLE[noun.genus];
  const plurals = noun.plural;
  return {
    id: id(),
    category: 'plural',
    mode: 'text',
    instruction: t('drills.instrPlural'),
    cue: `${article} ${noun.lemma}`,
    sub: noun.meaning,
    accept: plurals.flatMap((p) => [p, `die ${p}`]),
    answer: `die ${plurals.join(' / die ')}`,
    hint: pluralHint(noun),
    noun,
    speak: `die ${plurals[0]}`,
  };
}

function pluralHint(noun: LexNoun): string {
  const p = noun.plural[0] ?? '';
  const l = noun.lemma;
  if (noun.genus === 'f' && (p === `${l}n` || p === `${l}en`)) return t('drills.pluralFeminine');
  if (p.endsWith('er') && /[äöü]/.test(p) && !/[äöü]/.test(l)) return t('drills.pluralErUmlaut');
  if (p === `${l}s`) return t('drills.pluralS');
  if (p === l) return t('drills.pluralSame');
  if (p.endsWith('e') && /[äöü]/.test(p) && !/[äöü]/.test(l)) return t('drills.pluralEUmlaut');
  if (p === `${l}e`) return t('drills.pluralE');
  return t('drills.pluralDie');
}

export function drillMeaning(noun: LexNoun, pool: LexNoun[], rng: Rng): Drill {
  const distractors = rng
    .shuffle(pool.filter((n) => n.lemma !== noun.lemma && n.meaning && n.meaning !== noun.meaning))
    .slice(0, 3)
    .map((n) => n.meaning as string);
  const options = rng.shuffle([noun.meaning as string, ...distractors]);
  const article = GENUS_ARTICLE[noun.genus];
  return {
    id: id(),
    category: 'meaning',
    mode: 'choice',
    instruction: t('drills.instrMeaning'),
    cue: `${article} ${noun.lemma}`,
    sub: noun.example,
    options,
    accept: [noun.meaning as string],
    answer: noun.meaning as string,
    hint: noun.example ? t('drills.hintMeaningContext', { example: noun.example }) : t('drills.hintMeaningDefault'),
    noun,
    speak: `${article} ${noun.lemma}`,
  };
}

export type VerbForm = 'preterite' | 'perfekt';

export function drillVerb(verb: LexVerb, form: VerbForm): Drill {
  if (form === 'preterite') {
    return {
      id: id(),
      category: 'verbs',
      mode: 'text',
      instruction: t('drills.instrPreterite'),
      cue: verb.infinitive,
      sub: verb.meaning,
      accept: [verb.preterite, `er ${verb.preterite}`, `sie ${verb.preterite}`, `es ${verb.preterite}`],
      answer: `er ${verb.preterite}`,
      hint: t('drills.hintPreterite', { infinitive: verb.infinitive, preterite: verb.preterite }),
      verb,
      speak: `er ${verb.preterite}`,
    };
  }
  const aux = verb.auxiliary === 'sein' ? 'ist' : 'hat';
  // verbs like fahren take either auxiliary depending on the sentence (ist nach Berlin / hat das Auto gefahren)
  const auxes = AUX_VARIES.has(verb.infinitive) ? ['ist', 'hat'] : [aux];
  return {
    id: id(),
    category: 'verbs',
    mode: 'text',
    instruction: t('drills.instrPerfekt'),
    cue: verb.infinitive,
    sub: verb.meaning,
    groups: [auxes, [verb.participle]],
    accept: auxes.map((a) => `${a} ${verb.participle}`),
    answer: `er ${aux} ${verb.participle}`,
    hint: AUX_VARIES.has(verb.infinitive)
      ? t('drills.hintAuxVaries', { verb: verb.infinitive })
      : verb.auxiliary === 'sein'
        ? t('drills.hintAuxSein', { verb: verb.infinitive })
        : t('drills.hintAuxHaben', { verb: verb.infinitive }),
    verb,
    speak: `er ${aux} ${verb.participle}`,
  };
}

// ------------------------------------------------------------------------------------------------
// engine drills (numbers, clock, dates, prices, ordinals, a sentence with a date and a time)
// ------------------------------------------------------------------------------------------------

function numberPool(level: Level): [number, number][] {
  if (level === 'A1') return [[13, 99], [13, 99], [101, 999]];
  if (level === 'A2') return [[21, 99], [101, 999], [1001, 9999]];
  return [[101, 999], [1001, 9999], [10001, 99999], [100001, 999999]];
}

export function drillNumber(rng: Rng, level: Level): Drill {
  const [lo, hi] = rng.pick(numberPool(level));
  const value = rng.int(lo, hi);
  const words = numberToGerman(value);
  const accept = [words];
  if (words.startsWith('hundert') || words.startsWith('tausend')) accept.push(`ein${words}`);
  const rest = value % 100;
  const unit = rest % 10;
  const pieces: string[] = [];
  if (rest >= 21 && unit) pieces.push(`${rest} = ${unit === 1 ? 'ein' : numberToGerman(unit)} + und + ${numberToGerman(rest - unit)}`);
  if (value >= 100) pieces.push(t('drills.numberHundreds'));
  return {
    id: id(),
    category: 'numbers',
    mode: 'text',
    instruction: t('drills.instrNumber'),
    cue: value.toLocaleString('de-DE'),
    accept,
    answer: words,
    hint: t('drills.hintNumber', { pieces: pieces.join('; ') || t('drills.numberExample') }),
    speak: words,
  };
}

export function drillClock(rng: Rng): Drill {
  const hour = rng.int(0, 23);
  const minute = rng.pick([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  const f = clockToGerman(hour, minute);
  return {
    id: id(),
    category: 'clock',
    mode: 'text',
    instruction: t('drills.instrClock'),
    cue: f.digital,
    accept: [f.formal, f.informal, f.regional].filter(Boolean),
    answer: [f.formal, f.informal !== f.formal ? f.informal : '', f.regional].filter(Boolean).join(' / '),
    hint: t('drills.hintClock'),
    speak: f.informal,
  };
}

export function drillDate(rng: Rng): Drill {
  const day = rng.int(1, 28);
  const month = rng.int(1, 12);
  const f = dateToGerman(day, month);
  return {
    id: id(),
    category: 'dates',
    mode: 'text',
    instruction: t('drills.instrDate'),
    cue: `${day}.${month}.`,
    sub: dayMonth(day, month),
    accept: [f.nominative, f.dative],
    answer: `${f.nominative} / ${f.dative}`,
    hint: t('drills.hintDate', { ordinal: ordinalToGerman(day), month, monthDe: MONTHS[month - 1] }),
    speak: `Heute ist ${f.nominative}.`,
  };
}

export function drillPrice(rng: Rng): Drill {
  const euros = rng.int(1, 499);
  const cents = rng.pick([0, 5, 10, 25, 49, 50, 75, 90, 99]);
  const f = priceToGerman(euros, cents);
  const accept = [f.spoken];
  if (cents && f.spoken.includes(' Euro ')) accept.push(`${f.spoken} Cent`, `${f.spoken.replace(' Euro ', ' Euro und ')} Cent`);
  return {
    id: id(),
    category: 'prices',
    mode: 'text',
    instruction: t('drills.instrPrice'),
    cue: f.written,
    accept,
    answer: f.spoken,
    hint: t('drills.hintPrice'),
    speak: f.spoken,
  };
}

export function drillOrdinal(rng: Rng): Drill {
  const day = rng.int(1, 31);
  const month = rng.pick(MONTHS);
  const dative = rng.next() < 0.5;
  const ord = ordinalToGerman(day);
  const expected = dative ? `${ord}n` : ord;
  return {
    id: id(),
    category: 'ordinals',
    mode: 'text',
    instruction: t('drills.instrOrdinal'),
    cue: dative ? `Wir treffen uns am ___ (${day}.) ${month}.` : `Heute ist der ___ (${day}.) ${month}.`,
    accept: [expected],
    answer: expected,
    hint: t('drills.hintOrdinal'),
    speak: dative ? `Wir treffen uns am ${expected} ${month}.` : `Heute ist der ${expected} ${month}.`,
  };
}

// the cue in the learner's language (a catalog key with {date} and {time}) and the German it checks against
const SENTENCE_TEMPLATES = [
  { key: 'drills.sentenceMeeting', de: (d: string, c: string) => `Das Treffen ist ${d} um ${c}.` },
  { key: 'drills.sentenceTrain', de: (d: string, c: string) => `Der Zug fährt ${d} um ${c} ab.` },
  { key: 'drills.sentenceCourse', de: (d: string, c: string) => `Der Kurs beginnt ${d} um ${c}.` },
];

/** "15 March" in the learner's language. */
const dayMonth = (day: number, month: number) => t('drills.dayMonth', { day, month: t(`drills.month${month}`) });

/** A translation with a date and a time inside: both checked by the engines, the rest of the sentence is free. */
export function drillSentence(rng: Rng): Drill {
  const day = rng.int(1, 28);
  const month = rng.int(1, 12);
  const hour = rng.int(6, 21);
  const minute = rng.pick([0, 15, 30, 45]);
  const d = dateToGerman(day, month);
  const c = clockToGerman(hour, minute);
  const tpl = rng.pick(SENTENCE_TEMPLATES);
  const timeAlts = [c.formal, c.informal, c.regional].filter(Boolean);
  const en = t(tpl.key, { date: dayMonth(day, month), time: c.digital });
  return {
    id: id(),
    category: 'sentence',
    mode: 'text',
    instruction: t('drills.instrSentence'),
    cue: en,
    groups: [[d.dative], timeAlts],
    accept: [d.dative, ...timeAlts],
    answer: tpl.de(d.dative, c.formal),
    hint: t('drills.hintSentence', { date: d.dative, time: c.formal }),
    speak: tpl.de(d.dative, c.formal),
  };
}

// ------------------------------------------------------------------------------------------------
// checking
// ------------------------------------------------------------------------------------------------

export interface DrillResult {
  ok: boolean;
  /** Right apart from a missing umlaut or ß ("Hauser" for "Häuser"): counted, with a note. */
  nearly?: string;
  /** The learner wrote digits where words were asked for. */
  digits?: boolean;
  /** For two-part answers: which parts were found. */
  groups?: boolean[];
}

const stripUmlauts = (s: string) =>
  compact(s)
    .replace(/ae/g, 'a')
    .replace(/oe/g, 'o')
    .replace(/ue/g, 'u')
    .replace(/ss/g, 's');

export function checkDrill(drill: Drill, answer: string): DrillResult {
  const given = answer.trim();
  if (!given) return { ok: false };
  if (['numbers', 'prices', 'ordinals'].includes(drill.category) && /^[\d.,:€\s-]+$/.test(given)) return { ok: false, digits: true };
  if (drill.mode === 'articles' || drill.mode === 'choice') return { ok: matchesExactly(given, drill.accept) };
  if (drill.category === 'verbs' && drill.groups) {
    // whole words: "bist gegangen" must not pass as "ist gegangen"
    const words = normalise(given).split(/[^a-z]+/).filter(Boolean);
    const has = (alts: string[], loose: boolean) =>
      alts.some((a) => words.some((w) => w === normalise(a) || (loose && stripUmlauts(w) === stripUmlauts(a))));
    const groups = drill.groups.map((g) => has(g, false));
    if (groups.every(Boolean)) return { ok: true, groups };
    if (drill.groups.every((g) => has(g, true))) return { ok: true, nearly: drill.accept[0], groups };
    return { ok: false, groups };
  }
  if (drill.groups) {
    const groups = drill.groups.map((g) => matchesAny(given, g));
    return { ok: groups.every(Boolean), groups };
  }
  if (drill.category === 'plural' || drill.category === 'verbs') {
    if (matchesExactly(given, drill.accept)) return { ok: true };
    const near = drill.accept.find((a) => stripUmlauts(a) === stripUmlauts(given));
    return near ? { ok: true, nearly: near } : { ok: false };
  }
  if (matchesAny(given, drill.accept)) return { ok: true };
  const near = drill.accept.find((a) => stripUmlauts(given).includes(stripUmlauts(a)));
  return near ? { ok: true, nearly: near } : { ok: false };
}

// ------------------------------------------------------------------------------------------------
// building a set
// ------------------------------------------------------------------------------------------------

/** Pick nouns for a set: the learner's own level weighted double, earlier levels for review. */
export function pickNouns(lex: LexiconIndex, level: Level, n: number, rng: Rng, exclude: Set<string> = new Set()): LexNoun[] {
  const pool = nounsUpTo(lex, level).filter((x) => !exclude.has(x.lemma));
  const weighted = pool.flatMap((x) => (cefrOf(x.level) === level ? [x, x] : [x]));
  const out: LexNoun[] = [];
  const seen = new Set<string>();
  for (const x of rng.shuffle(weighted)) {
    if (seen.has(x.lemma)) continue;
    seen.add(x.lemma);
    out.push(x);
    if (out.length >= n) break;
  }
  return out;
}

const VERB_LEVEL_POOL: Record<Level, number> = { A1: 40, A2: 80, B1: 130, B2: 164, C1: 164, C2: 164 };
const MODALS = new Set(['können', 'müssen', 'dürfen', 'sollen', 'wollen', 'mögen']);

export function buildDrillSet(category: DrillCategory, level: Level, lex: LexiconIndex, rng: Rng, n = 8): Drill[] {
  switch (category) {
    case 'article':
      return pickNouns(lex, level, n, rng).map((x) => drillArticle(x, lex));
    case 'plural':
      return pickNouns(lex, level, n * 2, rng)
        .filter((x) => x.plural.length > 0)
        .slice(0, n)
        .map(drillPlural);
    case 'meaning': {
      const pool = pickNouns(lex, level, 80, rng);
      return pool.slice(0, n).map((x) => drillMeaning(x, pool, rng));
    }
    case 'verbs': {
      // the verb table is ordered by frequency, so lower levels drill the commonest verbs
      const verbs = rng.shuffle(lex.verbs.slice(0, VERB_LEVEL_POOL[level])).slice(0, n);
      // the Perfekt of a modal verb (hat gekonnt) is correct but rare: modal verbs are drilled in the Präteritum
      return verbs.map((v, i) => drillVerb(v, !MODALS.has(v.infinitive) && (level === 'A1' || i % 2 === 0) ? 'perfekt' : 'preterite'));
    }
    case 'numbers':
      return Array.from({ length: n }, () => drillNumber(rng, level));
    case 'clock':
      return Array.from({ length: n }, () => drillClock(rng));
    case 'dates':
      return Array.from({ length: n }, () => drillDate(rng));
    case 'prices':
      return Array.from({ length: n }, () => drillPrice(rng));
    case 'ordinals':
      return Array.from({ length: n }, () => drillOrdinal(rng));
    case 'sentence':
      return Array.from({ length: n }, () => drillSentence(rng));
  }
}

/** The plain text of a drill for prompts ("Which article? Fahrrad (bicycle)"). */
export function drillAsText(d: Drill): string {
  return `${d.instruction} ${d.cue}${d.sub && d.category !== 'meaning' ? ` (${d.sub})` : ''}`;
}

export const normaliseAnswer = normalise;
