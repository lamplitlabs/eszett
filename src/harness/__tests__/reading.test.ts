// The reading exercise: the draft the tutor writes is read by shape, and the questions are checked by the app.
import { describe, expect, it } from 'vitest';

import grammarCards from '../../data/grammar.json';
import grounding from '../../data/grounding.json';
import lexiconCore from '../../data/lexicon-core.json';
import type { GroundingPack } from '../grounding';
import { LexiconIndex, type LexiconData } from '../lexicon';
import { LEVELS } from '../levels';
import { READING_PREFILL } from '../prompts';
import { parseReadingDraft, READING_QUESTIONS, READING_WORDS, readingBudget, readingComplete } from '../reading';
import { DraftError, Tutor, type ChatMessage, type GrammarCard } from '../tutor';

const TEXT = [
  'Am Samstag gehen Lena und ihr Bruder Tim in den Park. Das Wetter ist schön und warm, und viele Leute sind draußen.',
  'Sie spielen zwei Stunden Fußball und essen danach ein Eis am Kiosk. Um fünf Uhr fahren sie mit dem Bus nach Hause. Zu Hause kocht die Mutter Nudeln, und alle essen zusammen.',
].join('\n\n');

const DRAFT = `Titel: Ein Tag im Park

${TEXT}

Frage 1: Wann gehen Lena und Tim in den Park?
a) Am Samstag
b) Am Montag
c) Am Abend
Antwort: a
Frage 2: Was essen sie am Kiosk?
a) Pizza
b) Ein Eis
c) Brot
Antwort: b)
Frage 3: Wie fahren sie nach Hause?
a) Mit dem Auto
b) Mit dem Fahrrad
c) Mit dem Bus
Antwort: c`;

describe('the reading draft', () => {
  it('reads title, text and three questions with the right option', () => {
    const d = parseReadingDraft(DRAFT, 'A1');
    expect(d).not.toBeNull();
    expect(d!.title).toBe('Ein Tag im Park');
    expect(d!.text).toBe(TEXT);
    expect(d!.questions).toHaveLength(3);
    expect(d!.questions[0]).toEqual({ question: 'Wann gehen Lena und Tim in den Park?', options: ['Am Samstag', 'Am Montag', 'Am Abend'], answer: 0 });
    expect(d!.questions[1].answer).toBe(1);
    expect(d!.questions[2].answer).toBe(2);
  });

  it('copes with markdown, English labels, a "Text:" heading and a title without a label', () => {
    const loose = DRAFT.replace('Titel: Ein Tag im Park', '**Ein Tag im Park**')
      .replace('Frage 1:', 'Question 1:')
      .replace('Antwort: a', 'Answer: (a)')
      .replace(`\n\n${TEXT}`, `\n\nText:\n${TEXT}`);
    const d = parseReadingDraft(loose, 'A1');
    expect(d).not.toBeNull();
    expect(d!.title).toBe('Ein Tag im Park');
    expect(d!.text).toBe(TEXT);
    expect(d!.questions[0].answer).toBe(0);
  });

  it('refuses a draft without enough questions or with a text far too short for the level', () => {
    expect(parseReadingDraft(DRAFT.split('Frage 2:')[0], 'A1')).toBeNull();
    expect(parseReadingDraft(DRAFT, 'C1')).toBeNull(); // 60-odd words is no C1 text
    expect(parseReadingDraft(DRAFT.replace('Antwort: b)', 'Antwort: d'), 'A1')?.questions).toHaveLength(2); // a bad answer letter drops that question
  });

  it('stops generation after the third answer and budgets by level', () => {
    expect(readingComplete(DRAFT)).toBe(true);
    expect(readingComplete(DRAFT.split('Frage 3:')[0])).toBe(false);
    expect(READING_QUESTIONS).toBe(3);
    let last = 0;
    for (const level of LEVELS) {
      expect(READING_WORDS[level][0]).toBeLessThan(READING_WORDS[level][1]);
      expect(READING_WORDS[level][0]).toBeGreaterThanOrEqual(last);
      last = READING_WORDS[level][0];
      expect(readingBudget(level)).toBeGreaterThan(READING_WORDS[level][1]);
    }
  });
});

describe('the tutor writing a reading text', () => {
  const make = (answers: string[]) => {
    const prompts: string[] = [];
    let i = 0;
    const generate = async (messages: ChatMessage[], opts: { prefill?: string }) => {
      prompts.push(messages[1].content);
      const text = answers[Math.min(i++, answers.length - 1)];
      // the engine returns the prefill as part of the text
      return { text: (opts.prefill ?? '') + text.replace(/^Titel:/, ''), stopped: 'eos' as const };
    };
    const tutor = new Tutor({ generate: generate as never, systemPrompt: '', grounding: grounding as unknown as GroundingPack, lex: new LexiconIndex(lexiconCore as unknown as LexiconData), cards: grammarCards as unknown as GrammarCard[] });
    return { tutor, prompts };
  };

  it('asks for the level, topic and length, prefills the title label and reads the draft', async () => {
    const { tutor, prompts } = make([DRAFT]);
    const r = await tutor.readingText('the daily routine', { level: 'A1', lang: 'en' });
    expect(r.title).toBe('Ein Tag im Park');
    expect(r.questions.map((q) => q.answer)).toEqual([0, 1, 2]);
    expect(r.checks).toBeDefined();
    expect(READING_PREFILL).toBe('Titel:');
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('A1');
    expect(prompts[0]).toContain('the daily routine');
    expect(prompts[0]).toContain('50-80 words');
  });

  it('asks once more in other words when the draft has no shape, then gives up with the last draft attached', async () => {
    const { tutor, prompts } = make(['Hallo! Hier ist ein Text ohne Fragen.', 'Noch ein unbrauchbarer Text.']);
    await expect(tutor.readingText('x', { level: 'A1', lang: 'en' })).rejects.toBeInstanceOf(DraftError);
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).not.toBe(prompts[1]);
  });
});
