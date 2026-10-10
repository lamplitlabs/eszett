// Reading a learner message before the model sees it: which language it is in (the model answers in the
// learner's language), what the learner wants (a question, a check of their German, "how do I say …"),
// and whether the rule engines can answer it outright (numbers, clock times, dates, prices).

import type { TutorLang } from '../i18n/languages';

import { clockToGerman, dateToGerman, normalise, numberToGerman, priceToGerman, yearToGerman } from './engines';

/** A language the tutor answers in (the model handles these well; see src/i18n/languages.ts). */
export type Lang = TutorLang;

const EN_WORDS = new Set(
  'the a an i you me my to for of and is are how what do does can want please help with in on it this that check correct practice practise prepare exam learn write number numbers time date dates price prices letter email question say mean means difference between when why which word words sentence'.split(
    ' ',
  ),
);
// words of another list ("in", "an", "um", "des", "es") stand here too, so they vote for both and the rest decides
const DE_WORDS = new Set(
  'ich du wir der die das ein eine und ist sind nicht bitte mit fur fuer wie was kann mochte moechte will uben ueben lernen prufung pruefung hilf mir mich auf zu in an um des zahlen uhrzeit datum preise brief mal noch schreib schreiben sag heisst heißt unterschied zwischen wann warum welche wort satz es sie er hat habe bin war'.split(
    ' ',
  ),
);
// the other tutor languages, without accents (see `plain`): the words a learner's question is likely to contain
const FR_WORDS = new Set(
  'le la les un une des et est je tu vous nous il elle on ce cette que qui pour avec dans comment quelle quel pourquoi quand entre peux pouvez corriger phrase mot mots veut dire difference niveau suis exemple explique traduis'.split(' '),
);
const ES_WORDS = new Set(
  'el los las un una unos y es soy estoy yo usted como que para con por cual cuando entre puedes corregir frase palabra palabras significa diferencia nivel ejemplo explica traduce dice'.split(' '),
);
const IT_WORDS = new Set(
  'il lo gli le un una uno e che per con come cosa quale quando tra fra puoi correggere frase parola parole significa differenza livello sono esempio spiega traduci dice'.split(' '),
);
const PT_WORDS = new Set(
  'o os as um uma uns umas e que para com como qual quando entre voce pode corrigir frase palavra palavras significa diferenca nivel estou exemplo explique traduza diz'.split(' '),
);
const VOTERS: [Lang, Set<string>][] = [
  ['en', EN_WORDS],
  ['de', DE_WORDS],
  ['fr', FR_WORDS],
  ['es', ES_WORDS],
  ['it', IT_WORDS],
  ['pt', PT_WORDS],
];

/** Latin letters without their accents ("é" -> "e", "ç" -> "c"), so the word lists above can be plain. */
const plain = (t: string) =>
  t
    .replace(/[àáâãå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõ]/g, 'o')
    .replace(/[ùúû]/g, 'u')
    .replace(/[ç]/g, 'c')
    .replace(/[ñ]/g, 'n');

/** How many common function words of each tutor language the text contains: the votes behind `detectLang`. */
export function langVotes(text: string): Record<Lang, number> {
  const words = plain(normalise(text)).split(/[^a-z0-9]+/).filter(Boolean);
  const votes: Record<Lang, number> = { en: 0, de: 0, fr: 0, es: 0, it: 0, pt: 0, ru: 0, zh: 0 };
  for (const w of words) for (const [lang, set] of VOTERS) if (set.has(w)) votes[lang] += 1;
  if (/[\u4e00-\u9fff]/.test(text)) votes.zh += 3;
  if (CYRILLIC.test(text)) votes.ru += 3;
  return votes;
}

