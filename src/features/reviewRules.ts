// Review-screen rules. Pure: tested in node; the UI (src/app/review.tsx) and src/features/review.ts
// do the platform calls.
//
// When the app may ask for a store review:

export const REVIEW_RULES = {
  /** Days with at least one exercise before the first ask. */
  minActiveDays: 3,
  /** Exercises, checks and answers in all. */
  minCompletions: 5,
  /** Between two asks. */
  minGapMs: 120 * 86_400_000,
  maxAsks: 3,
} as const;

export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.lamplitlabs.eszett';

export interface Engagement {
  activeDays: number;
  completions: number;
}

/** What the progress store says about use so far. */
export function engagementOf(days: Record<string, number>): Engagement {
  const counts = Object.values(days);
  return { activeDays: counts.filter((n) => n > 0).length, completions: counts.reduce((a, b) => a + b, 0) };
}

/** True when the app may ask now. */
export function shouldAskForReview(e: Engagement, state: { askedAt: number | null; asks: number }, modelReady: boolean, now = Date.now()): boolean {
  if (!modelReady) return false;
  if (e.activeDays < REVIEW_RULES.minActiveDays || e.completions < REVIEW_RULES.minCompletions) return false;
  if (state.asks >= REVIEW_RULES.maxAsks) return false;
  if (state.askedAt !== null && now - state.askedAt < REVIEW_RULES.minGapMs) return false;
  return true;
}

// Exporting "My words" as CSV: a learner can share the list out of the app (mail, files, a
// spreadsheet) without losing the Leitner box each word sits in. One row per word:
// word, translation, box — the word as shown on the card front, its meaning in the learner's
// language, and the box number the review screen prints.

export const CSV_HEADER = 'word,translation,box';

/** A field per RFC 4180: quote when it holds a comma, quote or line break; quotes inside double. */
function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** The saved words as a CSV document, ready to share. Empty deck: header only. */
export function formatDeckWordsCsv(words: Pick<import('@/state/deck').DeckWord, 'german' | 'meaning' | 'box'>[]): string {
  return [CSV_HEADER, ...words.map((w) => [csvField(w.german), csvField(w.meaning), String(w.box)].join(','))].join('\n');
}

// Importing words back from that CSV: someone keeps their list in a spreadsheet, moves to a new
// phone, or restores the words a reinstall wiped. The parser reads exactly what formatDeckWordsCsv
// writes (quoted commas/quotes/line breaks survive), and the merge adds only the words the deck
// does not already have — a word already saved keeps the Leitner box the learner reviewed it into.

/** One parsed CSV row, before it meets the deck. */
export interface ParsedDeckWord {
  /** The word as shown on the card front. */
  german: string;
  /** Its meaning in the learner's language. */
  meaning: string;
  /** Box number from the file, clamped into the Leitner range when it parses; undefined = start in box 1. */
  box?: number;
}

/** What parseDeckWordsCsv found: the rows it accepted, and what it refused to read as a word. */
export interface DeckWordsCsvParse {
  /** Rows with a word on the front, in file order. */
  words: ParsedDeckWord[];
  /** Non-empty lines that were not usable rows (bad column count, no word, not the expected header). */
  skipped: string[];
  /** True when no usable word row was found at all. */
  empty: boolean;
}

const MAX_CSV_COLUMNS = 3;

/** The Leitner range the deck keeps a word in: box 1 is new, box 5 is mastered. */
const MIN_BOX = 1;
const MAX_BOX = 5;

/** One CSV line per RFC 4180 into fields: quoted commas and doubled quotes come back intact. */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let afterQuote = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      if (afterQuote) return [];
      if (field.length > 0) return [];
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(field);
      field = '';
      afterQuote = false;
    } else {
      field += ch;
      afterQuote = false;
    }
  }
  if (inQuotes) return [];
  fields.push(field);
  return fields;
}

function csvFieldKey(line: string): string {
  return line.trim().replace(/\r$/, '');
}

