import { describe, expect, it } from 'vitest';

import { CSV_HEADER, formatDeckWordsCsv } from '../reviewRules';

describe('saved words CSV export', () => {
  it('writes one word,translation,box row per saved word under the header', () => {
    const csv = formatDeckWordsCsv([
      { german: 'die Abfahrt', meaning: 'departure', box: 1 },
      { german: 'gehen', meaning: 'to go', box: 3 },
    ]);
    expect(csv).toBe(`${CSV_HEADER}\ndie Abfahrt,departure,1\ngehen,to go,3`);
    expect(CSV_HEADER).toBe('word,translation,box');
  });

  it('quotes fields with commas, quotes or line breaks, doubling inner quotes', () => {
    const csv = formatDeckWordsCsv([
      { german: 'Ich hätte gern …', meaning: 'I would like…', box: 2 },
      { german: 'die Universität, "Uni"', meaning: 'university, "uni"', box: 4 },
      { german: 'Zeile eins\nZeile zwei', meaning: 'line one\nline two', box: 5 },
    ]);
    const rows = csv.split('\n');
    expect(rows[0]).toBe(CSV_HEADER);
    expect(rows[1]).toBe('Ich hätte gern …,I would like…,2');
    expect(rows[2]).toBe('"die Universität, ""Uni""","university, ""uni""",4');
    // The newline inside the field stays inside its quotes, so the row spans two lines.
    expect(csv).toContain('"Zeile eins\nZeile zwei","line one\nline two",5');
  });

  it('is header-only when nothing is saved', () => {
    expect(formatDeckWordsCsv([])).toBe(CSV_HEADER);
  });
});
