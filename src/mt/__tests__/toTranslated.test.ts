import { describe, expect, it, vi } from 'vitest';

// toTranslated lives beside the hook, which pulls in the native translator module; that is absent under Node.
vi.mock('expo', () => ({ requireOptionalNativeModule: () => null }));

import { toTranslated } from '../useTranslated';

// The chat and scene-gloss screens read `failed` to show a retryable error instead of falling back to raw English;
// these lock that contract down so a failed translation can never be shown as if it were the gloss.
describe('toTranslated', () => {
  it('flags a failed translation and keeps the source out of the translated field', () => {
    const retry = vi.fn();
    const t = toTranslated({
      text: 'Dative articles follow these prepositions.',
      active: true,
      enabled: true,
      done: null,
      failedSource: 'Dative articles follow these prepositions.',
      retry,
    });
    expect(t.failed).toBe(true);
    expect(t.translated).toBe(false);
    expect(t.available).toBe(false);
    // the raw English source is the text the screen shows, but `failed` tells it to render the retryable error instead
    expect(t.text).toBe('Dative articles follow these prepositions.');
    expect(t.retry).toBe(retry);
  });

  it('clears the failure once the source changes or a retry succeeds', () => {
    // a new attempt (different source) is not a failure of the old one
    const next = toTranslated({
      text: 'A different gloss now.',
      active: true,
      enabled: true,
      done: null,
      failedSource: 'Dative articles follow these prepositions.',
      retry: () => undefined,
    });
    expect(next.failed).toBe(false);
    // and a finished translation after retry reads as translated, not failed
    const done = toTranslated({
      text: 'Dative articles follow these prepositions.',
      active: true,
      enabled: true,
      done: {
        source: 'Dative articles follow these prepositions.',
        text: 'Dativartikel folgen diesen Präpositionen.',
        available: true,
      },
      failedSource: null,
      retry: () => undefined,
    });
    expect(done.failed).toBe(false);
    expect(done.translated).toBe(true);
    expect(done.text).toBe('Dativartikel folgen diesen Präpositionen.');
  });
});
