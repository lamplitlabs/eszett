// A hidden self-test of the tutor harness: a fixed battery of German cases goes through the same `tutor` calls
// the app's screens make (chat routing, corrections, word lists, drills, rule cards, scenes, writing, planning),
// and every result is logged as one `SELFTEST {json}` line for `adb logcat -s ReactNativeJS`. Nothing here is
// reachable unless the build sets EXPO_PUBLIC_SELFTEST=1 (see src/app/selftest.tsx).

import { changeCount, type DiffOp } from '@/harness/diff';
import { buildDrillSet, checkDrill, drillArticle, drillVerb, makeRng, type Drill } from '@/harness/drills';
import { GENUS_ARTICLE, type LexiconIndex } from '@/harness/lexicon';
import type { Level } from '@/harness/levels';
import { scriptedSuggestions, speakerLabel, type SceneCard, type TranscriptLine } from '@/harness/roleplay';
import { detectLang, route } from '@/harness/route';
import type { RuleHit } from '@/harness/rules';
import { DraftError, type CheckedVocabItem, type CorrectionResult, type Ctx, type GrammarCard, type Tutor } from '@/harness/tutor';
import { describeChecks, issueCount, type AnswerChecks } from '@/harness/verify';
import { tasksFor, WRITE_TASKS } from '@/harness/writing';
import type { EngineStats } from '@/model/engine';
import { translateMarkdown } from '@/mt/markdown';

export interface SelfTestDeps {
  tutor: Tutor;
  cards: GrammarCard[];
  scenes: SceneCard[];
  /** The lesson planner's menu, as features/lesson.ts passes it. */
  menu: { id: string; alias: RegExp }[];
  /** The lexicon the drill and word screens build from: tutor.lexicon ?? coreLexicon. */
  lexicon: LexiconIndex;
  /** Engine counters, read before and after every case. */
  stats?: () => EngineStats | null;
  describeError?: (e: unknown) => string;
  /** The on-phone translator (modules/eszett-translate), for group M; null in a build without it. */
  translator?: {
    downloadedModels(): Promise<string[]>;
    downloadModel(lang: string, allowCellular: boolean): Promise<void>;
    deleteModel(lang: string): Promise<void>;
    translate(text: string, from: string, to: string): Promise<string>;
  } | null;
}

export interface SelfTestRecord {
  i: number;
  id: string;
  group: string;
  feature: string;
  input: unknown;
  mode?: string;
  ms: number;
  ok: boolean;
  out: Record<string, unknown>;
  error?: string;
}

export interface SelfTestProgress {
  i: number;
  total: number;
  id: string;
}

export interface SelfTestSummary {
  cases: number;
  ok: number;
  failed: number;
  totalMs: number;
  aborted: boolean;
}

export interface SelfTestHooks {
  signal?: AbortSignal;
  onProgress?: (p: SelfTestProgress) => void;
  onRecord?: (r: SelfTestRecord) => void;
  log?: (line: string) => void;
  /** Run only the cases whose id or group letter matches one of these (an id prefix counts); everything by default. */
  only?: string[];
}

interface StepResult {
  out: Record<string, unknown>;
  /** The harness method that was called, when the step decides it at run time (chat routing). */
  feature?: string;
  mode?: string;
  input?: unknown;
  /** A failure the step wants logged with its output kept (the model's unusable draft, say). */
  error?: string;
}

interface Step {
  id: string;
  group: string;
  feature: string;
  input: unknown;
  mode?: string;
  level?: Level;
  /** What the spec expects, for whoever reads the log. */
  expect?: string;
  run: (ctx: Ctx) => Promise<StepResult>;
}

const LEVEL: Level = 'A2';
const TEXT_MAX = 1200;
/** Logcat drops everything past about 4 kB per line; JSON longer than this goes out in numbered chunks. */
const CHUNK = 3000;
const DRILL_SEED = 20260101;

const CHAT: { text: string; translate?: boolean; expect?: string }[] = [
  { text: "What's the difference between der, die and das?" },
  { text: 'When do I use Dativ and when Akkusativ?' },
  { text: 'Explain the Genitiv with two examples.' },
  { text: 'What is the plural of Apfel, Kind, Auto and Frau?' },
  { text: "What does 'doch' mean?" },
  { text: "How do I say 'I have been living in Berlin for two years'?" },
  { text: "What's the past tense of gehen?" },
  { text: 'Which article does Mädchen take and why?' },
  { text: 'Wie bildet man den Konjunktiv II von haben?' },
  { text: "Is it 'wegen dem' or 'wegen des'?" },
  { text: 'Ich verstehe den Unterschied zwischen kennen und wissen nicht.' },
  { text: "What's the difference between nicht and kein?" },
  { text: 'Which prepositions always take the Akkusativ?' },
  { text: "Why is it 'mit dem Bus' and not 'mit den Bus'?" },
  { text: 'Ich habe gestern ins Kino gegangen.' },
  { text: 'Ich gebe der Mann das Buch.' },
  { text: 'Er wohnt in die Stadt.' },
  { text: 'Gestern ich habe Fußball gespielt.' },
  { text: 'Ich weiß nicht, ob er kommt morgen.' },
  { text: 'Ich möchte ein kaltes Bier trinken.', expect: 'unchanged' },
  { text: 'Das ist ein schöne Haus.' },
  { text: 'Ich kann nicht schwimmen gut.' },
  { text: 'Wir treffen uns am Montag um drei Uhr.', expect: 'unchanged' },
  { text: 'Sie hat ihre Freundin angeruft.' },
  { text: 'Ich mochte ein Brotchen kaufen.', expect: 'umlauts restored: möchte, Brötchen' },
  { text: 'Er ist größer wie ich.' },
  { text: 'Ich freue mich über das Wochenende.', expect: 'auf das Wochenende' },
  { text: 'Kannst du mir helfen mit meine Hausaufgaben?' },
  { text: 'Ich habe kein Zeit.' },
  { text: 'Der Kinder spielen im Garten.' },
  { text: 'Ich bin 25 Jahre alt und ich wohne seit drei Jahren in Deutschland.', expect: 'unchanged' },
  { text: 'I would like to make an appointment with the doctor.', translate: true },
  { text: 'Although it was raining, we went for a walk.', translate: true },
  { text: 'Where is the nearest train station?', translate: true },
  { text: 'Könnten Sie das bitte wiederholen?', translate: true, expect: 'DE→EN' },
];

