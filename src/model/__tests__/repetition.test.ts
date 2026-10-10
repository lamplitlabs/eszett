import { describe, expect, it } from 'vitest';

import { loopCut } from '../repetition';

const quote = '> Das Problem kann gelöst werden.\n> → Das Problem kann gelöst werden.\n\n';

describe('loopCut', () => {
  it('leaves ordinary answers alone, finished or still streaming', () => {
    expect(loopCut('**Hallo!** Wie geht es dir?\n\n- der Hund (die Hunde) – dog\n- die Katze (die Katzen) – cat\n')).toBe(-1);
    expect(loopCut('Ich gehe. Du gehst. Er geht. Wir gehen')).toBe(-1);
    expect(loopCut('')).toBe(-1);
    expect(loopCut('\n\n')).toBe(-1);
  });
  it('cuts the v24 Passiversatz loop at the first copy of the repeated two-line block', () => {
    const head = `**Variante 2: Aktiv mit „lassen“**\n\n${quote}`;
    expect(loopCut(head)).toBe(-1);
    expect(loopCut(head + quote)).toBe(-1);
    const looping = head + quote + quote;
    expect(loopCut(looping)).toBe(head.length);
    expect(looping.slice(0, loopCut(looping)).trimEnd()).toBe(`**Variante 2: Aktiv mit „lassen“**\n\n${quote.trimEnd()}`);
    // the cut stays at the first copy however long the run has grown
    expect(loopCut(looping + quote + quote + '> Das Problem')).toBe(head.length);
  });
  it('needs three identical lines, not two, and ignores short ones', () => {
    expect(loopCut('Ja, das stimmt so.\nJa, das stimmt so.\n')).toBe(-1);
    expect(loopCut('Ja, das stimmt so.\nJa, das stimmt so.\nJa, das stimmt so.\n')).toBe('Ja, das stimmt so.\n'.length);
    expect(loopCut('- ja\n- ja\n- ja\n- ja\n')).toBe(-1);
  });
  it('does not count the line still being written', () => {
    expect(loopCut('Noch einmal bitte.\nNoch einmal bitte.\nNoch einmal bitte')).toBe(-1);
  });
  it('cuts a sentence repeated inside one paragraph', () => {
    const s = 'Das Problem kann gelöst werden. ';
    expect(loopCut(`Kurz gesagt. ${s}${s}`)).toBe(-1);
    expect(loopCut(`Kurz gesagt. ${s}${s}${s}Das`)).toBe('Kurz gesagt. '.length + s.length);
    expect(loopCut(`Erste Zeile.\nKurz gesagt. ${s}${s}${s}`)).toBe('Erste Zeile.\nKurz gesagt. '.length + s.length);
    // a lead-in without a full stop belongs to the first copy, so the run is counted from the second one
    expect(loopCut(`Kurz gesagt: ${s}${s}${s}`)).toBe(-1);
    expect(loopCut(`Kurz gesagt: ${s}${s}${s}${s}`)).toBe('Kurz gesagt: '.length + 2 * s.length);
    expect(loopCut('Nein. Nein. Nein. Nein.')).toBe(-1);
  });
});
