// The harness around the model: every feature of the app asks the model through one of these methods.
// Each builds the prompt the model was trained on, attaches the rule note the grounding router picks,
// streams the answer, stops the model as soon as the app has what it asked for, reads the answer, and
// checks it against the lexicon, the rule engines and the note. Pure TypeScript: the app passes a
// `generate` function that talks to the model host, the tests pass a stub.

import {
  parseGrammarCardDraft,
  parseSceneDraft,
  parseTopics,
  parseWriteTaskDraft,
  topicsComplete,
  WORDS_FOR_LEVEL,
  type GrammarCardDraft,
  type SceneDraft,
} from './authoring';
import { diffWords, tokenize, type DiffOp } from './diff';
import { drillAsText, type Drill } from './drills';
import { compact, normalise } from './engines';
import { blockTitle, groundPrompt, noteKeys, notePrefix, type GroundingPack, type NoteLayout } from './grounding';
import { GENUS_ARTICLE, type Article, type LexiconIndex } from './lexicon';
import type { Level } from './levels';
import {
  firstLine,
  firstLineComplete,
  parseCorrection,
  parsePhrases,
  parsePlan,
  parseVocabList,
  phrasesComplete,
  planComplete,
  repairReferenceQuotes,
  vocabListComplete,
  type Correction,
  type Phrase,
  type PlanItem,
  type VocabItem,
} from './parse';
import * as P from './prompts';
import {
  BLOCKING_TELLS,
  counterpartPrompt,
  exampleFor,
  factsRevealed,
  learnerSideOnly,
  readCounterpartLine,
  scriptedSuggestions,
  speakerLabel,
  transcriptText,
  type CounterpartLine,
  type Frame,
  type SceneCard,
  type TranscriptLine,
} from './roleplay';
import { answerFactual, detectLang, translationTarget, wordCount, type FactAnswer, type Lang } from './route';
import { correctionNote, rulesForCorrection, type RuleHit } from './rules';
import { renderChatPrefix } from './template';
import { parseTalkPoints, parseTaboo, tabooComplete, talkComplete, type TabooCard, type TalkPoint } from './together';
import { verifyAnswer, type AnswerChecks } from './verify';
import { precheckText, type Precheck, type WriteTask } from './writing';
import { t } from '../i18n';

/**
 * True when a "translation" into German is the line itself, give or take an article or a spelling ("Kinder spielen
 * gern draussen" → "Die Kinder spielen gern draußen"): the line was German already.
 */
