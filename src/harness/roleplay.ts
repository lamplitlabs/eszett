// Role-play scenes. The situation card (who you are, who they are, the facts that are true) belongs to the
// app; the model plays the other person. The prompt is the exact shape the model was trained on (four
// frames, ADR-019 in the licht toolkit), and every reply is checked the way the release gate checks it:
// in character, German, one or two sentences, a question at the end, no figure the card does not contain.

import { normalise } from './engines';
import type { Level } from './levels';

export interface SceneFact {
  key: string;
  label_de: string;
  label_en: string;
  value: string;
  alts: string[];
}

export interface SceneBeat {
  learner: string[];
  errors: string[];
  reply: string;
  gloss: string;
  asks: string | null;
}

export interface SceneCard {
  key: string;
  level: Level;
  situation_de: string;
  situation_en: string;
  place: string;
  role_de: string;
  role_en: string;
  learner_de: string;
  learner_en: string;
  register: 'Sie' | 'du';
  facts: SceneFact[];
  opening: string;
  opening_gloss: string;
  beats: SceneBeat[];
}

export type Frame = 'de-a' | 'de-b' | 'en-a' | 'en-b';
export const FRAMES: Frame[] = ['en-a', 'de-a', 'en-b', 'de-b'];
export type TranscriptLine = [speaker: string, line: string];

const ARTICLES = ['der ', 'die ', 'das ', 'ein ', 'eine '];

/** "die Friseurin" -> "Friseurin": the label used in the transcript and the instruction line. */
export function speakerLabel(role: string): string {
  const low = role.toLowerCase();
  for (const a of ARTICLES) if (low.startsWith(a)) return role.slice(a.length).trim();
  return role.trim();
}

const EXAMPLE_LINES: Record<'Sie' | 'du', [string, string][]> = {
  Sie: [
    ['Bäcker', 'Gern, zwei Brötchen. Darf es sonst noch etwas sein?'],
    ['Kellner', 'Einen Moment, ich bringe die Karte. Möchten Sie schon etwas trinken?'],
    ['Verkäuferin', 'Die Jacke gibt es auch in Blau. Welche Größe brauchen Sie?'],
    ['Busfahrer', 'Bis zum Rathaus sind es drei Stationen. Haben Sie schon eine Fahrkarte?'],
    ['Bibliothekarin', 'Die Ausleihe dauert vier Wochen. Haben Sie schon einen Bibliotheksausweis?'],
  ],
  du: [
    ['Freund', 'Klar, ich bring dir das Buch morgen mit. Bist du um sechs zu Hause?'],
    ['Mitbewohnerin', 'Ich hab noch Nudeln da, die reichen für uns beide. Kochst du oder soll ich?'],
    ['Kollegin', 'Die Besprechung fängt gleich an, ich hol dich vorher ab. Hast du die Unterlagen dabei?'],
  ],
};

const REGISTER_LINE: Record<Frame, Record<'Sie' | 'du', string>> = {
  'de-a': { Sie: 'Wir sagen „Sie“.', du: 'Wir sagen „du“.' },
  'de-b': { Sie: 'Anrede: Sie.', du: 'Anrede: du.' },
  'en-a': { Sie: 'We use formal "Sie".', du: 'We use informal "du".' },
  'en-b': { Sie: 'Address: formal "Sie".', du: 'Address: informal "du".' },
};

/** An example line from another situation (never the card's own role), picked deterministically per turn. */
export function exampleFor(card: SceneCard, turn: number): [string, string] {
  const own = speakerLabel(card.role_de).toLowerCase();
  const pool = EXAMPLE_LINES[card.register].filter(([who]) => who.toLowerCase() !== own);
  const list = pool.length ? pool : EXAMPLE_LINES[card.register];
  return list[turn % list.length];
}

export function factsText(card: SceneCard, lang: 'de' | 'en'): string {
  return card.facts.map((f) => `- ${lang === 'de' ? f.label_de : f.label_en}: ${f.value}`).join('\n');
}

