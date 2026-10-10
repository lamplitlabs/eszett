import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import grammarCards from '../../data/grammar.json';
import grounding from '../../data/grounding.json';
import lexiconCore from '../../data/lexicon-core.json';
import scenes from '../../data/scenes.json';
import { changeCount, diffWords, tokenize } from '../diff';
import { buildDrillSet, checkDrill, drillArticle, drillPlural, drillVerb, genderRule, makeRng } from '../drills';
import { clockToGerman, dateToGerman, matchesAny, numberToGerman, ordinalToGerman, priceToGerman } from '../engines';
import { groundPrompt, selectBlocks, type GroundingPack } from '../grounding';
import { levelSentence } from '../levels';
import { checkText, LexiconIndex, type LexiconData } from '../lexicon';
import { parseInline, parseMarkdown } from '../markdown';
import { checkReferenceQuotes, parseCorrection, parsePhrases, parsePlan, parseVocabList, phrasesComplete, repairReferenceQuotes, vocabListComplete } from '../parse';
import * as P from '../prompts';
import { counterpartPrompt, exampleFor, learnerSideOnly, readCounterpartLine, speakerLabel, transcriptText, type SceneCard, type TranscriptLine } from '../roleplay';
import { answerFactual, detectLang, route } from '../route';
import { renderChatPrompt } from '../template';
import { handedBack, softStop, Tutor, type ChatMessage, type Generate, type GrammarCard } from '../tutor';
import { precheckText, WRITE_TASKS } from '../writing';
import fixtures from './fixtures/roleplay-prompts.json';

const g = grounding as unknown as GroundingPack;
const cards = scenes as unknown as SceneCard[];
const fullLexiconPath = join(__dirname, '../../../.model-cache/lexicon.json');
const fullLex = existsSync(fullLexiconPath) ? new LexiconIndex(JSON.parse(readFileSync(fullLexiconPath, 'utf8')) as LexiconData) : null;
const coreLex = new LexiconIndex(lexiconCore as unknown as LexiconData);

describe('engines', () => {
  it('reads numbers the way German writes them', () => {
    expect(numberToGerman(21)).toBe('einundzwanzig');
    expect(numberToGerman(101)).toBe('hunderteins');
    expect(numberToGerman(438)).toBe('vierhundertachtunddreißig');
    expect(numberToGerman(2024)).toBe('zweitausendvierundzwanzig');
    expect(ordinalToGerman(3)).toBe('dritte');
    expect(ordinalToGerman(20)).toBe('zwanzigste');
  });
  it('reads clock times, dates and prices', () => {
    expect(clockToGerman(10, 30)).toMatchObject({ formal: 'zehn Uhr dreißig', informal: 'halb elf' });
    expect(clockToGerman(14, 45).informal).toBe('Viertel vor drei');
    expect(dateToGerman(3, 10).dative).toBe('am dritten Oktober');
    expect(priceToGerman(3, 40).spoken).toBe('drei Euro vierzig');
    expect(matchesAny('Es ist halb elf.', ['halb elf'])).toBe(true);
    expect(matchesAny('vier und neunzig', ['vierundneunzig'])).toBe(true);
  });
});

describe('routing', () => {
  it('detects the learner language and intent', () => {
    expect(detectLang('Was ist der Unterschied zwischen seit und vor?')).toBe('de');
    expect(detectLang("What's the difference between seit and vor?")).toBe('en');
    expect(route('Can you check this: Ich habe nach Berlin gefahren.')).toEqual({ intent: 'check', text: 'Ich habe nach Berlin gefahren.' });
    expect(route('Gestern ich habe meine Freundin besucht')).toMatchObject({ intent: 'check' });
    expect(route('How do I say "I am tired"?')).toMatchObject({ intent: 'translate' });
    expect(route('When do I use dative?')).toEqual({ intent: 'ask' });
  });
  it('treats a rewrite instruction before a German sentence as a task, not a check', () => {
    expect(route('Formuliere ohne Passiv: Der Antrag muss bis Freitag eingereicht werden.')).toEqual({ intent: 'ask' });
    expect(route('Rewrite in indirect speech: Der Minister sagte, die Reform wird im Herbst umgesetzt.')).toEqual({ intent: 'ask' });
    expect(route('Bilde den Nominalstil: Nachdem der Vertrag unterschrieben worden war, begann die Arbeit.')).toEqual({ intent: 'ask' });
    expect(route('Korrigiere bitte: Der Antrag muss bis Freitag eingereicht werden.')).toMatchObject({ intent: 'check', text: 'Der Antrag muss bis Freitag eingereicht werden.' });
    expect(route('Der Antrag muss bis Freitag eingereicht werden.')).toMatchObject({ intent: 'check' });
  });
  it('answers number and time questions with the engines', () => {
    expect(answerFactual('Wie sagt man die Uhrzeit 10:30 auf Deutsch?', 'de')).toMatchObject({ category: 'clock', answer: 'zehn Uhr dreißig' });
    expect(answerFactual('How do you say 438 in German?')).toMatchObject({ answer: 'vierhundertachtunddreißig' });
    expect(answerFactual('How do you say 3,40 € in German?')).toMatchObject({ category: 'prices', answer: 'drei Euro vierzig' });
    expect(answerFactual('What is the difference between 3 and 4?')).toBeNull();
    // "C1" is a level, not the number one (seen on the phone: "The rule engine says: eins" under a Goethe C1 answer)
    expect(answerFactual('How is the Goethe C1 exam structured and how many points do I need?')).toBeNull();
    expect(answerFactual('How do you say 1 in German?')).toMatchObject({ answer: 'eins' });
  });
});

