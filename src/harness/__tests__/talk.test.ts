import { describe, expect, it } from 'vitest';

import { LEVELS } from '../levels';
import { BLOCKING_TELLS, counterpartPrompt, readCounterpartLine, speakerLabel, transcriptText } from '../roleplay';
import { FOLLOW_UPS, keepTalking, learnerLabel, PARTNERS, partnerFor, TALK_TOPICS, talkCard, talkTopicsFor, thingTold } from '../talk';

const learner = { name: 'Manish Tiwari', city: 'Berlin', from: 'Indien', work: 'Ingenieur bei einer Softwarefirma', hobbies: 'Fußball, Kochen', why: 'ich hier lebe und arbeite' };
const nobody = { name: '', city: '', from: '', work: '', hobbies: '', why: '' };

describe('free talk topics and partners', () => {
  it('offers topics at every level, the level’s own first, none above', () => {
    for (const level of LEVELS) {
      const own = TALK_TOPICS.filter((t) => t.level === level);
      expect(own.length, level).toBeGreaterThanOrEqual(2);
      const list = talkTopicsFor(level);
      expect(list.slice(0, own.length).every((t) => t.level === level)).toBe(true);
      expect(list.every((t) => LEVELS.indexOf(t.level) <= LEVELS.indexOf(level))).toBe(true);
    }
    expect(new Set(TALK_TOPICS.map((t) => t.id)).size).toBe(TALK_TOPICS.length);
    for (const t of TALK_TOPICS) expect(t.opener_de.endsWith('?') || t.opener_de.endsWith('.')).toBe(true);
  });

  it('rotates the partner weekly and gives each a number they may say', () => {
    expect(partnerFor(0)).toBe(PARTNERS[0]);
    expect(partnerFor(7)).toBe(PARTNERS[1]);
    expect(partnerFor(7 * PARTNERS.length)).toBe(PARTNERS[0]);
    for (const p of PARTNERS) {
      expect(p.facts.some(([de, , v]) => de === 'Dein Alter' && /^\d+$/.test(v))).toBe(true);
      // every partner fact is labelled as the partner's own, so the model cannot hand it to the learner
      for (const [de] of p.facts) expect(/^Dein(e)? /.test(de), de).toBe(true);
    }
  });
});

