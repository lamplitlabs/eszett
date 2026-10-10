// Content the model writes for the app instead of the app shipping it: a role-play situation card, a writing
// task, a grammar card, vocabulary topics. The model is asked for a short labelled-line format with a worked
// example, and the answer is read leniently (bold labels, numbering, German labels, "Label - value") but
// validated strictly: a draft that lacks a required part is rejected and the caller asks again differently.
// What code can verify is verified (a role's article against the lexicon, the German in a card's examples)
// and what it can fix is fixed, so a generated card is as reliable as the harness can make it.

import { normalise } from './engines';
import { checkText, type LexiconIndex } from './lexicon';
import type { Level } from './levels';
import type { SceneCard, SceneFact } from './roleplay';
import { langVotes } from './route';
import type { GrammarCard } from './tutor';
import type { ContentPoint, WriteTask } from './writing';
import { t } from '../i18n';

export interface Field {
  key: string;
  value: string;
}

/** `- **Label (German):** value`, `3. Label - value`, `Label: value` -> { key: 'label (german)', value }. */
const FIELD_LINE = /^\s*(?:[-*•]|\d{1,2}[.)])?\s*(?:\*\*|__)?\s*([A-Za-zÄÖÜäöüß][^:*_\n]{1,48}?)\s*(?:\*\*|__)?\s*[:：]\s*(?:\*\*|__)?\s*(.*?)\s*(?:\*\*|__)?\s*$/;
const BULLET = /^\s*(?:[-*•]|\d{1,2}[.)])\s+/;
/** A line that is only a label: "Three facts", "Their first line", "## Examples" once the Markdown is gone. */
const HEADING = /^[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß' ()/-]{1,40}$/;
/** A whole line in parentheses, the model's way of glossing the line above: "(Hello! How can I help?)". */
const PAREN_LINE = /^\(([^()]{2,})\)[.!?]?$/;

/**
 * The Markdown the model dresses its lines in: `# ` headings, `> ` quotes, bold labels, a whole line in
 * italics. `**Their role** (German): x` becomes `Their role (German): x`; `*(Good day!)*` becomes `(Good day!)`.
 */
export function stripMd(line: string): string {
  return line
    .replace(/^\s*(?:#{1,4}\s+|>\s*)+/, '')
    .replace(/\*\*|__|~~/g, '')
    .replace(/^\s*\*([^*]+)\*\s*$/, '$1')
    .replace(/^\s*_([^_]+)_\s*$/, '$1')
    .trim();
}

const isBareHeading = (s: string) => HEADING.test(s) && !BULLET.test(s) && !s.includes('|') && !s.includes(':');
const normKey = (s: string) => normalise(s).replace(/\s+/g, ' ').trim();
/** "English: ..." inside a parenthesised gloss. */
const GLOSS_LABEL = /^\s*(?:english|englisch|en|translation|uebersetzung|übersetzung)\s*:\s*/i;
/** More English than German function words: a line is English only on positive evidence, a bare German title has neither. */
const looksEnglish = (s: string) => {
  const { en, de } = langVotes(s);
  return en > de;
};
/** A parenthesised line is the model's English gloss when it reads as English, not a "(der Vermieter, -)" note. */
const isEnglishGloss = (g: string) => {
  const { en, de } = langVotes(g);
  return en > de || (en === de && !/[äöüß]/.test(g));
};
const KNOWN_LABEL = /\b(facts?|fakten|roles?|rolle|line|zeile|opening|register|anrede|place|ort|situation|title|titel|rule|regel|examples?|beispiele?|pitfalls?|points?|punkte|task|aufgabe)\b/;

/** "Their role – der Mitarbeiter": a known label with a dash instead of the colon; a dash elsewhere is not a label. */
const DASH_LABEL = /^([A-Za-zÄÖÜäöüß][^|:\n]{1,30}?)\s+[–—-]\s+(.+)$/;
function dashField(s: string): RegExpExecArray | null {
  const m = DASH_LABEL.exec(s);
  return m && KNOWN_LABEL.test(normKey(m[1])) ? m : null;
}

/** Inline dictionary notes the model adds to its German: "(die Jacke, -n)", "(pl. die Reißverschlüsse)", "(die Heizungen)", "(nur Singular)". */
export function stripDictNotes(s: string): string {
  return s
    .replace(/\s*\([^)]*(?:,\s*[-–—]|\b[Pp]l\.|,\s*(?:der|die|das)\s|nur Singular|no plural)[^)]*\)/g, '')
    .replace(/\s*\((?:der|die|das)\s+[A-ZÄÖÜ][a-zäöüß-]+\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** The label of a line that is a labelled line or a bare heading, as a lower-cased key; null for anything else. */
export function lineKey(line: string): string | null {
  const s = stripMd(line);
  const m = FIELD_LINE.exec(s) ?? dashField(s);
  if (m) return normKey(m[1]) || null;
  return isBareHeading(s) ? normKey(s) : null;
}

/**
 * The labelled lines of an answer, lower-cased keys, values stripped of quotes and bold. A label without a value
 * ("Their first line", "**Opening line (German):**") takes the next line that is not a bullet or a label, and a
 * line in parentheses right after a value is kept as `<label> (english)`, the gloss the model likes to add.
 */
export function fieldLines(text: string): Field[] {
  const out: Field[] = [];
  const lines = text.split(/\r?\n/).map(stripMd);
  const nextContent = (from: number) => {
    let j = from;
    while (j < lines.length && !lines[j]) j++;
    return j;
  };
  const isValueLine = (s: string) => Boolean(s) && !BULLET.test(s) && !FIELD_LINE.test(s) && !s.includes('|');
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i];
    if (!s) continue;
    const m = FIELD_LINE.exec(s) ?? dashField(s);
    let key: string;
    let value: string;
    if (m) {
      key = normKey(m[1]);
      value = unquote(m[2]);
    } else if (isBareHeading(s)) {
      key = normKey(s);
      value = '';
    } else continue;
    if (!key) continue;
    if (!value) {
      // the value on the next line, one blank line allowed; a label word there is the next section, not a value
      const j = nextContent(i + 1);
      const cand = j < lines.length && j - i <= 2 ? lines[j] : '';
      if (isValueLine(cand) && !(isBareHeading(cand) && KNOWN_LABEL.test(normKey(cand)))) {
        value = unquote(cand);
        i = j;
      }
    }
    out.push({ key, value });
    if (value) {
      const j = nextContent(i + 1);
      const gloss = j < lines.length && j - i <= 2 ? PAREN_LINE.exec(lines[j]) : null;
      if (gloss && isEnglishGloss(gloss[1])) {
        out.push({ key: `${key.replace(/\s*\((?:german|deutsch|de)\)/, '')} (english)`, value: unquote(gloss[1].replace(GLOSS_LABEL, '')) });
        i = j;
      }
    }
  }
  return out;
}

/** The value of the first field whose key contains one of the names (English or German), '' when none. */
const EN_KEY = /english|englisch|translation|ubersetzung|\(en\)/;
const DE_KEY = /german|deutsch|\(de\)/;

export function fieldValue(fields: Field[], ...names: string[]): string {
  const wanted = names.map((n) => normalise(n));
  for (const w of wanted) {
    const hit = fields.find((f) => f.key === w);
    if (hit?.value) return hit.value;
  }
  // the first name says which language the field is in; a loose match never crosses to the other language
  // ("Opening (English)" is not an opening line, "Rule (German)" is not the English rule)
  const other = EN_KEY.test(wanted[0]) ? DE_KEY : DE_KEY.test(wanted[0]) ? EN_KEY : null;
  for (const w of wanted) {
    const hit = fields.find((f) => f.key.includes(w) && !other?.test(f.key));
    if (hit?.value) return hit.value;
  }
  return '';
}

/** The bullet lines that follow a heading line ("Facts:", "**Three facts**") until the next labelled line or blank line. */
export function bulletsAfter(text: string, ...headings: string[]): string[] {
  const lines = text.split(/\r?\n/).map(stripMd);
  const wanted = headings.map((h) => normalise(h));
  const start = lines.findIndex((l) => {
    const key = lineKey(l);
    return key !== null && wanted.some((w) => key === w || key.includes(w));
  });
  if (start < 0) return [];
  const out: string[] = [];
  const first = FIELD_LINE.exec(lines[start]);
  // "Facts: - a | b | c" on one line, or the first item on the heading line itself
  if (first?.[2] && first[2].includes('|')) out.push(unquote(first[2].replace(BULLET, '')));
  for (const l of lines.slice(start + 1)) {
    if (!l.trim()) {
      if (out.length) break;
      continue;
    }
    if (!BULLET.test(l)) {
      // a labelled line or heading ends the list; an unlabelled continuation that looks like an item is kept
      if (lineKey(l) !== null && !l.includes('|')) break;
      if (!l.includes('|')) break;
    }
    out.push(unquote(l.replace(BULLET, '')));
  }
  return out;
}

/** Bold and the quotes around a value go; a quote that closes one inside the text ('the café "Zur Linde"') stays. */
export function unquote(s: string): string {
  const t = s.replace(/\*\*|__/g, '').trim();
  const wrapped = /^[„"“‚'«»]+(.*?)["“”‚'«»]+$/s.exec(t);
  if (wrapped) return wrapped[1].trim();
  if (/^[„"“‚'«»]/.test(t) && !/["“”‚'«»]/.test(t.slice(1))) return t.slice(1).trim();
  return t;
}

const splitCells = (line: string) => line.split(/\s*[|;]\s*|\s+[–—-]\s+/).map((c) => unquote(c)).filter(Boolean);

/** Runs of consecutive bullet lines anywhere in the answer, Markdown stripped, bullets removed. */
export function bulletRuns(text: string): string[][] {
  const runs: string[][] = [];
  let run: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const l = stripMd(raw);
    if (BULLET.test(l)) run.push(unquote(l.replace(BULLET, '')));
    else if (l.trim() && run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  return runs;
}

/** "the-bakery-k3x9" style keys: a slug of the text plus a time stamp, unique enough for one phone. */
export function slugKey(prefix: string, text: string, now = Date.now()): string {
  const slug = normalise(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24)
    .replace(/-$/, '');
  return `${prefix}-${slug || 'item'}-${now.toString(36)}`;
}

const sentenceCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const ROLE_ARTICLE = /^(der|die|das|ein|eine)\s+(.+)$/i;

/** Capitalised words that are not nouns: the polite "Sie" and its forms, a sentence-initial pronoun. */
const PRONOUN_WORD = /^(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres|Du|Dir|Dich|Dein|Deine|Wir|Uns|Er|Es|Ich|Man)$/;
const CONTRACTION_NOUN = /(?:^|[^A-Za-zÄÖÜäöüß])([Ii]m|[Bb]eim|[Zz]um|[Vv]om|[Aa]m|[Ii]ns|[Aa]ns|[Zz]ur) ([A-ZÄÖÜ][a-zäöüß]{2,})(?![a-zäöüß]|-[A-ZÄÖÜ])/g;
const FEMININE_FORM: Record<string, string> = { im: 'in der', beim: 'bei der', zum: 'zur', vom: 'von der', am: 'an der' };
const ARTICLE_NOUN = /(?:^|[^A-Za-zÄÖÜäöüß])(Der|Die|Das|der|die|das) ([A-ZÄÖÜ][a-zäöüß]{2,})(?![a-zäöüß]|-[A-ZÄÖÜ])/g;

export interface GermanFinding {
  claimed: string;
  expected: string;
}

/**
 * Gender errors the lexicon can prove in a German sentence the model wrote. `checkText` judges citations only,
 * because in running text the article changes with the case; but some pairs are wrong in every case: "die" with a
 * masculine or neuter singular, "das" with a masculine or feminine, "der" with a neuter singular. Those are
 * flagged wherever they stand, except after a comma, where "die"/"das" may be a relative pronoun ("die Frau, die
 * Brot kauft"). Adjective agreement findings from `checkText` are included.
 */
export function germanFindings(text: string, lex: LexiconIndex | null): GermanFinding[] {
  if (!lex) return [];
  const out = new Map<string, string>();
  for (const f of checkText(text, lex).findings) {
    if (PRONOUN_WORD.test(f.claimed.split(/\s+/).at(-1) ?? '')) continue;
    out.set(f.claimed, f.expected);
  }
  for (const m of text.matchAll(ARTICLE_NOUN)) {
    const article = m[1].toLowerCase() as 'der' | 'die' | 'das';
    const noun = m[2];
    if (PRONOUN_WORD.test(noun)) continue;
    const before = text.slice(0, m.index ?? 0).trimEnd().at(-1) ?? '';
    if (before === ',') continue;
    const genera = lex.articlesOf(noun);
    if (!genera.length) continue;
    const plural = lex.isPluralForm(noun);
    const ok =
      article === 'die' ? genera.includes('die') || plural
      : article === 'das' ? genera.includes('das')
      : genera.includes('der') || genera.includes('die') || plural;
    if (!ok) out.set(`${article} ${noun}`, `${genera.join('/')} ${noun}`);
  }
  // "im Bäckerei": a contraction fixes the gender too; im/beim/zum/vom/am are masculine or neuter, zur is feminine
  for (const m of text.matchAll(CONTRACTION_NOUN)) {
    const word = m[1].toLowerCase();
    const noun = m[2];
    if (PRONOUN_WORD.test(noun)) continue;
    const genera = lex.articlesOf(noun);
    if (!genera.length || lex.isPluralForm(noun)) continue;
    const feminineOnly = genera.length === 1 && genera[0] === 'die';
    if (word === 'zur') {
      if (!genera.includes('die')) out.set(`${m[1]} ${noun}`, `zum ${noun}`);
    } else if (word === 'ins' || word === 'ans') {
      if (!genera.includes('das')) out.set(`${m[1]} ${noun}`, `${word === 'ins' ? 'in' : 'an'} ${genera[0] === 'der' ? 'den' : 'die'} ${noun}`);
    } else if (feminineOnly) {
      out.set(`${m[1]} ${noun}`, `${FEMININE_FORM[word]} ${noun}`);
    }
  }
  return [...out].map(([claimed, expected]) => ({ claimed, expected }));
}

/** "Verkäuferin" -> "die Verkäuferin" when the lexicon knows the noun; a wrong article is replaced. */
export function roleWithArticle(role: string, lex: LexiconIndex | null): { role: string; fixed: boolean } {
  const m = ROLE_ARTICLE.exec(role.trim());
  const noun = (m ? m[2] : role).trim().replace(/[.!?,]+$/, '');
  const head = noun.split(/\s+/).at(-1) ?? noun;
  const had = m?.[1].toLowerCase();
  const genera = lex?.articlesOf(head) ?? [];
  if (!genera.length) return { role: had ? `${had} ${noun}` : noun, fixed: false };
  const article = had && genera.includes(had as 'der' | 'die' | 'das') ? had : genera[0];
  return { role: `${article} ${noun}`, fixed: Boolean(had) && had !== article };
}

export interface SceneDraft {
  card: SceneCard;
  /** What the harness changed or could not confirm, for the screen's "generated" note. */
  notes: string[];
  /** Gender/agreement findings of the lexicon in the German lines (shown, not fatal). */
  warnings: string[];
}

const PRONOUN_ROLE = /^(sie|du|ich|you|me|i|myself|yourself|the learner|der lerner|die lernerin|learner)$/i;
const ROLE_REGISTER = /\s*[,;(–—-]\s*(?:register\s*:?\s*)?(Sie|du)(?:-form)?\s*\)?\s*$/i;
const ENGLISH_CELL = /^(the|a|an|my|your)\s/i;

/**
 * A role as the model writes it, reduced to the noun phrase: "der Kunde / die Kundin, Sie" -> der Kunde (register
 * Sie); "der Vermieter (die Vermieter) – the landlord" -> der Vermieter, english "the landlord"; "der Verkäufer
 * (salesperson)" -> english "the salesperson"; "Sie / die Mieterin" -> die Mieterin (a pronoun is not a role).
 */
export function cleanRole(raw: string): { role: string; english: string; register?: 'Sie' | 'du' } {
  let s = unquote(raw);
  let register: 'Sie' | 'du' | undefined;
  const r = ROLE_REGISTER.exec(s);
  if (r) {
    register = r[1].toLowerCase() === 'du' ? 'du' : 'Sie';
    s = s.slice(0, r.index);
  }
  // "der Verkäufer (salesperson)": an English word in brackets is the English role; a "(die Verkäufer)" note is not
  const bracket = /\(([^()]+)\)/.exec(s);
  const glossed = bracket && isEnglishGloss(bracket[1]) && !/^(?:der|die|das|pl\.)\b/.test(bracket[1]) ? bracket[1].trim() : '';
  s = s.replace(/\s*\([^)]*\)/g, '');
  const cells = s.split(/\s*\|\s*|\s+[–—-]\s+|\s*=\s*/).map((c) => unquote(c)).filter(Boolean);
  const english = cells.slice(1).find((c) => ENGLISH_CELL.test(c)) ?? (glossed ? glossed.replace(/^(?!the\b|a\b|an\b)/, 'the ') : '');
  // "Sie, der Mitarbeiter" / "der Kunde / die Kundin" / "der Vermieter, Herr Keller": the first part that is a role
  const role = (cells[0] ?? '')
    .split(/\s*,\s*|\s*\/\s*|\s+oder\s+|\s+or\s+/)
    .map((c) => c.replace(/[.!?,;]+$/, '').trim())
    .find((c) => c && !PRONOUN_ROLE.test(c));
  return { role: role ?? '', english, register };
}

const PLACE_IN = /(?:^|\s)(?:[Ii]m|[Ii]n (?:der|dem|einem|einer)|[Aa]m|[Aa]n der|[Bb]eim|[Bb]ei (?:der|einem|einer)|[Aa]uf (?:dem|der))\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]{2,})/;

/** "der Textilgeschäft, die Straße 5" -> Textilgeschäft; "die Wohnung (die Wohnungen) – the flat" -> Wohnung. */
export function cleanPlace(raw: string, situation = ''): string {
  let s = unquote(raw)
    .replace(/\s*\([^)]*\)/g, '')
    .split(/\s*\|\s*|\s+[–—-]\s+|\s*,\s*/)[0]
    .trim();
  s = s.replace(ROLE_ARTICLE, '$2').replace(/[.!?;]+$/, '');
  if (!s || s.length > 40) {
    const m = PLACE_IN.exec(situation);
    s = m ? m[1] : '';
  }
  return sentenceCase(s);
}

/** The first quoted line ("> Guten Tag! ...") as the opening when no labelled one exists, with a parenthesised gloss under it. */
export function quotedOpening(text: string): { line: string; gloss: string } | null {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*>/.test(lines[i])) continue;
    const s = stripMd(lines[i]);
    if (!s || PAREN_LINE.test(s) || s.split(/\s+/).length < 3 || FIELD_LINE.test(s)) continue;
    const next = stripMd(lines[i + 1] ?? '');
    const g = PAREN_LINE.exec(next);
    return { line: unquote(s), gloss: g ? unquote(g[1]) : '' };
  }
  return null;
}