describe('grounding', () => {
  it('routes questions to the rule notes the model was trained with', () => {
    expect(selectBlocks('Wie sagt man die Uhrzeit 10:30 auf Deutsch?', g)).toEqual(['grammar-numbers-time']);
    expect(selectBlocks('Can you explain Perfekt with haben or sein to me?', g)).toEqual(['grammar-perfekt']);
    expect(selectBlocks('How many points do I need to pass the Goethe B1 exam?', g)).toEqual(['goethe-b1']);
    expect(selectBlocks('I like cats.', g)).toEqual([]);
  });
  it('knows the C1/C2 exams of the v24 pack (Goethe C1/C2, telc C1 Hochschule, TestDaF, DSH, ÖSD)', () => {
    expect(selectBlocks('How is the Goethe-Zertifikat C1 exam structured?', g)).toEqual(['goethe-c1']);
    expect(selectBlocks('Was muss ich für das Goethe C2 Großes Deutsches Sprachdiplom können?', g)).toEqual(['goethe-c2']);
    expect(selectBlocks('Reicht telc C1 Hochschule für die Uni?', g)).toEqual(['telc-c1-hochschule']);
    expect(selectBlocks('Wie viele TDN-Punkte brauche ich im TestDaF?', g)).toEqual(['testdaf']);
    expect(selectBlocks('Was ist der Unterschied zwischen DSH und TestDaF?', g)).toEqual(['compare']);
    expect(selectBlocks('Ist das ÖSD Zertifikat C1 in Deutschland anerkannt?', g)).toEqual(['osd']);
    // a level alone with an exam cue falls through to the level's exam notes; C1 has four, the pack keeps one
    expect(selectBlocks('Welche Prüfung soll ich auf C1 machen?', g)).toEqual(['compare']);
    expect(g.rules.level_blocks.c1).toEqual(['goethe-c1', 'telc-c1-hochschule', 'testdaf', 'dsh']);
    expect(g.rules.level_blocks.c2).toEqual(['goethe-c2']);
    expect(g.max_blocks).toBe(1);
  });
  it('appends the note after the separator and header, as in training', () => {
    const out = groundPrompt('Wie sagt man 10:30?', g);
    expect(out.text.startsWith(`Wie sagt man 10:30?${g.separator}${g.header}\n`)).toBe(true);
    expect(out.keys).toEqual(['grammar-numbers-time']);
  });
});

describe.skipIf(!fullLex)('lexicon check (full lexicon from the model host)', () => {
  const lex = fullLex as LexiconIndex;
  it('flags a wrong gender in citation position and confirms right ones', () => {
    const r = checkText('**die Fahrrad** (die Fahrräder) – bicycle\n- das Haus (die Häuser)', lex);
    expect(r.findings.map((f) => f.kind)).toEqual(['gender']);
    expect(r.findings[0].expected).toBe('das Fahrrad');
    expect(r.verified.map((v) => `${v.article} ${v.noun}`)).toContain('das Haus');
  });
  it('accepts feminine nouns in the dative after a preposition and quoted mistakes', () => {
    expect(checkText('Ich gehe mit der Mutter einkaufen: - der Mutter', lex).findings).toHaveLength(0);
    expect(checkText("Not „das Arbeit“ but die Arbeit.", lex).findings).toHaveLength(0);
  });
  it('accepts feminine genitives and datives in a case explanation, after a noun or a dative verb', () => {
    const filler = 'The genitive shows possession or belonging.\n\n## 1. After "sein"\n\n- Das ist das Auto **meines Vaters**.\n'.repeat(3);
    expect(checkText(`# Genitiv (Genitive)\n\n${filler}- Alle Studenten **der Universität** kommen aus Berlin.`, lex).findings).toHaveLength(0);
    expect(checkText('- die Farbe **der Sonne** – the color of the sun', lex).findings).toHaveLength(0);
    expect(checkText('Ich helfe **der Frau**. Das gehört **der Lehrerin**.', lex).findings).toHaveLength(0);
    expect(checkText('- der Universität (university)', lex).findings.map((f) => f.expected)).toEqual(['die Universität']);
  });
  it('flags a wrong plural and a broken verb paradigm, but not in quotes', () => {
    const r = checkText('- der Stuhl (die Stuhle) – chair\nEr hat gegangen.', lex);
    expect(r.findings.map((f) => f.kind).sort()).toEqual(['plural', 'verb']);
    expect(checkText("Typical mistake: 'Er hat gegangen.' → correct: 'Er ist gegangen.'", lex).findings).toHaveLength(0);
  });
  it('ignores the learner text a correction quotes', () => {
    const original = 'Ich habe nach Berlin gegangen.';
    expect(checkText(`**Ich bin nach Berlin gegangen.**\nYou wrote ${original}`, lex, [original]).findings).toHaveLength(0);
  });
  it('flags article/adjective/noun agreement slips anywhere in the answer', () => {
    const slips: [string, string][] = [
      ['Bring vielleicht eine kleine Geschenk mit.', 'ein kleines Geschenk'],
      ['Wo ist die nächste Bahnhof?', 'der nächste Bahnhof'],
      ['Wo ist das nächste Verkehrsknotenpunkt?', 'der nächste Verkehrsknotenpunkt'],
      ['Das ist **eine kleine** Geschenk.', 'ein kleines Geschenk'],
      ['Er hat ein kleine Haus.', 'ein kleines Haus'],
      ['Sie kauft einen neues Auto.', 'ein neues Auto'],
      ['Ich habe kein Zeit.', 'keine Zeit'],
      ['Hast du ein Idee?', 'eine Idee'],
      ['Ich habe einen Katze.', 'eine Katze'],
      ['Das ist eine sehr gute Buch.', 'ein gutes Buch'],
      ['Ich suche ein neue Job.', 'ein neuer Job / einen neuen Job'],
    ];
    for (const [text, expected] of slips) {
      const f = checkText(text, lex).findings;
      expect(f.map((x) => [x.kind, x.expected]), text).toEqual([['agreement', expected]]);
    }
  });
  it('leaves correct noun phrases, relative clauses, pronouns, plurals and contrasted mistakes alone', () => {
    const fine = [
      'Ich habe ein kleines Geschenk für dich. Der nächste Bahnhof ist weit.',
      'Die Frau, die gerne Kaffee trinkt, wohnt hier. Der Mann, der heute Brot kauft, auch.',
      'Das Kind, das keine Zeit hat, spielt nicht.',
      'Habt ihr Zeit? Wollt ihr frische Milch? Hat einer Hunger? Wenn man einem Zeit gibt.',
      'Um ein Uhr essen wir. Ich habe ein bisschen Zeit und ein paar Fragen.',
      'Das ist die kleine Katze. Ich sehe den kleinen Hund. Mit meiner Schwester gehe ich ins Kino.',
      'Keine kleinen Kinder, keine Lehrer, meine Eltern.',
      'Not *eine kleine Geschenk* but *ein kleines Geschenk*.',
      'You wrote „ein kleine Haus“ – correct: „ein kleines Haus“.',
      'Es war ein schöner Tag und ein langes Wochenende. Eines Tages fahre ich nach Berlin.',
      'Ich nehme die größere Tasse und das kleinere Glas. Das war das erste Mal. Die ganze Woche.',
      'Eine Tasse Kaffee, eine Flasche Wasser und ein Glas Milch, bitte. Das kostet einen Euro.',
      'Ich lade dich ein. Morgen kommt meine Mutter. Hat ihr Bruder Zeit?',
    ];
    for (const text of fine) expect(checkText(text, lex).findings, text).toHaveLength(0);
  });
});

