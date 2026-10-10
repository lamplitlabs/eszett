import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import grammarCards from '../../data/grammar.json';
import grounding from '../../data/grounding.json';
import lexiconCore from '../../data/lexicon-core.json';
import { bulletsAfter, fieldLines, fieldValue, parseGrammarCardDraft, parseSceneDraft, parseTopics, parseWriteTaskDraft, roleWithArticle, slugKey, topicsComplete } from '../authoring';
import type { GroundingPack } from '../grounding';
import { LexiconIndex, type LexiconData } from '../lexicon';
import { DraftError, Tutor, type ChatMessage, type Generate, type GrammarCard } from '../tutor';
import { precheckText } from '../writing';

const coreLex = new LexiconIndex(lexiconCore as unknown as LexiconData);
const fullLexiconPath = join(__dirname, '../../../.model-cache/lexicon.json');
const fullLex = existsSync(fullLexiconPath) ? new LexiconIndex(JSON.parse(readFileSync(fullLexiconPath, 'utf8')) as LexiconData) : null;
const lex = fullLex ?? coreLex;

const SCENE = `Situation (German): Ein Fahrrad in der Werkstatt abholen
Situation (English): picking up a bike from the repair shop
Place: Fahrradwerkstatt
Their role (German): der Mechaniker
Their role (English): the mechanic
My role (German): die Kundin
My role (English): the customer
Register: Sie
Facts:
- Reparatur | Repair | neue Bremsen, 45 Euro
- Fertig seit | Ready since | gestern Nachmittag
- Öffnungszeiten | Opening hours | bis 18 Uhr
Opening line (German): Guten Tag! Kommen Sie wegen des Fahrrads?
Opening (English): Hello! Are you here about the bike?`;

describe('fieldLines', () => {
  it('reads plain, bold, bulleted and numbered labels', () => {
    const f = fieldLines('**Title:** An email\n- Place: Bahnhof\nRegister - Sie\nBerlin - a big city\nRule (English): Most verbs take haben: ich habe gegessen.');
    expect(fieldValue(f, 'title')).toBe('An email');
    expect(fieldValue(f, 'place')).toBe('Bahnhof');
    expect(fieldValue(f, 'rule (english)')).toBe('Most verbs take haben: ich habe gegessen.');
    // a known label takes a dash instead of the colon; any other "x - y" line is not a field
    expect(fieldValue(f, 'register')).toBe('Sie');
    expect(f.some((x) => x.key === 'berlin')).toBe(false);
  });

  it('reads the shapes the model really writes: headings, values on the next line, bracketed glosses', () => {
    const f = fieldLines('# Situation: Im Warenhaus\n\n**Their role** (German): der Kundenservice, Sie\n\n**Their first line**\nGuten Tag! Wie kann ich Ihnen helfen?\n*(Good day! How can I help you?)*\n\n**Three facts**\n- a | b | c');
    expect(fieldValue(f, 'situation')).toBe('Im Warenhaus');
    expect(fieldValue(f, 'their role (german)')).toBe('der Kundenservice, Sie');
    expect(fieldValue(f, 'their first line')).toBe('Guten Tag! Wie kann ich Ihnen helfen?');
    expect(fieldValue(f, 'their first line (english)')).toBe('Good day! How can I help you?');
    expect(fieldValue(f, 'three facts')).toBe('');
  });

  it('never takes the English line for a German field', () => {
    const f = fieldLines('Opening (English): Hello!\nFirst line (German): Guten Tag!');
    expect(fieldValue(f, 'opening line (german)', 'opening')).toBe('');
    expect(fieldValue(f, 'opening (english)')).toBe('Hello!');
  });

  it('collects the bullets under a heading until the next label or a blank line', () => {
    const items = bulletsAfter('Facts:\n- a | b | 1\n- c | d | 2\n\nOpening: x', 'facts');
    expect(items).toEqual(['a | b | 1', 'c | d | 2']);
    expect(bulletsAfter('Fakten:\n* a | b | 1\nOpening: x', 'facts', 'fakten')).toEqual(['a | b | 1']);
    expect(bulletsAfter('Nothing here', 'facts')).toEqual([]);
  });
});