export const transcriptText = (t: TranscriptLine[]) => t.map(([who, line]) => `${who}: ${line}`).join('\n');

/** The prompt for the counterpart's next line, exactly as the model was trained on it. */
export function counterpartPrompt(
  card: SceneCard,
  transcript: TranscriptLine[],
  frame: Frame,
  helpLang: 'de' | 'en',
  example: [string, string] | null,
): string {
  const role = speakerLabel(card.role_de);
  const facts = factsText(card, frame.startsWith('de') ? 'de' : 'en');
  const dialogue = transcriptText(transcript);
  const register = REGISTER_LINE[frame][card.register];
  const where = card.place ? ` (${card.place})` : '';
  let lines: string[];
  if (frame === 'de-a') {
    lines = [
      `Rollenspiel: ${card.situation_de}. Du bist ${card.role_de}${where}. Ich bin ${card.learner_de}. ${register}`,
      'Fakten (nur diese gelten):',
      facts,
      'Bisheriger Dialog:',
      dialogue,
      `Antworte nur als ${role} mit der nächsten Zeile: 1-2 Sätze, Deutsch, am Ende eine Frage. Keine Korrektur, keine Erklärung, keine Übersetzung, keine Wortliste.`,
    ];
    if (helpLang === 'en') lines.push('Danach eine Zeile auf Englisch in Klammern: was du gesagt hast.');
    if (example) lines.push(`Beispiel (andere Situation) - ${example[0]}: „${example[1]}“`);
  } else if (frame === 'de-b') {
    lines = [
      `Wir üben: ${card.situation_de}. Deine Rolle: ${card.role_de}${where}. Meine Rolle: ${card.learner_de}. ${register}`,
      'Was du weißt (mehr nicht):',
      facts,
      'So weit sind wir:',
      dialogue,
      `Deine Aufgabe: nur die nächste Zeile als ${role}, 1-2 Sätze auf Deutsch, mit einer Frage am Ende. Bleib in der Rolle - nichts korrigieren, nichts erklären, nichts übersetzen.`,
    ];
    if (helpLang === 'en') lines.push('Schreib danach in Klammern einen englischen Satz, der sagt, was du gesagt hast.');
    if (example) lines.push(`Zum Beispiel (andere Situation) - ${example[0]}: „${example[1]}“`);
  } else if (frame === 'en-a') {
    lines = [
      `Role-play: ${card.situation_en}. You are ${card.role_en}${where}. I am ${card.learner_en}. ${register}`,
      'Facts (only these are true):',
      facts,
      'Dialogue so far:',
      dialogue,
      `Reply only with ${role}'s next line: 1-2 sentences in German, ending with a question. No correction, no explanation, no translation, no word list.`,
    ];
    if (helpLang === 'en') lines.push('Then add one line in English in parentheses saying what you said.');
    if (example) lines.push(`Example (different situation) - ${example[0]}: "${example[1]}"`);
  } else {
    lines = [
      `Let's practise: ${card.situation_en}. You play ${card.role_en}${where}; I play ${card.learner_en}. ${register}`,
      'What you know (nothing more):',
      facts,
      'Where we are:',
      dialogue,
      `Your job: only ${role}'s next line, 1-2 sentences of German, with a question at the end. Stay in character - do not correct, explain, or translate anything.`,
    ];
    if (helpLang === 'en') lines.push('Afterwards, in parentheses, one English sentence saying what you said.');
    if (example) lines.push(`For example (different situation) - ${example[0]}: "${example[1]}"`);
  }
  return lines.join('\n');
}

// ------------------------------------------------------------------------------------------------
// reading and checking the model's line (a port of the release gate's roleplay_line)
// ------------------------------------------------------------------------------------------------

