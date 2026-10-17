import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CHECK_EVERY_MS, checkForUpdate, useRelease } from '../release';

// an in-memory AsyncStorage so the persisted store can be imported under node (vi.mock is hoisted above the imports)
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


const info = { android: { version: '9.9.9', storeUrl: 'https://play.google.com/store/apps/details?id=com.lamplitlabs.eszett' } };
const T = Date.UTC(2026, 9, 7); // checkedAt 0 means "never": a real clock is far more than a day past it
const respond = (status: number, body: unknown) => (async () => ({ ok: status < 400, status, json: async () => body })) as unknown as typeof fetch;

describe('checkForUpdate', () => {
  beforeEach(() => useRelease.getState().set({ info: null, checkedAt: 0, dismissed: null }));

  it('stores the file and reports fetched', async () => {
    expect(await checkForUpdate({ now: T, fetchImpl: respond(200, info) })).toBe('fetched');
    expect(useRelease.getState().info).toEqual(info);
    expect(useRelease.getState().checkedAt).toBe(T);
  });

  it('skips a check made within a day unless forced', async () => {
    const fetchImpl = vi.fn(respond(200, info)) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
    useRelease.getState().set({ checkedAt: T });
    expect(await checkForUpdate({ now: T + CHECK_EVERY_MS - 1, fetchImpl })).toBe('skipped');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await checkForUpdate({ now: T + CHECK_EVERY_MS - 1, fetchImpl, force: true })).toBe('fetched');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // a forced check asks for the current file, past any HTTP cache
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ headers: { 'cache-control': 'no-cache' } });
  });

  it('remembers an unpublished file for a day and keeps the old info', async () => {
    useRelease.getState().set({ info });
    expect(await checkForUpdate({ now: T, fetchImpl: respond(404, null) })).toBe('unpublished');
    expect(useRelease.getState().info).toEqual(info);
    expect(useRelease.getState().checkedAt).toBe(T);
  });

  it('reports a failure without touching the stored state', async () => {
    const boom = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await checkForUpdate({ now: T, fetchImpl: boom })).toBe('failed');
    expect(await checkForUpdate({ now: T, fetchImpl: respond(200, { nonsense: [1, 2] }) })).toBe('failed');
    expect(useRelease.getState().checkedAt).toBe(0);
  });
});