describe('parseSceneDraft', () => {
  it('reads the trained format into a playable card', () => {
    const draft = parseSceneDraft(SCENE, 'A2', lex, 'picking up my bike', 1000);
    expect(draft).not.toBeNull();
    const card = draft!.card;
    expect(card.key).toMatch(/^own-picking-up-a-bike-from-/);
    expect(card.situation_de).toBe('Ein Fahrrad in der Werkstatt abholen');
    expect(card.situation_en).toBe('picking up a bike from the repair shop');
    expect(card.role_de).toBe('der Mechaniker');
    expect(card.learner_de).toBe('die Kundin');
    expect(card.register).toBe('Sie');
    expect(card.facts.map((f) => f.value)).toEqual(['neue Bremsen, 45 Euro', 'gestern Nachmittag', 'bis 18 Uhr']);
    expect(card.facts[0]).toMatchObject({ label_de: 'Reparatur', label_en: 'Repair', alts: [] });
    expect(card.opening).toBe('Guten Tag! Kommen Sie wegen des Fahrrads?');
    expect(card.opening_gloss).toBe('Hello! Are you here about the bike?');
    expect(card.beats).toEqual([]);
    expect(draft!.warnings).toEqual([]);
  });

  it.skipIf(!fullLex)('takes a role article from the lexicon and notes what it assumed', () => {
    const text = SCENE.replace('der Mechaniker', 'die Mechaniker').replace('Register: Sie\n', '').replace(/My role \(German\): .*\n/, '');
    const draft = parseSceneDraft(text, 'A2', lex, '', 1000)!;
    expect(draft.card.role_de).toBe('der Mechaniker');
    expect(draft.card.register).toBe('Sie');
    expect(draft.card.learner_de).toBe('der Kunde');
    expect(draft.notes).toEqual(['Article of "der Mechaniker" taken from the lexicon', 'Register not stated; formal Sie assumed', 'Your role was not stated; "der Kunde" assumed']);
  });

  it('reads German labels, bold labels and du', () => {
    const text = `**Situation (Deutsch):** Mit einem Freund kochen
**Ort:** Küche
**Deine Rolle:** der Freund
**Meine Rolle:** die Mitbewohnerin
**Anrede:** du
**Fakten:**
- Gericht | Dish | Nudeln mit Tomatensoße
- Zeit | Time | 19 Uhr
**Erster Satz:** „Hey! Hast du schon Hunger?“`;
    const draft = parseSceneDraft(text, 'A1', lex, 'cooking with a friend', 1000)!;
    expect(draft.card.register).toBe('du');
    expect(draft.card.opening).toBe('Hey! Hast du schon Hunger?');
    expect(draft.card.situation_en).toBe('cooking with a friend');
    expect(draft.card.facts).toHaveLength(2);
  });

  it('rejects a draft without two facts or without an opening line', () => {
    expect(parseSceneDraft(SCENE.replace(/- Fertig.*\n- Öffnungszeiten.*\n/, ''), 'A2', lex)).toBeNull();
    expect(parseSceneDraft(SCENE.replace(/Opening line \(German\): .*\n/, ''), 'A2', lex)).toBeNull();
    expect(parseSceneDraft('Sure! Here is a role-play about bikes.', 'A2', lex)).toBeNull();
  });

  it.skipIf(!fullLex)('flags a wrong gender in the opening line instead of failing', () => {
    const draft = parseSceneDraft(SCENE.replace('Kommen Sie wegen des Fahrrads?', 'Ist das die Fahrrad?'), 'A2', lex)!;
    expect(draft.warnings).toEqual(['die Fahrrad -> das Fahrrad']);
  });
});