describe('parsers (shapes taken from the v16 release)', () => {
  it('reads a correction with the corrected sentence first', () => {
    const c = parseCorrection(
      "**Ich bin nach Berlin gefahren.**\n„fahren“ forms the Perfekt with **sein**, not haben.",
      'Ich habe nach Berlin gefahren.',
    );
    expect(c).toMatchObject({ corrected: 'Ich bin nach Berlin gefahren.', unchanged: false });
    expect(c.explanation).toContain('Perfekt');
  });
  it('recognises a sentence that was already right and drops the no-op fix line', () => {
    const c = parseCorrection(
      "**Ich bin gestern ins Kino gegangen.**\nFix: 'bin gestern ins Kino gegangen.' -> 'bin gestern ins Kino gegangen.'.\nReason: The participle 'gegangen' closes the sentence; nothing follows it.",
      'Ich bin gestern ins Kino gegangen.',
    );
    expect(c.unchanged).toBe(true);
    expect(c.explanation).not.toContain('Fix:');
    expect(c.explanation).toContain('Reason:');
  });
  it('reads a labelled correction with a quoted sentence', () => {
    const c = parseCorrection('**Corrected sentence:**\n> Weil ich krank bin, bleibe ich zu Hause.\n**The rule:** …', 'Weil ich bin krank, bleibe ich zu Hause.');
    expect(c.corrected).toBe('Weil ich krank bin, bleibe ich zu Hause.');
  });
  it('reads a Russian correction, labelled or with the sentence first', () => {
    const labelled = parseCorrection('**Исправленное предложение:**\nIch bin gestern ins Kino gegangen.\n\nПричина: gehen образует перфект с sein.', 'Ich habe gestern ins Kino gegangen.');
    expect(labelled).toMatchObject({ corrected: 'Ich bin gestern ins Kino gegangen.', unchanged: false });
    expect(labelled.explanation).toContain('Причина');
    const bold = parseCorrection('**Ich bin gestern ins Kino gegangen.**\nИсправление: habe → bin. Глаголы движения образуют перфект с sein.', 'Ich habe gestern ins Kino gegangen.');
    expect(bold.corrected).toBe('Ich bin gestern ins Kino gegangen.');
    expect(bold.explanation).toContain('Исправление');
  });
  it('treats a bold label line it does not know as a label, not as the sentence', () => {
    // the shape the phone produced for a Russian check (v23, "Ответь по-русски")
    const answer =
      '**Корректное предложение:**\n\n„Obwohl er krank war, **ist er** trotzdem zur Arbeit gegangen."\n\n(Although he was sick, he went to work anyway.)\n\n**Что я исправил:**\n\n1. „Obwohl er krank war, er ist" → „Obwohl er krank war, ist er"';
    const c = parseCorrection(answer, 'Obwohl er krank war, er ist trotzdem zur Arbeit gegangen.');
    expect(c.corrected).toBe('Obwohl er krank war, ist er trotzdem zur Arbeit gegangen.');
    expect(c.unchanged).toBe(false);
    expect(c.explanation).toContain('Что я исправил');
    expect(c.explanation).not.toContain('Корректное предложение');
    const plain = parseCorrection('Here is the correction:\nIch bin gestern ins Kino gegangen.\nReason: gehen takes sein.', 'Ich habe gestern ins Kino gegangen.');
    expect(plain.corrected).toBe('Ich bin gestern ins Kino gegangen.');
    // a bold sentence that happens to be the whole first line is still the sentence
    expect(parseCorrection('**Er sagte, dass er müde sei.**\nFix: ...', 'Er sagte, dass er müde ist.').corrected).toBe('Er sagte, dass er müde sei.');
  });
  const vocab = `Here are 8 useful words for food and shopping at A2 level:

1. **das Brot** (die Brote) – bread
   Ich kaufe morgens frisches Brot im Supermarkt. – I buy fresh bread at the supermarket in the morning.

2. **das Wasser** (–, usually no plural) – water
   Trinken Sie viel Wasser, besonders im Sommer. – Drink plenty of water, especially in summer.

3. **der Käse** (–, usually no plural) – cheese
   Auf dem Teller liegt frischer Käse. – There is fresh cheese on the plate.

A few useful notes:`;
  it('reads a word list item by item', () => {
    const items = parseVocabList(vocab);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ article: 'das', lemma: 'Brot', plural: 'Brote', meaning: 'bread', exampleGloss: 'I buy fresh bread at the supermarket in the morning.' });
    expect(items[1]).toMatchObject({ lemma: 'Wasser', plural: null, noPlural: true });
    expect(vocabListComplete(vocab, 3)).toBe(true);
    expect(vocabListComplete(vocab.slice(0, vocab.indexOf('3. **der')), 3)).toBe(false);
    // before the first item arrives (the streaming start)
    expect(vocabListComplete('Here are', 0)).toBe(false);
    expect(vocabListComplete('', 6)).toBe(false);
  });
  it('reads the other word-list layout: number inside the bold, example not indented', () => {
    const items = parseVocabList(`Here are 6 useful words:

**1. das Brot** (die Brote) – bread
Das Brot ist frisch. – The bread is fresh.

**2. die Milch** (no plural) – milk
Ich trinke Kaffee mit Milch. – I drink coffee with milk.

**3. der Arzt** (die Ärzte) / **die Ärztin** (die Ärztinnen) – doctor
Der Arzt hat mir eine Tablette gegeben. – The doctor gave me a tablet.

**Quick grammar note:** after *mit* you need the dative.`);
    expect(items.map((i) => [i.article, i.lemma, i.plural, i.meaning])).toEqual([
      ['das', 'Brot', 'Brote', 'bread'],
      ['die', 'Milch', null, 'milk'],
      ['der', 'Arzt', 'Ärzte', 'doctor'],
    ]);
    expect(items[1].noPlural).toBe(true);
    expect(items[2].example).toBe('Der Arzt hat mir eine Tablette gegeben.');
  });
  it('reads the B1 layout: plural as a suffix, meaning in parentheses, bulleted example and a note about the word', () => {
    const items = parseVocabList(`Here are 6 useful B1 words for a job interview:

**1. die Erfahrung, -en** (experience)
- Ich habe drei Jahre als Verkäufer gearbeitet. (I worked as a salesperson for three years.)
- *die Erfahrung, -en* is feminine and takes *die* in the plural.

**2. die Stärke, -n** (strength)
- Meine Stärken sind Teamarbeit und Zuverlässigkeit. (My strengths are teamwork and reliability.)
- *die Stärke, -n* is feminine.

**3. der Apfel, ¨-** (apple)
- Der Apfel ist rot. – The apple is red.

**4. das Haus, ¨-er** (house)
- Das Haus ist groß.

**5. der Lehrer, -** (teacher)
- Der Lehrer erklärt die Grammatik. (The teacher explains the grammar.)

**6. die Bewerbung (-en)** – application
- Ich schreibe eine Bewerbung. – I am writing an application.
`);
    expect(items.map((i) => [i.lemma, i.plural, i.meaning])).toEqual([
      ['Erfahrung', 'Erfahrungen', 'experience'],
      ['Stärke', 'Stärken', 'strength'],
      ['Apfel', 'Äpfel', 'apple'],
      ['Haus', 'Häuser', 'house'],
      ['Lehrer', 'Lehrer', 'teacher'],
      ['Bewerbung', 'Bewerbungen', 'application'],
    ]);
    expect(items[0].example).toBe('Ich habe drei Jahre als Verkäufer gearbeitet.');
    expect(items[0].exampleGloss).toBe('I worked as a salesperson for three years.');
    expect(items[3].exampleGloss).toBeNull();
    // the stream is complete for one item as soon as its example line has ended, note or no note
    const head = '**1. die Erfahrung, -en** (experience)\n- Ich habe drei Jahre als Verkäufer gearbeitet. (I worked as a salesperson for three years.)';
    expect(vocabListComplete(head, 1)).toBe(false);
    expect(vocabListComplete(`${head}\n`, 1)).toBe(true);
  });
  it('reads phrases with their translation on the next line', () => {
    const p = parsePhrases('Here are 6 phrases:\n\n**1. Ich hätte gern ein Brötchen.**\n(I would like a roll.)\nThe standard request.\n\n**2. Was kostet ein Brötchen?**\n(How much is a roll?)');
    expect(p).toEqual([
      { german: 'Ich hätte gern ein Brötchen.', english: 'I would like a roll.' },
      { german: 'Was kostet ein Brötchen?', english: 'How much is a roll?' },
    ]);
  });
  it('reads the other gloss shapes: a dash, a slash, an arrow, italics, a label, and leaves a German line alone', () => {
    const a = [
      '1. **Entschuldigung, wie komme ich zum Bahnhof?**',
      '- Excuse me, how do I get to the station?',
      '2. Ist es weit bis zum Zentrum? / Is it far to the centre?',
      '3. Wo ist die nächste Haltestelle?',
      '→ Where is the nearest stop?',
      '4. Können Sie mir helfen?',
      '*Can you help me?*',
      '5. Gehen Sie geradeaus.',
      'Translation: Go straight ahead.',
      '6. Biegen Sie links ab.',
      'Das sagt man oft in der Stadt.',
      '',
    ].join('\n');
    const p = parsePhrases(a);
    expect(p.map((x) => x.english)).toEqual(['Excuse me, how do I get to the station?', 'Is it far to the centre?', 'Where is the nearest stop?', 'Can you help me?', 'Go straight ahead.', null]);
    expect(p[5].german).toBe('Biegen Sie links ab.');
    expect(phrasesComplete(a, 5)).toBe(true);
    expect(phrasesComplete(a, 6)).toBe(false);
  });
  it('reads a plan and ignores the chatter around it', () => {
    const menu = [
      { id: 'numbers', alias: /\bnumbers?\b/i },
      { id: 'clock', alias: /\bclock\b/i },
      { id: 'dates', alias: /\bdates?\b/i },
      { id: 'scene', alias: /\bscene\b/i },
    ];
    const plan = parsePlan('Here are 4 tasks:\n\n1. **numbers** - because times are made of numbers\n2. **scene** - because you will need it at the bakery\n3. **dates** - because\n\nEach line gives …', menu, 4);
    expect(plan?.map((p) => p.id)).toEqual(['numbers', 'scene', 'dates']);
    expect(plan?.[1].why).toBe('Because you will need it at the bakery');
    expect(plan?.[2].why).toBeNull();
  });
  it('checks a reference quote against the rule note and repairs it', () => {
    const note = g.blocks['grammar-perfekt'];
    const answer = `Perfekt with haben or sein?\n\nReference:\n> All other verbs, all reflexive verbs and all modal verbs take haben: "Ich habe eine Stunde auf euch gewartet" (warten + haben; warten is not separable), "Ich habe mich gefreute", "Wir haben viel Spaß gehabt" (Spaß haben, never "Spaß spielen").\n\nMost verbs …`;
    const checks = checkReferenceQuotes(answer, note);
    expect(checks).toHaveLength(1);
    expect(checks[0].source).not.toBeNull();
    expect(checks[0].exact).toBe(false);
    expect(repairReferenceQuotes(answer, checks)).toContain('Ich habe mich gefreut"');
  });
});