/** Grounded prompts with different rule notes, for the latency bench (group K). */
const BENCH = [
  'Wie sagt man die Uhrzeit 10:30 auf Deutsch?',
  'When do I use the dative after mit?',
  'Gestern ich bin mit meine Freundin ins Kino gegangen.',
  "What's the difference between nicht and kein?",
  'When do I use Perfekt with haben or sein?',
  'Explain the Genitiv with two examples.',
];

const SCENE_LINES = ['Guten Tag, ich möchte zwei Brötchen bitte.', 'Was kostet das?', 'Ich nehme auch ein Brot, bitte. Haben Sie Vollkornbrot?', 'Danke, das ist alles. Auf Wiedersehen!'];
const SECOND_SCENE_LINES = ['Guten Tag, ich brauche einen Termin.', 'Ich habe Schmerzen in der Bauch.'];

const WRITING_TEXT =
  'Hallo Anna, wie geht es dir? Ich habe am Wochenende viel gemacht. Am Samstag ich bin mit meine Freunde ins Kino gegangen. Der Film war sehr spannend aber zu lang. Am Sonntag habe ich für meine Prüfung gelernt und dann ich habe meine Oma besucht. Sie hat ein Kuchen gebacken. Nächste Woche fahre ich nach München, weil ich habe dort ein Vorstellungsgespräch. Ich bin ein bisschen nervös. Schreib mir bald! Liebe Grüße, Tom';

const PLAN_GOAL = 'I want to practise ordering food and talking about my weekend';

// ------------------------------------------------------------------------------------------------
// shaping results for the log
// ------------------------------------------------------------------------------------------------

const clip = (s: string | null | undefined, max = TEXT_MAX): string | null => (s == null ? null : s.length > max ? `${s.slice(0, max - 1)}…` : s);

const pad = (n: number) => String(n).padStart(2, '0');