/** Cyrillic, Arabic, Hebrew, Devanagari, Greek, Thai… or Polish/Turkish letters: a script the word lists above cannot read. */
const FOREIGN = /[\u0400-\u04ff\u0530-\u058f\u0590-\u05ff\u0600-\u06ff\u0900-\u097f\u0e00-\u0e7f\u0370-\u03ff\u3040-\u30ff\uac00-\ud7af]|[ąćęłńśźżĄĆĘŁŃŚŹŻğışİĞŞ]/;
export const foreignScript = (text: string) => FOREIGN.test(text);

const CYRILLIC = /[\u0400-\u04ff]/;
/** Letters Ukrainian and Belarusian use and Russian does not. */
const NOT_RUSSIAN = /[іїєґўІЇЄҐЎ]/;
/** Letters Russian uses and Ukrainian does not. */
const RUSSIAN_ONLY = /[ыэъёЫЭЪЁ]/;
/**
 * Cyrillic text the tutor answers in Russian: the learner explains in Russian anyway, or the letters are Russian's
 * and not Ukrainian's. Other Cyrillic (a Ukrainian question from a learner who explains in English) stays with the
 * fallback rather than being answered in Russian.
 */
export const isRussian = (text: string, fallback: Lang = 'en') => CYRILLIC.test(text) && (fallback === 'ru' || (RUSSIAN_ONLY.test(text) && !NOT_RUSSIAN.test(text)));

/**
 * The language a German line is translated into for a learner who explains in `lang`: the learner's language
 * where the model translates German into it reliably (probed on v23: French, Spanish, Italian; Portuguese and
 * Chinese glosses had wrong words or flipped to English, and Russian glosses on the phone negated the sentence or
 * copied the German), English otherwise, and never German itself.
 */
export const translationTarget = (lang: Lang): Lang => (GLOSS_LANGUAGES.has(lang) ? lang : 'en');
const GLOSS_LANGUAGES: Set<Lang> = new Set<Lang>(['en', 'fr', 'es', 'it']);

/**
 * The language the learner writes in, which is the language the tutor answers in. `fallback` (the learner's
 * explanation language) decides ties and messages in a language the model does not handle.
 */
export function detectLang(text: string, fallback: Lang = 'en'): Lang {
  if (isRussian(text, fallback)) return 'ru';
  if (foreignScript(text)) return fallback;
  const votes = langVotes(text);
  // most votes first; in a tie German comes last, since the German words are usually the sentence being asked about
  const ranked = (Object.keys(votes) as Lang[]).sort((a, b) => votes[b] - votes[a] || (a === 'de' ? 1 : b === 'de' ? -1 : 0));
  const [best, second] = ranked;
  if (votes[best] > 0 && votes[best] > votes[second]) return best;
  if (votes[best] > 0 && votes[best] === votes[second]) {
    // umlauts decide a tie with German; otherwise the fallback wins when it is in the tie
    if (/[äöüß]/i.test(text) && votes.de === votes[best]) return 'de';
    return votes[fallback] === votes[best] ? fallback : best;
  }
  return /[äöüß]/i.test(text) ? 'de' : fallback;
}

export const wordCount = (text: string) =>
  String(text)
    .split(/\s+/)
    .filter((w) => /[A-Za-z0-9ÄÖÜäöüß]/.test(w)).length;

export type Intent = { intent: 'ask' } | { intent: 'check'; text: string } | { intent: 'translate'; text: string };

