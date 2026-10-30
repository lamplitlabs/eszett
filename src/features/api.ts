// The app's side of the small server (server/ in this repository): download links for the tutor model, the
// learner's entitlement, purchases and codes. Everything here is pure or takes its fetch and token as arguments,
// so the decisions - what each answer means for the app - are tested without a network. Without EXPO_PUBLIC_API_BASE
// (a development build) the app tries the plain URLs of src/model/manifest.ts, which only work with a custom
// model source: the published model files are private and reachable through the server's links alone.

export const API_BASE = (process.env.EXPO_PUBLIC_API_BASE ?? '').trim().replace(/\/+$/, '');
export const CLERK_PUBLISHABLE_KEY = (process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '').trim();

/** True when the build carries both the server address and the Clerk key: downloads go through the server. */
export const accountsEnabled = (): boolean => Boolean(API_BASE && CLERK_PUBLISHABLE_KEY);

// The session token comes from the account module (src/features/account.tsx), which registers itself here, so
// the model runtime can ask for a token without importing Clerk (the tests load the runtime in plain Node).
let tokenProvider: () => Promise<string | null> = async () => null;
export const registerTokenProvider = (provider: () => Promise<string | null>) => {
  tokenProvider = provider;
};
/** The signed-in learner's session token, or null without an account or a session. */
export const sessionToken = (): Promise<string | null> => tokenProvider();

export type Plan = 'none' | 'full';

/** What the server knows about the signed-in learner (GET /v1/me, and the body of every grant). */
export interface Me {
  plan: Plan;
  purchasedAt: number | null;
  updatesUntil: number | null;
  updatesLeftDays: number;
  firstDownloadUsed: boolean;
  downloaded: string[];
  gifts: number;
  /** The student the server currently serves. */
  student: string;
  canDownload: boolean;
  reason: 'first' | 'owned' | 'full' | 'needs-full' | 'needs-fresh';
  files?: string[];
}

export interface DownloadGrant {
  url: string;
  expiresAt: number;
  file: string;
  bytes: number;
  sha256: string;
}

/** What the app should do after asking for a link. */
export type LinkOutcome =
  | { kind: 'ok'; grant: DownloadGrant }
  /** No session: open sign-in, then ask again. */
  | { kind: 'sign-in' }
  /** The learner needs full access (or a fresh tutor): open the unlock screen with the reason. */
  | { kind: 'entitlement'; reason: 'needs-full' | 'needs-fresh'; me: Me }
  /** The server is not set up (no Clerk key yet) or could not be reached: the model files are private, so show the message and let the learner try again later. */
  | { kind: 'unavailable'; message: string; status: number | null };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

type Fetch = typeof fetch;

async function call<T>(path: string, token: string | null, init: RequestInit, fetchImpl: Fetch, timeoutMs = 15_000): Promise<T> {
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetchImpl(`${API_BASE}${path}`, {
      ...init,
      signal: controller?.signal,
      headers: { 'content-type': 'application/json', accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
    });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      body = {};
    }
    if (!res.ok) throw new ApiError(res.status, typeof body.error === 'string' ? body.error : 'error', typeof body.message === 'string' ? body.message : `HTTP ${res.status}`, body);
    return body as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const getMe = (token: string, fetchImpl: Fetch = fetch) => call<Me>('/v1/me', token, { method: 'GET' }, fetchImpl);

/** Asks for a link to `file`; never throws: the outcome says what to do. */
export async function requestDownloadLink(file: string, token: string | null, fetchImpl: Fetch = fetch): Promise<LinkOutcome> {
  if (!token) return { kind: 'sign-in' };
  try {
    const grant = await call<DownloadGrant>('/v1/download-url', token, { method: 'POST', body: JSON.stringify({ file }) }, fetchImpl);
    return { kind: 'ok', grant };
  } catch (e) {
    return linkOutcomeOfError(e);
  }
}

/** The outcome for a failed link request: 401 sign in, 402 entitlement, anything else unavailable. */
export function linkOutcomeOfError(e: unknown): LinkOutcome {
  if (e instanceof ApiError) {
    if (e.status === 401) return { kind: 'sign-in' };
    if (e.status === 402 && (e.code === 'needs-full' || e.code === 'needs-fresh')) return { kind: 'entitlement', reason: e.code, me: e.body as unknown as Me };
    return { kind: 'unavailable', message: e.message, status: e.status };
  }
  return { kind: 'unavailable', message: e instanceof Error ? e.message : String(e), status: null };
}

export interface PurchaseReport {
  platform: 'android' | 'ios';
  productId: string;
  token: string;
}

/** Tells the server about a store purchase; the server verifies it with the store and answers with the entitlement. */
export const reportPurchase = (report: PurchaseReport, token: string, fetchImpl: Fetch = fetch) => call<Me & { recorded: boolean; gift: string | null }>('/v1/purchase', token, { method: 'POST', body: JSON.stringify(report) }, fetchImpl);

/** Deletes the account on the server and at Clerk: the entitlement, the download log, the e-mail address. */
export const deleteAccount = (token: string, fetchImpl: Fetch = fetch) => call<{ deleted: boolean }>('/v1/me', token, { method: 'DELETE' }, fetchImpl);

/** Redeems a code, or asks for one from the pay-it-forward pool. */
export const redeemCode = (code: string | null, token: string, fetchImpl: Fetch = fetch) => call<Me & { code: string }>('/v1/redeem', token, { method: 'POST', body: JSON.stringify(code ? { code } : { fromPool: true }) }, fetchImpl);