describe('role-play', () => {
  it('builds the counterpart prompt exactly like the training data', () => {
    for (const f of fixtures as { key: string; frame: 'en-a' | 'de-a' | 'de-b' | 'en-b'; help: 'en' | 'de'; turn: number; learner: string[]; prompt: string }[]) {
      const card = cards.find((c) => c.key === f.key) as SceneCard;
      const transcript: TranscriptLine[] = [[speakerLabel(card.role_de), card.opening], ...f.learner.map((l) => [speakerLabel(card.learner_de), l] as TranscriptLine)];
      expect(counterpartPrompt(card, transcript, f.frame, f.help, exampleFor(card, f.turn))).toBe(f.prompt);
    }
  });
  it('reads a line with its gloss and lists how it broke character', () => {
    const bakery = cards.find((c) => c.key === 'bakery') as SceneCard;
    const ok = readCounterpartLine('Gern, vier Brötchen. Möchten Sie sonst noch etwas?\n(Certainly, four rolls. Anything else?)', bakery, true);
    expect(ok).toEqual({ german: 'Gern, vier Brötchen. Möchten Sie sonst noch etwas?', gloss: 'Certainly, four rolls. Anything else?', tells: [] });
    expect(readCounterpartLine('Verkäuferin: Das Brot kostet 5,20 Euro. Noch etwas?', bakery, false).tells).toContain('invented_figure');
    expect(readCounterpartLine('Das Vollkornbrot kostet 3,80 Euro. Soll ich es schneiden?', bakery, false).tells).toEqual([]);
    expect(readCounterpartLine('Korrektur: Sie meinen „sechs Brötchen“.', bakery, false).tells).toEqual(expect.arrayContaining(['meta_talk', 'no_question']));
  });
  it('drops a second greeting once the dialogue is under way and rejects a line said before', () => {
    const bakery = cards.find((c) => c.key === 'bakery') as SceneCard;
    const role = speakerLabel(bakery.role_de);
    const me = speakerLabel(bakery.learner_de);
    const context = transcriptText([
      [role, bakery.opening],
      [me, 'Guten Morgen, ich hätte gern zwei Brötchen.'],
      [role, 'Gern, zwei Brötchen. Möchten Sie noch etwas?'],
      [me, 'Haben Sie Vollkornbrot?'],
    ]);
    const regreet = readCounterpartLine('Guten Morgen! Ja, das Vollkornbrot kostet 3,80 Euro. Soll ich es schneiden?\n(Good morning! Yes, the wholegrain loaf is 3.80 euros. Shall I slice it?)', bakery, true, context);
    expect(regreet.german).toBe('Ja, das Vollkornbrot kostet 3,80 Euro. Soll ich es schneiden?');
    expect(regreet.gloss).toBe('Yes, the wholegrain loaf is 3.80 euros. Shall I slice it?');
    expect(regreet.tells).toEqual(['regreet']);
    // 2 x 0,45 is arithmetic on a fact, not an invented price
    expect(readCounterpartLine('Das macht 0,90 Euro. Möchten Sie noch etwas dazu?', bakery, false, context).tells).toEqual([]);
    expect(readCounterpartLine('Das macht 1,20 Euro. Möchten Sie noch etwas dazu?', bakery, false, context).tells).toEqual(['invented_figure']);
    const repeat = readCounterpartLine('Guten Tag, gern, zwei Brötchen. Möchten Sie noch etwas?', bakery, false, context);
    expect(repeat.tells).toEqual(expect.arrayContaining(['regreet', 'repeat']));
    expect(readCounterpartLine('Hallo!', bakery, false, context).tells).toContain('empty');
    // without a dialogue (no earlier line of the role) a greeting is fine
    expect(readCounterpartLine('Guten Morgen! Was darf es sein?', bakery, false).tells).toEqual([]);
  });
  it('keeps a suggested reply on the learner side of the counter', () => {
    const bakery = cards.find((c) => c.key === 'bakery') as SceneCard;
    const role = speakerLabel(bakery.role_de);
    const me = speakerLabel(bakery.learner_de);
    const transcript: TranscriptLine[] = [
      [role, bakery.opening],
      [me, 'Zwei Brötchen, bitte.'],
      [role, 'Das sind 0,90 Euro für zwei Brötchen. Möchten Sie noch etwas?'],
    ];
    expect(learnerSideOnly('Guten Morgen! Das sind 0,90 Euro für zwei Brötchen. Ja, noch eine Brezel, bitte.', bakery, transcript)).toBe('Ja, noch eine Brezel, bitte.');
    expect(learnerSideOnly('Das Vollkornbrot kostet 3,80 Euro. Noch etwas?', bakery, transcript)).toBe('Noch etwas?');
    expect(learnerSideOnly('Nein danke, das ist alles. Bis wann haben Sie heute geöffnet?', bakery, transcript)).toBe('Nein danke, das ist alles. Bis wann haben Sie heute geöffnet?');
    expect(learnerSideOnly('Möchten Sie noch etwas?', bakery, transcript)).toBe('');
    // the first line of the scene may greet
    expect(learnerSideOnly('Guten Morgen, ich hätte gern zwei Brötchen.', bakery, [[role, bakery.opening]])).toBe('Guten Morgen, ich hätte gern zwei Brötchen.');
  });
});

