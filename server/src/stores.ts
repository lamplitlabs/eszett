// Asking the stores whether a purchase is real. Google Play: the Android Publisher API with a service account
// (a JWT signed with its key, swapped for an access token). Apple: the App Store Server API with an ES256 JWT.
// Both are optional until their credentials are set; without them a purchase cannot be verified and is refused
// (unless TRUST_UNVERIFIED_PURCHASES is set, for development only).

import { createPrivateKey, createSign } from 'node:crypto';

import { config } from './config';

export interface StorePurchase {
  platform: 'android' | 'ios';
  productId: string;
  /** Android: the purchase token; iOS: the transaction id. */
  token: string;
}

export type Verification =
  | { ok: true; transactionId: string; productId: string }
  | { ok: false; reason: 'not-configured' | 'invalid' | 'store-error' | 'wrong-product' | 'not-purchased'; detail?: string };

const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

function signJwt(header: object, payload: object, key: string, algorithm: 'RS256' | 'ES256'): string {
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = createSign(algorithm === 'RS256' ? 'RSA-SHA256' : 'SHA256');
  signer.update(signingInput);
  const keyObject = createPrivateKey(key);
  const signature = algorithm === 'ES256' ? signer.sign({ key: keyObject, dsaEncoding: 'ieee-p1363' }) : signer.sign(keyObject);
  return `${signingInput}.${b64url(signature)}`;
}

// ---------------------------------------------------------------------------------------------- Google Play

let googleToken: { token: string; expiresAt: number } | null = null;

async function googleAccessToken(): Promise<string> {
  if (googleToken && googleToken.expiresAt - Date.now() > 60_000) return googleToken.token;
  const sa = JSON.parse(config.googleServiceAccountJson) as { client_email: string; private_key: string; token_uri?: string };
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt(
    { alg: 'RS256', typ: 'JWT' },
    { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: sa.token_uri ?? 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 },
    sa.private_key,
    'RS256',
  );
  const res = await fetch(sa.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
  });
  if (!res.ok) throw new Error(`google token: HTTP ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  googleToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function verifyGoogle(p: StorePurchase): Promise<Verification> {
  if (!config.googleServiceAccountJson) return { ok: false, reason: 'not-configured' };
  try {
    const token = await googleAccessToken();
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(config.androidPackage)}/purchases/products/${encodeURIComponent(p.productId)}/tokens/${encodeURIComponent(p.token)}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (res.status === 404 || res.status === 400) return { ok: false, reason: 'invalid', detail: `HTTP ${res.status}` };
    if (!res.ok) return { ok: false, reason: 'store-error', detail: `HTTP ${res.status}` };
    const data = (await res.json()) as { purchaseState?: number; orderId?: string; productId?: string; acknowledgementState?: number };
    // purchaseState 0 = purchased, 1 = canceled, 2 = pending
    if (data.purchaseState !== 0) return { ok: false, reason: 'not-purchased' };
    if (data.productId && data.productId !== p.productId) return { ok: false, reason: 'wrong-product' };
    return { ok: true, transactionId: data.orderId ?? p.token, productId: p.productId };
  } catch (e) {
    return { ok: false, reason: 'store-error', detail: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------------------------- App Store

function appleJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({ alg: 'ES256', kid: config.appleKeyId, typ: 'JWT' }, { iss: config.appleIssuerId, iat: now, exp: now + 1800, aud: 'appstoreconnect-v1', bid: config.appleBundleId }, config.applePrivateKey, 'ES256');
}

/** The payload of a JWS from Apple's own API (the transport is TLS to Apple; the chain is not re-verified here). */
function jwsPayload<T>(jws: string): T | null {
  try {
    const [, payload] = jws.split('.');
    return JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as T;
  } catch {
    return null;
  }
}

async function verifyApple(p: StorePurchase): Promise<Verification> {
  if (!config.appleIssuerId || !config.appleKeyId || !config.applePrivateKey) return { ok: false, reason: 'not-configured' };
  try {
    const host = config.appleSandbox ? 'https://api.storekit-sandbox.itunes.apple.com' : 'https://api.storekit.itunes.apple.com';
    const res = await fetch(`${host}/inApps/v1/transactions/${encodeURIComponent(p.token)}`, { headers: { authorization: `Bearer ${appleJwt()}` } });
    if (res.status === 404) return { ok: false, reason: 'invalid' };
    if (!res.ok) return { ok: false, reason: 'store-error', detail: `HTTP ${res.status}` };
    const data = (await res.json()) as { signedTransactionInfo?: string };
    const info = data.signedTransactionInfo ? jwsPayload<{ productId?: string; transactionId?: string; revocationDate?: number; bundleId?: string }>(data.signedTransactionInfo) : null;
    if (!info) return { ok: false, reason: 'invalid' };
    if (info.bundleId && info.bundleId !== config.appleBundleId) return { ok: false, reason: 'invalid' };
    if (info.productId !== p.productId) return { ok: false, reason: 'wrong-product' };
    if (info.revocationDate) return { ok: false, reason: 'not-purchased' };
    return { ok: true, transactionId: info.transactionId ?? p.token, productId: p.productId };
  } catch (e) {
    return { ok: false, reason: 'store-error', detail: e instanceof Error ? e.message : String(e) };
  }
}

/** Asks the right store; in development, with TRUST_UNVERIFIED_PURCHASES, an unconfigured store is taken at its word. */
export async function verifyPurchase(p: StorePurchase): Promise<Verification> {
  const result = p.platform === 'android' ? await verifyGoogle(p) : await verifyApple(p);
  if (!result.ok && result.reason === 'not-configured' && config.trustUnverifiedPurchases) return { ok: true, transactionId: `unverified:${p.platform}:${p.token}`, productId: p.productId };
  return result;
}