const DEVICE_SCENE = `# Situation: Im Warenhaus, Rückgabe eines Jacken

**Their role** (German): der Kundenservice, Sie
**My role** (German): der Kunde / die Kundin, Sie

**Three facts**
- Preis | Price | 45,99 €
- Artikel | Item | eine Jacke, Größe M
- Zeit | Time | heute Nachmittag, 14 Uhr

**Their first line**
Guten Tag! Wie kann ich Ihnen helfen?
*(Good day! How can I help you?)*

**Useful phrases for your turn**
- Ich habe dieses Jackett gestern gekauft. *(I bought this jacket yesterday.)*

Tip: use **der Umtauschschlüssel** (pl. die Umtauschschlüssel) – the standard German term.`;

const BAKERY_SCENE = `**Situation: Brot und Brötchen im Bäckerei kaufen**
*English: buying bread and rolls at the bakery*

**Place:** die Bäckerei (bakery)
**Their role:** der Verkäufer (salesperson)
**My role:** der Kunde (customer)

**Register:** Sie

**Facts:**
- Preis | Price | 1,50 € für das Brot, 1,20 € für die Brötchen
- Zeit | Time | 9 Uhr

**Opening line (German):**
Guten Morgen! Haben Sie alles dabei?
(Good morning! Do you have everything with you?)

Note: "Haben Sie alles dabei" is the standard way to ask.`;

describe('parseSceneDraft on the phone\'s drafts', () => {
  it('reads the Markdown card the model wrote on the device', () => {
    const draft = parseSceneDraft(DEVICE_SCENE, 'A2', lex, 'returning a jacket to a department store', 1000)!;
    expect(draft.card).toMatchObject({
      situation_de: 'Im Warenhaus, Rückgabe eines Jacken',
      situation_en: 'returning a jacket to a department store',
      place: 'Warenhaus',
      role_de: 'der Kundenservice',
      learner_de: 'der Kunde',
      register: 'Sie',
      opening: 'Guten Tag! Wie kann ich Ihnen helfen?',
      opening_gloss: 'Good day! How can I help you?',
    });
    expect(draft.card.facts.map((x) => x.label_en)).toEqual(['Price', 'Item', 'Time']);
  });

  it.skipIf(!fullLex)('takes bracketed English as the English role and flags a wrong contraction', () => {
    const draft = parseSceneDraft(BAKERY_SCENE, 'A1', lex, 'buying bread', 1000)!;
    expect(draft.card).toMatchObject({ place: 'Bäckerei', role_de: 'der Verkäufer', role_en: 'the salesperson', learner_en: 'the customer', opening: 'Guten Morgen! Haben Sie alles dabei?' });
    expect(draft.warnings).toContain('im Bäckerei -> in der Bäckerei');
  });
});

describe.skipIf(!fullLex)('roleWithArticle', () => {
  it('adds or corrects the article of a known noun and leaves unknown ones alone', () => {
    expect(roleWithArticle('Verkäuferin', lex)).toEqual({ role: 'die Verkäuferin', fixed: false });
    expect(roleWithArticle('der Verkäuferin', lex)).toEqual({ role: 'die Verkäuferin', fixed: true });
    expect(roleWithArticle('eine Verkäuferin', lex)).toEqual({ role: 'die Verkäuferin', fixed: true });
    expect(roleWithArticle('der Zugbegleiter-Azubi', null)).toEqual({ role: 'der Zugbegleiter-Azubi', fixed: false });
  });
});

const TASK = `Title: A message to a neighbour
Task (English): Write a short message to your neighbour Herr Weber: you are having a party on Saturday. Say when it starts, how long it will last, and apologise for the noise.
Task (German): Schreib eine kurze Nachricht an deinen Nachbarn Herrn Weber: Du feierst am Samstag eine Party. Sag, wann sie beginnt, wie lange sie dauert, und entschuldige dich für den Lärm.
Content points:
- when it starts | ab, um, Uhr, beginnt
- how long | bis, Mitternacht, dauert
- apologise for the noise | Entschuldigung, Lärm, laut, entschuldigen`;

