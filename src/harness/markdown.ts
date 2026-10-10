// A small Markdown reader for the model's "plain text with light Markdown": paragraphs whose lines stay
// separate (the model writes "Fix: …" and "Reason: …" on consecutive lines), lists, quotes, headings,
// simple tables, and bold / italic / code / strike inside a line. It produces plain data, so rendering
// stays in the UI layer and the parser is tested in Node.

export interface Span {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strike?: boolean;
}

export type Line = Span[];

export type Block =
  | { type: 'para'; lines: Line[] }
  | { type: 'heading'; level: number; line: Line }
  | { type: 'list'; ordered: boolean; items: { marker: string; line: Line; depth: number }[] }
  | { type: 'quote'; lines: Line[] }
  | { type: 'table'; header: Line[]; rows: Line[][] }
  | { type: 'rule' };

/** Inline formatting: **bold**, *italic* / _italic_, `code`, ~~strike~~ (nesting of bold and italic). */
export function parseInline(src: string): Line {
  const out: Span[] = [];
  const state = { bold: false, italic: false, strike: false };
  let buf = '';
  const flush = () => {
    if (!buf) return;
    out.push({ text: buf, ...(state.bold && { bold: true }), ...(state.italic && { italic: true }), ...(state.strike && { strike: true }) });
    buf = '';
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i) {
        flush();
        out.push({ text: src.slice(i + 1, end), code: true });
        i = end + 1;
        continue;
      }
    }
    if (src.startsWith('**', i) || src.startsWith('__', i)) {
      const marker = src.slice(i, i + 2);
      if (state.bold || src.indexOf(marker, i + 2) > i + 2) {
        flush();
        state.bold = !state.bold;
        i += 2;
        continue;
      }
    }
    if (src.startsWith('~~', i) && (state.strike || src.indexOf('~~', i + 2) > i + 2)) {
      flush();
      state.strike = !state.strike;
      i += 2;
      continue;
    }
    if ((c === '*' || c === '_') && src[i + 1] !== c) {
      const prev = src[i - 1] ?? ' ';
      const next = src[i + 1] ?? ' ';
      // "_" inside a word (snake_case) and a lone "*" between spaces are text, not emphasis
      const opens = !state.italic && /\S/.test(next) && (c === '*' ? true : /[\s(„"'-]/.test(prev)) && src.indexOf(c, i + 1) > i + 1;
      const closes = state.italic && /\S/.test(prev);
      if (opens || closes) {
        flush();
        state.italic = !state.italic;
        i += 1;
        continue;
      }
    }
    buf += c;
    i += 1;
  }
  flush();
  return out.length ? out : [{ text: '' }];
}

const LIST_ITEM = /^(\s*)([-*•+]|\d+[.)])\s+(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => parseInline(c.trim()));

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r/g, '').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: 'rule' });
      i += 1;
      continue;
    }
    const heading = /^\s*(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, line: parseInline(heading[2]) });
      i += 1;
      continue;
    }
    if (TABLE_ROW.test(line) && TABLE_SEP.test(lines[i + 1] ?? '')) {
      const header = cells(line);
      const rows: Line[][] = [];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i])) rows.push(cells(lines[i++]));
      blocks.push({ type: 'table', header, rows });
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote: Line[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(parseInline(lines[i++].replace(/^\s*>\s?/, '')));
      blocks.push({ type: 'quote', lines: quote });
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const first = LIST_ITEM.exec(line) as RegExpExecArray;
      const ordered = /\d/.test(first[2]);
      const items: { marker: string; line: Line; depth: number }[] = [];
      while (i < lines.length) {
        const m = LIST_ITEM.exec(lines[i]);
        if (m) {
          items.push({ marker: m[2], line: parseInline(m[3]), depth: m[1].length >= 2 ? 1 : 0 });
          i += 1;
        } else if (/^\s{2,}\S/.test(lines[i]) && items.length) {
          // an indented continuation (often the example sentence under a word-list item)
          items.push({ marker: '', line: parseInline(lines[i].trim()), depth: 1 });
          i += 1;
        } else break;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }
    const para: Line[] = [];
    while (i < lines.length && lines[i].trim() && !LIST_ITEM.test(lines[i]) && !/^\s*(>|#{1,4}\s)/.test(lines[i]) && !(TABLE_ROW.test(lines[i]) && TABLE_SEP.test(lines[i + 1] ?? ''))) {
      para.push(parseInline(lines[i].trim()));
      i += 1;
    }
    blocks.push({ type: 'para', lines: para });
  }
  return blocks;
}

export const lineText = (line: Line) => line.map((s) => s.text).join('');

/** Removes a dangling, unclosed marker at the end of a streaming answer so half-written bold does not flash. */
export function settleStreaming(text: string): string {
  const stars = (text.match(/\*\*/g) ?? []).length;
  return stars % 2 === 1 ? `${text}**` : text;
}
