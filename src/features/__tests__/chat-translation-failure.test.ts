// A failed question translation must never reach the tutor in a language it does not read: the learner gets a
// retryable error (their draft back, plus a Try again banner) instead of watching untranslated words go out as
// if they were English. These tests drive the real useChat store with a translator that fails once.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Native modules are mocked so the store module loads under node (same recipe as src/model/__tests__/runtime.test.ts).
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('@react-native-async-storage/async-storage', () => {
  const mem = new Map<string, string>();
  return {
    default: {
      getItem: async (k: string) => mem.get(k) ?? null,
      setItem: async (k: string, v: string) => void mem.set(k, v),
      removeItem: async (k: string) => void mem.delete(k),
    },
  };
});
vi.mock('expo-file-system', () => {
  class FakeFile {
    name = '';
    size = 0;
    exists = true;
    uri = '';
  }
  class FakeDir {
    exists = false;
    create() {}
    list() {
      return [];
    }
  }
  return { Directory: FakeDir, File: FakeFile, Paths: { document: '/tmp' }, DownloadTask: class {} };
});
vi.mock('llama.rn', () => ({
  initLlama: vi.fn(),
  loadLlamaModelInfo: vi.fn(async () => ({})),
}));

// The model runtime is mocked: the tutor is ready, and the whole point of this test is what happens before a
// word is ever sent to it. Importing the real runtime pulls expo's winter runtime, which cannot load under node.
vi.mock('@/model/runtime', () => ({
  describeError: (e: unknown) => String(e),
  isReady: () => true,
  logPrimeFailure: () => {},
  tutor: { prepare: async () => {} },
}));

// The translator fails: no untranslated question may reach the tutor. Mock @/mt whole — the real module binds
// the native translator through modules/eszett-translate, which imports 'expo' (winter runtime) and cannot load
// under node. The pure helpers (translateQuestion, needsQuestionTranslation, …) come from their source modules
// (imported below, they pull no native code) so send() runs the real question-masking path.
import * as languages from '@/mt/languages';
import * as markdown from '@/mt/markdown';
import * as question from '@/mt/question';

// Hoist-safe: vi.mock factories are hoisted above imports, so the failing-translator mock lives in vi.hoisted.
const { translateText } = vi.hoisted(() => ({
  translateText: vi.fn(async () => {
    throw new Error('translator offline');
  }),
}));
vi.mock('@/mt', () => ({
  isMtLang: languages.isMtLang,
  MT_LANGUAGES: languages.MT_LANGUAGES,
  needsQuestionTranslation: languages.needsQuestionTranslation,
  readLangFor: languages.readLangFor,
  readsEnglish: markdown.readsEnglish,
  translateMarkdown: markdown.translateMarkdown,
  maskQuestion: question.maskQuestion,
  translateQuestion: question.translateQuestion,
  translating: () => true,
  translateAnswer: translateText,
  translateText,
  useTranslator: () => ({ status: 'ready', retry: async () => {} }),
  useTranslated: (text: string | undefined) => ({ text, state: 'ready' }),
}));

import { QuestionTranslationError, useChat } from '@/features/chat';
import { setLanguage } from '@/i18n';
import { useSettings } from '@/state/settings';

const QUESTION = 'Jak się mówi po niemiecku "w rzeczywistości"?';

// Put the app into the one state where question translation runs: the app reads Polish (one of the languages
// the model cannot write, so it is machine-translated), the tutor explains in English, and on-phone
// translation is on.
function arm() {
  useChat.setState({ messages: [], busy: false });
  useSettings.setState({ language: 'pl', explainIn: 'en', explainInPinned: false, translate: true });
  setLanguage('pl');
  translateText.mockClear();
}

describe('question translation failure', () => {
  beforeEach(arm);

  it('throws QuestionTranslationError carrying the question, and reverts the optimistic pair', async () => {
    await expect(useChat.getState().send(QUESTION, 'ask')).rejects.toBeInstanceOf(QuestionTranslationError);
    // The untranslated question was never sent: no message holds it, and the store is idle again for a retry.
    const { messages, busy } = useChat.getState();
    expect(busy).toBe(false);
    expect(messages).toEqual([]);
  });

  it('the error carries the exact typed text so the screen can restore the draft for Try again', async () => {
    const err = await useChat
      .getState()
      .send(QUESTION, 'ask')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(QuestionTranslationError);
    expect(err).toBeInstanceOf(Error);
    expect((err as QuestionTranslationError).question).toBe(QUESTION);
  });
});
