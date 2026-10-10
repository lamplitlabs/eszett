// Which version a learner should move to, from the release file we publish (see release.json at the repository
// root). Pure: tested in node; src/features/release.ts fetches and stores the file.

/** One store listing (the file has one per platform). */
export interface ReleaseChannel {
  /** The version in the store, e.g. "1.1.0". */
  version: string;
  /** Versions below this must update before they can go on (a broken model contract, say). */
  minimum?: string;
  /** The store page "Update" opens. */
  storeUrl: string;
  /** What is new, one string or one per language code. */
  notes?: string | Record<string, string>;
}

export interface ReleaseInfo {
  android?: ReleaseChannel;
  ios?: ReleaseChannel;
  web?: ReleaseChannel;
}

/** Numeric dot-separated versions: 1.0.10 > 1.0.9; a missing part counts as 0; "-beta" suffixes are ignored. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const parts = (v: string) =>
    String(v)
      .split('-')[0]
      .split('.')
      .map((p) => Number.parseInt(p, 10) || 0);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export interface UpdateVerdict {
  /** A newer version is in the store. */
  available: boolean;
  /** The installed version is below the minimum: the card cannot be dismissed. */
  required: boolean;
  version: string | null;
  storeUrl: string | null;
  notes: string | null;
}

const NONE: UpdateVerdict = { available: false, required: false, version: null, storeUrl: null, notes: null };

/** What the learner should see for the installed `current` version on `platform`, in language `lang`. */
export function evaluateRelease(info: ReleaseInfo | null | undefined, platform: string, current: string, lang = 'en'): UpdateVerdict {
  const channel = info?.[platform as keyof ReleaseInfo];
  if (!channel || typeof channel.version !== 'string' || typeof channel.storeUrl !== 'string') return NONE;
  if (compareVersions(current, channel.version) >= 0) return NONE;
  const required = typeof channel.minimum === 'string' && compareVersions(current, channel.minimum) < 0;
  const notes = typeof channel.notes === 'string' ? channel.notes : (channel.notes?.[lang] ?? channel.notes?.en ?? null);
  return { available: true, required, version: channel.version, storeUrl: channel.storeUrl, notes };
}

/** True for an object whose platform entries carry a version; plain-string members (a "_comment") are ignored. */
export function isReleaseInfo(x: unknown): x is ReleaseInfo {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  return Object.values(x as Record<string, unknown>).every((c) => !c || typeof c === 'string' || (typeof c === 'object' && typeof (c as ReleaseChannel).version === 'string'));
}
