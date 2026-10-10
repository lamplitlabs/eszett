// Translating a tutor answer line by line while leaving the German alone.
//
// The tutor writes its explanation in English (for app languages the model cannot explain in) and quotes German
// in bold, in quotes, in brackets or as "German – gloss" example lines. A machine translator would happily
// translate the German examples too, so each line is taken apart first: German spans are swapped for
// placeholders, the English around them is translated, and the spans are put back with their markers. When a
// placeholder goes missing the line is translated without masking and checked for the German spans; when that
// fails too the English line stays. Pure functions, tested in Node with a fake translator.

import { bilingual, englishWords, looksGerman, NOUN_SPAN } from '@/harness/german';
import { lineText, parseInline, type Span } from '@/harness/markdown';
import { langVotes } from '@/harness/route';

export type Translate = (text: string) => Promise<string>;
/** A lookup for standalone terms the translator gets wrong on their own (see ./glossary); null to translate. */
export type Glossary = (text: string) => string | null;

/** `[1]`, `[2]`… stand in for German spans while the English is translated; ML Kit carries them through. */
export const placeholder = (n: number) => `[${n}]`;
const PLACEHOLDER = /\[\s*(\d+)\s*\]/g;

/** Where a kept span sits while a line is taken apart; numbered into placeholders by order of appearance at the end. */
const mark = (n: number) => `\uE000${n}\uE000`;
const MARK = /\uE000(\d+)\uE000/g;