export function handedBack(line: string, translation: string): boolean {
  const words = tokenize(normalise(line)).filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (!words.length) return compact(line) === compact(translation);
  const given = new Set(tokenize(normalise(translation)));
  return words.filter((w) => given.has(w)).length / words.length >= 0.8;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateOptions {
  maxNewTokens: number;
  /** Called with the full text so far on every streamed piece. */
  onText?: (full: string) => void;
  /** Return true once the text is enough: the model stops generating. `generated` counts the tokens so far. */
  stopWhen?: (full: string, generated: number) => boolean;
  signal?: AbortSignal;
  /** Background work (a lesson plan) yields to anything the learner is waiting for; foreground is the default. */
  priority?: 'foreground' | 'background';
  /**
   * Text the answer starts with: it is placed after the assistant tag so the model continues it, and it is part
   * of the returned text. Used for the labelled drafts, where the first label keeps the model on the card instead
   * of starting the role-play. Only possible when the app renders the prompt itself (the bundled template matches
   * the file's); otherwise the prompt goes without it.
   */
  prefill?: string;
}

export interface GenerateResult {
  text: string;
  /** eos: finished; length: hit the token budget; stop: the app had enough; abort: cancelled; stall: the model hung. */
  stopped: 'eos' | 'length' | 'abort' | 'stop' | 'stall';
}

export type Generate = (messages: ChatMessage[], opts: GenerateOptions) => Promise<GenerateResult>;

/** Evaluates a prompt prefix into the model's cache ahead of the prompt that will begin with it. */
export type Prime = (prompt: string) => Promise<void>;

/** Sentence ends that are not the end of a sentence: abbreviations and the numbers of list items. */
const NOT_AN_END = /(?:\b(?:z\.\s?B|bzw|usw|etc|ca|vgl|Nr|Dr|Prof|e\.\s?g|i\.\s?e|vs)|\b\d+)\.\s*$/;

/**
 * A stop for free text that is allowed to end a little early rather than mid-sentence at the token limit:
 * from three quarters of the budget the model is stopped at the next paragraph break, from nine tenths at the
 * next sentence end. Lists, corrections and translations keep their own stops; they are read by shape.
 */
export function softStop(budget: number): (full: string, generated: number) => boolean {
  const paragraphAt = Math.floor(budget * 0.75);
  const sentenceAt = Math.floor(budget * 0.9);
  return (full, generated) => {
    if (generated < paragraphAt) return false;
    const trimmed = full.trimEnd();
    if (!/[.!?…][)"»“”'*_]*$/.test(trimmed) || NOT_AN_END.test(trimmed)) return false;
    if (/\n\s*$/.test(full)) return true;
    return generated >= sentenceAt;
  };
}

export interface GrammarCard {
  key: string;
  level: Level;
  title_en: string;
  title_de: string;
  rule_en: string;
  rule_de: string;
  examples: [string, string][];
  pitfalls: { wrong: string; right: string; why_en: string; why_de: string }[];
  items: string[];
  reference: { block: string; needles: string[] } | null;
}

export interface Ctx {
  level: Level;
  /** The language explanations are written in (the learner's choice in settings). */
  lang: Lang;
  signal?: AbortSignal;
  onText?: (full: string) => void;
}

export interface Answer {
  text: string;
  checks: AnswerChecks;
  grounded: string[];
}

export interface AskResult extends Answer {
  fact: FactAnswer | null;
  card: GrammarCard | null;
}

export interface CorrectionResult extends Answer {
  correction: Correction;
  diff: DiffOp[] | null;
  /** The verified rules behind the change, read from the diff (empty when no pattern is certain). */
  rules: RuleHit[];
}

export type Verdict = 'verified' | 'fixed' | 'unchecked';

export interface CheckedVocabItem extends VocabItem {
  verdict: Verdict;
  /** What the lexicon says, when it disagrees with the model. */
  lexArticle?: Article;
  lexPlural?: string;
}

export interface SceneTurn {
  line: CounterpartLine;
  frame: Frame;
  attempts: number;
  revealed: string[];
}

export interface WritingResult {
  precheck: Precheck;
  correction: CorrectionResult | null;
}

/** The model's draft did not have the required shape twice; `draft` is the last answer, for the log. */
export class DraftError extends Error {
  constructor(
    message: string,
    public readonly draft: string,
  ) {
    super(message);
    this.name = 'DraftError';
  }
}

const STOP_WORDS = new Set('with the and for what when which does that this from about have your into than then them they there their order'.split(' '));

export class Tutor {
  /** Where the rule note stands in a grounded prompt (see NoteLayout); the trained layout unless the app says otherwise. */
  private layout: NoteLayout = 'after';

  constructor(
    private deps: {
      generate: Generate;
      systemPrompt: string;
      grounding: GroundingPack | null;
      lex: LexiconIndex | null;
      cards: GrammarCard[];
      /** Optional: the model host's cache prime, for evaluating the next prompt's known beginning early. */
      prime?: Prime;
      /** Optional: told when the cache prime fails, so the failure is logged and not mistaken for a warmed cache. */
      onPrimeError?: (error: unknown) => void;
    },
  ) {}

  setLayout(layout: NoteLayout) {
    this.layout = layout;
  }

  get noteLayout(): NoteLayout {
    return this.layout;
  }

  setLexicon(lex: LexiconIndex) {
    this.deps.lex = lex;
  }

  setSystemPrompt(text: string) {
    if (text.trim()) this.deps.systemPrompt = text;
  }

  get grounding() {
    return this.deps.grounding;
  }

  /** The lexicon in use: the A1-B2 core at first, the full one once the host has sent it. */
  get lexicon() {
    return this.deps.lex;
  }

  noteTitle = (key: string) => (this.deps.grounding ? blockTitle(this.deps.grounding, key) : key);

  /**
   * The rendered beginning every ordinary prompt shares: the system prompt in the chat template, the user turn
   * opened, and `userStart` (what the user turn is known to begin with, a rule note in the 'before' layout).
   */
  prefixText(userStart = ''): string {
    return renderChatPrefix([
      { role: 'system', content: this.deps.systemPrompt || P.DEFAULT_SYSTEM_PROMPT },
      { role: 'user', content: userStart },
    ]);
  }

  /** The rule note keys a prompt would carry, as `run` would attach them (the router's choice, or the given keys). */
  notesFor(prompt: string, keys: string[] | null = null): string[] {
    return noteKeys(prompt, this.deps.grounding, keys);
  }

  /**
   * Evaluates ahead of time what the prompt for `text` is known to begin with, while the learner is still
   * typing: the system prompt, and in the 'before' layout the rule note the router would attach to the text
   * so far (a translation carries none). Resolves when the host is done, at once when there is nothing to do.
   */
  prepare(text: string, ctx: Pick<Ctx, 'level' | 'lang'>, intent: 'ask' | 'check' | 'translate' = 'ask'): Promise<void> {
    const prime = this.deps.prime;
    if (!prime) return Promise.resolve();
    const t = text.trim();
    let start = '';
    if (t && this.layout === 'before' && intent !== 'translate') {
      const { prompt, keys } = intent === 'check' ? this.correctionPrompt(t, ctx) : { prompt: P.askPrompt(t, ctx.level, detectLang(t, ctx.lang)), keys: null };
      start = notePrefix(this.deps.grounding, this.notesFor(prompt, keys), this.layout);
    }
    // a failed prime is not fatal - the reply is generated without the warm cache - but it must be reported,
    // not swallowed, or the tutor looks fine until the generate that fails the same way
    return prime(this.prefixText(start)).catch((e) => this.deps.onPrimeError?.(e));
  }

  private async run(userText: string, ctx: Ctx, maxNewTokens: number, extra: Partial<GenerateOptions> = {}, ground = true, keys: string[] | null = null) {
    const g = ground ? groundPrompt(userText, this.deps.grounding, keys, this.layout) : { text: userText, keys: [] as string[] };
    const messages: ChatMessage[] = [
      { role: 'system', content: this.deps.systemPrompt || P.DEFAULT_SYSTEM_PROMPT },
      { role: 'user', content: g.text },
    ];
    const res = await this.deps.generate(messages, { maxNewTokens, onText: ctx.onText, signal: ctx.signal, ...extra });
    return { text: res.text.trim(), grounded: g.keys, stopped: res.stopped };
  }

  private verify(text: string, grounded: string[], fact: FactAnswer | null = null, ignore: string[] = []) {
    return verifyAnswer(text, { lex: this.deps.lex, grounding: this.deps.grounding, grounded, fact, ignore });
  }

  /** The grammar card a free question is about (its contrast words, or most of its title words). */
  matchCard(question: string): GrammarCard | null {
    const n = ` ${normalise(question).replace(/[^a-z0-9 ]+/g, ' ')} `;
    let best: GrammarCard | null = null;
    let bestScore = 0;
    for (const card of this.deps.cards) {
      const items = [...new Set(card.items.map((i) => normalise(i).split(/[ (…]/)[0]).filter((w) => w.length >= 2))];
      // two of a contrast card's words in one question ("seit" and "vor") name the card
      const present = items.filter((w) => n.includes(` ${w} `)).length;
      let score = present >= Math.min(2, items.length) && items.length >= 2 ? 3 : 0;
      const words = normalise(card.title_en)
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
      score += words.filter((w) => n.includes(` ${w}`)).length;
      if (score > bestScore) {
        best = card;
        bestScore = score;
      }
    }
    return bestScore >= 2 ? best : null;
  }

  // ----------------------------------------------------------------------------------------------
  // conversation
  // ----------------------------------------------------------------------------------------------

  async ask(question: string, ctx: Ctx): Promise<AskResult> {
    const lang = detectLang(question, ctx.lang);
    const fact = answerFactual(question, lang);
    const card = this.matchCard(question);
    const { text, grounded } = await this.run(P.askPrompt(question, ctx.level, lang), ctx, P.BUDGET.answer, { stopWhen: softStop(P.BUDGET.answer) });
    const checks = this.verify(text, grounded, fact);
    return { text: repairReferenceQuotes(text, checks.quotes), checks, grounded, fact, card };
  }

  /** The verified rules behind a correction (none when the sentence was right or no pattern is certain). */
  private rulesFor(original: string, correction: Correction, diff: DiffOp[] | null, lang: Lang): RuleHit[] {
    if (!correction.corrected || correction.unchanged || !diff) return [];
    return rulesForCorrection(original, correction.corrected, diff, lang, this.deps.lex, this.deps.grounding);
  }

  /** The correction prompt for a sentence or a text, with the note for the mistake it most likely has. */
  private correctionPrompt(original: string, ctx: Pick<Ctx, 'level' | 'lang'>) {
    const long = wordCount(original) > 25 || (original.match(/[.!?](\s|$)/g) ?? []).length > 1;
    const prompt = long ? P.correctTextPrompt(original, ctx.level, ctx.lang) : P.correctSentencePrompt(original, ctx.lang);
    // the note for the mistake the sentence most likely has (the router only sees topic words)
    const note = long ? null : correctionNote(original);
    return { prompt, keys: note ? [note] : null, long };
  }

  async correct(original: string, ctx: Ctx): Promise<CorrectionResult> {
    const lang = ctx.lang;
    const { prompt, keys, long } = this.correctionPrompt(original, ctx);
    // the corrected sentence comes first and is short; the soft stop only trims a long explanation at a paragraph or sentence end
    const budget = long ? P.BUDGET.textCorrection : P.correctionBudget(ctx.level);
    const { text, grounded } = await this.run(prompt, ctx, budget, { stopWhen: softStop(budget) }, true, keys);
    const correction = parseCorrection(text, original);
    const diff = correction.corrected ? diffWords(original, correction.corrected) : null;
    const checks = this.verify(text, grounded, null, [original]);
    return { text, checks, grounded, correction, diff, rules: this.rulesFor(original, correction, diff, lang) };
  }

  /**
   * The other language: German for a line in the learner's language, the learner's language (English when the
   * tutor cannot write it, see `translationTarget`) for a German one; `to` says which. The model is stopped
   * after its first line. A German line the word lists took for the learner's language comes back unchanged;
   * that answer is not shown, the line is glossed instead.
   */
  async translate(text: string, ctx: Ctx): Promise<Answer & { translation: string; to: Lang }> {
    const from = detectLang(text, ctx.lang);
    let to: Lang = from === 'de' ? translationTarget(ctx.lang) : 'de';
    let res = await this.run(to === 'de' ? P.translatePrompt(text, from) : P.glossPrompt(text, to), ctx, P.BUDGET.translate, { stopWhen: firstLineComplete }, false);
    let translation = firstLine(res.text);
    if (to === 'de' && handedBack(text, translation)) {
      // the model handed the line back: it was German already, which the word lists did not see; gloss it instead
      to = translationTarget(ctx.lang);
      res = await this.run(P.glossPrompt(text, to), ctx, P.BUDGET.translate, { stopWhen: firstLineComplete }, false);
      translation = firstLine(res.text);
    }
    return { text: translation, translation, to, checks: this.verify(to === 'de' ? translation : '', []), grounded: [] };
  }

  /** An English line for a German one (role-play lines at B1 and B2, where glosses are off). */
  async gloss(german: string, ctx: Ctx): Promise<string> {
    const res = await this.run(P.glossPrompt(german, ctx.lang), ctx, 60, { stopWhen: firstLineComplete }, false);
    return firstLine(res.text);
  }

  // ----------------------------------------------------------------------------------------------
  // words
  // ----------------------------------------------------------------------------------------------

  /** A themed word list, read item by item while it streams, every noun checked against the lexicon. */
  async vocabList(topic: string, ctx: Ctx & { onItems?: (items: CheckedVocabItem[]) => void }, n = 6): Promise<{ items: CheckedVocabItem[]; text: string }> {
    let lastCount = 0;
    const onText = (full: string) => {
      ctx.onText?.(full);
      const items = parseVocabList(full);
      // an item is final once the next one has started (or the list is complete)
      const settled = vocabListComplete(full, Math.min(n, items.length)) ? items : items.slice(0, -1);
      if (settled.length !== lastCount) {
        lastCount = settled.length;
        ctx.onItems?.(settled.slice(0, n).map((i) => this.checkVocab(i)));
      }
    };
    const { text } = await this.run(P.vocabListPrompt(topic, ctx.level, ctx.lang, n), { ...ctx, onText }, P.BUDGET.vocab, {
      stopWhen: (full) => vocabListComplete(full, n),
    });
    const items = parseVocabList(text)
      .slice(0, n)
      .map((i) => this.checkVocab(i));
    ctx.onItems?.(items);
    return { items, text };
  }

  checkVocab(item: VocabItem): CheckedVocabItem {
    const lex = this.deps.lex;
    if (!lex) return { ...item, verdict: 'unchecked' };
    const articles = lex.articlesOf(item.lemma);
    const plurals = lex.pluralsOfLemma(item.lemma);
    if (!articles.length) return { ...item, verdict: 'unchecked' };
    const articleOk = item.article !== null && articles.includes(item.article);
    const pluralOk = item.plural === null || plurals.length === 0 || plurals.includes(item.plural);
    if (articleOk && pluralOk) return { ...item, verdict: 'verified' };
    const known = lex.noun(item.lemma);
    return {
      ...item,
      verdict: 'fixed',
      lexArticle: articleOk ? undefined : (known ? GENUS_ARTICLE[known.genus] : articles[0]),
      lexPlural: pluralOk ? undefined : plurals[0],
    };
  }

  /** Examples for one word: the model writes sentences, which it does well, rather than rules about gender. */
  async wordExamples(word: string, ctx: Ctx): Promise<Answer> {
    const { text, grounded } = await this.run(P.wordPrompt(word, ctx.level, ctx.lang), ctx, P.BUDGET.examples, { stopWhen: softStop(P.BUDGET.examples) });
    return { text, checks: this.verify(text, grounded), grounded };
  }

  /**
   * Why a drill answer was wrong. For numbers, times, dates, prices and verb forms the model explains with the
   * matching rule note attached. For articles, plurals and meanings there is often no rule to explain, and a
   * small model invents one, so the app gives the rule itself and asks the model for example sentences.
   */
  async explainDrill(drill: Drill, given: string, ctx: Ctx): Promise<Answer> {
    if (drill.noun && (drill.category === 'article' || drill.category === 'plural' || drill.category === 'meaning')) {
      const word = drill.category === 'plural' ? `die ${drill.noun.plural[0]}` : `${GENUS_ARTICLE[drill.noun.genus]} ${drill.noun.lemma}`;
      const prompt =
        ctx.lang === 'de'
          ? `Gib mir zwei kurze Beispielsätze mit „${word}“, mit englischer Übersetzung. Ich bin auf Niveau ${ctx.level}.`
          : `Give me two short example sentences with "${word}", with English translations. I'm at ${ctx.level} level.`;
      const { text, grounded } = await this.run(prompt, ctx, P.BUDGET.examples, { stopWhen: softStop(P.BUDGET.examples) });
      return { text, checks: this.verify(text, grounded), grounded };
    }
    const { text, grounded } = await this.run(P.explainMistakePrompt(drillAsText(drill), given, drill.answer, ctx.lang), ctx, P.BUDGET.explain, {
      stopWhen: softStop(P.BUDGET.explain),
    });
    const checks = this.verify(text, grounded);
    return { text: repairReferenceQuotes(text, checks.quotes), checks, grounded };
  }

  // ----------------------------------------------------------------------------------------------
  // grammar (the four card shapes; the card's own rule note is attached when the router finds none)
  // ----------------------------------------------------------------------------------------------

  private cardKeys(prompt: string, card: GrammarCard): string[] | null {
    if (!this.deps.grounding) return null;
    const routed = noteKeys(prompt, this.deps.grounding);
    if (routed.length) return routed;
    return card.reference?.block ? [card.reference.block] : null;
  }

  async grammarExplain(card: GrammarCard, ctx: Ctx): Promise<Answer> {
    const title = ctx.lang === 'de' ? card.title_de : card.title_en;
    const prompt = card.items.length >= 2 ? P.grammarContrastPrompt(card.items, ctx.level, ctx.lang) : P.grammarExplainPrompt(title, ctx.level, ctx.lang);
    const { text, grounded } = await this.run(prompt, ctx, P.BUDGET.answer, { stopWhen: softStop(P.BUDGET.answer) }, true, this.cardKeys(prompt, card));
    const checks = this.verify(text, grounded);
    return { text: repairReferenceQuotes(text, checks.quotes), checks, grounded };
  }

  async grammarExamples(card: GrammarCard, ctx: Ctx): Promise<Answer> {
    const prompt = P.grammarExamplesPrompt(ctx.lang === 'de' ? card.title_de : card.title_en, ctx.lang);
    const { text, grounded } = await this.run(prompt, ctx, P.BUDGET.examples, { stopWhen: softStop(P.BUDGET.examples) }, true, this.cardKeys(prompt, card));
    const checks = this.verify(text, grounded);
    return { text: repairReferenceQuotes(text, checks.quotes), checks, grounded };
  }

  async grammarCheck(sentence: string, card: GrammarCard, ctx: Ctx): Promise<CorrectionResult> {
    const prompt = P.grammarCheckPrompt(sentence, ctx.lang);
    const budget = P.correctionBudget(ctx.level);
    const { text, grounded } = await this.run(prompt, ctx, budget, { stopWhen: softStop(budget) }, true, this.cardKeys(prompt, card));
    const correction = parseCorrection(text, sentence);
    const diff = correction.corrected ? diffWords(sentence, correction.corrected) : null;
    return { text, checks: this.verify(text, grounded, null, [sentence]), grounded, correction, diff, rules: this.rulesFor(sentence, correction, diff, ctx.lang) };
  }

  // ----------------------------------------------------------------------------------------------
  // scenes
  // ----------------------------------------------------------------------------------------------

  /**
   * The counterpart's next line. Greedy decoding gives the same answer to the same prompt, so a line that
   * breaks character is retried with another of the four trained frames, not with the same prompt again.
   */
  async sceneTurn(card: SceneCard, transcript: TranscriptLine[], ctx: Ctx & { help: boolean }, maxAttempts = 2): Promise<SceneTurn> {
    const order: Frame[] = ctx.lang === 'de' ? ['de-a', 'en-a', 'de-b', 'en-b'] : ['en-a', 'de-a', 'en-b', 'de-b'];
    const learnerTurns = transcript.filter(([who]) => who === speakerLabel(card.learner_de)).length;
    const context = transcriptText(transcript);
    let best: SceneTurn | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const frame = order[attempt % order.length];
      const prompt = counterpartPrompt(card, transcript, frame, ctx.help ? 'en' : 'de', exampleFor(card, learnerTurns + attempt));
      const { text } = await this.run(prompt, attempt === 0 ? ctx : { ...ctx, onText: undefined }, P.BUDGET.roleplay, {}, false);
      const line = readCounterpartLine(text, card, ctx.help, context);
      const turn: SceneTurn = { line, frame, attempts: attempt + 1, revealed: factsRevealed(card, line.german) };
      const blocking = line.tells.filter((t) => BLOCKING_TELLS.includes(t)).length;
      if (!blocking) return turn;
      if (!best || blocking < best.line.tells.filter((t) => BLOCKING_TELLS.includes(t)).length) best = turn;
    }
    return best as SceneTurn;
  }

  /** Lines the learner could say next: the card's own while the scene follows its script, else the model's. */
  async suggestReplies(card: SceneCard, transcript: TranscriptLine[], ctx: Ctx): Promise<{ german: string; english: string | null }[]> {
    const learnerTurns = transcript.filter(([who]) => who === speakerLabel(card.learner_de)).length;
    const scripted = scriptedSuggestions(card, learnerTurns);
    if (scripted.length) return scripted.map((german) => ({ german, english: null }));
    const last = [...transcript].reverse().find(([who]) => who === speakerLabel(card.role_de));
    const prompt = P.suggestReplyPrompt(card.situation_en, card.learner_en, last?.[1] ?? card.opening, ctx.level);
    const { text } = await this.run(prompt, ctx, P.BUDGET.hint, { stopWhen: (full) => /\)\s*\n|\n\s*\n/.test(full) }, false);
    const first = firstLine(text);
    const m = /^(.*?[.!?])\s*\(([^()]+)\)\s*$/.exec(first);
    const gloss = /\(([^()]+)\)/.exec(text.split('\n').slice(1).join(' '));
    const raw = m ? m[1] : first.replace(/\s*\(.*$/, '');
    const german = learnerSideOnly(raw, card, transcript);
    if (!german) return [];
    // the English gloss described the whole line; it only still fits when the line was kept whole
    return [{ german, english: german === raw.trim() ? (m ? m[2] : gloss?.[1] ?? null) : null }];
  }

  async phrases(situation: string, ctx: Ctx, n = 6): Promise<Phrase[]> {
    const { text } = await this.run(P.phrasesPrompt(situation, ctx.level, ctx.lang), ctx, P.BUDGET.phrases, { stopWhen: (full) => phrasesComplete(full, n) });
    return parsePhrases(text).slice(0, n);
  }

  // ----------------------------------------------------------------------------------------------
  // writing
  // ----------------------------------------------------------------------------------------------

  async writing(task: WriteTask, text: string, ctx: Ctx): Promise<WritingResult> {
    const precheck = precheckText(task, text);
    if (precheck.tooShort) return { precheck, correction: null };
    const { text: answer, grounded } = await this.run(P.correctTextPrompt(text, ctx.level, ctx.lang), ctx, P.BUDGET.textCorrection, {
      stopWhen: softStop(P.BUDGET.textCorrection),
    });
    const correction = parseCorrection(answer, text);
    const diff = correction.corrected ? diffWords(text, correction.corrected) : null;
    return {
      precheck,
      correction: {
        text: answer,
        checks: this.verify(answer, grounded, null, [text]),
        grounded,
        correction,
        diff,
        rules: this.rulesFor(text, correction, diff, ctx.lang),
      },
    };
  }

  async modelAnswer(task: WriteTask, ctx: Ctx): Promise<Answer> {
    const { text, grounded } = await this.run(
      P.modelAnswerPrompt(task.prompt, task.level, task.words, task.register),
      ctx,
      P.BUDGET.modelAnswer,
      { stopWhen: softStop(P.BUDGET.modelAnswer) },
      false,
    );
    return { text, checks: this.verify(text, grounded), grounded };
  }

  // ----------------------------------------------------------------------------------------------
  // authoring: the model writes content the app used to ship. Each draft is read by shape and validated; a
  // draft that fails is asked for once more in other words (the same prompt would give the same answer).
  // ----------------------------------------------------------------------------------------------

  /** A situation card for the learner's own role-play idea, the roles' articles checked against the lexicon. */
  async designScene(description: string, ctx: Ctx): Promise<SceneDraft> {
    let last = '';
    for (const variant of [0, 1]) {
      const { text } = await this.run(P.sceneCardPrompt(description, ctx.level, variant), variant ? { ...ctx, onText: undefined } : ctx, P.BUDGET.sceneCard, { prefill: P.SCENE_PREFILL }, false);
      last = text;
      const draft = parseSceneDraft(text, ctx.level, this.deps.lex, description);
      if (draft) return draft;
    }
    throw new DraftError(t('author.reasonScene'), last);
  }

  /** A writing task about a topic, in the exam shape; the content points carry the key words the precheck looks for. */
  async designWriteTask(topic: string, register: 'formal' | 'informal', ctx: Ctx): Promise<WriteTask> {
    let last = '';
    for (const variant of [0, 1]) {
      const { text } = await this.run(P.writeTaskPrompt(topic, ctx.level, register, WORDS_FOR_LEVEL[ctx.level], variant), variant ? { ...ctx, onText: undefined } : ctx, P.BUDGET.writeTask, { prefill: P.TASK_PREFILL }, false);
      last = text;
      const task = parseWriteTaskDraft(text, ctx.level, register, topic);
      if (task) return task;
    }
    throw new DraftError(t('author.reasonTask'), last);
  }

  /**
   * A grammar card on any topic. The prompt is grounded like a question (the router attaches the nearest rule
   * note), and every example sentence is checked against the lexicon; the ones with a finding are left out.
   */
  async designGrammarCard(topic: string, ctx: Ctx): Promise<GrammarCardDraft & { grounded: string[] }> {
    let last = '';
    for (const variant of [0, 1]) {
      const { text, grounded } = await this.run(P.grammarCardPrompt(topic, ctx.level, variant), variant ? { ...ctx, onText: undefined } : ctx, P.BUDGET.grammarCard, {}, true);
      last = text;
      const draft = parseGrammarCardDraft(text, ctx.level, this.deps.lex, topic);
      if (draft) return { ...draft, grounded };
    }
    throw new DraftError(t('author.reasonCard'), last);
  }

  /** Vocabulary topics beyond the app's own list for the level. */
  async suggestTopics(ctx: Ctx, exclude: string[], n = 6): Promise<string[]> {
    for (const variant of [0, 1]) {
      const { text } = await this.run(P.topicsPrompt(ctx.level, exclude, n, variant), variant ? { ...ctx, onText: undefined } : ctx, P.BUDGET.topics, { stopWhen: (full) => topicsComplete(full, n, exclude) }, false);
      const topics = parseTopics(text, exclude, n);
      if (topics.length >= Math.min(3, n)) return topics;
    }
    return [];
  }

  // ----------------------------------------------------------------------------------------------
  // planning
  // ----------------------------------------------------------------------------------------------

  /** The model picks and orders the lesson's activities from the app's menu; the app builds every one. */
  async plan(goal: string, menu: { id: string; alias: RegExp }[], ctx: Ctx, n = 4, seed = 0): Promise<PlanItem[] | null> {
    // the model favours the first types it reads, so the menu order changes from day to day
    const ids = menu.map((m) => m.id);
    const order = ids.map((id, i) => [id, ((i + 1) * 7919 + seed * 104729) % 1009] as const).sort((a, b) => a[1] - b[1]).map(([id]) => id);
    const messages: ChatMessage[] = [
      { role: 'system', content: P.PLANNER_SYSTEM },
      { role: 'user', content: P.plannerPrompt(goal, order, n, ctx.lang) },
    ];
    const res = await this.deps.generate(messages, {
      maxNewTokens: P.BUDGET.plan,
      signal: ctx.signal,
      onText: ctx.onText,
      stopWhen: (full) => planComplete(full, n),
      priority: 'background',
    });
    return parsePlan(res.text, menu, n);
  }

  // ----------------------------------------------------------------------------------------------
  // practising together (src/harness/together.ts): questions for the players' own topic, Taboo words
  // ----------------------------------------------------------------------------------------------

  /** Discussion questions in German for a topic two players chose; the bundled topics never need this. */
  async talkPoints(topic: string, ctx: Ctx, n = 5): Promise<TalkPoint[]> {
    for (const variant of [0, 1]) {
      const { text } = await this.run(P.talkPrompt(topic, ctx.level, ctx.lang, n, variant), variant ? { ...ctx, onText: undefined } : ctx, P.BUDGET.talk, { stopWhen: (full) => talkComplete(full, n) }, false);
      const points = parseTalkPoints(text, topic, ctx.level, this.deps.lex, n);
      if (points.length >= Math.min(3, n)) return points;
    }
    return [];
  }

  /** The four words a Taboo explainer may not say; null when the model's line did not read as a word list. */
  async tabooWords(card: TabooCard, ctx: Ctx): Promise<string[] | null> {
    for (const variant of [0, 1]) {
      const { text } = await this.run(P.tabooPrompt(card, variant), { ...ctx, onText: undefined }, P.BUDGET.taboo, { stopWhen: tabooComplete, priority: 'background' }, false);
      const words = parseTaboo(text, card);
      if (words) return words;
    }
    return null;
  }
}