describe('the conversation card', () => {
  const topic = TALK_TOPICS.find((t) => t.id === 'lastweekend')!;
  const memory = { topics: ['Urlaub', 'Deine Stadt'], told: 'Ich war am Wochenende auf einem Konzert in Hamburg.' };
  const card = talkCard(topic, PARTNERS[0], learner, memory, 'A2');

  it('greets the learner by first name and opens with the topic', () => {
    expect(learnerLabel(learner)).toBe('Manish');
    expect(card.opening).toBe('Hey Manish! Wie war dein Wochenende? Was hast du gemacht?');
    expect(speakerLabel(card.learner_de)).toBe('Manish');
    expect(speakerLabel(card.role_de)).toBe('Lena');
    expect(card.register).toBe('du');
    expect(card.beats).toEqual([]);
  });

  it('hands the partner her own life, the learner’s profile and the memory as facts', () => {
    const labels = card.facts.map((f) => f.label_de);
    expect(labels).toContain('Dein Alter');
    expect(labels).toContain('Manishs Wohnort');
    expect(labels).toContain('Manishs Hobbys');
    expect(labels).toContain('Eure letzten Gespräche');
    expect(card.facts.find((f) => f.key === 'm1')?.label_de).toBe('Was Manish dir letztes Mal erzählt hat');
    expect(card.facts.find((f) => f.key === 'm1')?.value).toContain('Konzert in Hamburg');
    const prompt = counterpartPrompt(card, [[speakerLabel(card.role_de), card.opening]], 'de-a', 'de', null);
    expect(prompt).toContain('Du bist Lena');
    expect(prompt).toContain('Ich bin Manish');
    expect(prompt).toContain('Manishs Wohnort: Berlin');
    expect(prompt).toContain('Dein Plan für Samstag: eine Wanderung in der Eifel');
    expect(prompt).toContain('Wir sagen „du“.');
  });

  it('works without a profile: no name, no learner facts, no memory', () => {
    const bare = talkCard(topic, PARTNERS[1], nobody, { topics: [], told: null }, 'A2');
    expect(bare.opening.startsWith('Hey! ')).toBe(true);
    expect(speakerLabel(bare.learner_de)).toBe('Tandempartner');
    expect(bare.facts.every((f) => /^Dein(e)? /.test(f.label_de))).toBe(true);
    const mine = talkCard(topic, PARTNERS[1], { ...nobody, city: 'Bonn' }, { topics: [], told: null }, 'A2');
    expect(mine.facts.map((f) => f.label_de)).toContain('Mein Wohnort');
  });

  it('lets a partner line that uses her facts pass the scene reader and blocks one that breaks character', () => {
    const context = transcriptText([
      ['Lena', card.opening],
      ['Manish', 'Ich war am Samstag im Park und habe Fußball gespielt.'],
    ]);
    const good = readCounterpartLine('Lena: Oh, schön! Ich war mit 29 noch nie so sportlich. Mit wem hast du gespielt?', card, false, context);
    expect(good.tells.filter((t) => BLOCKING_TELLS.includes(t))).toEqual([]);
    expect(good.german).toContain('Mit wem hast du gespielt?');
    const corrects = readCounterpartLine('Korrektur: Ich habe Fußball gespielt. Und was hast du am Sonntag gemacht?', card, false, context);
    expect(corrects.tells).toContain('corrected_in_role');
    const regreets = readCounterpartLine('Hallo Manish! Was hast du am Sonntag gemacht?', card, false, context);
    expect(regreets.tells).toContain('regreet');
    const invented = readCounterpartLine('Das kostet 45 Euro. Kommst du mit?', card, false, context);
    expect(invented.tells).toContain('invented_figure');
  });

  it('builds a card for a topic of the learner’s own', () => {
    const own = talkCard({ id: 'own', title_de: 'Mein neuer Job' }, PARTNERS[2], learner, { topics: [], told: null }, 'B1');
    expect(own.key).toBe('talk:own');
    expect(own.situation_de).toContain('Mein neuer Job');
    expect(own.opening).toContain('„Mein neuer Job“');
  });
});

describe('keeping the conversation going', () => {
  it('leaves a line that asks something alone', () => {
    expect(keepTalking('Oh, schön! Mit wem hast du gespielt?', 3)).toBe('Oh, schön! Mit wem hast du gespielt?');
  });

  it('drops a farewell and adds a follow-up question when none is left', () => {
    expect(keepTalking('Ach, dann schade! Tschüss, und gute Nacht!', 2)).toBe(`Ach, dann schade! ${FOLLOW_UPS[2]}`);
    expect(keepTalking('Bis bald!', 0)).toBe(FOLLOW_UPS[0]);
    expect(keepTalking('Das klingt nach einem schönen Wochenende.', 9)).toBe(`Das klingt nach einem schönen Wochenende. ${FOLLOW_UPS[9 % FOLLOW_UPS.length]}`);
  });

  it('keeps a farewell that is part of a question', () => {
    expect(keepTalking('Machst du am Wochenende wieder Sport?', 1)).toBe('Machst du am Wochenende wieder Sport?');
    for (const q of FOLLOW_UPS) expect(q.endsWith('?')).toBe(true);
  });
});

describe('what the partner remembers', () => {
  it('keeps the longest thing said, cut to a sentence or two', () => {
    expect(thingTold(['Ja.', 'Ich war am Wochenende in Hamburg. Das Konzert war super! Danach haben wir noch etwas gegessen und sind spät nach Hause gefahren, obwohl es geregnet hat und der Zug Verspätung hatte.', 'Nein, leider nicht.'])).toBe(
      'Ich war am Wochenende in Hamburg. Das Konzert war super!',
    );
    expect(thingTold([])).toBe('');
  });
});
