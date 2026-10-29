import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import lexiconCore from '../../data/lexicon-core.json';
import togetherData from '../../data/together.json';
import { wordMeaning } from '../../i18n/content';
import { OVERLAYS } from '../../i18n/overlays';
import { makeRng } from '../drills';
import { LEVELS } from '../levels';
import { LexiconIndex, type LexiconData } from '../lexicon';
import {
  askerOf,
  DUEL_CATEGORIES,
  duelAnswered,
  duelDone,
  duelPlayer,
  duelScores,
  duelWinner,
  keyWords,
  newDuel,
  nounsIn,
  parseTaboo,
  parseTalkPoints,
  pointGloss,
  STORY_OPENERS,
  storyText,
  storyTurn,
  TABOO_BUNDLED,
  tabooCards,
  tabooComplete,
  tabooGuessed,
  tabooPrompt,
  TALK_TOPICS,
  talkComplete,
  talkPoints,
  talkPrompt,
  type StoryLine,
  type TabooCard,
  type TalkPoint,
} from '../together';

const coreLex = new LexiconIndex(lexiconCore as unknown as LexiconData);
const fullLexiconPath = join(__dirname, '../../../.model-cache/lexicon.json');
const fullLex = existsSync(fullLexiconPath) ? new LexiconIndex(JSON.parse(readFileSync(fullLexiconPath, 'utf8')) as LexiconData) : null;