/** Reads a situation card the model wrote; null when the draft lacks a situation, a role, two facts or an opening. */
export function parseSceneDraft(text: string, level: Level, lex: LexiconIndex | null, description = '', now = Date.now()): SceneDraft | null {
  const f = fieldLines(text);
  const explicitDe = fieldValue(f, 'situation (german)', 'situation (deutsch)', 'situation de');
  let situationEn = fieldValue(f, 'situation (english)', 'situation (englisch)', 'situation en');
  // unlabelled "Situation:" lines: the first that is not English is the German one (a bold title line above the
  // card often repeats it); an English one serves as the English situation
  const unlabelled = f.filter((x) => ['situation', 'szene', 'szenario'].includes(x.key) && x.value).map((x) => x.value);
  let situationDe = explicitDe || unlabelled.find((v) => !looksEnglish(v)) || '';
  if (!explicitDe && !situationDe) situationEn ||= unlabelled[0] ?? '';
  // "Einjacken im Geschäft: Die Jacke ist kaputt, ..." - the title is what stands before a colon
  situationDe = stripDictNotes(situationDe);
  const [head, ...rest] = situationDe.split(/:\s+/);
  if (rest.length && head.split(/\s+/).length >= 2) situationDe = head;
  situationEn ||= description.trim() || fieldValue(f, 'english', 'englisch');
  const roleRaw = fieldValue(f, 'their role (german)', 'their role (deutsch)', 'ihre rolle', 'deine rolle', 'their role', 'other person (german)', 'other person', 'your role');
  const roleEnRaw = fieldValue(f, 'their role (english)', 'their role en', 'other person (english)', 'your role (english)');
  const learnerRaw = fieldValue(f, 'my role (german)', 'my role (deutsch)', 'meine rolle', 'my role', 'learner (german)', 'learner');
  const learnerEnRaw = fieldValue(f, 'my role (english)', 'my role en', 'learner (english)');
  const registerRaw = fieldValue(f, 'register', 'anrede', 'address');
  const openingRaw = fieldValue(f, 'their first line (german)', 'their first line', 'opening line (german)', 'opening (german)', 'erster satz', 'erste zeile', 'opening line', 'opening', 'first line');
  const quoted = openingRaw ? null : quotedOpening(text);
  const opening = openingRaw || quoted?.line || '';
  const openingGloss = fieldValue(f, 'their first line (english)', 'opening (english)', 'opening line (english)', 'first line (english)', 'opening translation', 'translation') || quoted?.gloss || '';
  const factLines = bulletsAfter(text, 'facts', 'fakten', 'what they know');

  const facts: SceneFact[] = [];
  for (const line of factLines) {
    const cells = splitCells(line);
    if (cells.length < 2) continue;
    const [labelDe, labelEn, rawValue] = cells.length >= 3 ? cells : [cells[0], cells[0], cells[1]];
    const value = stripDictNotes(rawValue ?? '');
    if (!value || value.length > 80 || /^value$/i.test(value)) continue;
    facts.push({ key: `fact-${facts.length + 1}`, label_de: labelDe, label_en: labelEn, value, alts: [] });
  }
  const theirs = cleanRole(roleRaw);
  const mine = cleanRole(learnerRaw);
  if (!situationDe || !theirs.role || !opening || facts.length < 2) return null;

  const notes: string[] = [];
  const warnings: string[] = [];
  const them = roleWithArticle(theirs.role, lex);
  const me = roleWithArticle(mine.role || 'der Kunde', lex);
  if (them.fixed) notes.push(t('author.noteArticle', { role: them.role }));
  if (me.fixed) notes.push(t('author.noteArticle', { role: me.role }));
  const registerHint = registerRaw || theirs.register || mine.register || '';
  const register: 'Sie' | 'du' = /\bdu\b|informal|informell|duzen/i.test(registerHint) && !/\bsie\b/i.test(registerHint) ? 'du' : 'Sie';
  if (!registerHint) notes.push(t('author.noteRegister'));
  if (!mine.role) notes.push(t('author.noteRole'));
  let openingLine = unquote(stripDictNotes(opening).split(/\s*\((?=[A-Z])/)[0]);
  if (!/[.!?"“]$/.test(openingLine)) openingLine += '?';
  for (const w of germanFindings([situationDe, openingLine, ...facts.map((x) => `${x.label_de}: ${x.value}`)].join('\n'), lex)) warnings.push(`${w.claimed} -> ${w.expected}`);
  const roleEn = cleanRole(roleEnRaw).role || theirs.english;
  const learnerEn = cleanRole(learnerEnRaw).role || mine.english;
  const card: SceneCard = {
    key: slugKey('own', situationEn || situationDe, now),
    level,
    situation_de: sentenceCase(situationDe.replace(/[.!]+$/, '')),
    situation_en: (situationEn || situationDe).replace(/[.!]+$/, '').replace(/^./, (c) => c.toLowerCase()),
    place: cleanPlace(fieldValue(f, 'place', 'ort'), situationDe),
    role_de: them.role,
    role_en: roleEn || them.role.replace(ROLE_ARTICLE, '$2'),
    learner_de: me.role,
    learner_en: learnerEn || (mine.role ? me.role.replace(ROLE_ARTICLE, '$2') : 'the customer'),
    register,
    facts,
    opening: openingLine,
    opening_gloss: openingGloss,
    beats: [],
  };
  return { card, notes, warnings };
}

/** Word bands of the bundled tasks by level, for a generated task of the same shape. */
export const WORDS_FOR_LEVEL: Record<Level, [number, number]> = { A1: [20, 35], A2: [30, 45], B1: [70, 100], B2: [120, 180], C1: [180, 250], C2: [220, 300] };

/** "Schreib eine E-Mail …", "Schreiben Sie …", "Verfasse …": the German instruction of an exam task. */
const TASK_VERB_DE = /\b(?:Schreib(?:e|en Sie|t)?|Verfass(?:e|en Sie)?)\b/;
const TASK_VERB_EN = /^(?:Write|Compose|Send)\b/;
/** A dictionary entry where a topic name or a content point was asked for: "die Wohnung, -en", "der Vermieter, - / die Vermieterin". */
const DICT_ENTRY = /^(?:der|die|das|ein|eine)\s+[A-ZÄÖÜ]|,\s*-|\(pl\.?\)|\(-/;
/** Articles and the prepositions fused with one, which change with the case the learner writes: "die Wohnung" -> "wohnung". */
const KEYWORD_ARTICLE = /^(?:der|die|das|den|dem|des|ein|eine|einen|einem|einer|eines|the|a|an)\s+/i;
const KEYWORD_LEAD = /^(?:or|oder|and|und|z\.\s?B\.|e\.\s?g\.)\s*:?\s*/i;
/** Words that carry no content of their own, never a key word by themselves: "bei meiner Oma" is hit by "Oma", not "meiner". */
const KEYWORD_STOP = new Set(
  'meiner meinem meinen meine deiner deinem deinen deine seiner seinem seinen seine ihrer ihrem ihren ihre unser unsere unserem unseren euer eure eurem dieser diesem diesen dieses jeder jedem jeden einer einem einen eines keine keinen keinem welche nicht etwas sehr auch noch schon haben werden seid sind bitte immer wieder'.split(' '),
);

/** A task text without the model's Markdown emphasis and dictionary notes, on one line. */
const cleanTask = (s: string) =>
  stripDictNotes(s.replace(/\*([^*]+)\*/g, '$1'))
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The content points: "point | key words" bullets after a points heading ("Content points:", "Schreibe etwas zu
 * diesen Punkten:", "Drei Leitpunkte:"), else the first run of bullets with a pipe; "point: a, b, c" is read too.
 * Key words lose their articles and dictionary notes; a point whose key words read as English (the model's
 * translation block) is left out. The point itself may be English or German, both work as a checklist line.
 */
export function readContentPoints(text: string): ContentPoint[] {
  const headed = bulletsAfter(text, 'content points', 'inhaltspunkte', 'leitpunkte', 'punkte', 'points', 'dinge');
  const piped = (lines: string[]) => lines.filter((l) => l.includes('|') || /^[^:|]{3,60}:\s+\S+(?:,\s*\S+)+/.test(l)).length;
  const lines = piped(headed) >= 2 ? headed : (bulletRuns(text).find((run) => piped(run) >= 2) ?? headed);
  const points: ContentPoint[] = [];
  for (const line of lines) {
    let cells = line.split(/\s*\|\s*/).map((c) => unquote(c));
    if (cells.length < 2) {
      const m = /^([^:|]{3,60}):\s+(\S.*)$/.exec(line);
      if (!m || !m[2].includes(',')) continue;
      cells = [m[1], m[2]];
    }
    const en = cleanTask(cells[0])
      .replace(/\s*\([^)]*\)/g, '')
      .replace(/[.:]+$/, '')
      .trim();
    // "das Praktikum, -s | sich bewerben": a word-bank line, not a content point
    if (/,\s*-|\(pl\.?\)|\(-/.test(cells[0])) continue;
    const raw = stripDictNotes(cells.slice(1).join(',')).replace(/\s*\([^)]*\)/g, '');
    if (looksEnglish(raw)) continue;
    const any: string[] = [];
    for (const part of raw.split(/\s*[,;/]\s*|\s+(?:or|oder)\s*:?\s+/)) {
      const k = normalise(part.replace(KEYWORD_LEAD, '').replace(KEYWORD_ARTICLE, ''))
        .replace(/[.!?"']+$/g, '')
        .trim();
      // "-en", "-\"e": a plural ending the model lists after a noun is not a key word
      if (k.length < 3 || k.length > 30 || /^-/.test(k) || KEYWORD_STOP.has(k)) continue;
      any.push(k);
      // "ins Schwimmbad gehen" is also hit by "Schwimmbad": the longest content word of a phrase counts on its own
      const words = k.split(' ').filter((w) => !KEYWORD_STOP.has(w));
      const longest = words.reduce((a, b) => (b.length > a.length ? b : a), '');
      if (k.includes(' ') && longest.length >= 5) any.push(longest);
    }
    if (!en || !any.length) continue;
    points.push({ en, any: [...new Set(any)] });
  }
  return points;
}

/**
 * Reads a writing task the model wrote. The card shape (Title / Task (English) / Task (German) / Content points)
 * and the exam shape ("Aufgabe: title", a German instruction paragraph, "Schreibe etwas zu diesen Punkten:" with
 * "point | key words" lines) are both read; a task in German only is kept, the English side then shows the
 * German. Null without a task text or two content points with key words; the title falls back to the topic.
 */
export function parseWriteTaskDraft(text: string, level: Level, register: 'formal' | 'informal', topic = '', now = Date.now()): WriteTask | null {
  const f = fieldLines(text);
  const lines = text.split(/\r?\n/).map(stripMd);
  const isGerman = (s: string) => TASK_VERB_DE.test(s) || langVotes(s).de > langVotes(s).en;

  let promptEn = cleanTask(fieldValue(f, 'task (english)', 'aufgabe (englisch)', 'aufgabe (english)'));
  let promptDe = cleanTask(fieldValue(f, 'task (german)', 'aufgabe (deutsch)', 'aufgabe (german)'));
  if (promptEn && isGerman(promptEn)) {
    // "Aufgabe (Englisch): Schreiben Sie …" - labelled English, written in German
    if (!promptDe) promptDe = promptEn;
    promptEn = '';
  }
  // "Task: …" / "Aufgabe: Schreib …" in either language
  for (const key of ['task', 'aufgabe']) {
    const v = cleanTask(fieldValue(f, key));
    if (!v || v.split(' ').length <= 8) continue;
    if (isGerman(v)) promptDe ||= v;
    else promptEn ||= v;
  }
  // the exam shape: the instruction paragraph(s) before the points, joined
  if (!promptDe) {
    const para: string[] = [];
    for (const l of lines) {
      if (!l) continue;
      if (BULLET.test(l) || l.includes('|')) {
        if (para.length) break;
        continue;
      }
      const key = lineKey(l);
      if (key && /punkte|points|dinge|aspekte/.test(key)) break;
      if (key && !TASK_VERB_DE.test(l)) {
        // a title line before the instruction, a "Tipp:" after it
        if (para.length) break;
        continue;
      }
      if (TASK_VERB_DE.test(l) && !looksEnglish(l)) para.push(cleanTask(l));
      else if (para.length) para.push(cleanTask(l));
    }
    promptDe = para.join(' ').replace(/\s+/g, ' ').trim();
  }
  // "… Schreiben Sie etwas zu den folgenden Punkten:" at the end of the instruction introduces the list, not the task
  promptDe = promptDe.replace(/\s*Schreib(?:e|en Sie)?\s+(?:bitte\s+)?(?:etwas\s+)?zu\s+(?:den\s+folgenden|diesen|allen(?:\s+drei)?)\s+Punkten\s*[:.–—-]?\s*$/i, '').trim();
  if (!promptEn) {
    const l = lines.find((s) => TASK_VERB_EN.test(s.replace(/^[^A-Za-z]+/, '')) && looksEnglish(s) && !BULLET.test(s));
    if (l) promptEn = cleanTask(l).replace(/^[^A-Za-z]+/, '');
  }

  let title = fieldValue(f, 'title', 'titel');
  if (!title) {
    // "Aufgabe: Eine E-Mail an einen Freund", "Schreiben: Einladung zum Wochenende": a short value is the title
    const short = f.find((x) => /^(?:aufgabe|schreiben|writing task|thema|topic)$/.test(x.key) && x.value && x.value.split(' ').length <= 8 && !TASK_VERB_DE.test(x.value));
    title = short?.value ?? '';
  }
  if (!title) {
    const first = lines.find((s) => s);
    if (first && first.length <= 70 && !FIELD_LINE.test(first) && !TASK_VERB_DE.test(first) && !BULLET.test(first)) title = first;
  }
  title = cleanTask(title)
    .replace(/\s*\((?:A1|A2|B1|B2|C1|C2)\)\s*$/, '')
    .replace(/^(?:A1|A2|B1|B2|C1|C2)\s*[–—-]\s*/, '')
    .replace(/[.]+$/, '');
  if (!title || title.length > 70) title = sentenceCase(topic.trim().replace(/[.!?]+$/, ''));

  const points = readContentPoints(text);
  if (!title || !(promptEn || promptDe) || points.length < 2) return null;
  // the checklist must match the task the learner reads: an explicit du-Form or Sie-Form in the text wins
  const said = `${promptEn} ${promptDe}`;
  let reg = register;
  if (/\bdu-form\b|\bduzen\b|\binformell|use (?:the )?du\b/i.test(said)) reg = 'informal';
  else if (/\bsie-form\b|\bsiezen\b|\bformell|\bförmlich|use (?:the )?sie\b/i.test(said)) reg = 'formal';
  return {
    id: slugKey('own', title, now),
    level,
    register: reg,
    words: WORDS_FOR_LEVEL[level],
    title: sentenceCase(title),
    prompt: promptEn || promptDe,
    promptDe: promptDe || promptEn,
    points: points.slice(0, 4),
  };
}

export interface GrammarCardDraft {
  card: GrammarCard;
  /** Examples the lexicon found a gender or agreement error in, left out of the card. */
  dropped: { example: [string, string]; why: string }[];
}

/** "Wrong – ein großer Haus. Right – ein großes Haus. After ein …": the model's one-line pitfall. */
const WRONG_RIGHT = /\b(?:wrong|falsch)\b\s*[:–—-]?\s*(.+?)\s*[.;,]?\s*[–—-]?\s*\b(?:right|richtig|correct)\b\s*[:–—-]?\s*(.+?)(?:[.!]\s+(.*))?$/i;

/** A card cell without emphasis marks and dictionary notes: "*ein großes Haus* (das Haus, pl. die Häuser)" -> "ein großes Haus". */
const cleanCell = (s: string) =>
  stripDictNotes(unquote(s.replace(/\*([^*]+)\*/g, '$1')))
    .replace(/\s+/g, ' ')
    .replace(/^[–—-]\s*|\s*[–—-]$/g, '')
    .trim();

/**
 * Reads a grammar card the model wrote; examples with a lexicon finding are dropped; null below two examples.
 * Examples are the "German | English" bullets after the Examples heading, else the first run of such bullets;
 * the pitfall is a three-cell bullet or the model's one-line "Wrong – … Right – … why".
 */
export function parseGrammarCardDraft(text: string, level: Level, lex: LexiconIndex | null, topic = '', now = Date.now()): GrammarCardDraft | null {
  const f = fieldLines(text);
  const titleEn = cleanCell(fieldValue(f, 'title (english)', 'title', 'titel (englisch)')).replace(/\s*\((?:A1|A2|B1|B2|C1|C2)\)$/, '') || sentenceCase(topic.trim());
  const titleDe = cleanCell(fieldValue(f, 'title (german)', 'titel (deutsch)', 'titel')) || titleEn;
  const ruleEn = cleanCell(fieldValue(f, 'rule (english)', 'rule', 'regel (englisch)'));
  const ruleDe = cleanCell(fieldValue(f, 'rule (german)', 'regel (deutsch)', 'regel')) || ruleEn;
  const examples: [string, string][] = [];
  const dropped: GrammarCardDraft['dropped'] = [];
  const pitfalls: GrammarCard['pitfalls'] = [];
  const addPitfall = (wrong: string, rightRaw: string, why: string) => {
    // "Könnten Sie mir bitte helfen? (Could you please help me?)": the gloss goes, a "right" side in English is no correction
    const right = rightRaw.replace(/\s*\(([^()]+)\)\s*$/, (m, g: string) => (isEnglishGloss(g) ? '' : m)).trim();
    if (!wrong || !right || normalise(wrong) === normalise(right) || looksEnglish(right)) return;
    if (germanFindings(right, lex).length) return;
    pitfalls.push({ wrong, right, why_en: why, why_de: why });
  };
  const addExample = (cells: string[]) => {
    const pair: [string, string] = [cells[0], cells.slice(1).join(' - ')];
    const findings = germanFindings(pair[0], lex);
    if (findings.length) dropped.push({ example: pair, why: findings.map((x) => `${x.claimed} -> ${x.expected}`).join(', ') });
    else examples.push(pair);
  };
  // "German | English", or the model's "German (die Stadt, pl. die Städte) — English" when the right side reads as English
  const pipeCells = (line: string) => {
    if (line.includes('|')) return line.split(/\s*\|\s*/).map(cleanCell).filter(Boolean);
    const cells = cleanCell(line).split(/\s+[–—]\s+/).map(cleanCell).filter(Boolean);
    return cells.length === 2 && isEnglishGloss(cells[1]) && !looksEnglish(cells[0]) ? cells : [];
  };
  let exampleLines = bulletsAfter(text, 'examples', 'beispiele').filter((l) => pipeCells(l).length >= 2);
  const pitfallLines = bulletsAfter(text, 'pitfall', 'typischer fehler', 'common mistake', 'stolperstein');
  if (exampleLines.length < 2) {
    // no Examples heading: the first run of "German | English" bullets that is not the pitfall list
    const run = bulletRuns(text).find((r) => r.filter((l) => pipeCells(l).length >= 2).length >= 2 && !r.some((l) => pitfallLines.includes(l)));
    exampleLines = (run ?? []).filter((l) => pipeCells(l).length >= 2);
  }
  for (const line of exampleLines) {
    const cells = pipeCells(line);
    if (cells.length === 2 || !pitfallLines.length) addExample(cells.slice(0, 2));
  }
  for (const line of pitfallLines) {
    const cells = splitCells(line).map(cleanCell);
    if (cells.length < 2) {
      const m = WRONG_RIGHT.exec(cleanCell(line));
      if (m) addPitfall(m[1], m[2], m[3] ?? '');
      continue;
    }
    const [wrong, right, why = ''] = cells;
    addPitfall(wrong, right, why);
  }
  if (!pitfalls.length) {
    const v = fieldValue(f, 'pitfall', 'typischer fehler', 'common mistake');
    const m = v ? WRONG_RIGHT.exec(cleanCell(v)) : null;
    if (m) addPitfall(m[1], m[2], m[3] ?? '');
  }
  if (!titleEn || !ruleEn || examples.length < 2) return null;
  return {
    card: {
      key: slugKey('own', titleEn, now),
      level,
      title_en: sentenceCase(titleEn.replace(/[.]+$/, '')),
      title_de: sentenceCase(titleDe.replace(/[.]+$/, '')),
      rule_en: ruleEn,
      rule_de: ruleDe,
      examples: examples.slice(0, 4),
      pitfalls: pitfalls.slice(0, 2),
      items: [],
      reference: null,
    },
    dropped,
  };
}

const TOPIC_NOISE = /^(?:here are|here's|here is|sure|of course|certainly|topics?|themen|themes?|vokabel|vocabulary|lesson topics|for (?:a |an )?[ab][12])/i;
const TOPIC_STOP = /^(?:the|and|with|from|about|your|their)$/;

/**
 * Short topic names, one per line, without numbering, the German noun the model glosses them with ("the weather
 * (das Wetter)"), a preamble line, or the ones already offered. A topic that shares a content word with the
 * given list ("at the doctor's" next to "health and the doctor") counts as a repeat.
 */
export function parseTopics(text: string, exclude: string[] = [], max = 6): string[] {
  const seen = new Set(exclude.map((t) => normalise(t)));
  const contentWords = (key: string) => key.split(' ').map((w) => w.replace(/'s$|[^a-z0-9]+$/g, '')).filter((w) => w.length > 3 && !TOPIC_STOP.test(w));
  const seenWords = new Set([...seen].flatMap(contentWords));
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = stripMd(raw).replace(BULLET, '');
    if (DICT_ENTRY.test(line)) continue;
    let t = unquote(line);
    t = t
      .split(/\s*[:(–—-]\s+|\s*\(/)[0]
      .replace(/[.!,;]+$/, '')
      .trim();
    if (!t || t.length < 3 || t.length > 40 || TOPIC_NOISE.test(t) || /[:?|]/.test(t)) continue;
    if (t.split(/\s+/).length > 5) continue;
    const key = normalise(t);
    if (seen.has(key)) continue;
    const words = contentWords(key);
    if (words.some((w) => seenWords.has(w))) continue;
    seen.add(key);
    for (const w of words) seenWords.add(w);
    out.push(t.charAt(0).toLowerCase() + t.slice(1));
    if (out.length >= max) break;
  }
  return out;
}

/** The list is complete once `n` usable topics stand on finished lines (the line being written does not count). */
export function topicsComplete(text: string, n: number, exclude: string[] = []): boolean {
  const done = text.slice(0, text.lastIndexOf('\n') + 1);
  return parseTopics(done, exclude, n).length >= n;
}
