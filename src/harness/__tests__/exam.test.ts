import { describe, expect, it } from 'vitest';

import { EXAM_CRITERIA, EXAMS, examFor, examPercent, FIXED_SHEETS, fixedSheet, fluencyScore, parseExamRating, parseExamSheet, partById, partPercent, passed, ratingComplete, ratingHasFeedback, ratingPrefill, sheetComplete, spoken, wordsOf, wordsPerMinute, type ExamPartResult } from '../exam';
import { LEVELS } from '../levels';
import { examFollowupPrompt, examSheetPrompt } from '../prompts';

describe('the mock oral exam', () => {
  it('has an exam at every level with the published shape: timed parts, an examiner line, a sheet brief or a fixed sheet', () => {
    for (const level of LEVELS) {
      const exam = examFor(level);
      expect(exam.level).toBe(level);
      expect(exam.parts.length).toBeGreaterThanOrEqual(2);
      expect(exam.parts.length).toBeLessThanOrEqual(3);
      for (const p of exam.parts) {
        expect(p.title_de).toMatch(/^Teil \d: /);
        expect(p.examiner_de.length).toBeGreaterThan(20);
        expect(p.speakSeconds).toBeGreaterThanOrEqual(30);
        expect(p.minWords).toBeGreaterThan(5);
        expect(p.minWords).toBeLessThan(p.speakSeconds * 2);
        if (p.kind === 'intro') expect(p.sheet_en).toBeNull();
      }
    }
    const ids = Object.values(EXAMS).flatMap((e) => e.parts.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(partById('b1-2')?.kind).toBe('monologue');
    expect(partById('b1-2')?.speakSeconds).toBe(180);
    expect(EXAMS.B2.parts.map((p) => p.kind)).toEqual(['monologue', 'talk']);
    expect(EXAMS.A1.parts.map((p) => p.kind)).toEqual(['intro', 'cards', 'request']);
  });

  it('reads a task sheet by shape: a labelled heading and bullet, card or slide points', () => {
    expect(parseExamSheet('Thema: Mein Lieblingsessen\n- Was essen Sie gern?\n- Wann essen Sie das?\n- Mit wem?\n- Warum?')).toEqual({
      heading: 'Mein Lieblingsessen',
      points: ['Was essen Sie gern?', 'Wann essen Sie das?', 'Mit wem?', 'Warum?'],
    });
    expect(parseExamSheet('**Thema: Einkaufen**\nKarte 1: Obst\nKarte 2: Preis', 'cards')).toEqual({ heading: 'Einkaufen', points: ['Obst', 'Preis'] });
    // a translation in brackets goes, a half-written lone word goes, "Wann?" stays; cards keep lone words
    expect(parseExamSheet('Thema: Einkaufen\n- Was kaufst du? (What do you buy?)\n- Wann?\n- Ich', 'monologue')?.points).toEqual(['Was kaufst du?', 'Wann?']);
    expect(parseExamSheet('Thema: Einkaufen\nKarte 1: Obst (fruit)\nKarte 2: Preis', 'cards')?.points).toEqual(['Obst', 'Preis']);
    expect(parseExamSheet('Situation: Eine Freundin hat Geburtstag.\nPunkte:\n1. Wann?\n2. Wo?\n3. Wer kommt?')?.points).toHaveLength(3);
    // a generic title line, then the real heading inside a bullet
    expect(parseExamSheet('Sprechen – Teil 1 (A1)\n- Thema: Einkaufen im Supermarkt\n- Was kaufen Sie?\n- Wo ist die Kasse?')).toEqual({ heading: 'Einkaufen im Supermarkt', points: ['Was kaufen Sie?', 'Wo ist die Kasse?'] });
    expect(parseExamSheet('These: Autos raus aus der Stadt.\n- Pro: weniger Lärm\n- Contra: Geschäfte leiden')?.heading).toBe('Autos raus aus der Stadt.');
    // a heading alone, or a single point, is not a sheet
    expect(parseExamSheet('Thema: Reisen')).toBeNull();
    expect(parseExamSheet('Thema: Reisen\n- Wohin?')).toBeNull();
    expect(sheetComplete('Thema: Reisen\n- Wohin?\n- Wann?\n- Mit wem?\n')).toBe(false);
    // complete only once the last line is closed by a newline, so a point is never cut in the middle
    expect(sheetComplete('Thema: Reisen\n- Wohin?\n- Wann?\n- Mit wem?\n- Warum?')).toBe(false);
    expect(sheetComplete('Thema: Reisen\n- Wohin?\n- Wann?\n- Mit wem?\n- Warum?\n')).toBe(true);
    expect(sheetComplete('Thema: Einkaufen\nKarte 1: Obst\nKarte 2: Preis\n', 'cards')).toBe(true);
    expect(sheetComplete('Thema: Einkaufen\nKarte 1: Obst\n', 'cards')).toBe(false);
  });

  it('reads a rating by shape, with the labels in any of the app languages or none', () => {
    const r = parseExamRating('Erfüllung: 3\nKohärenz: 2\nWortschatz: 3\nStrukturen: 2\nKommentar: You covered all points. The order was hard to follow.\nTipp: Use zuerst, dann, zum Schluss.\nBesser: „Zuerst gehe ich einkaufen, dann koche ich.“')!;
    expect(r.scores).toEqual({ fulfilment: 3, coherence: 2, vocabulary: 3, structures: 2 });
    expect(r.comment).toBe('You covered all points. The order was hard to follow.');
    expect(r.tip).toBe('Use zuerst, dann, zum Schluss.');
    expect(r.better).toBe('Zuerst gehe ich einkaufen, dann koche ich.');
    const ru = parseExamRating('Erfüllung: 4/4\nKohärenz: 3\nWortschatz: 3\nStrukturen: 4\nКомментарий: Всё сказано.\nСовет: Говорите медленнее.\nЛучше: Ich wohne seit zwei Jahren in Berlin.')!;
    expect(ru.scores.fulfilment).toBe(4);
    expect(ru.comment).toBe('Всё сказано.');
    expect(ru.tip).toBe('Говорите медленнее.');
    expect(ru.better).toBe('Ich wohne seit zwei Jahren in Berlin.');
    // no labels on the free lines: comment, tip, sentence in that order
    const bare = parseExamRating('Erfüllung: 2\nKohärenz: 2\nWortschatz: 1\nStrukturen: 1\nGood start but short.\nSay more about each point.\nIch heiße Anna und komme aus Polen.')!;
    expect(bare.comment).toBe('Good start but short.');
    expect(bare.better).toBe('Ich heiße Anna und komme aus Polen.');
    // the model's correction habit: a "Korrigiert:" line is the improved sentence
    const habit = parseExamRating('Erfüllung: 4\nKohärenz: 3\nWortschatz: 3\nStrukturen: 3\nKorrigiert: „Ich bin 30 Jahre alt.“\nKommentar: Alles gesagt.\nTipp: Sprich langsamer.')!;
    expect(habit.better).toBe('Ich bin 30 Jahre alt.');
    expect(habit.comment).toBe('Alles gesagt.');
    expect(parseExamRating('Erfüllung: 3\nKohärenz: 2\nnothing more')).toBeNull();
    expect(ratingComplete('Erfüllung: 3\nKohärenz: 2\nWortschatz: 3\nStrukturen: 2\nKommentar: ok')).toBe(false);
    expect(ratingComplete('Erfüllung: 3\nKohärenz: 2\nWortschatz: 3\nStrukturen: 2\nKommentar: ok\nTipp: more\nBesser: Ich bin sehr müde heute.')).toBe(true);
    // streaming: a label half written, or the last sentence unfinished, is not complete
    expect(ratingComplete('Erfüllung: 3\nKohärenz: 2\nWortschatz: 3\nStrukturen: 2\nKorrigiert: „Ich bin müde.“\nKom')).toBe(false);
    expect(ratingComplete('Erfüllung: 3\nKohärenz: 2\nWortschatz: 3\nStrukturen: 2\nKommentar: ok\nTipp: more\nBesser: Ich bin sehr müde')).toBe(false);
    expect(ratingComplete('Erfüllung: 3\nKohärenz: 2\nWortschatz: 3\nStrukturen: 2\nKommentar: ok\nTipp: more\nBesser: Ich bin müde.')).toBe(false);
  });

  it('counts words and pace, caps fluency when far too little was said, and sums the grid to 100', () => {
    expect(wordsOf('Ich heiße Anna, ich bin 30.')).toBe(6);
    const turns = [{ prompt: '', said: Array(60).fill('wort').join(' '), seconds: 40 }];
    expect(wordsPerMinute(turns)).toBe(90);
    const part = partById('b1-2')!;
    // 60 words in 40 s is 90 wpm: a 3 at B1 by pace, but under the part's 90 words, so capped at 2
    expect(fluencyScore('B1', part, turns)).toBe(2);
    expect(fluencyScore('B1', part, [{ prompt: '', said: Array(30).fill('wort').join(' '), seconds: 20 }])).toBe(1);
    const full = [{ prompt: '', said: Array(200).fill('wort').join(' '), seconds: 120 }];
    expect(fluencyScore('B1', part, full)).toBe(3);
    expect(fluencyScore('B1', part, [{ prompt: '', said: '', seconds: 10 }])).toBe(0);
    const result: ExamPartResult = { partId: 'b1-2', turns: full, rating: { scores: { fulfilment: 3, coherence: 3, vocabulary: 2, structures: 2 }, comment: '', tip: '', better: '' }, fluency: 3, words: 200 };
    expect(partPercent(result)).toBe(65);
    expect(passed(65)).toBe(true);
    expect(passed(59)).toBe(false);
    expect(examPercent([result, { ...result, partId: 'b1-1', rating: null }])).toBe(65);
    expect(examPercent([])).toBeNull();
    expect(EXAM_CRITERIA).toHaveLength(4);
  });

  it('ships the closed-set sheets: two cards or pictures at A1, four person cards at A2, a different one each day', () => {
    for (const id of ['a1-2', 'a1-3']) for (const sheet of FIXED_SHEETS[id]) expect(sheet.points).toHaveLength(2);
    for (const sheet of FIXED_SHEETS['a2-1']) expect(sheet.points).toHaveLength(4);
    expect(fixedSheet('a1-2', 0)).toBe(FIXED_SHEETS['a1-2'][0]);
    expect(fixedSheet('a1-2', 1)).toBe(FIXED_SHEETS['a1-2'][1]);
    expect(fixedSheet('a1-2', FIXED_SHEETS['a1-2'].length)).toBe(FIXED_SHEETS['a1-2'][0]);
    expect(fixedSheet('b1-2')).toBeNull();
    expect(fixedSheet('a1-1')).toBeNull();
  });

  it('asks for the sheet in the kind\'s own layout and for a follow-up in the examiner\'s role', () => {
    const cards = examSheetPrompt(partById('a1-2')!, 'A1');
    expect(cards).toContain('Karte 1: Obst');
    expect(cards).toContain('none from the example');
    const plan = examSheetPrompt(partById('b1-1')!, 'B1', 1);
    expect(plan).toContain('Situation: Eine Freundin hat Geburtstag');
    expect(plan).toContain('B1');
    const talk = examFollowupPrompt(partById('b2-2')!, { heading: 'Autos raus', points: ['Pro: Ruhe'] }, 'Ich finde das gut.', 'B2');
    expect(talk).toContain('counter-argument');
    expect(talk).toContain('Ich finde das gut.');
    expect(spoken('Prüfer: Danke. Wo wohnen Sie?')).toBe('Danke. Wo wohnen Sie?');
  });
});

describe('a rating that stopped after the scores', () => {
  it('is recognised and gets the scores as the beginning of a second answer', () => {
    const scoresOnly = parseExamRating('Erfüllung: 4\nKohärenz: 3\nWortschatz: 3\nStrukturen: 2\n');
    expect(scoresOnly).not.toBeNull();
    expect(ratingHasFeedback(scoresOnly!)).toBe(false);
    expect(ratingPrefill(scoresOnly!)).toBe('Erfüllung: 4\nKohärenz: 3\nWortschatz: 3\nStrukturen: 2\nKommentar:');
    // the second answer, prefill included, reads as a whole rating
    const full = parseExamRating(`${ratingPrefill(scoresOnly!)} Clear and complete for A1, though the sentences are short. Add a reason now and then.\nTipp: Join two sentences with "und" or "weil".\nBesser: Am Sonntag mache ich Sport im Park und besuche dann meine Familie.`);
    expect(full).not.toBeNull();
    expect(ratingHasFeedback(full!)).toBe(true);
    expect(full!.scores).toEqual({ fulfilment: 4, coherence: 3, vocabulary: 3, structures: 2 });
    expect(full!.comment.startsWith('Clear and complete')).toBe(true);
    expect(full!.better).toBe('Am Sonntag mache ich Sport im Park und besuche dann meine Familie.');
  });
});
