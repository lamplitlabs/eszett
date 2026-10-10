// A greedy decoder that has started repeating itself does not stop on its own: v24 (Q5_K_M) answered a C1
// Passiversatz question with the same two-line quote block to the token limit. The engine asks loopCut() each
// time a line or sentence is finished and ends the generation at the first copy of whatever is being repeated.

/** The longest block (in lines) the guard looks for; the v24 loop had a period of two lines. */
const MAX_PERIOD = 6;
/** Repeats shorter than this ("Ja.", "- …") are left alone; a learner may well be shown three identical short lines. */
const MIN_CHARS = 8;
/** Copies in a row before the text counts as looping. */
const COPIES = 3;

const SENTENCE = /[^.!?…\n]+[.!?…]+[)"»“”'*_]*\s*/g;

/**
 * Where a text that has started repeating itself should be cut, or -1 when it has not: the offset of the second
 * copy of a block of one to six lines (blank lines ignored) or of a sentence that the text ends with three times
 * in a row. The last, unfinished line only takes part in the sentence check, so the text can be streaming.
 */
export function loopCut(text: string): number {
  const parts = text.split('\n');
  const tail = parts.pop() ?? '';
  const lines: { s: string; at: number }[] = [];
  let at = 0;
  for (const line of parts) {
    const s = line.trim();
    if (s) lines.push({ s, at });
    at += line.length + 1;
  }
  const n = lines.length;
  for (let p = 1; p <= MAX_PERIOD && COPIES * p <= n; p++) {
    let periodic = true;
    for (let i = n - COPIES * p; i < n - p && periodic; i++) periodic = lines[i].s === lines[i + p].s;
    if (!periodic) continue;
    if (lines.slice(n - p).reduce((len, l) => len + l.s.length, 0) < MIN_CHARS) continue;
    let start = n - COPIES * p;
    while (start > 0 && lines[start - 1].s === lines[start - 1 + p].s) start -= 1;
    return lines[start + p].at;
  }
  const sentences = [...tail.matchAll(SENTENCE)].map((m) => ({ s: m[0].trim(), at: at + m.index }));
  const m = sentences.length;
  if (m < COPIES) return -1;
  const last = sentences[m - 1].s;
  if (last.length < MIN_CHARS) return -1;
  let start = m - 1;
  while (start > 0 && sentences[start - 1].s === last) start -= 1;
  return m - start >= COPIES ? sentences[start + 1].at : -1;
}