const defaultDescribe = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function firstSentence(md: string) {
  const line = md
    .split('\n')
    .map((l) => l.replace(/\*\*|__|[*_`#>]/g, '').trim())
    .find((l) => l.length > 3);
  return line ?? '';
}

function checksOut(checks: AnswerChecks, noteTitle: (key: string) => string) {
  return {
    grounded: checks.grounded,
    issues: issueCount(checks),
    lexicon: checks.lexicon
      ? {
          findings: checks.lexicon.findings.map((f) => ({ kind: f.kind, claimed: f.claimed, expected: f.expected })),
          verified: checks.lexicon.verified.map((v) => `${v.article} ${v.noun}`),
          unknown: checks.lexicon.unknown,
        }
      : null,
    quotes: checks.quotes.map((q) => ({ exact: q.exact, sourced: q.source !== null, quoted: clip(q.quoted, 200) })),
    engine: checks.engine ? { agrees: checks.engine.agrees, answer: checks.engine.fact.answer, category: checks.engine.fact.category } : null,
    lines: describeChecks(checks, noteTitle).map((l) => `${l.tone}: ${l.title}`),
  };
}

function diffOut(diff: DiffOp[] | null) {
  if (!diff) return null;
  return {
    changes: changeCount(diff),
    ops: diff
      .filter((op) => op.type !== 'same')
      .map((op) => `${op.type === 'del' ? '-' : '+'}${op.text}`)
      .join(' '),
  };
}

const rulesOut = (rules: RuleHit[]) => rules.map((r) => ({ kind: r.kind, title: r.title, detail: r.detail, source: r.source, rule: clip(r.rule, 300) }));

function correctionOut(r: CorrectionResult, original: string, noteTitle: (key: string) => string) {
  return {
    original,
    text: clip(r.text),
    corrected: clip(r.correction.corrected),
    unchanged: r.correction.unchanged,
    explanation: clip(r.correction.explanation),
    diff: diffOut(r.diff),
    rules: rulesOut(r.rules),
    checks: checksOut(r.checks, noteTitle),
  };
}

function vocabOut(items: CheckedVocabItem[]) {
  return {
    counts: {
      verified: items.filter((i) => i.verdict === 'verified').length,
      fixed: items.filter((i) => i.verdict === 'fixed').length,
      unchecked: items.filter((i) => i.verdict === 'unchecked').length,
    },
    items: items.map((it) => ({
      article: it.article,
      lemma: it.lemma,
      plural: it.plural,
      noPlural: it.noPlural,
      meaning: it.meaning,
      example: it.example,
      exampleGloss: it.exampleGloss,
      verdict: it.verdict,
      fixed:
        it.verdict === 'fixed'
          ? [it.lexArticle ? `article ${it.article ?? '—'} → ${it.lexArticle}` : null, it.lexPlural ? `plural ${it.plural ?? '—'} → ${it.lexPlural}` : null].filter(Boolean).join('; ')
          : undefined,
    })),
  };
}

function drillOut(drill: Drill) {
  return {
    id: drill.id,
    category: drill.category,
    mode: drill.mode,
    instruction: drill.instruction,
    cue: drill.cue,
    sub: drill.sub ?? null,
    answer: drill.answer,
    accept: drill.accept,
    hint: drill.hint,
    noun: drill.noun ? `${GENUS_ARTICLE[drill.noun.genus]} ${drill.noun.lemma}` : null,
    verb: drill.verb?.infinitive ?? null,
  };
}

/** A learner answer that is wrong for this drill (checked, so the case really explains a mistake). */
function wrongAnswerFor(drill: Drill): string {
  let given: string;
  if (drill.mode === 'articles') given = (['der', 'die', 'das'] as const).find((a) => !drill.accept.includes(a)) ?? 'die';
  else if (drill.category === 'ordinals') given = /n$/.test(drill.accept[0]) ? drill.accept[0].replace(/n$/, '') : `${drill.accept[0]}n`;
  else if (drill.category === 'verbs' && drill.verb) {
    const stem = drill.verb.infinitive.replace(/e?n$/, '');
    // the classic mistakes: the wrong auxiliary in the Perfekt, a weak form in the Präteritum
    given = drill.groups ? `${drill.verb.auxiliary === 'sein' ? 'hat' : 'ist'} ${drill.verb.participle}` : `er ${stem}te`;
  } else if (drill.category === 'plural' && drill.noun) given = `die ${drill.noun.lemma}s`;
  else given = 'falsch';
  return checkDrill(drill, given).ok ? `${given}x` : given;
}

function statsDelta(before: EngineStats | null, after: EngineStats | null) {
  if (!before || !after) return null;
  return {
    requests: after.requests - before.requests,
    tokens: after.generatedTokens - before.generatedTokens,
    tokS: after.lastTokS,
    avgTokS: after.avgTokS,
    // the prompt side: how long the last prompt was, how much of it the cache already held, what was evaluated in all
    promptTokens: after.lastPromptTokens,
    cached: after.lastCachedTokens,
    promptMs: after.lastPromptMs,
    ppTokS: after.lastPpTokS,
    evaluated: after.promptTokens - before.promptTokens,
    primes: after.primes - before.primes,
  };
}

/** Counts streamed pieces and the time to the first one, through ctx.onText like a screen would. */
function streamMeter() {
  const t0 = Date.now();
  let first: number | null = null;
  let pieces = 0;
  let chars = 0;
  return {
    onText: (full: string) => {
      first ??= Date.now() - t0;
      pieces += 1;
      chars = full.length;
    },
    read: () => ({ firstMs: first, pieces, chars }),
  };
}

function emit(log: (line: string) => void, record: SelfTestRecord) {
  const json = JSON.stringify(record);
  if (json.length <= CHUNK) {
    log(`SELFTEST ${json}`);
    return;
  }
  const n = Math.ceil(json.length / CHUNK);
  for (let k = 0; k < n; k += 1) log(`SELFTEST# ${record.i} ${k + 1}/${n} ${json.slice(k * CHUNK, (k + 1) * CHUNK)}`);
}

/** The first 80 characters of what the learner would have seen, for the on-screen list. */
export function briefOf(r: SelfTestRecord): string {
  if (r.error) return r.error;
  const o = r.out;
  const main = ['text', 'translation', 'german', 'corrected', 'items', 'replies', 'plan'].map((k) => o[k]).find((v) => v !== undefined && v !== null);
  const s = typeof main === 'string' ? main : (JSON.stringify(main ?? o) ?? '');
  return s.replace(/\s+/g, ' ').trim().slice(0, 80);
}

// ------------------------------------------------------------------------------------------------
// the battery
// ------------------------------------------------------------------------------------------------

function buildSteps(deps: SelfTestDeps): Step[] {
  const { tutor, cards, scenes, lexicon } = deps;
  const noteTitle = (key: string) => tutor.noteTitle(key);
  const steps: Step[] = [];

  // A. chat, routed the way features/chat.ts routes a message in 'auto' (or forced 'translate') mode
  CHAT.forEach(({ text, translate, expect }, idx) => {
    const n = idx + 1;
    const forced = translate ? 'translate' : 'auto';
    steps.push({
      id: `chat-${pad(n)}`,
      group: 'A',
      feature: 'chat',
      input: text,
      mode: forced,
      expect,
      run: async (ctx) => {
        const routed = route(text);
        const resolved = forced === 'auto' ? (routed.intent === 'check' ? 'check' : routed.intent === 'translate' ? 'translate' : 'ask') : forced;
        const body = forced === 'auto' && routed.intent === 'check' ? routed.text : text;
        const base = { routed: routed.intent, lang: resolved === 'check' ? ctx.lang : detectLang(text) };
        if (resolved === 'check') {
          const r = await tutor.correct(body, ctx);
          return { feature: 'correct', mode: 'check', out: { ...base, ...correctionOut(r, body, noteTitle) } };
        }
        if (resolved === 'translate') {
          const sent = body.replace(/^(how do (you|i) say|wie sag(t|e) (man|ich)|translate)\s*/i, '').replace(/^["'„“]|["'“”?]+$/g, '');
          const r = await tutor.translate(sent, ctx);
          return { feature: 'translate', mode: 'translate', out: { ...base, sent, to: r.to, translation: clip(r.translation), checks: checksOut(r.checks, noteTitle) } };
        }
        const r = await tutor.ask(body, ctx);
        return { feature: 'ask', mode: 'ask', out: { ...base, text: clip(r.text), fact: r.fact, cardKey: r.card?.key ?? null, checks: checksOut(r.checks, noteTitle) } };
      },
    });
  });

  // B. gloss
  const GLOSS_LINE = 'Ich hätte gern zwei Brötchen und ein Vollkornbrot, bitte.';
  steps.push({
    id: 'gloss-36',
    group: 'B',
    feature: 'gloss',
    input: GLOSS_LINE,
    run: async (ctx) => ({ out: { text: clip(await tutor.gloss(GLOSS_LINE, ctx)) } }),
  });

  // C. word lists, every noun checked against the lexicon (words.tsx asks for 6)
  for (const [n, topic, level] of [
    [37, 'at the bakery', 'A1'],
    [38, 'a job interview', 'B1'],
  ] as const) {
    steps.push({
      id: `vocab-${n}`,
      group: 'C',
      feature: 'vocabList',
      input: { topic, level },
      level,
      run: async (ctx) => {
        const r = await tutor.vocabList(topic, ctx, 6);
        return { out: { ...vocabOut(r.items), text: clip(r.text) } };
      },
    });
  }

  // D. examples for a word, with the article the lexicon gives it (word/[lemma].tsx)
  for (const [n, lemma] of [
    [39, 'Schlüssel'],
    [40, 'sich erinnern'],
  ] as const) {
    steps.push({
      id: `word-${n}`,
      group: 'D',
      feature: 'wordExamples',
      input: lemma,
      run: async (ctx) => {
        const known = lexicon.noun(lemma);
        const articles = lexicon.articlesOf(lemma);
        const plurals = lexicon.pluralsOfLemma(lemma);
        const article = known ? GENUS_ARTICLE[known.genus] : (articles[0] ?? null);
        const word = article ? `${article} ${lemma}` : lemma;
        const r = await tutor.wordExamples(word, ctx);
        return { out: { word, lexicon: { articles, plurals, meaning: known?.meaning ?? null }, text: clip(r.text), checks: checksOut(r.checks, noteTitle) } };
      },
    });
  }

  // E. drills: built with the same constructors as drill/[category].tsx, each answered wrongly on purpose
  const drillStep = (id: string, label: string, build: () => Drill | undefined): Step => ({
    id,
    group: 'E',
    feature: 'explainDrill',
    input: label,
    run: async (ctx) => {
      const drill = build();
      if (!drill) throw new Error(`no drill could be built for ${label}`);
      const given = wrongAnswerFor(drill);
      const r = await tutor.explainDrill(drill, given, ctx);
      return {
        input: { drill: label, prompt: `${drill.instruction} ${drill.cue}`, given },
        out: { drill: drillOut(drill), given, correct: drill.answer, drillCheck: checkDrill(drill, given), text: clip(r.text), checks: checksOut(r.checks, noteTitle) },
      };
    },
  });
  steps.push(
    drillStep('drill-article', 'article (gender)', () => {
      const noun = ['Mädchen', 'Fahrrad', 'Bahnhof', 'Küche', 'Garten'].map((l) => lexicon.noun(l)).find((x) => x !== undefined);
      return noun ? drillArticle(noun, lexicon) : buildDrillSet('article', LEVEL, lexicon, makeRng(DRILL_SEED), 8)[0];
    }),
    // there is no case drill as such: the ordinal drill's "am ___" gap is the dative one
    drillStep('drill-case', 'case (dative after am, ordinals)', () => {
      const set = buildDrillSet('ordinals', LEVEL, lexicon, makeRng(DRILL_SEED), 8);
      return set.find((d) => d.cue.startsWith('Wir treffen uns am')) ?? set[0];
    }),
    drillStep('drill-verb', 'conjugation (Perfekt)', () => {
      const verb = lexicon.verb('gehen') ?? lexicon.verbs.find((v) => v.auxiliary === 'sein');
      return verb ? drillVerb(verb, 'perfekt') : buildDrillSet('verbs', LEVEL, lexicon, makeRng(DRILL_SEED), 8).find((d) => d.groups);
    }),
  );

  // F. rule cards
  const findCard = (keys: string[], re: RegExp): GrammarCard | undefined =>
    keys.map((k) => cards.find((c) => c.key === k)).find((c) => c !== undefined) ?? cards.find((c) => re.test(c.key) || re.test(c.title_en)) ?? cards[0];
  const dativCard = findCard(['wechselpraepositionen', 'dativ-plural-n'], /dativ|dative|two-way|preposition/i);
  const perfektCard = findCard(['perfekt-haben-sein', 'praeteritum-perfekt'], /perfekt/i);
  const nebensatzCard = findCard(['nebensatz-verbende', 'dass-ob'], /nebensatz|subordinate/i);
  const cardInput = (card: GrammarCard) => ({ cardKey: card.key, title: card.title_en, level: card.level });
  for (const [n, card] of [
    [41, dativCard],
    [42, perfektCard],
    [43, nebensatzCard],
  ] as const) {
    if (!card) continue;
    steps.push({
      id: `grammar-${n}`,
      group: 'F',
      feature: 'grammarExplain',
      input: cardInput(card),
      run: async (ctx) => {
        const r = await tutor.grammarExplain(card, ctx);
        return { out: { cardKey: card.key, text: clip(r.text), checks: checksOut(r.checks, noteTitle) } };
      },
    });
  }
  if (dativCard) {
    steps.push({
      id: 'grammar-44',
      group: 'F',
      feature: 'grammarExamples',
      input: cardInput(dativCard),
      run: async (ctx) => {
        const r = await tutor.grammarExamples(dativCard, ctx);
        return { out: { cardKey: dativCard.key, text: clip(r.text), checks: checksOut(r.checks, noteTitle) } };
      },
    });
  }
  if (perfektCard) {
    for (const [n, sentence, expect] of [
      [45, 'Ich habe gestern mit meinem Bruder gesprochen.', 'unchanged'],
      [46, 'Ich habe gestern mit meinem Bruder gesprecht.', 'gesprochen'],
    ] as const) {
      steps.push({
        id: `grammar-${n}`,
        group: 'F',
        feature: 'grammarCheck',
        input: { sentence, ...cardInput(perfektCard) },
        expect,
        run: async (ctx) => {
          const r = await tutor.grammarCheck(sentence, perfektCard, ctx);
          // grammar/[key].tsx counts the sentence right when the correction leaves it unchanged
          return { out: { cardKey: perfektCard.key, verdictOk: r.correction.unchanged, ...correctionOut(r, sentence, noteTitle) } };
        },
      });
    }
  }

  // G. scenes: the transcript grows the way scene/[key].tsx keeps it (opening first, every done line after)
  const sceneSteps = (card: SceneCard, lines: string[], withSuggest: boolean) => {
    const role = speakerLabel(card.role_de);
    const me = speakerLabel(card.learner_de);
    let history: TranscriptLine[] = [[role, card.opening]];
    lines.forEach((line, idx) => {
      steps.push({
        id: `scene-${card.key}-${idx + 1}`,
        group: 'G',
        feature: 'sceneTurn',
        input: { scene: card.key, line },
        run: async (ctx) => {
          const transcript: TranscriptLine[] = [...history, [me, line]];
          const t0 = Date.now();
          const turn = await tutor.sceneTurn(card, transcript, { ...ctx, help: false });
          const turnMs = Date.now() - t0;
          history = [...transcript, [role, turn.line.german]];
          // correct-as-you-go, on by default: the learner's own line is checked after the reply
          let check: Record<string, unknown>;
          const t1 = Date.now();
          try {
            const r = await tutor.correct(line, { level: ctx.level, lang: ctx.lang, signal: ctx.signal });
            check = {
              unchanged: r.correction.unchanged || !r.correction.corrected,
              corrected: clip(r.correction.corrected),
              diff: diffOut(r.diff),
              note: firstSentence(r.correction.explanation),
              rules: rulesOut(r.rules),
              ms: Date.now() - t1,
            };
          } catch (e) {
            check = { error: (deps.describeError ?? defaultDescribe)(e), ms: Date.now() - t1 };
          }
          return {
            out: {
              scene: card.key,
              learnerTurn: idx + 1,
              german: turn.line.german,
              gloss: turn.line.gloss,
              tells: turn.line.tells,
              frame: turn.frame,
              attempts: turn.attempts,
              retried: turn.attempts > 1,
              revealed: turn.revealed,
              turnMs,
              check,
            },
          };
        },
      });
    });
    if (withSuggest) {
      steps.push({
        id: `scene-${card.key}-suggest`,
        group: 'G',
        feature: 'suggestReplies',
        input: { scene: card.key },
        run: async (ctx) => {
          const learnerTurns = history.filter(([who]) => who === me).length;
          const replies = await tutor.suggestReplies(card, history, ctx);
          return { out: { scene: card.key, learnerTurns, scripted: scriptedSuggestions(card, learnerTurns).length > 0, replies, transcript: history.map(([who, l]) => `${who}: ${l}`) } };
        },
      });
    }
  };
  const bakery = scenes.find((s) => s.key === 'bakery') ?? scenes.find((s) => /bakery|shopping|supermarket/i.test(s.situation_en)) ?? scenes[0];
  if (bakery) sceneSteps(bakery, SCENE_LINES, true);
  const second = scenes.find((s) => s.key === 'doctor_phone') ?? scenes.find((s) => s !== bakery && /doctor|train/i.test(s.situation_en));
  if (second) sceneSteps(second, SECOND_SCENE_LINES, false);

  // H. phrases
  steps.push({
    id: 'phrases-47',
    group: 'H',
    feature: 'phrases',
    input: 'asking for directions in a city',
    run: async (ctx) => {
      // the raw text too: how the model shaped the list is what a parser fix needs
      let raw = '';
      const onText = (full: string) => {
        raw = full;
        ctx.onText?.(full);
      };
      const items = await tutor.phrases('asking for directions in a city', { ...ctx, onText });
      return { out: { items, text: clip(raw) } };
    },
  });

  // I. writing: an A2 message task, the way write/[id].tsx submits it
  const task = WRITE_TASKS.find((t) => t.id === 'a2-birthday') ?? tasksFor('A2').find((t) => t.register === 'informal') ?? tasksFor('A2')[0] ?? WRITE_TASKS[0];
  steps.push({
    id: 'writing-a2',
    group: 'I',
    feature: 'writing',
    input: { taskId: task.id, prompt: task.prompt, text: WRITING_TEXT },
    run: async (ctx) => {
      const r = await tutor.writing(task, WRITING_TEXT, ctx);
      const p = r.precheck;
      return {
        out: {
          taskId: task.id,
          precheck: { ok: p.ok, words: p.words, inBand: p.inBand, tooShort: p.tooShort, points: p.points.map((x) => ({ point: x.en, hit: x.hit })), opening: p.opening, closing: p.closing, noDu: p.noDu },
          correction: r.correction ? correctionOut(r.correction, WRITING_TEXT, noteTitle) : null,
        },
      };
    },
  });
  steps.push({
    id: 'writing-48-model',
    group: 'I',
    feature: 'modelAnswer',
    input: { taskId: task.id, prompt: task.prompt },
    run: async (ctx) => {
      const r = await tutor.modelAnswer(task, ctx);
      return { out: { taskId: task.id, text: clip(r.text), checks: checksOut(r.checks, noteTitle) } };
    },
  });

  // J. the lesson planner
  steps.push({
    id: 'plan-49',
    group: 'J',
    feature: 'plan',
    input: PLAN_GOAL,
    run: async (ctx) => ({ out: { plan: await tutor.plan(PLAN_GOAL, deps.menu, ctx), menu: deps.menu.map((m) => m.id) } }),
  });

  // K. latency bench: grounded prompts in both note layouts, each after the prime a typing learner would have
  // caused, so the cache hit of the 'before' layout and its effect on the answer can be read side by side
  BENCH.forEach((text, idx) => {
    for (const layout of ['after', 'before'] as const) {
      steps.push({
        id: `bench-${pad(idx + 1)}-${layout}`,
        group: 'K',
        feature: 'bench',
        input: text,
        mode: layout,
        run: async (ctx) => {
          const was = tutor.noteLayout;
          tutor.setLayout(layout);
          try {
            const routed = route(text);
            const check = routed.intent === 'check';
            const body = check ? routed.text : text;
            const t0 = Date.now();
            await tutor.prepare(body, ctx, check ? 'check' : 'ask');
            const primeMs = Date.now() - t0;
            // the wait that matters: from the request (after the prime a typing learner would have caused) to the first piece
            const t1 = Date.now();
            let firstMs: number | null = null;
            const timed: typeof ctx = {
              ...ctx,
              onText: (full) => {
                firstMs ??= Date.now() - t1;
                ctx.onText?.(full);
              },
            };
            if (check) {
              const r = await tutor.correct(body, timed);
              return { feature: 'correct', out: { layout, primeMs, firstMs, ...correctionOut(r, body, noteTitle) } };
            }
            const r = await tutor.ask(body, timed);
            return { feature: 'ask', out: { layout, primeMs, firstMs, text: clip(r.text), grounded: r.grounded, checks: checksOut(r.checks, noteTitle) } };
          } finally {
            tutor.setLayout(was);
          }
        },
      });
    }
  });

  // L. authoring: the model writes content the app used to ship; the harness parses and the lexicon checks it.
  // The raw draft is logged too: when the model shapes a card differently, that is what a parser fix needs.
  const drafting = (ctx: Ctx) => {
    let raw = '';
    const onText = (full: string) => {
      raw = full;
      ctx.onText?.(full);
    };
    return { ctx: { ...ctx, onText }, raw: () => clip(raw, 2400) };
  };
  const draftFailure = (e: unknown): StepResult => {
    if (e instanceof DraftError) return { out: { draft: clip(e.draft, 2400) }, error: e.message };
    throw e;
  };
  const SCENE_WISH = 'returning a jacket at a clothes shop, the zip is broken';
  let authored: SceneCard | null = null;
  steps.push({
    id: 'author-scene-50',
    group: 'L',
    feature: 'designScene',
    input: SCENE_WISH,
    expect: 'a Sie-register A2 card with a shop assistant, two or more facts and a German opening line; every article the lexicon knows is right',
    run: async (ctx0) => {
      const { ctx, raw } = drafting(ctx0);
      try {
        const d = await tutor.designScene(SCENE_WISH, ctx);
        authored = d.card;
        return {
          out: {
            key: d.card.key,
            situation: [d.card.situation_de, d.card.situation_en],
            place: d.card.place,
            them: [d.card.role_de, d.card.role_en],
            me: [d.card.learner_de, d.card.learner_en],
            register: d.card.register,
            facts: d.card.facts.map((f) => `${f.label_en}: ${f.value}`),
            opening: [d.card.opening, d.card.opening_gloss],
            notes: d.notes,
            warnings: d.warnings,
            text: raw(),
          },
        };
      } catch (e) {
        const f = draftFailure(e);
        return { ...f, out: { ...f.out, text: raw() } };
      }
    },
  });
  const AUTHORED_LINE = 'Guten Tag, ich möchte diese Jacke zurückgeben. Der Reißverschluss ist kaputt.';
  steps.push({
    id: 'author-scene-turn-51',
    group: 'L',
    feature: 'sceneTurn',
    input: AUTHORED_LINE,
    expect: 'the tutor answers in role from the generated card alone; the reply is German, in Sie, and uses only the card facts',
    run: async (ctx) => {
      if (!authored) return { out: {}, error: 'no scene from author-scene-50' };
      const role = speakerLabel(authored.role_de);
      const me = speakerLabel(authored.learner_de);
      const transcript: TranscriptLine[] = [[role, authored.opening], [me, AUTHORED_LINE]];
      const turn = await tutor.sceneTurn(authored, transcript, { ...ctx, help: false });
      const suggestions = await tutor.suggestReplies(authored, [...transcript, [role, turn.line.german]], ctx);
      return { out: { scene: authored.key, line: turn.line.german, gloss: clip(turn.line.gloss), frame: turn.frame, attempts: turn.attempts, revealed: turn.revealed, tells: turn.line.tells, suggestions } };
    },
  });
  const TASK_WISH = 'a weekend trip with a friend';
  steps.push({
    id: 'author-task-52',
    group: 'L',
    feature: 'designWriteTask',
    input: TASK_WISH,
    expect: 'an informal A2 task of 30-45 words with three or four content points, each with key words the precheck can match',
    run: async (ctx0) => {
      const { ctx, raw } = drafting(ctx0);
      try {
        const t = await tutor.designWriteTask(TASK_WISH, 'informal', ctx);
        return { out: { id: t.id, title: t.title, prompt: t.prompt, promptDe: t.promptDe, words: t.words, points: t.points.map((p) => ({ en: p.en, any: p.any })), text: raw() } };
      } catch (e) {
        const f = draftFailure(e);
        return { ...f, out: { ...f.out, text: raw() } };
      }
    },
  });
  const CARD_WISH = 'adjective endings after ein';
  steps.push({
    id: 'author-card-53',
    group: 'L',
    feature: 'designGrammarCard',
    input: CARD_WISH,
    expect: 'a rule in both languages, two to four examples the lexicon agrees with, a sentence to fix; the adjective-endings rule note in the prompt',
    run: async (ctx0) => {
      const { ctx, raw } = drafting(ctx0);
      try {
        const d = await tutor.designGrammarCard(CARD_WISH, ctx);
        return { out: { key: d.card.key, title: [d.card.title_en, d.card.title_de], rule: [d.card.rule_en, d.card.rule_de], examples: d.card.examples, pitfalls: d.card.pitfalls, dropped: d.dropped, grounded: d.grounded.map(noteTitle), text: raw() } };
      } catch (e) {
        const f = draftFailure(e);
        return { ...f, out: { ...f.out, text: raw() } };
      }
    },
  });
  const KNOWN_TOPICS = ['shopping', 'health and the doctor', 'travelling by train', 'work', 'free time', 'the post office and the bank'];
  steps.push({
    id: 'author-topics-54',
    group: 'L',
    feature: 'suggestTopics',
    input: KNOWN_TOPICS,
    expect: 'three to six short English topic names for A2 words, none from the list',
    run: async (ctx0) => {
      const { ctx, raw } = drafting(ctx0);
      const topics = await tutor.suggestTopics(ctx, KNOWN_TOPICS);
      return { out: { topics, text: raw() }, error: topics.length ? undefined : 'no topics parsed' };
    },
  });

  // M — the on-phone translator: does ML Kit carry placeholders through, and how does a whole answer come out?
  const mt = deps.translator;
  const MT_LANGS = ['pl', 'tr', 'uk', 'ar'];
  const FORMATS: [string, (n: number) => string][] = [
    ['[n]', (n) => `[${n}]`],
    ['{n}', (n) => `{${n}}`],
    ['#n#', (n) => `#${n}#`],
    ['<n>', (n) => `<${n}>`],
    ['⟦n⟧', (n) => `⟦${n}⟧`],
  ];
  const MT_SAMPLE = [
    '## Genitiv after trotz',
    '',
    'The preposition **trotz** takes the Genitiv: **trotz des Regens** (despite the rain).',
    '- **Trotz des Regens gehen wir spazieren.** – Despite the rain we go for a walk.',
    '- Trotz der Kälte bleibt er draußen.',
    '',
    '| Case | Example |',
    '|---|---|',
    '| Genitiv | **des Regens** |',
    '',
    '> Tip: in speech people also say **trotz dem Regen**, but the Genitiv is the written form.',
  ].join('\n');
  const noMt = { out: {}, error: 'no translator in this build' };
  let n = 60;
  for (const lang of MT_LANGS) {
    steps.push({
      id: `mt-download-${lang}-${n++}`,
      group: 'M',
      feature: 'mt.download',
      input: lang,
      expect: 'the pack downloads over Wi-Fi within a minute',
      run: async () => {
        if (!mt) return noMt;
        await mt.downloadModel(lang, true);
        return { out: { downloaded: await mt.downloadedModels() } };
      },
    });
    for (const [name, fmt] of FORMATS) {
      const text = `Use ${fmt(1)} with the genitive, as in ${fmt(2)}; in speech people also say ${fmt(3)}.`;
      steps.push({
        id: `mt-placeholder-${lang}-${n++}`,
        group: 'M',
        feature: 'mt.placeholders',
        input: `${lang} ${name}`,
        expect: 'each of the three placeholders appears exactly once in the translation',
        run: async () => {
          if (!mt) return noMt;
          const out = await mt.translate(text, 'en', lang);
          const counts = [1, 2, 3].map((i) => out.split(fmt(i)).length - 1);
          return { out: { text: out, counts }, error: counts.every((c) => c === 1) ? undefined : 'placeholder lost or doubled' };
        },
      });
    }
    steps.push({
      id: `mt-plain-${lang}-${n++}`,
      group: 'M',
      feature: 'mt.translate',
      input: lang,
      expect: 'a sensible translation of a plain English grammar sentence',
      run: async () => {
        if (!mt) return noMt;
        return { out: { text: await mt.translate('The preposition trotz takes the genitive case, but in everyday speech many people use the dative.', 'en', lang) } };
      },
    });
    steps.push({
      id: `mt-markdown-${lang}-${n++}`,
      group: 'M',
      feature: 'mt.markdown',
      input: lang,
      expect: 'headings, bullets, the table and every German example survive; only the English changes',
      run: async () => {
        if (!mt) return noMt;
        const out = await translateMarkdown(MT_SAMPLE, (t) => mt.translate(t, 'en', lang));
        const german = ['**trotz**', '**trotz des Regens**', '**Trotz des Regens gehen wir spazieren.**', 'Trotz der Kälte bleibt er draußen.', '**des Regens**', '**trotz dem Regen**'];
        const lost = german.filter((g) => !out.includes(g));
        return { out: { text: out, lost }, error: lost.length ? 'German lost' : undefined };
      },
    });
  }
  steps.push({
    id: `mt-cleanup-${n++}`,
    group: 'M',
    feature: 'mt.delete',
    input: MT_LANGS,
    expect: 'no packs left on the phone',
    run: async () => {
      if (!mt) return noMt;
      for (const lang of MT_LANGS) await mt.deleteModel(lang);
      return { out: { downloaded: await mt.downloadedModels() } };
    },
  });

  return steps;
}

/** True when a case is among those asked for: its id, an id prefix, or its group letter. */
function selected(step: Step, only: string[] | undefined): boolean {
  if (!only?.length) return true;
  return only.some((o) => o === step.group || step.id === o || step.id.startsWith(o));
}

/** The ids of the battery's cases in order, without running anything. */
export function selfTestCaseIds(deps: SelfTestDeps): string[] {
  return buildSteps(deps).map((s) => s.id);
}

/**
 * Runs the whole battery in order, one case at a time; a failing case is logged and the run goes on. Resolves
 * with the summary once every case ran, or as soon as `hooks.signal` is aborted.
 */
export async function runSelfTest(deps: SelfTestDeps, begin: Record<string, unknown>, hooks: SelfTestHooks = {}): Promise<SelfTestSummary> {
  const log = hooks.log ?? ((line: string) => console.log(line));
  const describe = deps.describeError ?? defaultDescribe;
  const steps = buildSteps(deps).filter((step) => selected(step, hooks.only));
  const total = steps.length;
  const t0 = Date.now();
  log(`SELFTEST BEGIN ${JSON.stringify({ ...begin, cases: total, only: hooks.only ?? null, layout: deps.tutor.noteLayout, lexiconFull: deps.lexicon.full, level: LEVEL, lang: 'en' })}`);

  let i = 0;
  let ok = 0;
  let failed = 0;
  let aborted = false;
  for (const step of steps) {
    if (hooks.signal?.aborted) {
      aborted = true;
      break;
    }
    i += 1;
    hooks.onProgress?.({ i, total, id: step.id });
    const before = deps.stats?.() ?? null;
    const meter = streamMeter();
    const ctx: Ctx = { level: step.level ?? LEVEL, lang: 'en', signal: hooks.signal, onText: meter.onText };
    const started = Date.now();
    let record: SelfTestRecord;
    try {
      const r = await step.run(ctx);
      record = {
        i,
        id: step.id,
        group: step.group,
        feature: r.feature ?? step.feature,
        input: r.input ?? step.input,
        mode: r.mode ?? step.mode,
        ms: Date.now() - started,
        ok: !r.error,
        error: r.error,
        out: { ...r.out, expect: step.expect, level: ctx.level, stream: meter.read(), stats: statsDelta(before, deps.stats?.() ?? null) },
      };
      if (hooks.signal?.aborted) {
        record.ok = false;
        record.error = 'aborted';
      }
    } catch (e) {
      record = {
        i,
        id: step.id,
        group: step.group,
        feature: step.feature,
        input: step.input,
        mode: step.mode,
        ms: Date.now() - started,
        ok: false,
        out: { expect: step.expect, level: ctx.level, stream: meter.read(), stats: statsDelta(before, deps.stats?.() ?? null) },
        error: hooks.signal?.aborted ? 'aborted' : describe(e),
      };
    }
    if (record.ok) ok += 1;
    else failed += 1;
    emit(log, record);
    hooks.onRecord?.(record);
    if (hooks.signal?.aborted) {
      aborted = true;
      break;
    }
  }

  const summary: SelfTestSummary = { cases: i, ok, failed, totalMs: Date.now() - t0, aborted };
  log(`SELFTEST END ${JSON.stringify(summary)}`);
  return summary;
}
