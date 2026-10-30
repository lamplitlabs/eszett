// The learner's account, when the build has one (EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY and EXPO_PUBLIC_API_BASE):
// Clerk keeps the session on the phone (expo-secure-store), and this store mirrors what the screens need -
// signed in or not, the e-mail, a way to get the session token for the server - so no screen depends on Clerk
// directly and a build without a key behaves exactly as before (no account, public downloads). The bridge
// component below sits inside the ClerkProvider and copies Clerk's state into the store.

import { useAuth, useUser } from '@clerk/clerk-expo';
import { useEffect } from 'react';
import { create } from 'zustand';

import { accountsEnabled, deleteAccount, getMe, registerTokenProvider, type Me } from '@/features/api';

export interface AccountState {
  /** The build carries a Clerk key and the server address. */
  enabled: boolean;
  /** Clerk has read the stored session (or found none). */
  loaded: boolean;
  signedIn: boolean;
  userId: string | null;
  email: string | null;
  /** What the server knows about this learner; null until fetched. */
  me: Me | null;
  meAt: number;
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
  /** Fetches /v1/me (at most once a minute unless forced); quiet on failure. */
  refreshMe: (force?: boolean) => Promise<Me | null>;
  /** Deletes the account on the server and signs out; throws when the server refused. */
  deleteAccount: () => Promise<void>;
  set: (patch: Partial<Pick<AccountState, 'loaded' | 'signedIn' | 'userId' | 'email' | 'getToken' | 'signOut'>>) => void;
}

export const useAccount = create<AccountState>()((set, get) => ({
  enabled: accountsEnabled(),
  loaded: !accountsEnabled(),
  signedIn: false,
  userId: null,
  email: null,
  me: null,
  meAt: 0,
  getToken: async () => null,
  signOut: async () => undefined,
  refreshMe: async (force = false) => {
    const s = get();
    if (!s.enabled || !s.signedIn) return null;
    if (!force && s.me && Date.now() - s.meAt < 60_000) return s.me;
    try {
      const token = await s.getToken();
      if (!token) return null;
      const me = await getMe(token);
      set({ me, meAt: Date.now() });
      return me;
    } catch (e) {
      console.warn('[account] /v1/me failed:', e);
      return null;
    }
  },
  deleteAccount: async () => {
    const s = get();
    const token = await s.getToken();
    if (!token) throw new Error('no session');
    await deleteAccount(token);
    // Clerk no longer knows the user; signing out clears the cached session on this phone
    await s.signOut().catch(() => undefined);
    set({ me: null, meAt: 0, signedIn: false, userId: null, email: null });
  },
  set: (patch) => set(patch),
}));

registerTokenProvider(() => useAccount.getState().getToken());

/**
 * Copies Clerk's auth state into the store. Rendered by the root layout inside the ClerkProvider, only when the
 * build has a key; Clerk's hooks are used here and on the sign-in screen only.
 */
export function AccountBridge() {
  const { isLoaded, isSignedIn, userId, getToken, signOut } = useAuth();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const set = useAccount((s) => s.set);
  useEffect(() => {
    set({
      loaded: isLoaded,
      signedIn: Boolean(isSignedIn),
      userId: userId ?? null,
      email,
      getToken: async () => {
        try {
          return (await getToken()) ?? null;
        } catch {
          return null;
        }
      },
      signOut: async () => {
        await signOut();
        useAccount.setState({ me: null, meAt: 0 });
      },
    });
  }, [email, getToken, isLoaded, isSignedIn, set, signOut, userId]);
  const signedIn = Boolean(isSignedIn);
  const refreshMe = useAccount((s) => s.refreshMe);
  useEffect(() => {
    if (signedIn) void refreshMe(true);
  }, [refreshMe, signedIn]);
  return null;
}