describe('drills and writing', () => {
  it('checks verb forms by whole words and forgives a missing umlaut', () => {
    const gehen = coreLex.verb('gehen');
    expect(gehen).toBeDefined();
    const d = drillVerb(gehen!, 'perfekt');
    expect(checkDrill(d, 'er ist gegangen').ok).toBe(true);
    expect(checkDrill(d, 'er bist gegangen').ok).toBe(false);
    const haus = coreLex.noun('Haus') ?? { lemma: 'Haus', genus: 'n' as const, plural: ['Häuser'], meaning: 'house' };
    expect(checkDrill(drillPlural(haus), 'Hauser')).toMatchObject({ ok: true, nearly: 'Häuser' });
    expect(checkDrill(drillArticle(haus), 'das').ok).toBe(true);
    expect(checkDrill(drillArticle(haus), 'der').ok).toBe(false);
  });
  it('builds sets at the learner level from the lexicon core', () => {
    const set = buildDrillSet('article', 'A1', coreLex, makeRng(7), 8);
    expect(set).toHaveLength(8);
    expect(set.every((d) => d.noun && /^A1/.test(d.noun.level ?? ''))).toBe(true);
    expect(buildDrillSet('numbers', 'A2', coreLex, makeRng(1), 3)).toHaveLength(3);
  });
  it.skipIf(!fullLex)('explains a compound by its last part, and only a real compound', () => {
    const lex = fullLex as LexiconIndex;
    expect(genderRule({ lemma: 'Spielstein', genus: 'm', plural: [] }, lex)).toMatch(/der Stein → der Spielstein/);
    expect(genderRule({ lemma: 'Fahrrad', genus: 'n', plural: [] }, lex)).toMatch(/das Rad → das Fahrrad/);
    expect(genderRule({ lemma: 'Kaffee', genus: 'm', plural: [] }, lex)).toBeNull();
  });
  it('only shows a gender rule that predicts the right article', () => {
    expect(genderRule({ lemma: 'Zeitung', genus: 'f', plural: ['Zeitungen'] })).toMatch(/-ung/);
    expect(genderRule({ lemma: 'Käse', genus: 'm', plural: [] })).toBeNull();
  });
  it('prechecks a letter for length, content points and register', () => {
    const task = WRITE_TASKS.find((t) => t.id === 'b1-teacher-absent')!;
    const p = precheckText(task, 'Sehr geehrte Frau Weber, leider kann ich am Montag nicht zum Unterricht kommen, weil ich einen Termin beim Arzt habe. Könnten Sie mir bitte die Hausaufgaben schicken? Vielen Dank im Voraus. Mit freundlichen Grüßen Sam');
    expect(p).toMatchObject({ opening: true, closing: true, noDu: true, ok: true });
    expect(p.points.every((x) => x.hit)).toBe(true);
  });
});

