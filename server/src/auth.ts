// Who is asking: the Clerk session token the app sends as "Authorization: Bearer <token>", verified with the
// Clerk secret key (networkless once Clerk's JWKS is cached by the SDK). Without a key nothing is verified and
// every request is refused: the server fails closed.

import { createClerkClient, verifyToken } from '@clerk/backend';
import type { HttpRequest } from '@azure/functions';

import { config } from './config';

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 503 = 401,
  ) {
    super(message);
  }
}

export interface Caller {
  userId: string;
  /** The session id, for the download log. */
  sessionId: string | null;
}

/** The bearer token of a request, or null. */
export function bearerOf(req: HttpRequest): string | null {
  const header = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/** The signed-in learner behind a request; throws AuthError (401 without a valid token, 503 while Clerk is not configured). */
export async function requireCaller(req: HttpRequest): Promise<Caller> {
  if (!config.clerkSecretKey) throw new AuthError('sign-in is not configured on this server yet', 503);
  const token = bearerOf(req);
  if (!token) throw new AuthError('sign in to continue');
  try {
    const payload = await verifyToken(token, {
      secretKey: config.clerkSecretKey,
      authorizedParties: config.clerkAuthorizedParties.length ? config.clerkAuthorizedParties : undefined,
      // phones' clocks drift; a minute of leeway keeps a fresh token from being refused as "not yet valid"
      clockSkewInMs: 60_000,
    });
    if (!payload.sub) throw new AuthError('the token names no user');
    return { userId: payload.sub, sessionId: typeof payload.sid === 'string' ? payload.sid : null };
  } catch (e) {
    if (e instanceof AuthError) throw e;
    throw new AuthError('the sign-in token was not accepted; sign in again');
  }
}

/** Deletes the learner's Clerk user (e-mail address, sessions, sign-in history); quiet when Clerk already has no such user. */
export async function deleteClerkUser(userId: string): Promise<void> {
  if (!config.clerkSecretKey) throw new AuthError('sign-in is not configured on this server yet', 503);
  const clerk = createClerkClient({ secretKey: config.clerkSecretKey });
  try {
    await clerk.users.deleteUser(userId);
  } catch (e) {
    if ((e as { status?: number }).status !== 404) throw e;
  }
}

/** The Clerk user id behind an e-mail address, or null when no such user exists (the owner's grants are by e-mail). */
export async function findClerkUserByEmail(email: string): Promise<string | null> {
  if (!config.clerkSecretKey) throw new AuthError('sign-in is not configured on this server yet', 503);
  const clerk = createClerkClient({ secretKey: config.clerkSecretKey });
  const page = await clerk.users.getUserList({ emailAddress: [email.trim().toLowerCase()], limit: 1 });
  return page.data[0]?.id ?? null;
}
