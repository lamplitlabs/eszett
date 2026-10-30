import { describe, expect, it, vi } from 'vitest';

import { ApiError, linkOutcomeOfError, requestDownloadLink, shouldFallBackToPublic } from '../api';

const respond = (status: number, body: unknown) =>
  vi.fn(async () => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) }) as unknown as Response);

describe('asking the server for a download link', () => {
  it('returns the grant when the server says yes', async () => {
    const grant = { url: 'https://x/y.gguf?sig=1', expiresAt: 1, file: 'y.gguf', bytes: 2, sha256: 'ab' };
    const fetchImpl = respond(200, grant);
    const outcome = await requestDownloadLink('y.gguf', 'tok', fetchImpl as unknown as typeof fetch);
    expect(outcome).toEqual({ kind: 'ok', grant });
    const [, init] = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit]);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
    expect(init.body).toBe(JSON.stringify({ file: 'y.gguf' }));
  });

  it('asks for sign-in without a token or on 401', async () => {
    expect(await requestDownloadLink('y.gguf', null)).toEqual({ kind: 'sign-in' });
    expect(await requestDownloadLink('y.gguf', 'old', respond(401, { error: 'unauthorized', message: 'sign in' }) as unknown as typeof fetch)).toEqual({ kind: 'sign-in' });
  });

  it('turns 402 into the entitlement outcome with the server’s reason', async () => {
    const body = { error: 'needs-full', message: 'the new tutor comes with full access', plan: 'none', canDownload: false };
    const outcome = await requestDownloadLink('y.gguf', 'tok', respond(402, body) as unknown as typeof fetch);
    expect(outcome.kind).toBe('entitlement');
    if (outcome.kind === 'entitlement') {
      expect(outcome.reason).toBe('needs-full');
      expect(outcome.me.plan).toBe('none');
    }
  });

  it('falls back to the public URL only when the server is not set up or not answering', async () => {
    expect(shouldFallBackToPublic(linkOutcomeOfError(new ApiError(503, 'not-configured', 'later')))).toBe(true);
    expect(shouldFallBackToPublic(linkOutcomeOfError(new TypeError('Network request failed')))).toBe(true);
    expect(shouldFallBackToPublic(linkOutcomeOfError(new ApiError(500, 'server', 'oops')))).toBe(true);
    expect(shouldFallBackToPublic(linkOutcomeOfError(new ApiError(404, 'unknown-file', 'no such file')))).toBe(false);
    expect(shouldFallBackToPublic(linkOutcomeOfError(new ApiError(402, 'needs-full', 'pay')))).toBe(false);
    expect(shouldFallBackToPublic(linkOutcomeOfError(new ApiError(401, 'unauthorized', 'sign in')))).toBe(false);
  });
});
