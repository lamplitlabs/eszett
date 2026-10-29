// Conjugation and declension tables inside a rule card's text. A rule often carries a paradigm written out in a
// line — "sein – ich bin, du bist, er ist, wir sind, ihr seid, sie sind" — which reads better as a table and
// makes an exercise (the forms blanked out, to fill in). This module finds those runs in the rule text, in three
// shapes: pronoun + form runs (with an optional label before them: an infinitive or a tense name), arrow runs
// ("ich → mein, du → dein"), and case lists ("Nominativ: ich, du, …; Akkusativ: mich, dich, …"), and splits the
// text into plain parts and tables so the screen can lay them out. The German is the same in every UI language,
// so one parser serves all the overlays.

export interface Paradigm {
  /** Column headers: null for the pronoun column and for a column without a label. */
  labels: (string | null)[];
  /** Rows: the pronoun (or first-column key) first, then one form per further column. */
  rows: string[][];
}

export type RuleSegment = { kind: 'text'; text: string } | { kind: 'table'; paradigm: Paradigm };

const PRONOUN = String.raw`(?:ich|du|er\/sie\/es|er\/es|er|sie\/Sie|sie \([^)]{1,16}\)|sie|es|wir|ihr|Sie)`;
const PRONOUN_RE = new RegExp(`^${PRONOUN}$`);
/** A label right before a run: an infinitive (sein, haben, lassen, können) or a tense/case/mood name, English or German. */
const LABEL_RE = /(?:^|[\s(„"'«»])([A-Za-zÄÖÜäöüßÀ-ÿĀ-ſА-яЁёІіЇїЄєĞğİıŞşÇç][\wäöüßÀ-ÿĀ-ſА-яЁёІіЇїЄєĞğİıŞşÇç/ ]{1,24}?)\s*[–—:：-]\s*$/u;
const LABEL_OK =
  /^(?:[a-zäöüß]+(?:en|eln|ern)|sein|tun|Präsens|Präteritum|Perfekt|Plusquamperfekt|Futur(?: I{1,2})?|Konjunktiv(?: I{1,2})?|Imperativ|Nominativ|Akkusativ|Dativ|Genitiv|Singular|Plural|Passiv|Aktiv|Present|Past|Simple past|Perfect|Pluperfect|Future(?: I{1,2})?|Subjunctive(?: I{1,2})?|Imperative|Nominative|Accusative|Dative|Genitive|Passive|Active|Présent|Prétérit|Nominatif|Accusatif|Datif|Génitif|Presente|Pretérito|Nominativo|Acusativo|Accusativo|Dativo|Genitivo|Mianownik|Biernik|Celownik|Dopełniacz|Teraźniejszy|Именительный|Винительный|Дательный|Родительный|Настоящее|Називний|Знахідний|Давальний|Родовий|Теперішній|Yalın|Belirtme|Yönelme|Şimdiki zaman|Geniş zaman)$/u;
/** Words that end a sentence before a run but name nothing: "Formen:", "Forms:", "lernen:" — the run then has no label. */
const LABEL_STOP = new Set(['lernen', 'merken', 'formen', 'forms', 'bilden', 'heißen', 'sagen', 'benutzen', 'nehmen', 'stehen', 'kommen', 'haben wir', 'endungen', 'endings', 'e-endungen', 'e-endings']);
const MIN_ROWS = 3;
/**
 * The persons a paradigm runs through, in order: singular 1–3, plural 1–3, the formal Sie. "sie" is the 3rd person
 * singular before "wir" and the 3rd person plural after "ihr"; a run whose persons do not climb is a list of
 * examples ("ich war, er hatte, sie konnte"), not a table.
 */
const PERSON: Record<string, number> = { ich: 1, du: 2, er: 3, 'er/sie/es': 3, 'er/es': 3, es: 3, wir: 4, ihr: 5, 'sie/Sie': 6, Sie: 7 };
function ordered(pronouns: string[]): boolean {
  let last = 0;
  for (const p of pronouns) {
    let n = PERSON[p];
    // "er/es" then "sie (Singular)" share the 3rd person: the same rank may follow once
    if (/^sie \(/i.test(p)) n = /plur|mehrzahl|liczba mnoga|мн|plural|çoğul|جمع|复数/i.test(p) ? 6 : 3;
    else if (p === 'sie') n = last >= 4 ? 6 : 3;
    if (n === undefined || n < last || (n === last && !/^sie \(/i.test(p))) return false;
    last = n;
  }
  return true;
}

const trimForm = (s: string) => s.replace(/^[\s„"'(]+|[\s.;:!?)"“”]+$/g, '').trim();

function labelBefore(text: string, start: number): { label: string | null; from: number } {
  const before = text.slice(Math.max(0, start - 40), start);
  const m = LABEL_RE.exec(before);
  if (!m) return { label: null, from: start };
  const label = m[1].trim();
  const from = start - (before.length - m.index - (m[0].startsWith(' ') || /^[(„"']/.test(m[0]) ? 1 : 0));
  // "Formen:" / "Forms:" name nothing: the colon leaves with the table, the table gets no label
  if (LABEL_STOP.has(label.toLowerCase())) return { label: null, from };
  if (!LABEL_OK.test(label)) return { label: null, from: start };
  // the label and its separator leave the text with the table
  return { label, from };
}

/** Pronoun + form runs and arrow runs: "ich bin, du bist, …" / "ich → mein, du → dein, …". */
function findRuns(text: string): { from: number; to: number; paradigm: Paradigm }[] {
  const out: { from: number; to: number; paradigm: Paradigm }[] = [];
  const starts = /\bich\b(?= |\s*→)/g;
  let m: RegExpExecArray | null;
  while ((m = starts.exec(text))) {
    const start = m.index;
    // walk comma-separated items while each starts with a pronoun
    const rows: string[][] = [];
    let pos = start;
    let end = start;
    let arrow = false;
    while (pos < text.length) {
      const rest = text.slice(pos);
      const item = /^(.*?)(,\s+|、|;\s+|；|。|\.\s|\.$|:\s|：|$|\s[–—-]\s)/s.exec(rest);
      if (!item) break;
      const raw = item[1];
      const pm = new RegExp(`^(${PRONOUN})\\s*(→\\s*)?(.+)$`).exec(raw.trim());
      if (!pm) break;
      const pronoun = pm[1];
      const form = trimForm(pm[3]);
      if (!form || form.split(/\s+/).length > 3 || /[,:;]/.test(form)) break;
      if (rows.length === 0 && pronoun !== 'ich') break;
      if (pm[2]) arrow = true;
      rows.push([pronoun, form]);
      end = pos + raw.length;
      const sep = item[2];
      if (sep !== undefined && /^(?:,\s+|、)$/.test(sep)) pos = pos + item[0].length;
      else break;
    }
    if (rows.length < MIN_ROWS) continue;
    // a paradigm runs through the persons in order; "ich war, er hatte, sie konnte" is a list of examples
    if (!ordered(rows.map((r) => r[0])) || !rows.some((r) => r[0] === 'du' || r[0] === 'wir' || r[0] === 'ihr')) continue;
    const { label, from } = labelBefore(text, start);
    out.push({ from, to: end, paradigm: { labels: [null, arrow ? null : label], rows } });
    starts.lastIndex = end;
  }
  return out;
}

/** Case lists: "Nominativ: ich, du, …. Akkusativ (…): mich, dich, …. Dativ (…): mir, dir, …." */
function findCaseTables(text: string): { from: number; to: number; paradigm: Paradigm }[] {
  const sentence = /(\p{Lu}[\p{L}]+|[\u4e00-\u9fff]{1,4})(?:\s*\([^)]*\))?\s?[:：]\s*([^.;:：；。]+?)(?=\.\s|\.$|;\s|；|。)/gu;
  const lists: { from: number; to: number; label: string; items: string[] }[] = [];
  let m: RegExpExecArray | null;
  while ((m = sentence.exec(text))) {
    const items = m[2].split(/,\s*|、/).map(trimForm);
    if (items.length < 6 || items.length > 9 || items.some((x) => !x || x.split(/\s+/).length > 2)) continue;
    lists.push({ from: m.index, to: m.index + m[0].length, label: m[1], items });
  }
  const out: { from: number; to: number; paradigm: Paradigm }[] = [];
  for (let i = 0; i < lists.length; i += 1) {
    if (!lists[i].items.every((x) => PRONOUN_RE.test(x))) continue;
    // the pronoun list starts a table; the following lists of the same length are its columns
    const group = [lists[i]];
    for (let j = i + 1; j < lists.length && lists[j].items.length === lists[i].items.length && lists[j].from - group[group.length - 1].to < 4; j += 1) group.push(lists[j]);
    if (group.length < 2) continue;
    const rows = lists[i].items.map((_, r) => group.map((g) => g.items[r]));
    out.push({ from: group[0].from, to: group[group.length - 1].to, paradigm: { labels: group.map((g) => g.label), rows } });
    i += group.length - 1;
  }
  return out;
}

/** Adjacent labelled runs with the same pronouns become one table with a column per label ("sein", "haben"). */
function merge(found: { from: number; to: number; paradigm: Paradigm }[], text: string) {
  const out: { from: number; to: number; paradigm: Paradigm }[] = [];
  for (const f of found) {
    const last = out[out.length - 1];
    const gap = last ? text.slice(last.to, f.from) : '';
    const sameRows = last && last.paradigm.rows.length === f.paradigm.rows.length && last.paradigm.rows.every((r, i) => r[0] === f.paradigm.rows[i][0]);
    if (last && sameRows && /^[\s.;]*$/.test(gap)) {
      last.paradigm = { labels: [...last.paradigm.labels, f.paradigm.labels[1]], rows: last.paradigm.rows.map((r, i) => [...r, f.paradigm.rows[i][1]]) };
      last.to = f.to;
    } else out.push({ ...f });
  }
  return out;
}

/** The tables a rule text carries, in order. */
export function paradigmsIn(text: string): Paradigm[] {
  return ruleSegments(text).flatMap((s) => (s.kind === 'table' ? [s.paradigm] : []));
}

/** The rule text split into plain parts and tables, the tables lifted out of the sentences that held them. */
export function ruleSegments(text: string): RuleSegment[] {
  const found = [...findCaseTables(text), ...findRuns(text)].sort((a, b) => a.from - b.from);
  // drop runs inside a case table's range
  const kept: typeof found = [];
  for (const f of found) if (!kept.some((k) => f.from >= k.from && f.to <= k.to)) kept.push(f);
  const merged = merge(kept, text);
  const out: RuleSegment[] = [];
  let pos = 0;
  for (const f of merged) {
    const before = text.slice(pos, f.from).replace(/\s+$/, '');
    if (before.trim()) out.push({ kind: 'text', text: before });
    out.push({ kind: 'table', paradigm: f.paradigm });
    pos = f.to;
    // a full stop or semicolon that closed the run goes with it
    const tail = /^[.;:]+/.exec(text.slice(pos));
    if (tail) pos += tail[0].length;
  }
  const rest = text.slice(pos).trim();
  if (rest) out.push({ kind: 'text', text: rest });
  return out.length ? out : [{ kind: 'text', text }];
}

/** Compare a typed form with the table's: case, hyphens in stems ("wohn-e"), umlaut spellings and spacing aside. */
export function sameForm(typed: string, form: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/ß/g, 'ss')
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/[-‐]/g, '')
      .replace(/[^a-z\s/]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  return norm(typed) === norm(form);
}

/**
 * Which cells of a table to blank for the exercise: about half of the form cells, never the first column,
 * never a whole column, chosen by a seed so a card keeps its pattern and "again" gives another.
 */
export function blankCells(paradigm: Paradigm, seed: number): boolean[][] {
  const cols = paradigm.labels.length;
  const cells = paradigm.rows.map((row) => row.map(() => false));
  for (let j = 1; j < cols; j += 1) {
    let blanked = 0;
    for (let i = 0; i < paradigm.rows.length; i += 1) {
      const blank = (i + j + seed) % 2 === 0;
      cells[i][j] = blank;
      if (blank) blanked += 1;
    }
    if (blanked === 0) cells[0][j] = true;
    if (blanked === paradigm.rows.length) cells[paradigm.rows.length - 1][j] = false;
  }
  return cells;
}