// English and German cues first (the trained wording), then the other tutor languages: French, Spanish,
// Italian, Portuguese ("corrige", "¿puedes corregir…?", "correggi", "corrija"; "comment dit-on", "cómo se
// dice", "come si dice", "como se diz"). `normalise` lowercases but keeps accents.
const CHECK_CUE =
  /\b(check|correct|korrigier\w*|pruf\w* (mal|bitte|das|den|meinen)|pruef\w* (mal|bitte|das|den|meinen)|is (this|that|it) (correct|right|ok)|ist das (richtig|korrekt|so richtig)|feedback|verbessern?|fehler|corrig\w*|correg\w*|corre[gz]i\w*|corrija|c'est correct|es correcto|è corretto|está correto|esta correto)\b/;
const TRANSLATE_CUE =
  /^(wie sag(t|e) (man|ich)|was heisst|how do (you|i) say|how would (you|i) say|what'?s .{1,40} in german|translate|comment (dit-on|on dit|dire)|c[oó]mo se dice|come si dice|como se diz|tradu(is|ce|ci|za|zca|zir|ire))\b/;
// the Russian cues ("проверь", "исправь", "это правильно?"; "как сказать … по-немецки", "переведи"): \b does not see
// Cyrillic letters, so the word boundaries are spelt out
const CHECK_CUE_RU = /(^|[^а-яё])(провер(ь|ьте|ить)|исправ(ь|ьте|ить|лени[ея])|поправ(ь|ьте)|правильно ли|(это|так) правильно|ошибк[аи]|без ошибок)(?![а-яё])/;
// "Formuliere ohne Passiv: Der Antrag muss …", "Rewrite in indirect speech: …": an instruction before a colon makes
// the German sentence a task for the tutor, not a sentence to check (C1 learners paste such rewrites all the time)
const TASK_CUE =
  /^(formulier\w*|schreib\w*|bild\w*|setz\w*|wandl\w*|verwandl\w*|ersetz\w*|nominalisier\w*|verbalisier\w*|verk(u|ue)rz\w*|erg(a|ae)nz\w*|verbind\w*|rewrite|rephrase|reword|put|turn|change|convert|transform|express|nominali[sz]e|paraphrase|shorten|combine)\b[^:?\n]{0,60}:\s*\S/;
const TRANSLATE_CUE_RU = /^(как (сказать|будет|это будет|это по-немецки|по-немецки)|переведи(те)?|скажи(те)? по-немецки)(?![а-яё])/;

function extractCheckBody(raw: string): string {
  const colon = raw.indexOf(':');
  if (colon >= 0 && colon < 60) return raw.slice(colon + 1).trim().replace(/^["'„“«]|["'“”»]$/g, '');
  const q = raw.indexOf('?');
  if (q >= 0 && q < 60 && wordCount(raw.slice(q + 1)) >= 3) return raw.slice(q + 1).trim();
  const quoted = raw.match(/["„“«']([^"“”»']{6,})["“”»']/);
  if (quoted) return quoted[1].trim();
  const lines = raw
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length > 1) return lines.slice(1).join('\n');
  return '';
}

/** Route a free chat message. Never fails: anything unrecognised is a question for the tutor. */
export function route(text: string): Intent {
  const raw = String(text).trim();
  const n = normalise(raw).replace(/^[¿¡\s]+/, '');
  if (TRANSLATE_CUE.test(n) || TRANSLATE_CUE_RU.test(n)) return { intent: 'translate', text: raw };
  if (CHECK_CUE.test(n) || CHECK_CUE_RU.test(n)) {
    const body = extractCheckBody(raw);
    return { intent: 'check', text: body || raw };
  }
  if (TASK_CUE.test(n)) return { intent: 'ask' };
  // a German statement with no question mark is most likely a sentence to be checked
  if (!/\?/.test(raw) && wordCount(raw) >= 4 && detectLang(raw) === 'de') return { intent: 'check', text: raw };
  return { intent: 'ask' };
}

// ------------------------------------------------------------------------------------------------
// questions the engines answer without the model ("how do you say 94?", "14:30 auf Deutsch?")
// ------------------------------------------------------------------------------------------------

const FACT_CUE = /\b(how|wie|say|sagt|sag|schreib|write|spell|read|lies|pronounce|ausgesprochen|words?|worte?n?|german|deutsch|heisst|heißt|spoken|gesprochen)\b/i;

export interface FactAnswer {
  category: 'numbers' | 'clock' | 'dates' | 'prices';
  /** The figure as written in the question ("10:30", "3,40 €"). */
  value: string;
  /** The computed German, e.g. "halb elf". */
  answer: string;
  /** Every reading the engines accept (formal, everyday, regional). */
  accepted: string[];
  note: string;
}

/**
 * The computed answer to a "how do you say <number|time|date|price>" question, or null. The engines are
 * the same ones the model's drills were built from, so their answer is correct by construction.
 */
export function answerFactual(text: string, lang: Lang = 'en'): FactAnswer | null {
  const raw = String(text);
  if (!FACT_CUE.test(raw) || wordCount(raw) > 16) return null;
  const t = (en: string, de: string) => (lang === 'de' ? de : en);
  const price = raw.match(/(\d{1,5})[,.](\d{2})\s*(€|euros?|eur)(?![a-z])|(€|eur)\s*(\d{1,5})[,.](\d{2})/i);
  const clock = raw.match(/\b(\d{1,2})[:.](\d{2})\s*(uhr|h)?\b/i);
  const date = raw.match(/\b(\d{1,2})\.\s?(\d{1,2})\.(?!\d)/);
  const rest = raw.replace(/\d{1,5}[,.]\d{2}\s*(€|euros?|eur)|(€|eur)\s*\d{1,5}[,.]\d{2}|\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\.\s?\d{1,2}\./gi, ' ');
  // a digit glued to a letter is a level (C1, B2) or a code (A4, Q5), not a number to say
  const ints = [...rest.matchAll(/(?:^|[^\d.,:A-Za-zÄÖÜäöüß])(\d{1,7})(?![\d]|[.,:]\d)/g)].map((m) => Number(m[1]));
  const entities = [price, clock, date].filter(Boolean).length + ints.length;
  if (entities !== 1) return null;
  if (price) {
    const euros = Number(price[1] ?? price[5]);
    const cents = Number(price[2] ?? price[6]);
    const p = priceToGerman(euros, cents);
    return {
      category: 'prices',
      value: p.written,
      answer: p.spoken,
      accepted: [p.spoken],
      note: t('Written with a comma; spoken with "Euro" between euros and cents.', 'Geschrieben mit Komma; gesprochen steht „Euro“ zwischen Euro und Cent.'),
    };
  }
  if (clock && Number(clock[1]) < 24 && Number(clock[2]) < 60) {
    const c = clockToGerman(Number(clock[1]), Number(clock[2]));
    return {
      category: 'clock',
      value: c.digital,
      answer: c.formal,
      accepted: [c.formal, c.informal, c.regional].filter(Boolean),
      note: t(`Everyday: ${c.informal}${c.regional ? ` (regional: ${c.regional})` : ''}.`, `Alltag: ${c.informal}${c.regional ? ` (regional: ${c.regional})` : ''}.`),
    };
  }
  if (date && Number(date[1]) >= 1 && Number(date[1]) <= 31 && Number(date[2]) >= 1 && Number(date[2]) <= 12) {
    const d = dateToGerman(Number(date[1]), Number(date[2]));
    return {
      category: 'dates',
      value: `${date[1]}.${date[2]}.`,
      answer: d.nominative,
      accepted: [d.nominative, d.dative],
      note: t(`After "am": ${d.dative}.`, `Nach „am“: ${d.dative}.`),
    };
  }
  if (ints.length === 1 && ints[0] <= 999_999) {
    const n = ints[0];
    const inYearRange = n >= 1100 && n <= 1999 && /\b(jahr|year)\b/i.test(raw);
    const answer = inYearRange ? yearToGerman(n) : numberToGerman(n);
    const parts: string[] = [];
    if (n % 100 >= 21 && n % 10) parts.push(t('units before tens, joined with "und"', 'Einer vor Zehner, verbunden mit „und“'));
    if (n >= 1100 && n <= 1999 && !inYearRange) parts.push(t(`as a year: ${yearToGerman(n)}`, `als Jahreszahl: ${yearToGerman(n)}`));
    return { category: 'numbers', value: String(n), answer, accepted: [answer], note: parts.join('; ') };
  }
  return null;
}
