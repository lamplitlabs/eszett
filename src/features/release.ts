// Is there a newer Eszett in the store? The app reads a small JSON we publish next to the model files (see
// release.json at the repository root) at most once a day and shows a card the learner can dismiss; below the
// `minimum` version the card cannot be dismissed. Nothing is ever downloaded or installed from here: "Update"
// opens the store page. The pure parts (version comparison, evaluation) are testable in node.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { storage } from '@/state/storage';

import { isReleaseInfo, type ReleaseInfo } from './releaseRules';

export { compareVersions, evaluateRelease, type ReleaseChannel, type ReleaseInfo, type UpdateVerdict } from './releaseRules';

export const RELEASE_URL = 'https://lichtgwcst001.blob.core.windows.net/models/eszett/release.json';
export const CHECK_EVERY_MS = 24 * 3_600_000;
const FETCH_TIMEOUT_MS = 8_000;

interface ReleaseState {
  info: ReleaseInfo | null;
  checkedAt: number;
  /** The version the learner tapped "Later" on; the card returns for the next one. */
  dismissed: string | null;
  set: (patch: Partial<Pick<ReleaseState, 'info' | 'checkedAt' | 'dismissed'>>) => void;
}

export const useRelease = create<ReleaseState>()(
  persist((set) => ({ info: null, checkedAt: 0, dismissed: null, set: (patch) => set(patch) }), {
    name: 'eszett.release',
    storage,
    version: 1,
    partialize: ({ info, checkedAt, dismissed }) => ({ info, checkedAt, dismissed }),
  }),
);

/** What a check found: the file (fresh `info`), no file published, a network/format failure, or nothing to do yet. */
export type CheckOutcome = 'fetched' | 'unpublished' | 'failed' | 'skipped';

let inFlight: Promise<CheckOutcome> | null = null;

/**
 * Fetches the release file when the last check is older than a day (or `force`). Failures are silent: a
 * learner without a connection simply sees no card; the outcome is for the manual check in Me, which says
 * what happened.
 */
export function checkForUpdate(opts: { force?: boolean; url?: string; now?: number; fetchImpl?: typeof fetch } = {}): Promise<CheckOutcome> {
  const now = opts.now ?? Date.now();
  const { checkedAt } = useRelease.getState();
  if (!opts.force && now - checkedAt < CHECK_EVERY_MS) return Promise.resolve('skipped');
  if (inFlight) return inFlight;
  const doFetch = opts.fetchImpl ?? fetch;
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
  inFlight = (async (): Promise<CheckOutcome> => {
    try {
      // the blob is served with max-age=300; a learner who taps "check" wants the current file, not the cache's
      const headers: Record<string, string> = { accept: 'application/json' };
      if (opts.force) headers['cache-control'] = 'no-cache';
      const res = await doFetch(opts.url ?? RELEASE_URL, { signal: controller?.signal, headers });
      if (!res.ok) {
        // no file published (yet): look again tomorrow, not at every start
        useRelease.getState().set({ checkedAt: now });
        return 'unpublished';
      }
      const json: unknown = await res.json();
      if (!isReleaseInfo(json)) return 'failed';
      useRelease.getState().set({ info: json, checkedAt: now });
      return 'fetched';
    } catch {
      // offline, blocked or malformed: try again tomorrow
      return 'failed';
    } finally {
      if (timer) clearTimeout(timer);
      inFlight = null;
    }
  })();
  return inFlight;
}