describe('diff and markdown', () => {
  it('marks a word-order correction', () => {
    const ops = diffWords('Weil ich bin krank, bleibe ich zu Hause.', 'Weil ich krank bin, bleibe ich zu Hause.');
    expect(changeCount(ops)).toBeGreaterThan(0);
    expect(ops.map((o) => o.type)).toContain('ins');
    expect(changeCount(diffWords('Ich bin müde.', 'Ich bin müde.'))).toBe(0);
  });
  it('keeps words in any script whole when diffing', () => {
    expect(tokenize('Ich heiße José, und du?')).toEqual(['Ich', 'heiße', 'José', ',', 'und', 'du', '?']);
    expect(tokenize('Корректное предложение:')).toEqual(['Корректное', 'предложение', ':']);
    expect(changeCount(diffWords('Das ist Café Müller.', 'Das ist Café Müller.'))).toBe(0);
  });
  it('parses the model’s light Markdown', () => {
    const blocks = parseMarkdown('**der Verlust** (maskulin). Plural: die Verluste.\nEnglisch: loss.\n\n- Ich wohne seit drei Jahren hier. – I have lived here for three years.\n\n> quoted');
    expect(blocks.map((b) => b.type)).toEqual(['para', 'list', 'quote']);
    expect((blocks[0] as { lines: unknown[] }).lines).toHaveLength(2);
    expect(parseInline('a **b** *c* `d`')).toEqual([{ text: 'a ' }, { text: 'b', bold: true }, { text: ' ' }, { text: 'c', italic: true }, { text: ' ' }, { text: 'd', code: true }]);
  });
});