/** Splits a CSV document into records; a line break inside a quoted field stays in its record. */
function csvRecords(text: string): string[] {
  const records: string[] = [];
  let record = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      record += ch;
      if (ch === '"') {
        if (text[i + 1] === '"') {
          record += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      }
    } else if (ch === '"') {
      inQuotes = true;
      record += ch;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      records.push(record);
      record = '';
    } else {
      record += ch;
    }
  }
  if (record) records.push(record);
  return records;
}

/** Words a CSV document adds to the deck, and how many it added: skips duplicates and header rows. */
export function mergeDeckWords(existing: Pick<import('@/state/deck').DeckWord, 'german'>[], parsed: ParsedDeckWord[]): { added: ParsedDeckWord[]; count: number } {
  const known = new Set(existing.map((w) => w.german.trim().toLowerCase()));
  const added: ParsedDeckWord[] = [];
  for (const word of parsed) {
    const key = word.german.trim().toLowerCase();
    if (!key || known.has(key)) continue;
    known.add(key);
    added.push(word);
  }
  return { added, count: added.length };
}

/** Parses a CSV document in the format formatDeckWordsCsv writes. Header optional; box column optional. */
export function parseDeckWordsCsv(text: string): DeckWordsCsvParse {
  const words: ParsedDeckWord[] = [];
  const skipped: string[] = [];
  const lines = csvRecords(text.replace(/^\uFEFF/, ''));
  let headerSeen = false;
  for (const raw of lines) {
    const line = csvFieldKey(raw);
    if (!line) continue;
    if (!headerSeen && line.toLowerCase() === CSV_HEADER) {
      headerSeen = true;
      continue;
    }
    const fields = parseCsvLine(raw);
    if (fields.length < 2 || fields.length > MAX_CSV_COLUMNS) {
      skipped.push(line);
      continue;
    }
    const german = fields[0].trim();
    const meaning = fields[1].trim();
    if (!german) {
      skipped.push(line);
      continue;
    }
    let box: number | undefined;
    if (fields.length === 3 && fields[2].trim() !== '') {
      const parsed = Number.parseInt(fields[2].trim(), 10);
      if (Number.isNaN(parsed)) {
        skipped.push(line);
        continue;
      }
      box = Math.min(Math.max(parsed, MIN_BOX), MAX_BOX);
    }
    words.push({ german, meaning, box });
  }
  return { words, skipped, empty: words.length === 0 };
}

// Removing a saved word throws away its Leitner box — the progress the learner built reviewing it.
// So the trash button never deletes on a single tap: the app asks first, with the word's name in
// the question. These rules build what the confirmation says and does, without touching the UI.

export interface RemoveWordCopy {
  /** Alert title with the word's name already filled in by the caller. */
  title: string;
  /** Alert body with the word's name already filled in by the caller. */
  message: string;
  /** Label of the button that deletes the word. */
  confirm: string;
  /** Label of the button that keeps it. */
  cancel: string;
}

export interface RemoveWordAlert {
  /** Title with the word filled in. */
  title: string;
  /** Body with the word filled in. */
  message: string;
  /** Labels for the two buttons. */
  confirm: string;
  cancel: string;
  /** Run this to actually delete the word (box progress lost). */
  action: () => void;
}

/** Interpolate one `{name}` placeholder; templates that miss it pass through unchanged. */
export function fillTemplate(template: string, name: string, value: string): string {
  return template.split(`{${name}}`).join(value);
}

/**
 * The confirmation for deleting one saved word: the texts (already word-named by the caller)
 * plus the removal to run only when the learner confirms. Pure — the UI (src/state/deck.ts)
 * turns the result into a React Native Alert.
 */
export function buildRemoveWordAlert(copy: RemoveWordCopy, remove: () => void): RemoveWordAlert {
  return {
    title: copy.title,
    message: copy.message,
    confirm: copy.confirm,
    cancel: copy.cancel,
    action: remove,
  };
}