describe('parseWriteTaskDraft', () => {
  it('reads the task with normalised key words the precheck can match', () => {
    const task = parseWriteTaskDraft(TASK, 'A2', 'formal', 'a party', 1000)!;
    expect(task).toMatchObject({ id: 'own-a-message-to-a-neighbour-rs', level: 'A2', register: 'formal', words: [30, 45], title: 'A message to a neighbour' });
    expect(task.points).toHaveLength(3);
    expect(task.points[2].any).toEqual(['entschuldigung', 'laerm', 'laut', 'entschuldigen']);
    const check = precheckText(task, 'Sehr geehrter Herr Weber, am Samstag feiere ich eine Party. Sie beginnt um 19 Uhr und dauert bis Mitternacht. Entschuldigung für den Lärm! Mit freundlichen Grüßen, Anna');
    expect(check.points.map((p) => p.hit)).toEqual([true, true, true]);
    expect(check.opening && check.closing).toBe(true);
  });

  it('falls back to the English task text when the German one is missing and rejects thin drafts', () => {
    const task = parseWriteTaskDraft(TASK.replace(/Task \(German\): .*\n/, ''), 'B1', 'informal')!;
    expect(task.promptDe).toBe(task.prompt);
    expect(task.words).toEqual([70, 100]);
    expect(parseWriteTaskDraft(TASK.replace(/- how long.*\n- apologise.*/, ''), 'A2', 'formal')).toBeNull();
    expect(parseWriteTaskDraft('Here is a task: write about your party.', 'A2', 'formal')).toBeNull();
  });

  it('reads dash labels, dictionary notes and articles out of a card the model wrote', () => {
    const text = `**An eine Mietbeschwerde – formelle E-Mail an den Vermieter**

**Title** – eine Beschwerde über Lärm an den Vermieter

**Task (English)** – Write a formal complaint email to your landlord about noise: describe the problem.

**Task (German)** – Schreib eine formelle Beschwerde-E-Mail an deinen Vermieter (der Vermieter, –) über Lärm: beschreibe das Problem.

**Content points**
- the noise and when | der Lärm, Lärm in der Nacht, ab 22 Uhr
- what you want | eine Lösung, Ruhe, Entschädigung (die Entschädigung, -en)`;
    const task = parseWriteTaskDraft(text, 'B1', 'formal', 'noise', 1000)!;
    expect(task.title).toBe('Eine Beschwerde über Lärm an den Vermieter');
    expect(task.prompt).toMatch(/^Write a formal complaint/);
    expect(task.promptDe).toBe('Schreib eine formelle Beschwerde-E-Mail an deinen Vermieter über Lärm: beschreibe das Problem.');
    expect(task.points).toEqual([
      { en: 'the noise and when', any: ['laerm', 'laerm in der nacht', 'ab 22 uhr'] },
      { en: 'what you want', any: ['loesung', 'ruhe', 'entschaedigung'] },
    ]);
  });

  it('reads the exam shape the model prefers: German only, with the English side showing the German', () => {
    const text = `**Aufgabe: Beschwerdebrief an den Vermieter**

Sie wohnen seit drei Monaten in der Wohnung 3. Schreiben Sie einen formellen Beschwerdebrief (mindestens 70 Wörter) an Ihren Vermieter.

Schreiben Sie etwas zu diesen Punkten:

- Warum schreiben Sie? | die Beschwerde, die Wohnung, der Vermieter
- Was genau ist das Problem? | das Geräusch, die Nacht
- Was erwarten Sie vom Vermieter? | die Lösung

Tipp: Nutzen Sie höfliche Formulierungen.`;
    const task = parseWriteTaskDraft(text, 'B1', 'formal', 'a complaint', 1000)!;
    expect(task.title).toBe('Beschwerdebrief an den Vermieter');
    expect(task.promptDe).toBe('Sie wohnen seit drei Monaten in der Wohnung 3. Schreiben Sie einen formellen Beschwerdebrief (mindestens 70 Wörter) an Ihren Vermieter.');
    expect(task.prompt).toBe(task.promptDe);
    expect(task.points.map((p) => p.en)).toEqual(['Warum schreiben Sie?', 'Was genau ist das Problem?', 'Was erwarten Sie vom Vermieter?']);
    expect(task.points[0].any).toEqual(['beschwerde', 'wohnung', 'vermieter']);
  });

  it('takes the English task from a translation block and ignores its English key words', () => {
    const text = `**Aufgabe: Eine E-Mail an einen Freund**

Schreib eine E-Mail an deinen Freund Jonas. Schreibe 30–45 Wörter.

Schreibe etwas zu diesen Punkten:
- Wann fährst du? | Freitag, am Wochenende
- Was machst du? | wandern, ins Schwimmbad

---

**Translation**

Writing task: An email to a friend

Write an email to your friend Jonas. Write 30–45 words.

Say something about these points:
- When are you going? | with when, from
- What are you doing? | hiking, the swimming pool`;
    const task = parseWriteTaskDraft(text, 'A2', 'informal', 'a trip', 1000)!;
    expect(task.title).toBe('Eine E-Mail an einen Freund');
    expect(task.promptDe).toBe('Schreib eine E-Mail an deinen Freund Jonas. Schreibe 30–45 Wörter.');
    expect(task.prompt).toBe('Write an email to your friend Jonas. Write 30–45 words.');
    expect(task.points).toEqual([
      { en: 'Wann fährst du?', any: ['freitag', 'am wochenende', 'wochenende'] },
      { en: 'Was machst du?', any: ['wandern', 'ins schwimmbad', 'schwimmbad'] },
    ]);
  });

  it('follows an explicit du-Form in the task text, falls back to the topic as title, skips word-bank lines', () => {
    const text = `Task (English): Write a complaint to your landlord. Use the du-form, and say when the noise started.
Task (German): Schreib eine Beschwerde an deinen Vermieter. Benutze die du-Form.
Content points:
- the noise | der Lärm, begonnen hat
- what you want | etwas ändern, höflich bitten`;
    const task = parseWriteTaskDraft(text, 'B1', 'formal', 'a complaint about noise', 1000)!;
    expect(task.register).toBe('informal');
    expect(task.title).toBe('A complaint about noise');
    expect(task.points[1].any).toEqual(['etwas aendern', 'aendern', 'hoeflich bitten', 'hoeflich']);
    const bank = `**Aufgabe: Bewerbung**\n\nSchreiben Sie eine formelle E-Mail.\n\n**Point 1** | Anlass\n- das Praktikum, -s | sich bewerben um ein Praktikum\n- die Abteilung, -en | sich eine Abteilung aussuchen`;
    expect(parseWriteTaskDraft(bank, 'B2', 'formal', 'an application')).toBeNull();
  });
});

