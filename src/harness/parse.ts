// Reading the model's answers. The formats here are the ones the model was trained to write and that the
// probes against the v16 release show: the corrected sentence in bold on the first line, word lists as
// numbered "**article noun** (plural) – meaning" items with an example line, card-shaped grammar answers.
// Every parser is tolerant: anything it cannot read is shown as the model wrote it.

import { compact, normalise } from './engines';
import type { Article } from './lexicon';
import { detectLang } from './route';

const stripMd = (s: string) => s.replace(/\*\*|__|[*_`]/g, '').trim();
const unquote = (s: string) => s.replace(/^[\s"'„“‚‘«»]+|[\s"'“”‘’«»]+$/g, '').trim();

// ------------------------------------------------------------------------------------------------
// corrections
// ------------------------------------------------------------------------------------------------

export interface Correction {
  /** The corrected sentence or text, when the model put one first. */
  corrected: string | null;
  /** True when the corrected text is the learner's own text: nothing to fix. */
  unchanged: boolean;
  /** The explanation after the corrected text (Fix / Reason lines, a list of mistakes), as Markdown. */
  explanation: string;
}

// the labels the model puts before the corrected sentence, in the languages it answers in (English, German,
// French, Spanish, Italian, Portuguese, Russian); Chinese answers start with the bold sentence itself
const CORRECTED_LABEL =
  'corrected(?: sentence| text| version)?|correction|korrigiert(?:er satz|er text)?|korrektur|richtig|correct|phrase corrigée|corrigée?|corrección|frase corregida|corregid[ao]|correzione|frase corretta|corrett[ao]|correção|frase corrigida|corrigid[ao]|исправлен(?:о|ное предложение|ный текст|ный вариант)|исправление|правильн(?:о|ый вариант|ое предложение)|корректн(?:о|ый вариант|ое предложение|ый текст)|верный вариант';
const LABEL_LINE = new RegExp(`^\\s*(?:\\*\\*)?(${CORRECTED_LABEL})(?:\\*\\*)?\\s*:?\\s*(?:\\*\\*)?\\s*:?\\s*$`, 'i');
/** A short line that only announces what follows ("Here is the correction:", a label in a wording we do not list). */
const LABEL_SHAPED = /^\s*(?:\*\*)?[^*\n]{2,60}?:\s*(?:\*\*)?\s*$/;
const INLINE_LABEL = new RegExp(`^\\s*(?:\\*\\*)?(${CORRECTED_LABEL.replace('|correction|', '|').replace('|correct|', '|')})\\s*:\\s*(?:\\*\\*)?\\s*`, 'i');
/** The start of the explanation under a corrected text: a list, or a Fix/Reason/Rule/Mistakes label in any answer language. */
const EXPLANATION_START =
  /^\s*(\d+[.)]|[-*•]|fix|reason|grund|regel|mistakes?|fehler|motivo|raison|razón|razon|ragione|règle|regla|regola|regra|erreurs?|errores?|errori|erros?|explication|explicación|spiegazione|explicação|corrección|correzione|correção|исправлени[ея]|причина|правило|ошибк[аи]|объяснение|пояснение|совет|что (?:я )?исправил|что было не так|изменени[ея])/i;

export function parseCorrection(answer: string, original: string): Correction {
  const lines = answer.replace(/\r/g, '').split('\n');
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i += 1;
  let corrected: string | null = null;
  let rest = i;
  const first = lines[i] ?? '';
  if (LABEL_LINE.test(first) || LABEL_SHAPED.test(first)) {
    // "**Corrected sentence:**" on its own line, the sentence (often a > quote) on the next one
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j += 1;
    if (j < lines.length) {
      corrected = unquote(stripMd(lines[j].replace(/^\s*>\s?/, '')));
      rest = j + 1;
    }
  } else {
    const inline = first.replace(INLINE_LABEL, '');
    const bold = /^\s*(?:>\s*)?\*\*(.+?)\*\*\s*$/.exec(inline) ?? /^\s*(?:>\s*)?\*\*(.+?)\*\*/.exec(inline);
    if (bold) {
      corrected = unquote(bold[1]);
      rest = i + 1;
    } else if (INLINE_LABEL.test(first)) {
      corrected = unquote(stripMd(inline));
      rest = i + 1;
    }
  }
  // a longer text: the corrected text may run over several lines up to the first blank line
  if (corrected && original.split(/\n/).length > 1) {
    const more: string[] = [];
    let j = rest;
    while (j < lines.length && lines[j].trim() && !EXPLANATION_START.test(lines[j])) {
      more.push(stripMd(lines[j]));
      j += 1;
    }
    if (more.length) {
      corrected = [corrected, ...more].join('\n');
      rest = j;
    }
  }
  const unchanged = Boolean(corrected) && compact(corrected as string) === compact(original);
  let explanation = lines.slice(rest).join('\n').trim();
  if (unchanged) {
    // a "Fix: 'x' -> 'x'" line that changes nothing is noise
    explanation = explanation
      .split('\n')
      .filter((l) => {
        const m = /^(?:fix|korrektur|correction|corrección|correzione|correção)\s*:\s*['"„‚«](.+?)['"“‘»]\s*(?:->|→)\s*['"„‚«](.+?)['"“‘»]/i.exec(l.trim());
        return !(m && compact(m[1]) === compact(m[2]));
      })
      .join('\n')
      .trim();
  }
  return { corrected, unchanged, explanation };
}

// ------------------------------------------------------------------------------------------------
// word lists
// ------------------------------------------------------------------------------------------------

export interface VocabItem {
  article: Article | null;
  lemma: string;
  plural: string | null;
  /** True when the model says the noun has no (everyday) plural. */
  noPlural: boolean;
  meaning: string;
  example: string | null;
  exampleGloss: string | null;
}

const NUMBERED_HEAD = /^\s*\d+[.)]\s+(.*)$/;
const BULLET_HEAD = /^\s*[-*•]\s+(.*)$/;
const NOUN = /\b(der|die|das)\s+([A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?)/;
const SPLIT_GLOSS = /\s+[–—-]\s+|\s+=\s+/;
/** ", -en", ", ¨-e", ", -" right after the lemma: the dictionary way of giving the plural (an umlaut mark, an ending). */
const PLURAL_SUFFIX = /^\s*,\s*([¨"˝\u0308]?)\s*-\s*([¨"˝\u0308]?)([a-zäöüß]*)(?=$|[\s,;:()–—-])/;
/** The same inside parentheses: "(-en)", "(¨-er)". */
const PAREN_SUFFIX = /^\s*([¨"˝\u0308]?)\s*-\s*([¨"˝\u0308]?)([a-zäöüß]*)\s*$/;
const NO_PLURAL =
  /^\s*[–—-]\s*$|no plural|kein plural|nur singular|singular only|ohne plural|only singular|pas de pluriel|sin plural|senza plurale|sem plural|singulier seulement|solo singular|solo singolare|só singular|нет множественного числа|без множественного числа|только единственное число|только ед\. ?ч\./i;
/** A line under an item that is about the item, not an example: a plural note, an aside, a tip. */
const NOTE_LINE =
  /^\s*\(|^\s*(?:plural|pl\.?|also|note|hinweis|tipp|tip|beachte|achtung|merke|synonym|gegenteil|opposite|pluriel|nota|remarque|astuce|consejo|suggerimento|dica|attention|atención|attenzione|atenção|contraire|contrario|opposto|oposto)\b|^\s*(?:множественное число|мн\. ?ч\.|примечание|совет|синоним|антоним|обратите внимание)(?![а-яё])/i;
/** A sentence about the word rather than with it: "die Erfahrung, -en is feminine and takes die in the plural." */
const WORD_NOTE = /,\s*[¨"˝\u0308]?-[a-zäöüß]*(?=$|[\s,;:()*–—-])|\b(?:is|ist)\s+(?:feminine|masculine|neuter|feminin|maskulin|neutral|plural|singular)|\b(?:gender|genus|takes\s+(?:der|die|das)|the plural)\b/i;

/** "**1. das Brot**" -> "1. das Brot**": the model sometimes bolds the number with the noun. */
const unboldNumber = (line: string) => line.replace(/^\s*\*\*\s*(?=\d+[.)])/, '');

/** The umlaut a plural mark puts on the lemma's last a, o, u or au (Apfel -> Äpfel, Haus -> Häus-, Buch -> Büch-). */
function umlauted(lemma: string): string {
  const at = Math.max(lemma.lastIndexOf('a'), lemma.lastIndexOf('o'), lemma.lastIndexOf('u'), lemma.lastIndexOf('A'), lemma.lastIndexOf('O'), lemma.lastIndexOf('U'));
  if (at === -1) return lemma;
  // "au" counts as one vowel: the a takes the umlaut
  const start = lemma[at] === 'u' && at > 0 && /[aA]/.test(lemma[at - 1]) ? at - 1 : at;
  const map: Record<string, string> = { a: 'ä', o: 'ö', u: 'ü', A: 'Ä', O: 'Ö', U: 'Ü' };
  return lemma.slice(0, start) + map[lemma[start]] + lemma.slice(start + 1);
}

/** The plural a suffix note stands for: "-en" appended, an umlaut mark applied, a bare "-" meaning no change. */
const pluralFromSuffix = (lemma: string, umlaut: boolean, ending: string) => (umlaut ? umlauted(lemma) : lemma) + ending;

/** An example sentence line with its gloss: "Das Brot ist frisch. – The bread is fresh." or "… frisch. (The bread is fresh.)". */
function readExample(line: string): { example: string; gloss: string | null } | null {
  const text = stripMd(line.replace(/^\s*[-*•]\s+/, '').trim());
  if (!text || !/[.!?]/.test(text)) return null;
  const paren = /^(.*?[.!?]["“”]?)\s*\(([^()]+)\)\s*$/.exec(text);
  if (paren) return { example: unquote(paren[1]), gloss: unquote(paren[2]) };
  const parts = text.split(SPLIT_GLOSS);
  const example = unquote(parts[0] ?? '');
  if (!example) return null;
  return { example, gloss: parts.length > 1 ? unquote(parts.slice(1).join(' – ')) : null };
}

/**
 * Reads word-list items, each with an optional example sentence among the lines under it. The heads are the
 * numbered lines when there are any ("1. das Brot (die Brote) – bread", "**1. die Erfahrung, -en** (experience)"),
 * else the bulleted ones; under a numbered head, bullets are the item's example and notes, not further items.
 * The plural may be given in full ("(die Brote)") or as a suffix (", -en", "(¨-er)", ", -" for no change).
 */
export function parseVocabList(answer: string): VocabItem[] {
  const lines = answer.replace(/\r/g, '').split('\n').map(unboldNumber);
  const numbered = lines.some((l) => NUMBERED_HEAD.test(l) && NOUN.test(stripMd(l)));
  const headOf = (line: string) => (numbered ? NUMBERED_HEAD : BULLET_HEAD).exec(line);
  const items: VocabItem[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const head = headOf(lines[i]);
    if (!head) continue;
    const plain = stripMd(head[1]);
    const noun = NOUN.exec(plain);
    // the noun opens the item; a noun mentioned later in a sentence is not a word-list entry
    if (!noun || (noun.index ?? 0) > 3) continue;
    const lemma = noun[2];
    let afterNoun = plain.slice((noun.index ?? 0) + noun[0].length);
    let plural: string | null = null;
    let noPlural = false;
    let meaning: string | null = null;

    const suffix = PLURAL_SUFFIX.exec(afterNoun);
    if (suffix) {
      plural = pluralFromSuffix(lemma, Boolean(suffix[1] || suffix[2]), suffix[3]);
      afterNoun = afterNoun.slice(suffix[0].length);
    }
    const paren = /^\s*\(([^)]*)\)/.exec(afterNoun);
    if (paren) {
      const inside = paren[1];
      const asSuffix = PAREN_SUFFIX.exec(inside);
      const full = /(?:die\s+|pl\.?\s*:?\s*|plural:?\s*)?([A-ZÄÖÜ][a-zäöüß]+)/.exec(inside);
      if (NO_PLURAL.test(inside)) noPlural = true;
      else if (asSuffix) plural ??= pluralFromSuffix(lemma, Boolean(asSuffix[1] || asSuffix[2]), asSuffix[3]);
      else if (full) plural ??= full[1];
      else meaning = inside.trim(); // "(experience)": no German noun inside, so this is the meaning
      afterNoun = afterNoun.slice(paren[0].length);
    }
    if (meaning === null) {
      // the meaning follows the last dash of the line ("… / die Ärztin (die Ärztinnen) – doctor"), or stands in parentheses at its end
      const parts = afterNoun.split(SPLIT_GLOSS);
      const tail = (parts.length > 1 ? parts[parts.length - 1] : afterNoun).replace(/^[\s:,=–—-]+/, '').trim();
      const tailParen = /^\(([^()]+)\)\s*$/.exec(tail);
      meaning = (tailParen ? tailParen[1] : tail).replace(/[.;]\s*$/, '').trim();
    }

    let example: string | null = null;
    let exampleGloss: string | null = null;
    // the example is the first sentence under the head that is not a note about the word, up to the next head
    for (let j = i + 1; j < lines.length && !headOf(lines[j]); j += 1) {
      const line = lines[j].trim();
      if (!line) {
        if (numbered) continue; // items may be separated by blank lines
        break;
      }
      const body = stripMd(line.replace(/^\s*[-*•]\s+/, ''));
      if (NOTE_LINE.test(body) || WORD_NOTE.test(body) || /^\s*\*\*/.test(line)) continue;
      const read = readExample(line);
      if (!read) continue;
      example = read.example;
      exampleGloss = read.gloss;
      break;
    }
    items.push({ article: noun[1] as Article, lemma, plural, noPlural, meaning, example, exampleGloss });
  }
  return items;
}

/** True once `n` items are complete: the n-th item's example line has ended (the model has moved on). */
export function vocabListComplete(answer: string, n: number): boolean {
  if (n <= 0) return false;
  const items = parseVocabList(answer);
  if (items.length < n) return false;
  const last = items[n - 1];
  const headAt = answer.indexOf(`${last.article} ${last.lemma}`);
  const at = headAt === -1 ? answer.lastIndexOf(last.lemma) : headAt;
  if (last.example !== null) {
    // the example's line has ended
    const exAt = answer.indexOf(last.example.slice(0, 24), at);
    if (exAt !== -1) return /\n/.test(answer.slice(exAt + last.example.length));
  }
  const rest = answer.slice(at);
  // head line + example line, both finished with a newline (or a blank line right after the head)
  return last.example !== null ? /\n[^\n]*\n/.test(rest) : /\n\s*\n/.test(rest);
}

// ------------------------------------------------------------------------------------------------
// phrases ("**1. Ich hätte gern ein Brötchen.**" + "(I would like a roll.)")
// ------------------------------------------------------------------------------------------------

export interface Phrase {
  german: string;
  english: string | null;
}

/** A line under a phrase that gives its English: "(gloss)", "- gloss", "→ gloss", "*gloss*", "Translation: gloss". */
const GLOSS_LINE = /^(?:[-–—→•*]\s*)?(?:\(?(?:translation|english|englisch|übersetzung|meaning|bedeutung)\s*:\s*\)?\s*)?(.+?)$/i;

/** The English of a phrase on the line below it, if the line is one; null when the line is the next phrase or German. */
function glossOf(line: string): string | null {
  if (!line.trim() || /^\s*(?:\*\*)?\s*\d+[.)]/.test(line)) return null;
  const m = GLOSS_LINE.exec(stripMd(line).trim());
  if (!m) return null;
  const text = unquote(m[1].replace(/^\(|\)$/g, ''));
  if (!text || !/[a-z]/i.test(text)) return null;
  // a bracketed or labelled line is the gloss whatever it looks like; a bare line must read as English
  const marked = /^\s*[-–—→•*(]|^\s*(?:translation|english|englisch|übersetzung|meaning|bedeutung)\s*:/i.test(stripMd(line).trim()) || /^\s*[(*"“]/.test(line.trim());
  return marked || detectLang(text) === 'en' ? text : null;
}

export function parsePhrases(answer: string): Phrase[] {
  const lines = answer
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim());
  const out: Phrase[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^(?:\*\*)?\s*\d+[.)]\s*(.+?)(?:\*\*)?$/.exec(lines[i]);
    if (!m) continue;
    let text = stripMd(m[1]);
    let english: string | null = null;
    const paren = /^(.*?[.!?]["“”]?)\s*\(([^()]+)\)\s*$/.exec(text);
    const slash = /^(.+?[.!?]["“”]?)\s+\/\s+(.+)$/.exec(text);
    const inline = text.split(SPLIT_GLOSS);
    if (paren) {
      text = paren[1];
      english = paren[2];
    } else if (slash) {
      text = slash[1];
      english = slash[2];
    } else if (inline.length > 1 && /[a-z]/.test(inline[1])) {
      text = inline[0];
      english = inline.slice(1).join(' – ');
    } else {
      // the gloss on the next line: "(I would like a roll.)", "- I would like a roll.", "*I would like a roll.*"
      let j = i + 1;
      while (j < lines.length && !lines[j]) j += 1;
      const gloss = glossOf(lines[j] ?? '');
      if (gloss) {
        english = gloss;
        i = j;
      }
    }
    text = unquote(text.replace(/\s*(?:[-–—:]|\/)\s*$/, ''));
    if (text.split(/\s+/).length >= 2 && /[a-zäöüß]/.test(text)) out.push({ german: text, english: english ? unquote(english) : null });
  }
  return out;
}

export const phrasesComplete = (answer: string, n: number) => {
  const items = parsePhrases(answer);
  return items.length >= n && items[n - 1].english !== null;
};

// ------------------------------------------------------------------------------------------------
// translations and first lines
// ------------------------------------------------------------------------------------------------

/** The first non-empty line, without Markdown and quotes: the translation the model leads with. */
export function firstLine(answer: string): string {
  const line = answer
    .replace(/\r/g, '')
    .split('\n')
    .find((l) => l.trim());
  return unquote(stripMd(line ?? '').replace(/^(translation|übersetzung|german|deutsch)\s*:\s*/i, ''));
}

/** True once the first line is complete: the rest of a translation answer is explanation we did not ask for. */
export const firstLineComplete = (answer: string) => /\S[^\n]*\n/.test(answer.replace(/^\s+/, ''));

// ------------------------------------------------------------------------------------------------
// session plans
// ------------------------------------------------------------------------------------------------

export interface PlanItem {
  id: string;
  why: string | null;
}

const NUMBERED_LINE = /^\s*(\d+[.)]|(aufgabe|task)\s*\d)/i;

export function planComplete(text: string, n: number): boolean {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/[*_`#>]/g, '').trim());
  return lines.filter((l) => NUMBERED_LINE.test(l)).length >= n && /\n\s*$/.test(text);
}

/**
 * Reads the task types out of a numbered plan, in order, one per line, duplicates dropped. Returns null when
 * fewer than three known types are found, so a misread plan falls back to a fixed plan, never to a wrong task.
 */
export function parsePlan(text: string, types: { id: string; alias: RegExp }[], n: number): PlanItem[] | null {
  const clean = (s: string) => s.replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map(clean)
    .filter((l) => NUMBERED_LINE.test(l));
  const out: PlanItem[] = [];
  for (const line of lines) {
    let best: { id: string; index: number; length: number } | null = null;
    for (const ty of types) {
      const m = ty.alias.exec(line);
      if (m && (!best || m.index < best.index)) best = { id: ty.id, index: m.index, length: m[0].length };
    }
    if (!best || best.index > 16 || out.some((o) => o.id === best.id)) continue;
    const rest = line
      .slice(best.index + best.length)
      .replace(/^[\s:–—.)-]*(?:\([^)]*\))?[\s:–—.-]*/, '')
      .replace(/[\s:;,.!"“”'-]+$/, '');
    // the reason ends at its first bracket or sentence end; what follows is the model teaching
    const reason = rest.split(/\s\(|[.!?](?:\s|$)/)[0].replace(/[\s:;,–—-]+$/, '').trim();
    let why = reason.length >= 12 && reason.split(/\s+/).length >= 3 ? reason : null;
    if (why && why.length > 140) why = `${why.slice(0, 140).replace(/\s+\S*$/, '')}…`;
    if (why) why = why.charAt(0).toUpperCase() + why.slice(1);
    out.push({ id: best.id, why });
    if (out.length >= n) break;
  }
  return out.length >= 3 ? out : null;
}

// ------------------------------------------------------------------------------------------------
// reference quotes in grammar answers ("Reference:" followed by "> " lines)
// ------------------------------------------------------------------------------------------------

export interface QuotedLine {
  /** The line as the model wrote it. */
  quoted: string;
  /** The bullet of the rule note it quotes, verbatim; null when no bullet is close. */
  source: string | null;
  exact: boolean;
}

/** The bullets of a grounding note, with wrapped continuation lines joined. */
export function noteBullets(note: string): string[] {
  const out: string[] = [];
  for (const line of note.split('\n')) {
    if (/^\s*-\s+/.test(line)) out.push(line.replace(/^\s*-\s+/, '').trim());
    else if (out.length && /^\s{2,}\S/.test(line)) out[out.length - 1] += ` ${line.trim()}`;
  }
  return out;
}

function similarity(a: string, b: string): number {
  const ta = new Set(normalise(a).split(/[^a-z0-9]+/).filter(Boolean));
  const tb = new Set(normalise(b).split(/[^a-z0-9]+/).filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  ta.forEach((w) => tb.has(w) && (inter += 1));
  return (2 * inter) / (ta.size + tb.size);
}

/** Checks each "> " line after a Reference label against the rule note it claims to quote. */
export function checkReferenceQuotes(answer: string, note: string | null): QuotedLine[] {
  const lines = answer.split('\n');
  const start = lines.findIndex((l) => /^\s*(?:\*\*)?(reference|referenz)(?:\*\*)?\s*:/i.test(l));
  if (start < 0) return [];
  const bullets = note ? noteBullets(note) : [];
  const out: QuotedLine[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const l = lines[i];
    if (!l.trim()) {
      if (out.length) break;
      continue;
    }
    if (!/^\s*>/.test(l)) break;
    const quoted = l.replace(/^\s*>\s?/, '').trim();
    let best: string | null = null;
    let score = 0;
    for (const b of bullets) {
      const s = similarity(quoted, b);
      if (s > score) {
        score = s;
        best = b;
      }
    }
    const exact = best !== null && compact(best) === compact(quoted);
    out.push({ quoted, source: score >= 0.5 ? best : null, exact });
  }
  return out;
}

/** Replaces misquoted reference lines with the note's own words, so the learner reads the verified text. */
export function repairReferenceQuotes(answer: string, checks: QuotedLine[]): string {
  let out = answer;
  for (const c of checks) {
    if (c.source && !c.exact) out = out.replace(c.quoted, c.source);
  }
  return out;
}
