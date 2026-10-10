// Grounding: the model ships `grounding.json`, short verified rule notes with a router of cue patterns.
// When a learner's message matches a note, the note is appended to the user turn exactly as in training
// (prompt + separator + header + note). With a note in front of it the model quotes the rule correctly;
// without one it can invent an analysis (model card, "Known weak spots").

export interface GroundingRules {
  exams: Record<string, string>;
  levels: Record<string, string>;
  exam_cue: string;
  vocab_cue: string;
  exam_blocks: Record<string, Record<string, string>>;
  level_blocks: Record<string, string[]>;
  topics: [string, string][];
  fallback_block: string;
  grammar?: [string, string][];
}

export interface GroundingPack {
  version: number;
  header: string;
  separator: string;
  max_blocks: number;
  blocks: Record<string, string>;
  rules: GroundingRules;
}

/** Lower case with umlauts folded to plain vowels, the form the router's patterns are written for. */
export function foldForRouting(text: string): string {
  let out = text.toLowerCase();
  for (const [src, dst] of [
    ['ä', 'a'],
    ['ö', 'o'],
    ['ü', 'u'],
    ['ß', 'ss'],
  ] as const) {
    out = out.split(src).join(dst);
  }
  return out;
}

const patternCache = new Map<string, RegExp>();
function re(pattern: string): RegExp {
  let r = patternCache.get(pattern);
  if (!r) {
    r = new RegExp(pattern);
    patternCache.set(pattern, r);
  }
  return r;
}

function search(pattern: string, text: string): number | null {
  const m = re(pattern).exec(text);
  return m ? m.index : null;
}

/** Route a bare learner prompt to at most `max_blocks` note keys (empty = no grounding). */
export function selectBlocks(prompt: string, grounding: GroundingPack): string[] {
  const rules = grounding.rules;
  const text = foldForRouting(prompt);
  const exams = Object.entries(rules.exams)
    .map(([name, pat]) => [search(pat, text), name] as const)
    .filter((e): e is readonly [number, string] => e[0] !== null)
    .sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  const levels = Object.entries(rules.levels)
    .filter(([, pat]) => re(pat).test(text))
    .map(([name]) => name);
  const examCue = re(rules.exam_cue).test(text);
  const vocab = re(rules.vocab_cue).test(text);
  const topicKeys = rules.topics.filter(([, pat]) => re(pat).test(text)).map(([key]) => key);

  const examKeys: string[] = [];
  for (const [, exam] of exams) {
    const table = rules.exam_blocks[exam];
    const hits = levels.filter((level) => level in table).map((level) => table[level]);
    examKeys.push(...(hits.length ? hits : [table['']]));
  }
  const levelKeys = levels.flatMap((level) => rules.level_blocks[level] ?? []);

  let ordered: string[];
  if (examKeys.length) {
    ordered = [...examKeys, ...topicKeys];
    if (examKeys.length > 1 && topicKeys.includes('compare')) ordered = ['compare', ...ordered];
  } else if (vocab && examCue) ordered = [rules.fallback_block];
  else if (levelKeys.length && examCue) ordered = [...topicKeys, ...levelKeys];
  else if (examCue) ordered = topicKeys.length ? topicKeys : [rules.fallback_block];
  else {
    // no exam in sight: the grammar reference blocks
    ordered = (rules.grammar ?? []).filter(([, pat]) => re(pat).test(text)).map(([key]) => key);
    if (!ordered.length) return [];
  }

  const chosen: string[] = [];
  for (const key of ordered) {
    if (key in grounding.blocks && !chosen.includes(key)) chosen.push(key);
  }
  return chosen.slice(0, grounding.max_blocks);
}

export interface GroundedPrompt {
  text: string;
  keys: string[];
}

/**
 * Where the note goes in the user turn. 'after' is the layout the model was trained on (prompt, separator,
 * header, note). 'before' puts header and note first and the prompt last: then the note is a prefix the engine
 * can evaluate into its cache while the learner is still typing, and only the question itself is new work.
 */
export type NoteLayout = 'after' | 'before';

/** The header, reworded for a note that stands before the question. */
const headerFor = (grounding: GroundingPack, layout: NoteLayout) =>
  layout === 'before' ? grounding.header.replace('the question above', 'the question below') : grounding.header;

/** The chosen notes as one block, each trimmed, as the training rows join them. */
const noteText = (grounding: GroundingPack, keys: string[]) => keys.map((k) => grounding.blocks[k].replace(/\s+$/, '')).join('\n\n');

/** The note keys a prompt would carry: the given ones that exist, else the router's choice, capped at max_blocks. */
export function noteKeys(prompt: string, grounding: GroundingPack | null, keys: string[] | null = null): string[] {
  if (!grounding) return [];
  const candidates = keys ?? selectBlocks(prompt, grounding);
  return candidates.filter((k) => k in grounding.blocks).slice(0, grounding.max_blocks);
}

/** The user turn: the prompt with the chosen note blocks, in the given layout. */
export function groundPrompt(prompt: string, grounding: GroundingPack | null, keys: string[] | null = null, layout: NoteLayout = 'after'): GroundedPrompt {
  if (!grounding) return { text: prompt, keys: [] };
  const used = noteKeys(prompt, grounding, keys);
  if (!used.length) return { text: prompt, keys: [] };
  const context = noteText(grounding, used);
  if (layout === 'before') return { text: `${headerFor(grounding, layout)}\n${context}${grounding.separator}${prompt}`, keys: used };
  return { text: `${prompt}${grounding.separator}${grounding.header}\n${context}`, keys: used };
}

/**
 * The part of a 'before'-layout user turn that comes before the prompt (header, note, separator): what to
 * evaluate ahead of time. Empty for the 'after' layout or without a note, where nothing precedes the prompt.
 */
export function notePrefix(grounding: GroundingPack | null, keys: string[], layout: NoteLayout): string {
  if (!grounding || layout !== 'before') return '';
  const used = keys.filter((k) => k in grounding.blocks).slice(0, grounding.max_blocks);
  if (!used.length) return '';
  return `${headerFor(grounding, layout)}\n${noteText(grounding, used)}${grounding.separator}`;
}

/** Learner-facing title of a note: its first line without the trailing colon ("Perfekt and Partizip II"). */
export function blockTitle(grounding: GroundingPack, key: string): string {
  const first = (grounding.blocks[key] ?? '').split('\n')[0] ?? key;
  return first.replace(/\s*\((reference|referenz)[^)]*\)\s*:?\s*$/i, '').replace(/:\s*$/, '').trim();
}
