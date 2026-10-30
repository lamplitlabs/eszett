// The tutor model on the phone: llama.rn over a GGUF file. One generation at a time — a foreground request (the
// learner is waiting) interrupts a running background job (a lesson plan, a cache prime) and goes before queued
// background ones; otherwise first come, first served. Greedy decoding, like the retired laptop host, with a
// guard that ends a generation once the model repeats the same lines or sentence three times (repetition.ts).
//
// Latency: llama.rn keeps the KV cache of the last prompt and reuses the part a new prompt shares with it, so
// everything the next prompt is known to begin with (the system prompt, the rule note the learner's question
// will carry) is evaluated ahead of time with a one-token "prime" completion. On this hardware prompt
// processing runs at ~25 tokens/s, so every token already in the cache is 40 ms the learner does not wait.

import {
  initLlama,
  loadLlamaModelInfo,
  type CompletionParams,
  type LlamaContext,
  type NativeCompletionResult,
  type TokenData,
} from 'llama.rn';

import { renderChatPrompt, sameTemplate } from '@/harness/template';
import type { ChatMessage, Generate, GenerateOptions, GenerateResult } from '@/harness/tutor';
import { CHAT_TEMPLATE } from '@/model/manifest';
import { loopCut } from '@/model/repetition';
import { watchdog } from '@/model/watchdog';

export interface EngineInfo {
  name: string;
  version: string | null;
  gpu: boolean;
  reasonNoGPU: string;
  /** The file embeds the chat template the app renders itself; otherwise llama.rn's jinja engine formats the prompt. */
  templateKnown: boolean;
  nCtx: number;
}

export interface EngineStats {
  /** Generations (primes are not counted). */
  requests: number;
  generatedTokens: number;
  lastTokS: number | null;
  avgTokS: number | null;
  /** Prompt tokens evaluated (not served from the cache) over all requests and primes. */
  promptTokens: number;
  promptMs: number;
  /** The last generation: tokens its prompt had, how many the cache already held, and the evaluation time. */
  lastPromptTokens: number | null;
  lastCachedTokens: number | null;
  lastPromptMs: number | null;
  /** Prompt processing speed (tokens/s), last and running average. */
  lastPpTokS: number | null;
  avgPpTokS: number | null;
  /** Cache primes that ran to the end. */
  primes: number;
}

export class ModelError extends Error {
  constructor(
    message: string,
    readonly kind: 'not_loaded' | 'failed' | 'memory',
  ) {
    super(message);
    this.name = 'ModelError';
  }
}


const N_CTX = 4096;
const EOS = '<|im_end|>';
/** Prompt processing on a slow phone can take a while before the first token shows up. */
const FIRST_TOKEN_MS = 120_000;
/** Once streaming, this long without a token means the model hung. */
const IDLE_MS = 30_000;
/** A prime evaluates the prompt only; anything longer than this and the model hung. */
const PRIME_MS = 180_000;

const GREEDY = { temperature: 0, top_k: 1, top_p: 1, min_p: 0, penalty_repeat: 1 };

type Outcome = 'stop' | 'abort' | 'stall';

interface Job {
  kind: 'generate' | 'prime';
  messages: ChatMessage[];
  /** The rendered prompt of a prime (a generate job renders its messages when it runs). */
  prompt: string;
  opts: GenerateOptions;
  priority: 'foreground' | 'background';
  resolve: (result: GenerateResult) => void;
  reject: (error: unknown) => void;
  /** Set while the job runs: ends it with the given outcome. */
  interrupt?: (why: Outcome) => void;
  onSignalAbort?: () => void;
}

type Meta = Record<string, string | undefined>;

const metaString = (meta: Meta, key: string): string | null => {
  const value = meta[key];
  return typeof value === 'string' && value.trim() ? value : null;
};

const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const isMemoryError = (message: string) => /memory|alloc|mmap|out of/i.test(message);

const freshStats = (): EngineStats => ({
  requests: 0,
  generatedTokens: 0,
  lastTokS: null,
  avgTokS: null,
  promptTokens: 0,
  promptMs: 0,
  lastPromptTokens: null,
  lastCachedTokens: null,
  lastPromptMs: null,
  lastPpTokS: null,
  avgPpTokS: null,
  primes: 0,
});