const CARD = `Title (English): Two-way prepositions: wo or wohin?
Title (German): Wechselpräpositionen: wo oder wohin?
Rule (English): After in, an, auf, über, unter, vor, hinter, neben and zwischen the case depends on the question. Wohin? (movement to a place) takes the accusative, wo? (a place) takes the dative.
Rule (German): Nach in, an, auf, über, unter, vor, hinter, neben und zwischen hängt der Kasus von der Frage ab: wohin? Akkusativ, wo? Dativ.
Examples:
- Ich gehe in die Küche. | I go into the kitchen.
- Ich bin in der Küche. | I am in the kitchen.
- Das Buch liegt auf die Tisch. | The book is on the table.
Pitfall:
- Ich gehe in der Küche. | Ich gehe in die Küche. | gehen is movement, so wohin? and the accusative.`;

describe.skipIf(!fullLex)('parseGrammarCardDraft', () => {
  it('reads the card and drops an example the lexicon finds a gender error in', () => {
    const draft = parseGrammarCardDraft(CARD, 'A2', lex, 'wo or wohin', 1000)!;
    expect(draft.card.title_en).toBe('Two-way prepositions: wo or wohin?');
    expect(draft.card.examples).toEqual([
      ['Ich gehe in die Küche.', 'I go into the kitchen.'],
      ['Ich bin in der Küche.', 'I am in the kitchen.'],
    ]);
    expect(draft.dropped).toEqual([{ example: ['Das Buch liegt auf die Tisch.', 'The book is on the table.'], why: 'die Tisch -> der Tisch' }]);
    expect(draft.card.pitfalls).toEqual([{ wrong: 'Ich gehe in der Küche.', right: 'Ich gehe in die Küche.', why_en: 'gehen is movement, so wohin? and the accusative.', why_de: 'gehen is movement, so wohin? and the accusative.' }]);
    expect(draft.card).toMatchObject({ items: [], reference: null, level: 'A2' });
  });

  it('needs a rule and two clean examples', () => {
    expect(parseGrammarCardDraft(CARD.replace(/- Ich bin in der Küche.*\n/, ''), 'A2', lex)).toBeNull();
    expect(parseGrammarCardDraft(CARD.replace(/Rule \(English\): .*\n/, ''), 'A2', lex)).toBeNull();
  });

  it('reads the model\'s own card: dash-separated examples with dictionary notes, a one-line pitfall', () => {
    const text = `**Dativ nach Präpositionen**

**The rule:** Some German prepositions are always followed by the dative case. Learn the preposition together with its case.

**Examples:**
- Ich wohne **bei meiner Schwester**. (die Schwester, pl. die Schwestern) — I live with my sister.
- Er spielt **mit dem Kind**. (das Kind, pl. die Kinder) — He plays with the child.
- Sie spricht **von ihrem Bruder**. (der Bruder, pl. die Brüder) — She talks about her brother.

**Pitfall:** Wrong – *ein großer Haus* – Right – *ein großes Haus* (das Haus, pl. die Häuser). Haus is neuter, so the adjective ends in -es.`;
    const draft = parseGrammarCardDraft(text, 'B1', lex, 'Dativ after prepositions', 1000)!;
    expect(draft.card.title_en).toBe('Dativ after prepositions');
    expect(draft.card.rule_en).toMatch(/^Some German prepositions/);
    expect(draft.card.examples).toEqual([
      ['Ich wohne bei meiner Schwester.', 'I live with my sister.'],
      ['Er spielt mit dem Kind.', 'He plays with the child.'],
      ['Sie spricht von ihrem Bruder.', 'She talks about her brother.'],
    ]);
    expect(draft.card.pitfalls).toEqual([{ wrong: 'ein großer Haus', right: 'ein großes Haus', why_en: 'Haus is neuter, so the adjective ends in -es.', why_de: 'Haus is neuter, so the adjective ends in -es.' }]);
  });

  it('drops a pitfall whose right side is a translation and strips strikethrough and glosses', () => {
    const text = `Title (English): Sein
Rule (English): sein is the verb to be.
Examples:
- Ich bin müde. | I am tired.
- Wir sind hier. | We are here.
Pitfall:
- Ich habe gestern gewohnt. | I lived yesterday. | a translation, not a correction`;
    expect(parseGrammarCardDraft(text, 'A1', lex)!.card.pitfalls).toEqual([]);
    const konj = text.replace(/Pitfall:\n.*$/s, 'Pitfall:\n- ~~Könnten Sie bitte helfen?~~ | Könnten Sie mir bitte helfen? (Could you please help me?) | helfen takes a dative object.');
    expect(parseGrammarCardDraft(konj, 'B1', lex)!.card.pitfalls).toEqual([{ wrong: 'Könnten Sie bitte helfen?', right: 'Könnten Sie mir bitte helfen?', why_en: 'helfen takes a dative object.', why_de: 'helfen takes a dative object.' }]);
  });
});