export type Tell =
  | 'empty'
  | 'meta_talk'
  | 'corrected_in_role'
  | 'invented_figure'
  | 'no_question'
  | 'too_long'
  | 'formatting'
  | 'not_german'
  | 'regreet'
  | 'repeat';

export interface CounterpartLine {
  german: string;
  gloss: string | null;
  tells: Tell[];
}

const ROLE_LABEL = /^(?:\*\*)?[A-ZÄÖÜ][\wäöüÄÖÜß '.\/-]{0,30}?(?::\*\*\s*|\*\*:\s*|:\s+)(?=\S)/;
const LABEL_ONLY = /^(?:\*\*)?[A-ZÄÖÜ][\wäöüÄÖÜß '.\/-]{0,30}?(?::\*\*|\*\*:|:)\s*$/;
const TRAILING_GLOSS = /\s*\(([^()]{3,})\)\s*$/;
const GLOSS_LINE = /^\(([^()]{3,})\)$/;
const META =
  /\bkorrektur|\bkorrigier|\bcorrection|\bu(?:e)?bersetzung|\btranslation|\brollenspiel|\brole-?play|jetzt bist du dran|n(?:ue|u)tzliche w(?:oe|o)rter|\bvokabel|\bwortschatz|\bwortliste|\bbeispieldialog|\bredemittel|\bgrammatik|kurz erkl(?:ae|a)rt|\bhinweis:|\btipp:|\berkl(?:ae|a)rung|kein fehler|richtig w(?:ae|a)re|besser w(?:ae|a)re|\bvocabulary|(?:^|\s)note:|english note|deine antwort|your turn/;
const CORRECTS = /\bkorrektur|\bkorrigier|richtig w(?:ae|a)re|besser w(?:ae|a)re|kein fehler|->|→/;
const MONEY = /(?:€\s*(\d{1,4})(?:[,.](\d{2}))?|\b(\d{1,4})(?:[,.](\d{2}))?\s*(?:euro|eur\b|€))/g;
const CLOCK = /\b(\d{1,2})[:.](\d{2})(?:\s*uhr)?\b|\b(\d{1,2})\s*uhr(?:\s+(\d{1,2})\b)?/g;
const EN_STOP = new Set('the you your is are and to of a in it what would like do have can for with this that please'.split(' '));
const DE_STOP = new Set('der die das und ist sie ich ein eine zu in mit den dem nicht es wir haben sind bitte gern noch'.split(' '));

const GREETING_DE =
  /^(?:(?:guten\s+(?:morgen|tag|abend)|hallo|hi|hey|moin(?:\s+moin)?|grüß\s+gott|servus|(?:herzlich\s+)?willkommen)(?:\s+(?:zusammen|nochmal|noch\s+einmal|zurück|und\s+(?:herzlich\s+)?willkommen))?[\s,!.]*)+/i;
const GREETING_EN = /^(?:(?:good\s+(?:morning|afternoon|evening|day)|hello|hi|hey|welcome)(?:\s+(?:again|back))?[\s,!.]*)+/i;

/** The line without its opening greeting ("Guten Morgen! Was darf es sein?" -> "Was darf es sein?"); '' when that was all. */
export function stripGreeting(line: string, lang: 'de' | 'en' = 'de'): string {
  const m = (lang === 'de' ? GREETING_DE : GREETING_EN).exec(line);
  if (!m) return line;
  const rest = line.slice(m[0].length).trim();
  return rest ? rest[0].toUpperCase() + rest.slice(1) : '';
}

/** Letters and digits only, umlauts folded: the form two lines are compared in. */
export const compact = (s: string) => normalise(s).replace(/[^a-z0-9]+/g, '');

/** The counterpart's earlier lines in a dialogue text ("Bäcker: Guten Morgen! ..."). */
export function counterpartLines(card: SceneCard, context: string): string[] {
  const label = `${speakerLabel(card.role_de)}:`;
  return context
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith(label))
    .map((l) => l.slice(label.length).trim());
}

/** True when `line` says what one of `earlier` already said (word for word, greeting aside). */
export function repeatsOneOf(line: string, earlier: string[]): boolean {
  const now = compact(stripGreeting(line));
  if (now.length < 12) return false;
  return earlier.some((e) => {
    const then = compact(stripGreeting(e));
    if (!then) return false;
    if (then === now) return true;
    const short = Math.min(then.length, now.length);
    return short >= 30 && (then.includes(now) || now.includes(then));
  });
}

const NUMBER_WORDS: Record<string, number> = { zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12 };

/** Quantities 2-12 a dialogue mentions, as digits or words. */
function quantitiesIn(text: string): number[] {
  const out = new Set<number>();
  for (const m of text.toLowerCase().matchAll(/(?:^|[^\d.,:])(\d{1,2})(?![\d]|[.,:]\d)/g)) {
    const n = Number(m[1]);
    if (n >= 2 && n <= 12) out.add(n);
  }
  for (const w of text.toLowerCase().split(/[^a-zäöüß]+/)) if (NUMBER_WORDS[w]) out.add(NUMBER_WORDS[w]);
  return [...out];
}

function figures(text: string): string[] {
  const out: string[] = [];
  let rest = text;
  for (const m of [...rest.matchAll(MONEY)]) {
    const euros = Number(m[1] ?? m[3] ?? 0);
    const cents = Number(m[2] ?? m[4] ?? 0);
    out.push(`eur:${euros * 100 + cents}`);
    rest = rest.replace(m[0], ' ');
  }
  for (const m of [...rest.matchAll(CLOCK)]) {
    const hh = Number(m[1] ?? m[3]);
    const mm = Number(m[2] ?? m[4] ?? 0);
    out.push(`t:${hh}:${mm}`);
    rest = rest.replace(m[0], ' ');
  }
  for (const m of rest.matchAll(/(?:^|[^\d.,:])(\d{1,4})(?![\d]|[.,:]\d)/g)) out.push(`n:${Number(m[1])}`);
  return out;
}

/**
 * Splits the model's reply into the German line and its gloss, and lists every way it broke character.
 * `context` is the dialogue so far: a figure the learner already said ("20 Brötchen") is not invented.
 */
export function readCounterpartLine(text: string, card: SceneCard, allowGloss: boolean, context = ''): CounterpartLine {
  let lines = text
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return { german: '', gloss: null, tells: ['empty'] };
  const tells: Tell[] = [];
  if (lines.length > 1 && LABEL_ONLY.test(lines[0])) lines = lines.slice(1);
  let german = lines[0].replace(ROLE_LABEL, '');
  let gloss: string | null = null;
  const trailing = TRAILING_GLOSS.exec(german);
  if (trailing && /[?!."“”]$/.test(german.slice(0, trailing.index).trimEnd())) {
    gloss = trailing[1];
    german = german.slice(0, trailing.index).trimEnd();
  }
  for (const ln of lines.slice(1)) {
    const m = GLOSS_LINE.exec(ln.replace(/^[*_ ]+|[*_ ]+$/g, ''));
    if (m && !gloss) gloss = m[1];
    else {
      tells.push('too_long');
      break;
    }
  }
  german = german.replace(/^\*\*|\*\*$/g, '').replace(/^["„“]|["“”]$/g, '').trim();
  const earlier = counterpartLines(card, context);
  if (earlier.length) {
    // the scripted opening has greeted already: a second greeting is dropped in place
    const bare = stripGreeting(german);
    if (bare !== german) {
      tells.push('regreet');
      german = bare.replace(ROLE_LABEL, '').replace(/^\*\*|\*\*$/g, '').trim();
      if (gloss) gloss = stripGreeting(gloss, 'en') || null;
      if (!german) tells.push('empty');
    }
    if (german && repeatsOneOf(german, earlier)) tells.push('repeat');
  }
  if ((german.match(/[.!?]+(?=\s|$)/g) ?? []).length > 3) tells.push('too_long');
  if (!/\?["'“”„»« ]*$/.test(german)) tells.push('no_question');
  const all = normalise(text);
  if (META.test(all)) tells.push('meta_talk');
  if (CORRECTS.test(all)) tells.push('corrected_in_role');
  const factFigures = figures(normalise(card.facts.map((f) => `${f.value} ${f.alts.join(' ')}`).join(' ')));
  const allowed = new Set([...factFigures, ...figures(normalise(context))]);
  // a price times a quantity the dialogue mentions ("zwei Brötchen" at 0,45 -> 0,90) is arithmetic, not invention
  for (const k of quantitiesIn(context)) for (const f of factFigures) if (f.startsWith('eur:')) allowed.add(`eur:${Number(f.slice(4)) * k}`);
  if (figures(normalise(german)).some((f) => !allowed.has(f) && !(f.startsWith('n:') && Number(f.slice(2)) <= 12))) tells.push('invented_figure');
  if (/^\s*(?:[-*•]|\d+[.)])\s+/m.test(text) || /^\s*#/m.test(text)) tells.push('formatting');
  const words = normalise(german).split(/[^a-z]+/);
  const en = words.filter((w) => EN_STOP.has(w)).length;
  const de = words.filter((w) => DE_STOP.has(w)).length;
  if (en >= 2 && en > de) tells.push('not_german');
  if (gloss && !allowGloss) gloss = null; // a gloss nobody asked for is dropped, not shown
  return { german, gloss, tells: [...new Set(tells)] };
}

/** Tells that make a line unusable (retry with another frame); the rest are cosmetic and fixed up in place. */
export const BLOCKING_TELLS: Tell[] = ['empty', 'meta_talk', 'corrected_in_role', 'invented_figure', 'not_german', 'too_long', 'repeat'];

/**
 * A model-written suggestion for the learner, kept to the learner's side of the counter: the greeting goes once
 * the dialogue is under way, and any sentence the counterpart has said or that states one of the counterpart's
 * facts is dropped. '' when nothing usable is left.
 */
export function learnerSideOnly(suggestion: string, card: SceneCard, transcript: TranscriptLine[]): string {
  const role = speakerLabel(card.role_de);
  const me = speakerLabel(card.learner_de);
  const theirs = transcript.filter(([who]) => who === role).map(([, l]) => compact(stripGreeting(l)));
  const facts = card.facts.flatMap((f) => [f.value, ...f.alts]).map(compact).filter((v) => v.length >= 2);
  const underWay = transcript.some(([who]) => who === me);
  let text = suggestion.replace(/^\*\*|\*\*$/g, '').trim();
  if (underWay) text = stripGreeting(text);
  const sentences = text.match(/[^.!?]+[.!?]+["“”]?|[^.!?]+$/g) ?? [];
  const kept = sentences
    .map((x) => x.trim())
    .filter((x) => {
      const c = compact(x);
      if (c.length < 2) return false;
      if (theirs.some((t) => t.includes(c) && c.length >= 12)) return false;
      return !facts.some((f) => c.includes(f));
    });
  return kept.slice(0, 2).join(' ');
}

/** Which of the card's facts a counterpart line has revealed (by value or accepted alternative). */
export function factsRevealed(card: SceneCard, line: string): string[] {
  const n = normalise(line);
  return card.facts.filter((f) => [f.value, ...f.alts].some((v) => v && n.includes(normalise(v)))).map((f) => f.key);
}

/** Example lines the learner could say next, taken from the card while the scene follows its script. */
export function scriptedSuggestions(card: SceneCard, learnerTurns: number): string[] {
  return card.beats[learnerTurns]?.learner ?? [];
}

/** A short English title for lists: "Buying rolls at the bakery". */
export function sceneTitle(card: SceneCard): string {
  return card.situation_en.charAt(0).toUpperCase() + card.situation_en.slice(1);
}
