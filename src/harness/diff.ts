// A word-level diff between what the learner wrote and the tutor's corrected version, rendered as red-pen
// marks: struck-through words the tutor removed, inserted words written above them.

export type DiffOp = { type: 'same' | 'del' | 'ins'; text: string };

/** Words and punctuation as separate tokens; whitespace is dropped (it is re-inserted when rendering). */
export function tokenize(text: string): string[] {
  return text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*|[^\s\p{L}\p{N}]/gu) ?? [];
}

const key = (t: string) => t.toLowerCase();

/** Longest-common-subsequence diff over tokens; adjacent operations of one type are merged. */
export function diffWords(before: string, after: string): DiffOp[] {
  const a = tokenize(before);
  const b = tokenize(after);
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i][j] = key(a[i]) === key(b[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const ops: DiffOp[] = [];
  const push = (type: DiffOp['type'], text: string) => {
    const last = ops[ops.length - 1];
    if (last && last.type === type) last.text = joinTokens([last.text, text]);
    else ops.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (key(a[i]) === key(b[j])) {
      // a change of case only ("ich" -> "Ich") is still a correction
      if (a[i] !== b[j]) {
        push('del', a[i]);
        push('ins', b[j]);
      } else push('same', b[j]);
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push('del', a[i]);
      i += 1;
    } else {
      push('ins', b[j]);
      j += 1;
    }
  }
  while (i < n) push('del', a[i++]);
  while (j < m) push('ins', b[j++]);
  return ops;
}

/** Joins tokens with spaces except before closing punctuation and after opening quotes. */
export function joinTokens(tokens: string[]): string {
  let out = '';
  for (const t of tokens) {
    if (!out) out = t;
    else if (/^[.,;:!?)\]}“”"»]/.test(t) || /[(\[{„«]$/.test(out)) out += t;
    else out += ` ${t}`;
  }
  return out;
}

/** How many words the tutor changed: 0 means the learner's text was already right. */
export function changeCount(ops: DiffOp[]): number {
  return ops.filter((o) => o.type !== 'same').length;
}