describe('talking points', () => {
  it('ships five questions per topic and level, each glossed in four languages with three key words', () => {
    expect(togetherData).toHaveLength(TALK_TOPICS.length * LEVELS.length * 5);
    for (const topic of TALK_TOPICS) {
      for (const level of LEVELS) {
        const points = talkPoints(topic, level);
        expect(points).toHaveLength(5);
        for (const p of points) {
          expect(p.q.endsWith('?') || p.q.endsWith('.')).toBe(true);
          expect(p.gloss.en && p.gloss.fr && p.gloss.es && p.gloss.it).toBeTruthy();
          expect(p.words).toHaveLength(3);
        }
      }
    }
    expect(talkPoints('food', 'B1', true)).toHaveLength(15);
  });

  it('never repeats a question', () => {
    const all = togetherData.map((p) => p.q);
    expect(new Set(all).size).toBe(all.length);
  });

  it('glosses in the app language when bundled, in English otherwise, never in German', () => {
    const [p] = talkPoints('food', 'A1');
    expect(pointGloss(p, 'fr')?.lang).toBe('fr');
    expect(pointGloss(p, 'pl')).toEqual({ text: p.gloss.en, lang: 'en' });
    expect(pointGloss(p, 'de')).toBeNull();
    expect(pointGloss({ ...p, gloss: { en: 'x' } }, 'it')).toEqual({ text: 'x', lang: 'en' });
  });

  it('looks the key words up in the lexicon and keeps the lemma when it knows nothing', () => {
    const [p] = talkPoints('everyday', 'A1'); // Morgen, Uhr, Wecker
    const words = keyWords(p, coreLex);
    expect(words.map((w) => w.lemma)).toEqual(p.words);
    const uhr = words.find((w) => w.lemma === 'Uhr');
    expect(uhr?.article).toBe('die');
    expect(uhr?.meaning).toBeTruthy();
    if (fullLex) {
      const full = keyWords(p, fullLex);
      // the full lexicon knows the gender of nearly every key word, even those without a meaning entry
      expect(full.filter((w) => w.article).length).toBeGreaterThanOrEqual(2);
    }
  });

  it.skipIf(!fullLex)('gives a compound the lexicon does not list the article and plural of its head', () => {
    const lex = fullLex as LexiconIndex;
    const point = (words: string[]): TalkPoint => ({ topic: 'work', level: 'C1', q: '', gloss: { en: '' }, words });
    const [week, culture, data, known] = keyWords(point(['Vier-Tage-Woche', 'Debattenkultur', 'Gesundheitsdaten', 'Arbeit']), lex);
    expect(week.article).toBe('die'); // the part after the last hyphen
    expect(week.plural).toBe('Vier-Tage-Wochen');
    expect(culture.article).toBe('die'); // Debatten|kultur
    expect(culture.plural).toBe('Debattenkulturen');
    expect(data.article).toBeNull(); // Daten is plural-only: nothing to inherit
    expect(known.article).toBe('die');
    expect(week.noun).toBeNull();
    // the same lookup the word sheet uses
    expect(lex.compoundHead('Vier-Tage-Woche')).toEqual({ head: 'Woche', article: 'die', plural: 'Vier-Tage-Wochen' });
    expect(lex.compoundHead('Arbeit')).toBeUndefined(); // listed as a whole
    expect(lex.compoundHead('Xyz-Qrst')).toBeUndefined(); // no known head
  });

  it('most key words are in the full lexicon', () => {
    if (!fullLex) return;
    let known = 0;
    let total = 0;
    for (const p of togetherData) {
      for (const w of p.words) {
        total += 1;
        if (fullLex.articlesOf(w).length || fullLex.noun(w)) known += 1;
      }
    }
    expect(known / total).toBeGreaterThan(0.95);
  });

  it('alternates the asker', () => {
    expect([0, 1, 2, 3].map(askerOf)).toEqual([0, 1, 0, 1]);
  });

  it('asks for numbered questions with a translation in the gloss language', () => {
    expect(talkPrompt('my first job', 'B1', 'fr')).toContain('French translation');
    expect(talkPrompt('my first job', 'B1', 'pt')).toContain('English translation');
    expect(talkPrompt('x', 'A2', 'en', 5, 1)).not.toBe(talkPrompt('x', 'A2', 'en', 5, 0));
  });

  it('reads the model’s questions and drops answers, tips and repeats', () => {
    const text = [
      'Here are five questions:',
      '1. Was war dein erster Job? (What was your first job?)',
      '2. Wie alt warst du damals? (How old were you then?)',
      '3. Ich war sechzehn Jahre alt. (I was sixteen.)',
      '4. Was war dein erster Job? (What was your first job?)',
      '5. Hast du das Geld gespart oder ausgegeben? (Did you save the money or spend it?)',
      '6. Würdest du den Job heute noch einmal machen (Would you do the job again today)',
      'Tip: use the Perfekt for the past.',
    ].join('\n');
    const points = parseTalkPoints(text, 'my first job', 'B1', coreLex, 5);
    expect(points.map((p) => p.q)).toEqual(['Was war dein erster Job?', 'Wie alt warst du damals?', 'Hast du das Geld gespart oder ausgegeben?', 'Würdest du den Job heute noch einmal machen?']);
    expect(points[0].gloss.en).toBe('What was your first job?');
    expect(points[0]).toMatchObject({ topic: 'custom', level: 'B1' });
    expect(points[0].words).toContain('Job');
    expect(talkComplete(text, 5)).toBe(true);
    expect(talkComplete('1. Was war dein erster Job? (What was', 1)).toBe(false);
    expect(parseTalkPoints('Sorry, I cannot help with that.', 'x', 'A1', coreLex)).toEqual([]);
  });

  it('finds the nouns the lexicon knows in a sentence', () => {
    expect(nounsIn('Wann stehst du morgens auf?', coreLex)).toEqual([]);
    expect(nounsIn('Hast du einen Job in einer Firma?', coreLex)).toEqual(expect.arrayContaining(['Job']));
    expect(nounsIn('Gehst du gern ins Kino mit Freunden?', null)).toEqual([]);
  });

  it('never takes the first word or the formal pronoun, which the full lexicon knows as nouns too', () => {
    if (!fullLex) return;
    expect(fullLex.articlesOf('Wie').length).toBeGreaterThan(0);
    expect(nounsIn('Wie war dein letzter Urlaub?', fullLex)).toEqual(['Urlaub']);
    expect(nounsIn('Hast du Kinder?', fullLex)).toEqual(['Kind']);
    expect(nounsIn('Haben Sie ein Auto?', fullLex)).toEqual(['Auto']);
    expect(nounsIn('"Ich reise gern", sagt Ben.', fullLex)).not.toContain('Ich');
  });
});

