// Wraps the app in Clerk when the build has a publishable key; otherwise renders the children as they are. The
// token cache keeps the session in expo-secure-store, so a learner signs in once per phone.

import { ClerkProvider } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import type { ReactNode } from 'react';

import { AccountBridge } from '@/features/account';
import { CLERK_PUBLISHABLE_KEY, accountsEnabled } from '@/features/api';

export function AccountProvider({ children }: { children: ReactNode }) {
  if (!accountsEnabled()) return <>{children}</>;
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <AccountBridge />
      {children}
    </ClerkProvider>
  );
}