describe('Tutor (stub model)', () => {
  const seen: { messages: ChatMessage[]; primes: string[] } = { messages: [], primes: [] };
  const stub =
    (reply: string): Generate =>
    async (messages, opts) => {
      seen.messages = messages;
      let full = '';
      let generated = 0;
      for (const ch of reply.split(/(?<=\n)/)) {
        full += ch;
        generated += 1;
        opts.onText?.(full);
        if (opts.stopWhen?.(full, generated)) return { text: full, stopped: 'stop' as const };
      }
      return { text: full, stopped: 'eos' as const };
    };
  const make = (reply: string) =>
    new Tutor({
      generate: stub(reply),
      prime: async (prompt) => {
        seen.primes.push(prompt);
      },
      systemPrompt: '',
      grounding: g,
      lex: fullLex ?? coreLex,
      cards: grammarCards as unknown as GrammarCard[],
    });

  it('cross-checks a time question against the rule engine', async () => {
    const r = await make('**zehn Uhr dreißig**\nAuch möglich: zehn nach halb elf.').ask('Wie sagt man die Uhrzeit 10:30 auf Deutsch?', { level: 'A2', lang: 'en' });
    expect(r.grounded).toEqual(['grammar-numbers-time']);
    expect(r.checks.engine?.agrees).toBe(true);
  });
  it('stops a translation after its first line', async () => {
    const r = await make('**Ich möchte ein Konto eröffnen.**\n\nKey points:\n- möchte …').translate('I would like to open an account.', { level: 'B1', lang: 'en' });
    expect(r.translation).toBe('Ich möchte ein Konto eröffnen.');
    expect(r.to).toBe('de');
    expect(seen.messages[1].content).toContain('in German');
  });
  it('translates a German line into English, not into German again', async () => {
    const r = await make('I would like to open an account.\n').translate('Ich möchte ein Konto eröffnen.', { level: 'B1', lang: 'en' });
    expect(r.to).toBe('en');
    expect(r.translation).toBe('I would like to open an account.');
    expect(seen.messages[1].content).toMatch(/^Translate into English/);
  });
  it('knows when a translation into German is the line handed back', () => {
    expect(handedBack('Kinder spielen gern draussen.', 'Kinder spielen gern draussen.')).toBe(true);
    // the phone's answer: an article added, the spelling normalised
    expect(handedBack('Kinder spielen gern draussen.', 'Die Kinder spielen gern draußen.')).toBe(true);
    expect(handedBack('Kindergarten', 'der Kindergarten')).toBe(true);
    expect(handedBack('I like to play outside.', 'Ich spiele gern draußen.')).toBe(false);
    // names and shared words are not an echo
    expect(handedBack('Tom is in Berlin.', 'Tom ist in Berlin.')).toBe(false);
  });
  it('glosses a German line the word lists missed once the model hands it back', async () => {
    const replies = ['Die Kinder spielen gern draußen.\n', 'Children like playing outside.\n'];
    const prompts: string[] = [];
    const tutor = new Tutor({
      generate: async (messages) => {
        prompts.push(messages[1].content);
        return { text: replies.shift() ?? '', stopped: 'eos' as const };
      },
      prime: async () => {},
      systemPrompt: '',
      grounding: g,
      lex: fullLex ?? coreLex,
      cards: grammarCards as unknown as GrammarCard[],
    });
    const r = await tutor.translate('Kinder spielen gern draussen.', { level: 'A2', lang: 'ru' });
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toMatch(/^Translate into English/);
    expect(r.to).toBe('en');
    expect(r.translation).toBe('Children like playing outside.');
  });
  it('glosses a scene line in the language asked for, not always English', async () => {
    const prompts: string[] = [];
    const tutor = new Tutor({
      generate: async (messages) => {
        prompts.push(messages[1].content);
        return { text: 'Volontiers, commençons tout de suite.\n', stopped: 'eos' as const };
      },
      prime: async () => {},
      systemPrompt: '',
      grounding: g,
      lex: fullLex ?? coreLex,
      cards: grammarCards as unknown as GrammarCard[],
    });
    // the phone showed an English gloss under a French app: the prompt had ignored the language
    expect(await tutor.gloss('Gern, dann fangen wir direkt an.', { level: 'B2', lang: 'fr' })).toBe('Volontiers, commençons tout de suite.');
    expect(prompts[0]).toMatch(/^Traduis en français/);
    await tutor.gloss('Gern.', { level: 'B2', lang: 'de' });
    expect(prompts[1]).toMatch(/^Translate into English/);
  });
  it('puts the rule note after the question by default and before it in the cache-friendly layout', async () => {
    const t = make('Antwort.');
    const q = 'Wie sagt man die Uhrzeit 10:30 auf Deutsch?';
    await t.ask(q, { level: 'A2', lang: 'en' });
    const after = seen.messages[1].content;
    expect(after.startsWith(q)).toBe(true);
    expect(after).toContain('the question above');
    t.setLayout('before');
    await t.ask(q, { level: 'A2', lang: 'en' });
    const before = seen.messages[1].content;
    // the question is German, so the level sentence is too
    expect(before.endsWith(`${q} ${levelSentence('A2', 'de')}`)).toBe(true);
    expect(before).toContain('the question below');
    expect(before).not.toContain('the question above');
    // the two layouts carry the same note
    const headerBefore = g.header.replace('the question above', 'the question below');
    expect(before.startsWith(`${headerBefore}\n`)).toBe(true);
    expect(before.slice(headerBefore.length + 1).split(g.separator)[0]).toBe(after.split(`${g.header}\n`)[1]);
  });
  it('primes the shared beginning of the next prompt while the learner types', async () => {
    const t = make('');
    const ctx = { level: 'A2' as const, lang: 'en' as const };
    seen.primes = [];
    await t.prepare('', ctx);
    expect(seen.primes).toHaveLength(1);
    expect(seen.primes[0].endsWith('<|im_start|>user\n')).toBe(true);
    // the trained layout: the note follows the question, so only the system prompt can go first
    await t.prepare('Wie sagt man die Uhrzeit 10:30', ctx);
    expect(seen.primes[1]).toBe(seen.primes[0]);
    t.setLayout('before');
    await t.prepare('Wie sagt man die Uhrzeit 10:30', ctx);
    expect(seen.primes[2].startsWith(seen.primes[0])).toBe(true);
    expect(seen.primes[2]).toContain('the question below');
    expect(seen.primes[2].endsWith(g.separator)).toBe(true);
    // and the prompt that follows begins with exactly that prefix
    await t.ask('Wie sagt man die Uhrzeit 10:30 auf Deutsch?', { level: 'A2', lang: 'en' });
    const prompt = renderChatPrompt(seen.messages);
    expect(prompt.startsWith(seen.primes[2])).toBe(true);
  });
  it('finds the grammar card a question is about', () => {
    const t = make('');
    expect(t.matchCard("What's the difference between seit and vor?")?.key).toBe('seit-vor-fuer');
    expect(t.matchCard('When do I use Perfekt with haben or sein?')?.key).toBe('perfekt-haben-sein');
    expect(t.matchCard('I like trains')).toBeNull();
  });
  it('gives a correction at B2 or C1 more room and ends it at a paragraph break, not mid-sentence', async () => {
    // the phone at C1: a 260-token correction was cut off inside "a conjunction like *dass, weil, wenn, als"
    const budgets: number[] = [];
    const reply = [
      '**Der Minister sagte, dass die Reform nächstes Jahr umgesetzt werde.**',
      '',
      `Your word order followed main-clause rules. ${'In a subordinate clause the verb goes to the end. '.repeat(20)}`,
      '',
      'More examples:',
      '- Ich weiß, dass er morgen kommt.',
      '- Sie sagt, dass sie das Buch schon gelesen hat.',
      '- Wir glauben, dass das Projekt nächstes Jahr erfolgreich abgeschlossen wird.',
      '- Er fragte, ob wir am Wochenende Zeit für ein Treffen hätten.',
      '',
      `Two useful points: 1. "Obwohl" already sends the verb to the end ${'and so on '.repeat(40)}`,
    ].join('\n');
    const tutor = new Tutor({
      // one word of the reply per token, so the stop sees a realistic token count
      generate: async (_messages, opts) => {
        budgets.push(opts.maxNewTokens);
        const words = reply.split(/(?<=\s)/);
        let full = '';
        for (let i = 0; i < words.length; i += 1) {
          full += words[i];
          if (i + 1 >= opts.maxNewTokens) return { text: full, stopped: 'length' as const };
          if (opts.stopWhen?.(full, i + 1)) return { text: full, stopped: 'stop' as const };
        }
        return { text: full, stopped: 'eos' as const };
      },
      prime: async () => {},
      systemPrompt: '',
      grounding: g,
      lex: fullLex ?? coreLex,
      cards: grammarCards as unknown as GrammarCard[],
    });
    const sentence = 'Der Minister sagte, dass die Reform wird nächstes Jahr umgesetzt werden.';
    const c1 = await tutor.correct(sentence, { level: 'C1', lang: 'en' });
    expect(budgets).toEqual([P.correctionBudget('C1')]);
    expect(P.correctionBudget('C1')).toBeGreaterThan(P.correctionBudget('A2'));
    expect(c1.correction.corrected).toBe('Der Minister sagte, dass die Reform nächstes Jahr umgesetzt werde.');
    // stopped at the blank line after the examples (the first paragraph break past three quarters of the budget)
    expect(c1.text.endsWith('- Er fragte, ob wir am Wochenende Zeit für ein Treffen hätten.')).toBe(true);
    expect(c1.text).not.toContain('Two useful points');
    await tutor.correct(sentence, { level: 'A2', lang: 'en' });
    expect(budgets[1]).toBe(P.BUDGET.correction);
  });
});

