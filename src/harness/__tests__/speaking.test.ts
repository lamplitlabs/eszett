// Speaking: what the recognizer heard against the sentence to say.
import { describe, expect, it } from 'vitest';

import { CLEAR_RATIO, compareSpoken, spokenTokens } from '../speaking';

describe('spoken tokens', () => {
  it('normalises case, ß, umlauts and punctuation and spells the recognizer\'s digits out', () => {
    expect(spokenTokens('Ich heiße Anna, und du?')).toEqual(['ich', 'heisse', 'anna', 'und', 'du']);
    expect(spokenTokens('Um 7 Uhr')).toEqual(['um', 'sieben', 'uhr']);
    expect(spokenTokens('Das kostet 3,50 Euro')).toEqual(['das', 'kostet', 'drei', 'komma', 'fuenfzig', 'euro']);
    expect(spokenTokens('21 Jahre')).toEqual(['einundzwanzig', 'jahre']);
    expect(spokenTokens('Schönes Wetter!')).toEqual(['schoenes', 'wetter']);
  });
});

describe('comparing a sentence with what was heard', () => {
  it('counts a sentence heard as said, whatever the recognizer did to case, punctuation and digits', () => {
    const r = compareSpoken('Ich stehe um sieben Uhr auf.', 'ich stehe um 7 Uhr auf');
    expect(r.words.map((w) => w.ok)).toEqual([true, true, true, true, true, true]);
    expect(r.ratio).toBe(1);
    expect(r.clear).toBe(true);
  });

  it('marks the words that were not heard, in place, and keeps the rest aligned', () => {
    const r = compareSpoken('Wir fahren morgen mit dem Zug nach Berlin.', 'wir fahren morgen mit dem Flug nach Berlin');
    expect(r.words.filter((w) => !w.ok).map((w) => w.word)).toEqual(['Zug']);
    expect(r.ratio).toBeCloseTo(7 / 8);
    expect(r.clear).toBe(true);
    const missing = compareSpoken('Kannst du mir bitte helfen?', 'kannst du helfen');
    expect(missing.words.map((w) => [w.word, w.ok])).toEqual([
      ['Kannst', true],
      ['du', true],
      ['mir', false],
      ['bitte', false],
      ['helfen?', true],
    ]);
    expect(missing.clear).toBe(false);
  });

  it('is not fooled by extra words or a different order', () => {
    const extra = compareSpoken('Guten Morgen!', 'äh guten morgen also');
    expect(extra.ratio).toBe(1);
    const swapped = compareSpoken('Der Hund beißt den Mann.', 'den Mann beißt der Hund');
    expect(swapped.ratio).toBeLessThan(1);
  });

  it('needs four words in five, and something heard at all', () => {
    expect(CLEAR_RATIO).toBe(0.8);
    expect(compareSpoken('Ich habe keine Zeit.', '').clear).toBe(false);
    expect(compareSpoken('Ich habe keine Zeit.', 'ich habe Zeit').ratio).toBe(0.75);
    expect(compareSpoken('Ich habe keine Zeit.', 'ich habe Zeit').clear).toBe(false);
    expect(compareSpoken('Ich habe heute leider keine Zeit.', 'ich habe heute leider Zeit').clear).toBe(true);
  });
});

describe('compounds the recognizer splits or joins', () => {
  it('matches a compound heard as two words and two words heard as one', () => {
    expect(compareSpoken('Am Samstagmorgen gehe ich in den Park.', 'am samstag morgen gehe ich in den park').words.every((w) => w.ok)).toBe(true);
    expect(compareSpoken('Ich bin zu Hause.', 'ich bin zuhause').words.every((w) => w.ok)).toBe(true);
    expect(compareSpoken('Der Hauptbahnhof ist dort.', 'der haupt bahn hof ist dort').words.every((w) => w.ok)).toBe(true);
    // a different word stays different
    expect(compareSpoken('in den Stadtpark', 'in den park').words.map((w) => w.ok)).toEqual([true, true, false]);
  });
});
