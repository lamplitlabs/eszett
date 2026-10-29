import { describe, expect, it } from 'vitest';

import scenesData from '../../data/scenes.json';
import { ALLTAG, ALLTAG_DOMAINS, alltagByKey, alltagFor, alltagKey } from '../alltag';
import { LEVELS } from '../levels';
import { letterPrompt } from '../prompts';
import { parseReadingDraft } from '../reading';
import { tasksFor } from '../writing';

describe('living in Germany', () => {
  it('covers every domain with situations at every level from A2 up, each with a letter brief', () => {
    expect(new Set(ALLTAG.map((a) => a.key)).size).toBe(ALLTAG.length);
    for (const domain of ALLTAG_DOMAINS) expect(ALLTAG.some((a) => a.domain === domain), domain).toBe(true);
    for (const level of LEVELS.filter((l) => l !== 'A1')) expect(ALLTAG.some((a) => a.levels.includes(level)), level).toBe(true);
    for (const a of ALLTAG) {
      expect(a.letter_en.length).toBeGreaterThan(80);
      expect(a.title_de.length).toBeGreaterThan(5);
      expect(a.levels.length).toBeGreaterThan(0);
    }
    expect(alltagFor('A1').length).toBeGreaterThan(0);
    expect(alltagFor('B1').every((a) => a.levels.includes('B1'))).toBe(true);
    expect(alltagKey('B1', 'mahnung')).toBe('alltag:B1:mahnung');
    expect(alltagByKey('mahnung')?.domain).toBe('money');
    expect(alltagByKey(undefined)).toBeUndefined();
  });

  it('links only to scenes and writing tasks that exist', () => {
    const scenes = new Set((scenesData as { key: string }[]).map((s) => s.key));
    const tasks = new Set(LEVELS.flatMap((l) => tasksFor(l).map((task) => task.id)));
    for (const a of ALLTAG) {
      if (a.scene) expect(scenes.has(a.scene), `${a.key} -> scene ${a.scene}`).toBe(true);
      if (a.write) expect(tasks.has(a.write), `${a.key} -> task ${a.write}`).toBe(true);
    }
    expect(ALLTAG.filter((a) => a.scene).length).toBeGreaterThanOrEqual(12);
  });

  it('asks for the letter in the reading shape, and the reader takes a letter back', () => {
    const p = letterPrompt(alltagByKey('anmeldung')!.letter_en, 'A2', [80, 120]);
    expect(p).toContain('Titel:');
    expect(p).toContain('formal register (Sie)');
    expect(p).toContain('Einladung zum Elternabend');
    expect(p).toContain('none from the example');
    const draft = parseReadingDraft(
      [
        'Titel: Ihr Termin zur Anmeldung',
        'Sehr geehrte Frau Rossi,',
        'Ihr Termin zur Anmeldung ist am Montag, den 4. März, um 9:30 Uhr in Zimmer 12. Bitte bringen Sie Ihren Pass und die Wohnungsgeberbestätigung mit. Wenn Sie nicht kommen können, rufen Sie uns bitte an.',
        'Mit freundlichen Grüßen',
        'Ihr Bürgeramt Mitte',
        'Frage 1: Wann ist der Termin?',
        'a) Am Montag um 9:30 Uhr',
        'b) Am Dienstag um 9 Uhr',
        'c) Am Montag um 12 Uhr',
        'Antwort: a',
        'Frage 2: Was soll Frau Rossi mitbringen?',
        'a) Ein Foto',
        'b) Den Pass und die Wohnungsgeberbestätigung',
        'c) Den Mietvertrag',
        'Antwort: b',
        'Frage 3: Was soll sie tun, wenn sie nicht kommen kann?',
        'a) Eine E-Mail schreiben',
        'b) Einfach später kommen',
        'c) Anrufen',
        'Antwort: c',
      ].join('\n'),
      'A2',
      [40, 180],
    );
    expect(draft?.title).toBe('Ihr Termin zur Anmeldung');
    expect(draft?.questions).toHaveLength(3);
    expect(draft?.text).toContain('Sehr geehrte Frau Rossi');
  });
});
