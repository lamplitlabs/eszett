import { describe, expect, it } from 'vitest';

import { paceOf, READ_ALOUD_PASS, readAloudSentences, scoreReading, scoreSentence } from '../readAloud';

const TEXT = 'Am Samstag gehen Lena und ihr Bruder Tim in den Park. Das Wetter ist schön und warm, und viele Leute sind draußen.\n\nSie spielen zwei Stunden Fußball. Danach essen sie ein Eis am Kiosk. Um fünf Uhr fahren sie nach Hause. Toll!';

describe('reading aloud', () => {
  it('splits a text into sentences to read, a very short one joining its neighbour', () => {
    const s = readAloudSentences(TEXT);
    expect(s.map((x) => x.text)).toEqual([
      'Am Samstag gehen Lena und ihr Bruder Tim in den Park.',
      'Das Wetter ist schön und warm, und viele Leute sind draußen.',
      'Sie spielen zwei Stunden Fußball.',
      'Danach essen sie ein Eis am Kiosk.',
      'Um fünf Uhr fahren sie nach Hause. Toll!',
    ]);
    expect(s[0].words).toBe(11);
    expect(readAloudSentences('„Komm!“ Sie lacht. Dann gehen wir nach Hause.').map((x) => x.text)).toEqual(['„Komm!“ Sie lacht.', 'Dann gehen wir nach Hause.']);
  });

  it('scores a sentence word by word with its pace, and a text as a whole', () => {
    const s = readAloudSentences(TEXT);
    const r0 = scoreSentence(s[0].text, 'am samstag gehen lena und ihr bruder tim in den park', 4400);
    expect(r0.words.every((w) => w.ok)).toBe(true);
    expect(r0.wpm).toBe(150);
    const r1 = scoreSentence(s[1].text, 'das wetter ist schön und warm und viele leute sind', 6000);
    expect(r1.words.filter((w) => !w.ok).map((w) => w.word)).toEqual(['draußen.']);
    expect(scoreSentence(s[2].text, 'sie', 800).wpm).toBeNull();
    const score = scoreReading([r0, r1, null, null, null], s);
    expect(score.total).toBe(5);
    expect(score.clean).toBe(1);
    expect(score.accuracy).toBeCloseTo((11 + 10) / s.reduce((n, x) => n + x.words, 0));
    expect(s[1].words).toBe(11);
    expect(score.wpm).toBe(Math.round((150 + 100) / 2));
    expect(score.pace).toBe('steady');
  });

  it('names the pace from words a minute', () => {
    expect(paceOf(null)).toBeNull();
    expect(paceOf(60)).toBe('slow');
    expect(paceOf(120)).toBe('steady');
    expect(paceOf(190)).toBe('fast');
    expect(READ_ALOUD_PASS).toBe(0.8);
  });
});