describe('softStop', () => {
  const stop = softStop(100);
  it('lets the model run until most of the budget is spent', () => {
    expect(stop('Der Satz ist fertig.\n\n', 50)).toBe(false);
  });
  it('stops at a paragraph break from three quarters of the budget', () => {
    expect(stop('Der Satz ist fertig.\n\n', 75)).toBe(true);
    expect(stop('Der Satz ist fertig.\n', 75)).toBe(true);
    expect(stop('Der Satz ist fertig. Und', 75)).toBe(false);
    expect(stop('Der Satz ist fertig.', 75)).toBe(false);
  });
  it('stops at a sentence end from nine tenths of the budget, but not at an abbreviation or a list number', () => {
    expect(stop('Der Satz ist fertig.', 90)).toBe(true);
    expect(stop('Der Satz ist „fertig.“', 90)).toBe(true);
    expect(stop('Der Satz ist fertig!', 95)).toBe(true);
    expect(stop('Zum Beispiel z. B.', 90)).toBe(false);
    expect(stop('Hier kommt Nr.', 90)).toBe(false);
    expect(stop('Ein Beispiel:\n1.', 90)).toBe(false);
    expect(stop('1. Der erste Punkt.\n2.', 90)).toBe(false);
  });
});

describe('rules behind a correction', () => {
  // imported lazily so the suite above stays independent of the rule tables
  it('names verb-second and the dative for the learner sentence from the live check', async () => {
    const { rulesForCorrection } = await import('../rules');
    const a = 'Gestern ich bin mit meine Freundin ins Kino gegangen.';
    const b = 'Gestern bin ich mit meiner Freundin ins Kino gegangen.';
    const hits = rulesForCorrection(a, b, diffWords(a, b), 'en', fullLex ?? coreLex, g);
    expect(hits.map((h) => h.kind)).toEqual(['verb-second', 'preposition-case']);
    expect(hits[1].detail).toContain('meine → meiner');
  });
  it.skipIf(!fullLex)('is never wrong on the classic learner errors (A1-B2) it recognises', async () => {
    const { rulesForCorrection } = await import('../rules');
    const errors = (await import('./fixtures/classic-errors.json')).default as { wrong: string; right: string; kind: string }[];
    const related: Record<string, string[]> = { 'accusative-preposition': ['preposition-case', 'place-preposition'], 'two-way-preposition': ['place-preposition', 'preposition-case'], 'perfekt-auxiliary': ['bracket', 'verb-final'] };
    let hits = 0;
    let right = 0;
    for (const e of errors) {
      for (const h of rulesForCorrection(e.wrong, e.right, diffWords(e.wrong, e.right), 'en', fullLex as LexiconIndex, g)) {
        hits += 1;
        if (h.kind === e.kind || (related[h.kind] ?? []).includes(e.kind)) right += 1;
      }
    }
    expect(right).toBe(hits);
    expect(hits).toBeGreaterThanOrEqual(40);
  });
  it('picks the rule note for the mistake a sentence most likely has', async () => {
    const { correctionNote } = await import('../rules');
    expect(correctionNote('Gestern ich bin mit meine Freundin ins Kino gegangen.')).toBe('grammar-word-order');
    expect(correctionNote('Ich fahre mit der Bus.')).toBe('grammar-prepositions');
    expect(correctionNote('Ich habe nach Hause gegangen.')).toBe('grammar-perfekt');
    expect(correctionNote('Das ist gut.')).toBeNull();
  });
});