/** stopCompletion() is typed as a promise but the JSI host function answers synchronously; cover both. */
function stop(context: LlamaContext) {
  try {
    void Promise.resolve(context.stopCompletion()).catch(() => undefined);
  } catch (e) {
    // the context is gone already
    console.warn('[model] could not stop the completion; the context is gone already:', e);
  }
}

function completionParams(messages: ChatMessage[], templateKnown: boolean, maxNewTokens: number, prefill = ''): CompletionParams {
  const base: CompletionParams = { ...GREEDY, stop: [EOS], n_predict: maxNewTokens };
  if (templateKnown) return { ...base, prompt: renderChatPrompt(messages) + prefill };
  // the file's own template renders the turns: no place to put a prefill
  return { ...base, messages, jinja: true, add_generation_prompt: true, force_pure_content: true };
}

/**
 * Evaluates `prompt` into the KV cache and samples a single token, which llama.rn trims from its token list
 * again (never decoded), so the cache holds exactly the prompt. One token rather than none: llama.cpp books the
 * prompt timings only when logits are read, so a zero-token prime reports nothing and the next request is
 * charged with the prime's evaluation on top of its own.
 */
const primeParams = (prompt: string): CompletionParams => ({ ...GREEDY, stop: [EOS], n_predict: 1, prompt });

class Engine {
  private context: LlamaContext | null = null;
  private info: EngineInfo | null = null;
  private running: Job | null = null;
  private active: Promise<void> | null = null;
  private queue: Job[] = [];
  private _stats: EngineStats = freshStats();
  private predictedN = 0;
  private predictedMs = 0;
  private homePrefix: (() => string) | null = null;
  /** The home prefix the last automatic re-prime tried, so a failing prime is not retried in a loop. */
  private homeTried: string | null = null;
  /** The prompt the cache holds (what the last job evaluated), for deciding whether a re-prime is worth it. */
  private cached = '';

  get loaded(): boolean {
    return this.context !== null;
  }

  /** A fresh copy each time, so a store can tell that something changed. */
  get stats(): EngineStats {
    return { ...this._stats };
  }

  /**
   * The prefix every ordinary prompt starts with (the system prompt rendered in the chat template). It is
   * evaluated right after the model loads instead of a warm-up, and again, in the background, whenever a job
   * with a different beginning (the lesson planner) has pushed it out of the cache.
   */
  setHomePrefix(prefix: (() => string) | null): void {
    this.homePrefix = prefix;
  }

  async load(uri: string, onProgress?: (p: number) => void): Promise<EngineInfo> {
    await this.unload();
    let context: LlamaContext;
    try {
      context = await initLlama(
        { model: uri, n_ctx: N_CTX, n_batch: 512, n_gpu_layers: 99, use_mlock: false, use_mmap: true, ctx_shift: false },
        onProgress ? (percent) => onProgress(Math.max(0, Math.min(1, percent / 100))) : undefined,
      );
    } catch (e) {
      const message = errorMessage(e);
      throw new ModelError(message, isMemoryError(message) ? 'memory' : 'failed');
    }

    const meta = ((context.model as { metadata?: unknown } | undefined)?.metadata ?? {}) as Meta;
    const info: EngineInfo = {
      name: metaString(meta, 'general.name') ?? context.model?.desc ?? 'GGUF model',
      version: metaString(meta, 'general.version'),
      gpu: context.gpu,
      reasonNoGPU: context.reasonNoGPU ?? '',
      templateKnown: sameTemplate(metaString(meta, 'tokenizer.chat_template') ?? CHAT_TEMPLATE, CHAT_TEMPLATE),
      nCtx: N_CTX,
    };

    // The warm-up (kernels compile before the learner's first question) is the home prefix going into the
    // cache, so the first question only brings its own tokens; a two-token "Hallo" when there is none.
    const home = info.templateKnown ? this.homePrefix?.() ?? '' : '';
    try {
      if (home) {
        const result = await context.completion(primeParams(home));
        this.recordPrompt(result, 'prime');
        this.cached = home;
      } else {
        await context.completion(completionParams([{ role: 'user', content: 'Hallo' }], info.templateKnown, 2));
        this.cached = '';
      }
    } catch (e) {
      await context.release().catch(() => undefined);
      const message = errorMessage(e);
      throw new ModelError(message, isMemoryError(message) ? 'memory' : 'failed');
    }

    this.context = context;
    this.info = info;
    return info;
  }

