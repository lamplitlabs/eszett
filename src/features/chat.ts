// The Tutor tab's conversation. Each learner message is routed (a question, a sentence to check, "how do I
// say …"), sent through the harness, streamed into place and checked; the result is kept with the message.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { DiffOp } from '@/harness/diff';
import type { RuleHit } from '@/harness/rules';
import { detectLang, route, translationTarget, type FactAnswer, type Lang } from '@/harness/route';
import type { AnswerChecks } from '@/harness/verify';
import { getLanguage } from '@/i18n';
import { describeError, isReady, logPrimeFailure, tutor } from '@/model/runtime';
import { needsQuestionTranslation, translateQuestion, translateText, translating } from '@/mt';
import { useProgress } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { storage, uid } from '@/state/storage';

export type Mode = 'auto' | 'ask' | 'check' | 'translate';

export interface LearnerMessage {
  id: string;
  role: 'learner';
  text: string;
  mode: Exclude<Mode, 'auto'>;
}

export interface TutorMessage {
  id: string;
  role: 'tutor';
  kind: 'answer' | 'correction' | 'translation';
  status: 'thinking' | 'streaming' | 'done' | 'stopped' | 'error';
  text: string;
  lang: Lang;
  error?: string;
  checks?: AnswerChecks;
  fact?: FactAnswer | null;
  cardKey?: string | null;
  original?: string;
  corrected?: string | null;
  unchanged?: boolean;
  explanation?: string;
  diff?: DiffOp[] | null;
  rules?: RuleHit[];
}

export type Message = LearnerMessage | TutorMessage;

