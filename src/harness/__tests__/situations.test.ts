import { describe, expect, it } from 'vitest';

import { situationPrompt } from '../prompts';
import { parseReadingDraft } from '../reading';
import { SITUATION_WORDS, SITUATIONS, situationsFor, situationStyle } from '../situations';

describe('listening situations', () => {
  it('offers situations at every level, each with a place and a brief, and short word bands', () => {
    for (const level of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const) {
      expect(situationsFor(level).length, level).toBeGreaterThanOrEqual(3);
      expect(SITUATION_WORDS[level][0]).toBeLessThan(SITUATION_WORDS[level][1]);
      expect(SITUATION_WORDS[level][1]).toBeLessThanOrEqual(160);
    }
    expect(new Set(SITUATIONS.map((s) => s.key)).size).toBe(SITUATIONS.length);
    for (const s of SITUATIONS) {
      expect(s.brief_en.length).toBeGreaterThan(40);
      expect(['station', 'cafe', 'street', 'phone', 'room']).toContain(s.place);
    }
  });

  it('asks for the kind in its spoken shape with an example of the same kind, and the reader accepts a short piece', () => {
    const p = situationPrompt('a platform announcement', situationStyle('announcement'), 'A1', SITUATION_WORDS.A1, 0, 'announcement');
    expect(p).toContain('loudspeaker');
    expect(p).toContain('Titel: Durchsage am Gleis');
    expect(p).toContain('none from the example');
    const v = situationPrompt('a voicemail', situationStyle('voicemail'), 'A2', SITUATION_WORDS.A2, 0, 'voicemail');
    expect(v).toContain('Titel: Nachricht von Paul');
    expect(v).not.toContain('Hannover');
    const d = situationPrompt('a dialogue', situationStyle('dialogue'), 'A1', SITUATION_WORDS.A1, 1, 'dialogue');
    expect(d).toContain('Kellnerin:');
    expect(d).toContain('"Frage 1:"');
    const draft = parseReadingDraft(
      'Titel: Durchsage\n\nAchtung an Gleis zwei: Der Zug nach Köln fährt heute um neun Uhr zehn von Gleis vier. Wir bitten um Entschuldigung.\n\nFrage 1: Wohin fährt der Zug?\na) Nach Köln\nb) Nach Bonn\nc) Nach Mainz\nAntwort: a\nFrage 2: Von welchem Gleis?\na) Zwei\nb) Vier\nc) Neun\nAntwort: b\nFrage 3: Wann fährt er?\na) Um neun Uhr\nb) Um neun Uhr zehn\nc) Um zehn Uhr\nAntwort: b',
      'A1',
      SITUATION_WORDS.A1,
    );
    expect(draft?.questions).toHaveLength(3);
    expect(draft?.title).toBe('Durchsage');
    // the same text is too short for a reading text at A1
    expect(parseReadingDraft('Titel: Durchsage\n\nAchtung an Gleis zwei: Der Zug nach Köln fährt um neun Uhr zehn.\n\nFrage 1: Wohin?\na) Köln\nb) Bonn\nc) Mainz\nAntwort: a\nFrage 2: Wann?\na) Neun\nb) Zehn\nc) Elf\nAntwort: a', 'A1')).toBeNull();
  });
});