describe('Taboo', () => {
  it('ships cards with four forbidden words that never contain the word itself', () => {
    expect(TABOO_BUNDLED.length).toBeGreaterThanOrEqual(84);
    for (const c of TABOO_BUNDLED) {
      expect(c.forbidden).toHaveLength(4);
      expect(c.forbidden.some((f) => f.toLowerCase().includes(c.word.toLowerCase()))).toBe(false);
      expect(LEVELS).toContain(c.level);
    }
    expect(new Set(TABOO_BUNDLED.map((c) => c.word)).size).toBe(TABOO_BUNDLED.length);
  });

  it('has a gloss for every bundled card in every content overlay, so the guesser reads it in the app language', () => {
    for (const lang of Object.keys(OVERLAYS) as (keyof typeof OVERLAYS)[]) {
      const missing = TABOO_BUNDLED.filter((c) => !wordMeaning(c.word, '', lang)).map((c) => c.word);
      expect(missing, lang).toEqual([]);
    }
    expect(wordMeaning('Schadenfreude', 'malicious glee', 'pl')).toBe('radość z cudzego nieszczęścia');
    expect(wordMeaning('Schadenfreude', 'malicious glee', 'en')).toBe('malicious glee');
  });

  it('deals bundled cards at or below the level first, then lexicon nouns without forbidden words', () => {
    const a1 = tabooCards('A1', coreLex, makeRng(3), 20);
    expect(a1).toHaveLength(20);
    const bundled = a1.filter((c) => c.forbidden.length);
    expect(bundled.length).toBe(TABOO_BUNDLED.filter((c) => c.level === 'A1').length);
    expect(bundled.every((c) => c.level === 'A1')).toBe(true);
    expect(a1.slice(bundled.length).every((c) => c.forbidden.length === 0 && c.article)).toBe(true);
    expect(new Set(a1.map((c) => c.word)).size).toBe(20);
    // two rounds with different seeds differ
    expect(tabooCards('B2', coreLex, makeRng(1), 8).map((c) => c.word)).not.toEqual(tabooCards('B2', coreLex, makeRng(2), 8).map((c) => c.word));
  });

  it('reads the forbidden words off one line and rejects word salad', () => {
    const card: TabooCard = { word: 'Hund', article: 'der', meaning: 'dog', forbidden: [], level: 'A1' };
    expect(parseTaboo('Tier, bellen, Katze, Haustier', card)).toEqual(['Tier', 'bellen', 'Katze', 'Haustier']);
    expect(parseTaboo('Forbidden: das Tier, bellen (to bark), die Katze, der Hund, Haustier', card)).toEqual(['Tier', 'bellen', 'Katze', 'Haustier']);
    expect(parseTaboo('Sure! Here are the words:\n\n- Tier\n- bellen\n- Katze\n- Hundehütte\n- Leine', card)).toBeNull();
    expect(parseTaboo('1. Tier, 2. bellen, 3. Katze, 4. Leine', card)).toEqual(['Tier', 'bellen', 'Katze', 'Leine']);
    expect(parseTaboo('Der Hund ist ein Tier, das bellt.', card)).toBeNull();
    expect(tabooComplete('Tier, bellen, Katze, Haustier\n')).toBe(true);
    expect(tabooComplete('Tier, bellen, Katze')).toBe(false);
  });

  it('accepts the guess with or without article, in any case', () => {
    const card: TabooCard = { word: 'Regenschirm', article: 'der', meaning: null, forbidden: [], level: 'A2' };
    expect(tabooGuessed(card, 'der Regenschirm')).toBe(true);
    expect(tabooGuessed(card, 'regenschirm')).toBe(true);
    expect(tabooGuessed(card, 'Regen')).toBe(false);
    expect(tabooGuessed(card, '')).toBe(false);
  });

  it('shows the model the shape of the answer', () => {
    const p = tabooPrompt({ word: 'Bibliothek', article: 'die', meaning: 'library', forbidden: [], level: 'A2' });
    expect(p).toContain('"die Bibliothek"');
    expect(p).toContain('fahren, Straße, Rad, Motor');
  });
});

describe('chain story', () => {
  it('has openers for every level and alternates the players after the opener', () => {
    for (const l of LEVELS) expect(STORY_OPENERS[l].length).toBeGreaterThanOrEqual(3);
    const lines: StoryLine[] = [{ id: 'o', player: null, text: 'Es ist Montag.' }];
    expect(storyTurn(lines)).toBe(0);
    lines.push({ id: '1', player: 0, text: 'Anna geht in die Schule.', check: { status: 'done', corrected: 'Anna geht zur Schule.', unchanged: false } });
    expect(storyTurn(lines)).toBe(1);
    lines.push({ id: '2', player: 1, text: 'Sie hat ein Buch.', check: { status: 'done', corrected: null, unchanged: true } });
    expect(storyTurn(lines)).toBe(0);
    expect(storyText(lines)).toBe('Es ist Montag. Anna geht zur Schule. Sie hat ein Buch.');
  });
});

describe('duel', () => {
  it('deals two drills per round, alternates the players and keeps score', () => {
    for (const category of DUEL_CATEGORIES) {
      const d = newDuel(category, 'A2', coreLex, makeRng(5), 3);
      expect(d.drills).toHaveLength(6);
      expect(d.drills.every((x) => x.category === category)).toBe(true);
    }
    let d = newDuel('article', 'A1', coreLex, makeRng(9), 2);
    expect([0, 1, 2, 3].map(duelPlayer)).toEqual([0, 1, 0, 1]);
    d = duelAnswered(d, true);
    d = duelAnswered(d, false);
    d = duelAnswered(d, true);
    expect(duelDone(d)).toBe(false);
    d = duelAnswered(d, true);
    expect(duelDone(d)).toBe(true);
    expect(duelScores(d)).toEqual([2, 1]);
    expect(duelWinner(d)).toBe(0);
    expect(duelWinner({ ...d, results: [true, true, false, false] })).toBeNull();
    // a stray extra answer after the last drill changes nothing
    expect(duelAnswered(d, true)).toBe(d);
  });
});