// The translator could not turn the learner's question into English for the tutor. Thrown by send() so the
// caller can revert the send and show a retryable error instead of the message: without it the screen would
// have to guess why nothing arrived.
export class QuestionTranslationError extends Error {
  constructor(readonly question: string) {
    super('question translation failed');
    this.name = 'QuestionTranslationError';
    // Restore the prototype chain the ES5 build target breaks, or `instanceof QuestionTranslationError` is false.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

interface ChatState {
  messages: Message[];
  busy: boolean;
  /** `shown` is what the learner's bubble reads when it differs from what goes to the tutor (a chip read in Polish, asked in English). */
  send: (text: string, mode: Mode, shown?: string) => Promise<void>;
  stop: () => void;
  clear: () => void;
}

let controller: AbortController | null = null;

/** What a message in a mode is: the mode itself, or in 'auto' what the router makes of the text. */
function resolveMode(text: string, mode: Mode): { resolved: Exclude<Mode, 'auto'>; body: string } {
  const routed = route(text);
  const resolved: Exclude<Mode, 'auto'> = mode === 'auto' ? (routed.intent === 'check' ? 'check' : routed.intent === 'translate' ? 'translate' : 'ask') : mode;
  return { resolved, body: mode === 'auto' && routed.intent === 'check' ? routed.text : text };
}

/** The text a translation request is about, without the "how do I say" framing and quotes. */
const translationBody = (body: string) =>
  body
    .replace(/^[¿¡]?\s*(how do (you|i) say|wie sag(t|e) (man|ich)|translate|comment (dit-on|on dit|dire)|c[oó]mo se dice|come si dice|como se diz|tradu(?:is|ce|ci|za|zca|zir|ire)|как (?:сказать|будет|это будет|это по-немецки|по-немецки)|переведи(?:те)?|скажи(?:те)? по-немецки)\s*/i, '')
    .replace(/\s*(in german|auf deutsch|en allemand|en alem[aá]n|in tedesco|em alem[aã]o|по-немецки)\s*\??\s*$/i, '')
    .replace(/^["'„“«]|["'“”»?]+$/g, '');

/**
 * Called while the learner types (debounced by the screen): the model evaluates what the coming prompt is
 * known to begin with, so the answer starts sooner once the message is sent. Nothing happens while an
 * answer is being written or without a loaded model.
 */
export function prepare(raw: string, mode: Mode): void {
  if (!isReady() || useChat.getState().busy) return;
  const text = raw.trim();
  const { resolved, body } = resolveMode(text, mode);
  const { level, explainIn } = useSettings.getState();
  // a failed prime does not block the reply, but it must not be silent: the generate it warmed meets the same
  // failure, and an unlogged tutor that suddenly cannot answer is the worst kind of bug report
  void tutor.prepare(resolved === 'translate' ? translationBody(body) : body, { level, lang: explainIn }, resolved).catch((e) => logPrimeFailure('chat', e));
}

export const useChat = create<ChatState>()(
  persist(
    (set, get) => {
      const patch = (id: string, p: Partial<TutorMessage>) =>
        set((s) => ({ messages: s.messages.map((m) => (m.id === id && m.role === 'tutor' ? { ...m, ...p } : m)) }));

      return {
        messages: [],
        busy: false,
        stop: () => controller?.abort(),
        clear: () => {
          controller?.abort();
          set({ messages: [], busy: false });
        },
        send: async (raw, mode, shown) => {
          const text = raw.trim();
          if (!text || get().busy) return;
          const { resolved, body: typed } = resolveMode(text, mode);
          const { level, explainIn } = useSettings.getState();
          const app = getLanguage();
          // with translation on, the conversation reads in the app language on both sides
          const learner: LearnerMessage = { id: uid(), role: 'learner', text: shown?.trim() && translating(app) ? shown.trim() : text, mode: resolved };
          const id = uid();
          const placeholder: TutorMessage = {
            id,
            role: 'tutor',
            kind: resolved === 'check' ? 'correction' : resolved === 'translate' ? 'translation' : 'answer',
            status: 'thinking',
            text: '',
            lang: explainIn,
          };
          set((s) => ({ messages: [...s.messages, learner, placeholder].slice(-80), busy: true }));
          // a question in a language the model does not read (Polish, Ukrainian, Turkish, Arabic) goes to the
          // tutor in English, translated on this phone with the German it quotes kept verbatim; the learner's
          // bubble keeps what they typed
          let body = typed;
          if (resolved !== 'check' && translating(app) && needsQuestionTranslation(typed, app)) {
            try {
              body = await translateQuestion(typed, app, (s) => translateText(s, app, 'en'));
            } catch {
              // Never ask the tutor in a language it does not read: the question goes nowhere instead of going
              // out untranslated. The optimistic pair comes back off and the caller restores the draft, so
              // Try again is one tap and the reply can never answer a different sentence than the one shown.
              set((s) => ({ messages: s.messages.slice(0, -2), busy: false }));
              throw new QuestionTranslationError(typed);
            }
          }
          // a translation comes back in the other language
          const lang = resolved === 'check' ? explainIn : resolved === 'translate' ? (detectLang(translationBody(body), explainIn) === 'de' ? translationTarget(explainIn) : 'de') : detectLang(body, explainIn);
          patch(id, { lang });
          controller = new AbortController();
          const ctx = {
            level,
            lang: explainIn,
            signal: controller.signal,
            onText: (full: string) => patch(id, { text: full, status: 'streaming' }),
          };
          try {
            if (resolved === 'check') {
              const r = await tutor.correct(body, ctx);
              patch(id, {
                status: controller.signal.aborted ? 'stopped' : 'done',
                text: r.text,
                original: body,
                corrected: r.correction.corrected,
                unchanged: r.correction.unchanged,
                explanation: r.correction.explanation,
                diff: r.diff,
                checks: r.checks,
                rules: r.rules,
              });
              useProgress.getState().record('check', r.correction.unchanged);
            } else if (resolved === 'translate') {
              const r = await tutor.translate(translationBody(body), ctx);
              patch(id, { status: controller.signal.aborted ? 'stopped' : 'done', text: r.translation, checks: r.checks, lang: r.to });
              useProgress.getState().record('ask');
            } else {
              const r = await tutor.ask(body, ctx);
              patch(id, { status: controller.signal.aborted ? 'stopped' : 'done', text: r.text, checks: r.checks, fact: r.fact, cardKey: r.card?.key ?? null });
              useProgress.getState().record('ask');
            }
          } catch (e) {
            patch(id, { status: 'error', error: describeError(e) });
          } finally {
            controller = null;
            set({ busy: false });
          }
        },
      };
    },
    {
      name: 'eszett.chat',
      storage,
      version: 1,
      partialize: ({ messages }) => ({
        // an answer that was still streaming when the app closed is kept as far as it got
        messages: messages.map((m) => (m.role === 'tutor' && (m.status === 'thinking' || m.status === 'streaming') ? { ...m, status: 'stopped' as const } : m)),
      }),
    },
  ),
);