describe('parseTopics', () => {
  it('cleans numbering and explanations, skips headers and known topics', () => {
    const text = 'Here are six topics:\n1. At the doctor\'s - useful for emergencies\n2. **Shopping**\n3. the family\n4. Hobbies and free time\n5. Public transport: buses and trains\n6. The weather\n7. Sports';
    expect(parseTopics(text, ['the family', 'the weather'])).toEqual(["at the doctor's", 'shopping', 'hobbies and free time', 'public transport', 'sports']);
  });

  it('drops the German nouns the model glosses topics with, word lists, and repeats of the given topics', () => {
    const text = `Here are six more topic names for A2 German vocabulary:

1. at the dentist
2. at the hairdresser
3. at the doctor's (der Arzt, die Ärzte)
4. the weather (das Wetter, die Wetter)
5. the train station (der Bahnhof, die Bahnhöfe)
6. the phone (das Telefon, die Telefone)`;
    expect(parseTopics(text, ['health and the doctor', 'travelling by train'])).toEqual(['at the dentist', 'at the hairdresser', 'the weather', 'the phone']);
    expect(parseTopics('1. die Wohnung, -en – flat\n2. der Mietvertrag, -"e – rental contract\n3. die Nebenkosten (pl.) – utility costs')).toEqual([]);
    expect(parseTopics('1. Arbeit – Arbeit, -en; der Job, -s\n2. Wohnen – die Wohnung, -en')).toEqual([]);
  });

  it('knows when the list is long enough: usable topics on finished lines', () => {
    expect(topicsComplete('Here are topics:\n1. the weather\n2. my family\n3. at the bank\n', 3)).toBe(true);
    expect(topicsComplete('Here are topics:\n1. the weather\n2. my family\n3. at the bank', 3)).toBe(false);
    expect(topicsComplete('1. the weather\n2. my family (die Familie)\n3. at the bank\n4. the', 3)).toBe(true);
    // a repeat of a given topic does not count
    expect(topicsComplete('1. the weather\n2. my family\n3. at the bank\n', 3, ['the weather'])).toBe(false);
  });
});

