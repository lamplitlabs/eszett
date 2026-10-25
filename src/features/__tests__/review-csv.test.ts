import { describe, expect, it } from 'vitest';

import { CSV_HEADER, formatDeckWordsCsv, mergeDeckWords, parseDeckWordsCsv } from '../reviewRules';

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

describe('saved words CSV import', () => {
  it('round-trips: format, parse and merge hand every word back once', () => {
    const deck = [
      { german: 'die Abfahrt', meaning: 'departure', box: 2 },
      { german: 'gehen', meaning: 'to go', box: 3 },
      { german: 'die Universität, "Uni"', meaning: 'university, "uni"', box: 4 },
      { german: 'Zeile eins\nZeile zwei', meaning: 'line one\nline two', box: 5 },
    ];
    const parsed = parseDeckWordsCsv(formatDeckWordsCsv(deck));
    expect(parsed.empty).toBe(false);
    expect(parsed.skipped).toEqual([]);
    expect(parsed.words).toEqual(deck);

    // Importing into the deck the export came from adds nothing: every word is already there.
    expect(mergeDeckWords(deck, parsed.words).count).toBe(0);

    // Importing into an empty deck hands back every word.
    const fresh = mergeDeckWords([], parsed.words);
    expect(fresh.count).toBe(deck.length);
    expect(fresh.added).toEqual(deck);
  });

  it('reads a hand-written CSV without the header or the box column', () => {
    const parsed = parseDeckWordsCsv('die Abfahrt,departure\ngehen,to go\n');
    expect(parsed.empty).toBe(false);
    expect(parsed.words).toEqual([
      { german: 'die Abfahrt', meaning: 'departure', box: undefined },
      { german: 'gehen', meaning: 'to go', box: undefined },
    ]);
  });

  it('accepts CRLF line endings and a BOM', () => {
    const parsed = parseDeckWordsCsv(`\uFEFF${CSV_HEADER}\r\ndie Abfahrt,departure,2\r\n`);
    expect(parsed.words).toEqual([{ german: 'die Abfahrt', meaning: 'departure', box: 2 }]);
    expect(parsed.skipped).toEqual([]);
  });

  it('clamps a box outside the Leitner range and skips rows without a word', () => {
    const parsed = parseDeckWordsCsv(`${CSV_HEADER}\naus,really,9\n,no word,3\ndoch,after all,0\n,,\n`);
    expect(parsed.words).toEqual([
      { german: 'aus', meaning: 'really', box: 5 },
      { german: 'doch', meaning: 'after all', box: 1 },
    ]);
    expect(parsed.skipped).toEqual([',no word,3', ',,']);
  });

  it('skips rows with the wrong column count or a box that is not a number', () => {
    const parsed = parseDeckWordsCsv('onlyonecol\na,b,c,d\nword,meaning,abc\n');
    expect(parsed.empty).toBe(true);
    expect(parsed.skipped).toEqual(['onlyonecol', 'a,b,c,d', 'word,meaning,abc']);
  });

  it('keeps existing box progress: merge skips words the deck already has, case-insensitively', () => {
    const existing = [{ german: 'Die Abfahrt' }];
    const parsed = [
      { german: 'die Abfahrt', meaning: 'departure', box: 5 },
      { german: 'gehen', meaning: 'to go', box: 2 },
      { german: 'gehen', meaning: 'a duplicate inside the file', box: 1 },
    ];
    const { added, count } = mergeDeckWords(existing, parsed);
    expect(count).toBe(1);
    expect(added).toEqual([{ german: 'gehen', meaning: 'to go', box: 2 }]);
  });
});