  async unload(): Promise<void> {
    const context = this.context;
    this.context = null;
    this.info = null;
    this.cached = '';
    for (const job of this.queue.splice(0)) this.settle(job, { text: '', stopped: 'abort' });
    this.running?.interrupt?.('abort');
    if (this.active) await this.active.catch(() => undefined);
    if (context) await context.release().catch(() => undefined);
  }

  generate: Generate = (messages, opts) => {
    return new Promise<GenerateResult>((resolve, reject) => {
      if (opts.signal?.aborted) {
        resolve({ text: '', stopped: 'abort' });
        return;
      }
      if (!this.context) {
        reject(new ModelError('The tutor model is not loaded.', 'not_loaded'));
        return;
      }
      // Anything that does not say otherwise is something the learner is waiting for.
      const job: Job = { kind: 'generate', messages, prompt: '', opts, priority: opts.priority ?? 'foreground', resolve, reject };
      if (opts.signal) {
        const signal = opts.signal;
        job.onSignalAbort = () => {
          if (this.running === job) job.interrupt?.('abort');
          else if (this.dequeue(job)) this.settle(job, { text: '', stopped: 'abort' });
        };
        signal.addEventListener('abort', job.onSignalAbort, { once: true });
      }
      this.enqueue(job);
    });
  };

  /**
   * Evaluates a prompt prefix into the cache without generating, so a prompt that begins with it starts
   * sooner. Background by default: a foreground request interrupts it and still inherits what was evaluated.
   * Primes queued earlier are dropped (only the newest guess about the next prompt counts), and a running
   * prime is interrupted when the new one does not extend it. Resolves when the prime has ended either way.
   */
  prime(prompt: string, priority: 'foreground' | 'background' = 'background'): Promise<void> {
    if (!this.context || !prompt || !(this.info?.templateKnown ?? false)) return Promise.resolve();
    // already there (the cache holds a prompt that begins with it) and nothing queued that would evict it
    if (this.cached.startsWith(prompt) && !this.running && this.queue.length === 0) return Promise.resolve();
    for (const job of this.queue.filter((j) => j.kind === 'prime')) {
      this.dequeue(job);
      this.settle(job, { text: '', stopped: 'abort' });
    }
    if (this.running?.kind === 'prime') {
      // the running prime already covers this prefix: the cache ends up holding it anyway
      if (this.running.prompt.startsWith(prompt)) return this.active ?? Promise.resolve();
      // an unrelated prefix is not worth finishing; one this prime extends is left to finish first
      if (!prompt.startsWith(this.running.prompt)) this.running.interrupt?.('abort');
    }
    return new Promise<void>((resolve) => {
      const job: Job = {
        kind: 'prime',
        messages: [],
        prompt,
        opts: { maxNewTokens: 0 },
        priority,
        resolve: () => resolve(),
        reject: () => resolve(),
      };
      this.enqueue(job);
    });
  }

  /** Drops background work (queued and running) so the next foreground request starts at once. */
  yieldBackground(): void {
    for (const job of this.queue.filter((j) => j.priority === 'background')) {
      this.dequeue(job);
      this.settle(job, { text: '', stopped: 'abort' });
    }
    if (this.running?.priority === 'background') this.running.interrupt?.('abort');
  }

  private enqueue(job: Job): void {
    if (job.priority === 'foreground') {
      if (this.running?.priority === 'background') this.running.interrupt?.('abort');
      const firstBackground = this.queue.findIndex((j) => j.priority === 'background');
      if (firstBackground === -1) this.queue.push(job);
      else this.queue.splice(firstBackground, 0, job);
    } else {
      this.queue.push(job);
    }
    this.pump();
  }

  private dequeue(job: Job): boolean {
    const at = this.queue.indexOf(job);
    if (at === -1) return false;
    this.queue.splice(at, 1);
    return true;
  }

  private settle(job: Job, result: GenerateResult): void {
    if (job.onSignalAbort) job.opts.signal?.removeEventListener('abort', job.onSignalAbort);
    job.onSignalAbort = undefined;
    job.resolve(result);
  }

  private fail(job: Job, error: unknown): void {
    if (job.onSignalAbort) job.opts.signal?.removeEventListener('abort', job.onSignalAbort);
    job.onSignalAbort = undefined;
    job.reject(error);
  }

  private pump(): void {
    if (this.running || this.queue.length === 0) {
      if (!this.running && this.queue.length === 0) this.reprime();
      return;
    }
    const job = this.queue.shift();
    if (!job) return;
    this.running = job;
    this.active = this.run(job).finally(() => {
      this.running = null;
      this.active = null;
      this.pump();
    });
  }