/** A leading marker the translator never sees: heading hashes, list bullets, numbering, quotes. */
const MARKER = /^(\s*(?:#{1,6}\s+|[-*•]\s+|\d+[.)]\s+|>\s+))/;

/** Quoted or bracketed stretches of German inside an English sentence. */
const QUOTED = /„([^“”"]+)[“”"]|«([^»]+)»|"([^"]+)"|\(([^()]+)\)/g;

/** The "German – gloss" separator `bilingual` splits on, found again in the raw line. */
const SEP = /\s[–—]\s|\s-\s|\s=\s/;

/** "German sentence. (English gloss)": the gloss in brackets at the end of the line. */
const GLOSSED = /^(.*\S)(\s*)\(([^()]+)\)\s*$/;

/** German grammar terms the tutor uses inside its English; they stay as they are. */
const TERM = /\b(Genitiv|Dativ|Akkusativ|Nominativ|Kasus|Perfekt|Präteritum|Plusquamperfekt|Präsens|Futur|Konjunktiv|Imperativ|Partizip|Infinitiv|Nebensatz|Nebensätze|Hauptsatz|Hauptsätze|Modalverb|Modalverben|Präposition|Präpositionen|Artikel|Umlaut|Umlaute)s?\b/g;

/** A span taken out of a line: German to put back as it was, or formatted English to translate on its own. */
export interface Masked extends Span {
  english?: boolean;
}

export interface MaskedLine {
  /** The English with placeholders where the German was. */
  text: string;
  /** The spans to put back, by placeholder number (1-based). */
  spans: Masked[];
}

const wrap = (s: Span): string => {
  let t = s.text;
  if (s.code) return `\`${t}\``;
  if (s.bold) t = `**${t}**`;
  if (s.italic) t = `_${t}_`;
  if (s.strike) t = `~~${t}~~`;
  return t;
};

/**
 * A stretch that reads as German: by the word lists, by its umlauts, by a capitalised noun after a small
 * word ("des Regens"), which English does not do, or — with no English function word in it — by one word of
 * four letters or more that reads as German on its own ("umgesetzt werden", "Guten Morgen").
 */
const germanish = (t: string) =>
  looksGerman(t) ||
  /[äöüßÄÖÜ]/.test(t) ||
  NOUN_SPAN.test(t) ||
  (englishWords(t) === 0 && (/\b[a-zäöüß]+ [A-ZÄÖÜ][a-zäöüß]+/.test(t) || t.split(/[\s,;:!?.…"„“”()]+/).some((w) => w.length >= 4 && looksGerman(w))));

/**
 * The tutor sets German in bold (or italics, or code). An emphasised English stretch gives itself away by its
 * function words or a label colon ("**Tip:**"); anything else emphasised is taken for German and protected —
 * at worst an English term stays English. A bold line of its own in sentence case ("**Key differences**") is a
 * heading, English unless it reads as German; a capital inside it ("**Guten Morgen**") is a German noun.
 */
const germanSpan = (s: Span, whole = false) => {
  if (!(s.bold || s.italic || s.code)) return false;
  const t = s.text.trim();
  if (!t) return false;
  if (germanish(t)) return true;
  if (whole && !s.code && t.split(/\s+/).length >= 2 && !/\s[A-ZÄÖÜ]/.test(t)) return false;
  return !/:$/.test(t) && englishWords(t) === 0;
};

/**
 * Takes a line apart: formatted spans and quoted/bracketed stretches that read as German become placeholders,
 * and so does formatted English ("**Tip:**"), which is translated on its own so the translator never sees a
 * Markdown marker. A quote that runs across formatting ("die Reform … **umgesetzt** wird") is protected whole,
 * markup included. Returns null when there is nothing to protect (the whole line can go to the translator as it is).
 */
export function maskGerman(line: string): MaskedLine | null {
  const kept: Masked[] = [];
  const keep = (s: Masked) => {
    kept.push(s);
    return mark(kept.length - 1);
  };
  const quoted = (m: string, a?: string, b?: string, c?: string, d?: string, markup = false): string => {
    const inner = a ?? b ?? c ?? d ?? '';
    if (markup !== /[*_`~]/.test(inner)) return m;
    // „…“ and «…» are the German quotation marks; "…" and (…) must read as German
    if (a === undefined && b === undefined && !germanish(markup ? lineText(parseInline(inner)) : inner)) return m;
    return keep({ text: m });
  };
  const pre = line.replace(QUOTED, (m, a, b, c, d) => quoted(m, a, b, c, d, true));
  const spans = parseInline(pre);
  let out = '';
  for (const s of spans) {
    if (germanSpan(s, spans.length === 1)) {
      out += keep(s);
      continue;
    }
    if (s.bold || s.italic || s.code || s.strike) {
      out += keep({ ...s, english: true });
      continue;
    }
    out += s.text.replace(QUOTED, (m, a, b, c, d) => quoted(m, a, b, c, d)).replace(TERM, (m) => keep({ text: m }));
  }
  if (!kept.length) return null;
  // a kept span may hold a mark itself (a quote inside bold): put that span back into it
  const resolve = (s: Masked): Masked => (s.text.includes('\uE000') ? { ...s, text: s.text.replace(MARK, (m, n) => wrap(resolve(kept[Number(n)]))) } : s);
  const ordered: Masked[] = [];
  const text = out.replace(MARK, (m, n) => {
    ordered.push(resolve(kept[Number(n)]));
    return placeholder(ordered.length);
  });
  return { text, spans: ordered };
}

/** Puts the German back; null when a placeholder was lost or doubled by the translator. */
export function unmask(translated: string, spans: Span[]): string | null {
  const seen = new Map<number, number>();
  for (const m of translated.matchAll(PLACEHOLDER)) {
    const n = Number(m[1]);
    seen.set(n, (seen.get(n) ?? 0) + 1);
  }
  for (let i = 1; i <= spans.length; i += 1) if (seen.get(i) !== 1) return null;
  return translated.replace(PLACEHOLDER, (m, n) => {
    const s = spans[Number(n) - 1];
    return s ? wrap(s) : m;
  });
}

/** A line that is itself German (an example sentence, a heading quoting a phrase): the translator leaves it alone. */
export function wholeGerman(body: string): boolean {
  const plain = lineText(parseInline(body)).trim();
  if (!plain) return false;
  const words = plain.split(/\s+/);
  if (words.length >= 3) return looksGerman(plain) && englishWords(plain) <= 1 && !/^[a-z]+:\s/i.test(plain.slice(0, 14));
  return looksGerman(plain) && englishWords(plain) === 0;
}

/** Formatted English inside a line ("**Tip:**", "**Key differences**"), translated on its own; a label keeps its colon. */
async function translateSpan(s: Masked, translate: Translate, glossary?: Glossary): Promise<Masked> {
  const text = s.text.trim();
  if (!text) return s;
  const term = glossary?.(text) ?? null;
  let out = term ?? (await translate(text));
  if (/:$/.test(text) && !/:$/.test(out)) out = `${out}:`;
  return { ...s, text: out };
}

/** Translates one line's body (markers already stripped). */
export async function translateLine(body: string, translate: Translate, glossary?: Glossary): Promise<string> {
  if (!body.trim()) return body;

  // "German – gloss": only the gloss is translated
  if (bilingual(parseInline(body))) {
    const m = SEP.exec(body);
    if (m) {
      const left = body.slice(0, m.index + m[0].length);
      const right = body.slice(m.index + m[0].length);
      return left + (await translateLine(right, translate, glossary));
    }
  }
  // "German sentence. (English gloss)": the same, with the gloss in brackets
  const glossed = GLOSSED.exec(body);
  if (glossed && englishWords(glossed[3]) >= 2) {
    const left = glossed[1];
    const plain = lineText(parseInline(left)).trim();
    if (wholeGerman(left) || (englishWords(plain) === 0 && germanish(plain))) {
      return `${left}${glossed[2]}(${await translateLine(glossed[3], translate, glossary)})`;
    }
  }
  if (wholeGerman(body)) return body;

  // a standalone term ("Case", "**Tip:**") comes from the glossary, formatting kept
  if (glossary) {
    const spans = parseInline(body);
    const term = spans.length === 1 ? glossary(spans[0].text) : null;
    if (term !== null) return wrap({ ...spans[0], text: term });
  }

  const masked = maskGerman(body);
  if (!masked) return translate(body);

  const spans = await Promise.all(masked.spans.map((s) => (s.english ? translateSpan(s, translate, glossary) : s)));
  // the line was one formatted English span: nothing else to translate
  if (masked.text.trim() === placeholder(1) && spans.length === 1) return masked.text.replace(placeholder(1), wrap(spans[0]));

  const first = unmask(await translate(masked.text), spans);
  if (first !== null) return first;

  // fallback: translate the line whole and make sure every German span survived verbatim
  const whole = await translate(body);
  let out = whole;
  for (const s of masked.spans) {
    if (s.english) continue;
    if (whole.includes(wrap(s))) continue;
    if (!whole.includes(s.text)) return body;
    out = out.replace(s.text, wrap(s));
  }
  return out;
}

/** Translates a table row cell by cell; separator rows (`|---|---|`) pass through. */
async function translateRow(line: string, translate: Translate, glossary?: Glossary): Promise<string> {
  const trimmed = line.trim();
  if (/^\|?\s*:?-{2,}/.test(trimmed)) return line;
  const lead = trimmed.startsWith('|');
  const trail = trimmed.length > 1 && trimmed.endsWith('|');
  const cells = trimmed
    .slice(lead ? 1 : 0, trail ? -1 : undefined)
    .split('|')
    .map((c) => c.trim());
  const done = await Promise.all(cells.map((c) => translateLine(c, translate, glossary)));
  return `${lead ? '| ' : ''}${done.join(' | ')}${trail ? ' |' : ''}`;
}

/**
 * Translates a Markdown answer line by line. Blank lines, markers, tables and German stay as they are; lines the
 * translator cannot be trusted with keep their English.
 */
export async function translateMarkdown(text: string, translate: Translate, glossary?: Glossary): Promise<string> {
  const out = await Promise.all(
    text.split('\n').map(async (line) => {
      if (!line.trim()) return line;
      try {
        if (/^\s*\|/.test(line)) return await translateRow(line, translate, glossary);
        const marker = MARKER.exec(line)?.[1] ?? '';
        return marker + (await translateLine(line.slice(marker.length), translate, glossary));
      } catch {
        return line;
      }
    }),
  );
  return out.join('\n');
}

/**
 * True when the prose of an answer reads as English: its lines that are not German, with their German spans taken
 * out, carry more English function words than those of any other language. The tutor sometimes answers in German
 * (or in the question's language) whatever it was asked in, and such an answer must not go through an
 * English translator — the German would come out as nonsense.
 */
export function readsEnglish(text: string): boolean {
  const prose = text
    .split('\n')
    .map((line) => {
      if (!line.trim() || /^\s*\|?\s*:?-{2,}/.test(line)) return '';
      const body = line.slice((MARKER.exec(line)?.[1] ?? '').length).replace(/\|/g, ' ');
      if (wholeGerman(body)) return '';
      return maskGerman(body)?.text ?? body;
    })
    .join('\n');
  const votes = langVotes(prose);
  const others = Math.max(...Object.entries(votes).map(([lang, n]) => (lang === 'en' ? 0 : n)));
  return votes.en > 0 && votes.en >= others;
}