describe('Tutor authoring', () => {
  const g = grounding as unknown as GroundingPack;
  const make = (replies: string[]) => {
    const prompts: string[] = [];
    const generate: Generate = async (messages: ChatMessage[]) => {
      prompts.push(messages[1].content);
      return { text: replies[Math.min(prompts.length, replies.length) - 1], stopped: 'eos' };
    };
    return { tutor: new Tutor({ generate, systemPrompt: '', grounding: g, lex, cards: grammarCards as unknown as GrammarCard[] }), prompts };
  };

  it('asks again in other words when the first draft is unusable', async () => {
    const { tutor, prompts } = make(['Sure, here is a fun role-play about bikes!', SCENE]);
    const draft = await tutor.designScene('picking up my bike', { level: 'A2', lang: 'en' });
    expect(draft.card.role_de).toBe('der Mechaniker');
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).not.toBe(prompts[1]);
    expect(prompts[0]).toContain('Example for "buying a train ticket"');
  });

  it('gives up after two drafts with the last answer attached', async () => {
    const { tutor } = make(['nope', 'still nope']);
    await expect(tutor.designWriteTask('a party', 'informal', { level: 'A2', lang: 'en' })).rejects.toBeInstanceOf(DraftError);
    await expect(tutor.designWriteTask('a party', 'informal', { level: 'A2', lang: 'en' })).rejects.toMatchObject({ draft: 'still nope' });
  });

  it.skipIf(!fullLex)('grounds the grammar card prompt and reports the notes it carried', async () => {
    const { tutor, prompts } = make([CARD]);
    const draft = await tutor.designGrammarCard('two-way prepositions wo wohin', { level: 'A2', lang: 'en' });
    expect(draft.card.examples).toHaveLength(2);
    expect(draft.grounded.length).toBeGreaterThan(0);
    expect(prompts[0]).toMatch(/Wechselpr|two-way|Akkusativ/i);
  });

  it('returns topics, or none when the model does not list any', async () => {
    const a = make(['- shopping\n- the family\n- hobbies\n- sport\n']);
    await expect(a.tutor.suggestTopics({ level: 'A1', lang: 'en' }, ['the family'], 4)).resolves.toEqual(['shopping', 'hobbies', 'sport']);
    const b = make(['I cannot help with that.', 'Sorry.']);
    await expect(b.tutor.suggestTopics({ level: 'A1', lang: 'en' }, [], 4)).resolves.toEqual([]);
  });
});

describe('slugKey', () => {
  it('builds a short, unique key from a text', () => {
    expect(slugKey('own', 'Buying rolls at the bakery!', 1000)).toBe('own-buying-rolls-at-the-bake-rs');
    expect(slugKey('own', '!!!', 1000)).toBe('own-item-rs');
  });
});