  /** With nothing to do, put the home prefix back into the cache if the last job evicted it (once per eviction). */
  private reprime(): void {
    if (!this.context || !this.homePrefix || !(this.info?.templateKnown ?? false)) return;
    const home = this.homePrefix();
    if (!home || this.cached.startsWith(home) || this.homeTried === home) return;
    this.homeTried = home;
    void this.prime(home);
  }

  private async run(job: Job): Promise<void> {
    const context = this.context;
    if (!context) {
      this.settle(job, { text: '', stopped: 'abort' });
      return;
    }
    if (job.opts.signal?.aborted) {
      this.settle(job, { text: '', stopped: 'abort' });
      return;
    }
    if (job.kind === 'prime') {
      await this.runPrime(job, context);
      return;
    }
    this.homeTried = null;

    const templateKnown = this.info?.templateKnown ?? true;
    const lead = templateKnown ? (job.opts.prefill ?? '') : '';
    let raw = lead;
    let generated = 0;
    /** The text up to the first copy of a block the model started repeating, when the loop guard ended the job. */
    let unlooped: string | null = null;
    // Asserted rather than annotated so the closures' assignments are not narrowed away below.
    let done = null as Outcome | null;
    let cancelWatchdog: (() => void) | null = null;
    const clearTimer = () => {
      cancelWatchdog?.();
      cancelWatchdog = null;
    };
    const end = (why: Outcome) => {
      if (done) return;
      done = why;
      clearTimer();
      stop(context);
    };
    const arm = (ms: number) => {
      clearTimer();
      cancelWatchdog = watchdog(ms, () => end('stall'));
    };
    job.interrupt = (why) => end(why);

    const onToken = (data: TokenData) => {
      if (done) return;
      generated += 1;
      if (typeof data.token === 'string') raw += data.token;
      const text = raw.replace(/^\s+/, '');
      if (!text) return;
      arm(IDLE_MS);
      job.opts.onText?.(text);
      if (job.opts.stopWhen?.(text, generated)) {
        end('stop');
        return;
      }
      if (typeof data.token === 'string' && /[\n.!?…]/.test(data.token)) {
        const cut = loopCut(text);
        if (cut >= 0) {
          unlooped = text.slice(0, cut);
          end('stop');
        }
      }
    };

    const params = completionParams(job.messages, templateKnown, job.opts.maxNewTokens, lead);
    let result: NativeCompletionResult;
    try {
      arm(FIRST_TOKEN_MS);
      result = await context.completion(params, onToken);
    } catch (e) {
      clearTimer();
      if (done) {
        this.settle(job, { text: finalText(unlooped ?? raw), stopped: done });
        return;
      }
      const message = errorMessage(e);
      this.fail(job, new ModelError(message, isMemoryError(message) ? 'memory' : 'failed'));
      return;
    } finally {
      clearTimer();
      job.interrupt = undefined;
    }

    this.record(result);
    if (templateKnown && typeof params.prompt === 'string') this.cached = params.prompt;
    // Our own stop keeps the text the app had seen (cut back to the first copy when the loop guard fired);
    // otherwise the native text may hold a last unstreamed piece.
    const native = typeof result.text === 'string' ? lead + result.text : null;
    const text = unlooped ?? (done === 'stop' || native === null || native.length < raw.length ? raw : native);
    const stopped: GenerateResult['stopped'] = done ?? (result.interrupted ? 'abort' : result.stopped_limit ? 'length' : 'eos');
    this.settle(job, { text: finalText(text), stopped });
  }

  private async runPrime(job: Job, context: LlamaContext): Promise<void> {
    if (this.cached.startsWith(job.prompt)) {
      // the job that ran meanwhile left the cache holding this prefix already
      this.settle(job, { text: '', stopped: 'eos' });
      return;
    }
    let done = null as Outcome | null;
    const cancelWatchdog = watchdog(PRIME_MS, () => end('stall'));
    const end = (why: Outcome) => {
      if (done) return;
      done = why;
      cancelWatchdog();
      stop(context);
    };
    job.interrupt = (why) => end(why);
    try {
      const result = await context.completion(primeParams(job.prompt));
      if (!done && !result.interrupted) {
        this.recordPrompt(result, 'prime');
        this.cached = job.prompt;
      } else {
        // what was evaluated before the interruption stays in the cache; the next prompt still reuses it
        this.recordPrompt(result, 'partial');
        this.cached = '';
      }
    } catch (error) {
      // A prime that dies (the context died evaluating the prompt, or could not be made at all) must not pass
      // for a prime that finished: the reply that follows it fails the same way, and the learner would see a
      // tutor that just stops answering. Log it with the reason; the settled 'stall' outcome marks the miss.
      console.warn('[model] the cache prime failed:', error);
      this.cached = '';
      end('stall');
    } finally {
      cancelWatchdog();
      job.interrupt = undefined;
    }
    // When the prime just failed, `end('stall')` already marked `done`: a broken prime settles as 'stall',
    // never as the normal 'eos' of a finished reply, so the chat path can tell the two ends apart.
    this.settle(job, { text: '', stopped: done ?? 'eos' });
  }

  private record(result: NativeCompletionResult): void {
    const stats = this._stats;
    stats.requests += 1;
    stats.generatedTokens += Number(result.tokens_predicted) || 0;
    this.recordPrompt(result, 'generate');
    const timings = result.timings;
    if (timings && Number.isFinite(timings.predicted_per_second) && timings.predicted_per_second > 0) {
      stats.lastTokS = timings.predicted_per_second;
      if (Number.isFinite(timings.predicted_n) && Number.isFinite(timings.predicted_ms) && timings.predicted_ms > 0) {
        this.predictedN += timings.predicted_n;
        this.predictedMs += timings.predicted_ms;
        stats.avgTokS = (this.predictedN / this.predictedMs) * 1000;
      } else {
        stats.avgTokS = stats.avgTokS === null ? stats.lastTokS : (stats.avgTokS + stats.lastTokS) / 2;
      }
    }
  }

  /**
   * Prompt-side timings: `prompt_n` is what was evaluated, `tokens_evaluated` the whole prompt. A 'generate'
   * sets the last-prompt figures, a 'prime' counts as one, a 'partial' (interrupted) prime adds to the totals only.
   * llama.cpp books prompt work when logits are first read, so an interrupted prime (no token sampled) reports
   * nothing and the next request's figures include what the prime had evaluated.
   */
  private recordPrompt(result: NativeCompletionResult, kind: 'generate' | 'prime' | 'partial'): void {
    const stats = this._stats;
    if (kind === 'prime') stats.primes += 1;
    const timings = result.timings;
    const total = Number(result.tokens_evaluated);
    const evaluated = timings && Number.isFinite(timings.prompt_n) ? timings.prompt_n : NaN;
    const ms = timings && Number.isFinite(timings.prompt_ms) ? timings.prompt_ms : NaN;
    if (!Number.isFinite(evaluated) || !Number.isFinite(ms)) return;
    stats.promptTokens += evaluated;
    stats.promptMs += ms;
    if (evaluated > 0 && ms > 0) {
      stats.lastPpTokS = (evaluated / ms) * 1000;
      stats.avgPpTokS = stats.promptMs > 0 ? (stats.promptTokens / stats.promptMs) * 1000 : stats.lastPpTokS;
    }
    if (kind === 'generate') {
      stats.lastPromptTokens = Number.isFinite(total) ? total : evaluated;
      stats.lastCachedTokens = Number.isFinite(total) ? Math.max(0, total - evaluated) : null;
      stats.lastPromptMs = ms;
    }
  }
}

function finalText(raw: string): string {
  return raw.replace(/^\s+/, '').replace(/<\|im_end\|>\s*$/, '').trimEnd();
}

export const engine: {
  readonly loaded: boolean;
  readonly stats: EngineStats;
  load(uri: string, onProgress?: (p: number) => void): Promise<EngineInfo>;
  unload(): Promise<void>;
  generate: Generate;
  prime(prompt: string, priority?: 'foreground' | 'background'): Promise<void>;
  setHomePrefix(prefix: (() => string) | null): void;
  yieldBackground(): void;
} = new Engine();

/** Reads a GGUF's header without loading it: what the file calls itself, so a sideloaded file can be checked. */
export async function inspectModelFile(uri: string): Promise<{ name: string; version: string | null } | null> {
  try {
    const meta = (await loadLlamaModelInfo(uri)) as Meta;
    const name = metaString(meta, 'general.name');
    if (!name) return null;
    return { name, version: metaString(meta, 'general.version') };
  } catch (e) {
    console.warn('[model] could not inspect the model file:', e);
    return null;
  }
}
