// The store side of the one-time purchase (expo-iap over StoreKit 2 and Google Play Billing): connect, read the
// price, buy, restore, and finish every transaction the store hands back. The result of a purchase arrives through
// the store's listeners, not the request's return value; this module turns it into the record src/features/access.ts
// keeps. There is no server: a purchase the store reports as complete is taken at its word (the device verifies
// StoreKit's signed transaction itself), the same way the app trusts the rest of the phone.
import {
  ErrorCode,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  restorePurchases,
  type Purchase,
  type PurchaseError,
} from 'expo-iap';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { t } from '@/i18n';

import { useAccess } from './access';
import { PRODUCT_ID, purchaseRecordOf } from './accessRules';
import { useAccount } from './account';
import { accountsEnabled, reportPurchase, type Me } from './api';

export type StoreStatus = 'idle' | 'connecting' | 'ready' | 'unavailable';

/** Twelve more months of tutor models for someone who has full access (needs the server: the account carries it). */
export const FRESH_ID = 'eszett_fresh_tutor';
/** Full access for someone else: the server answers with a code for the pay-it-forward pool. */
export const GIFT_ID = 'eszett_gift';
export type ProductId = typeof PRODUCT_ID | typeof FRESH_ID | typeof GIFT_ID;
const ALL_PRODUCTS: ProductId[] = [PRODUCT_ID, FRESH_ID, GIFT_ID];
/** A short outcome for the sheet to word: the store is still confirming, a restore found the purchase, or found none. */
export type PurchaseNote = 'pending' | 'restored' | 'restoreNone';

export interface PurchasesState {
  status: StoreStatus;
  /** The store's own price line for full access ("4,99 €"), once fetched; null when the product is not listed. */
  price: string | null;
  /** The prices of every product the store lists, by id. */
  prices: Partial<Record<ProductId, string>>;
  busy: 'buy' | 'restore' | null;
  note: PurchaseNote | null;
  error: string | null;
  /** The code the server handed back for a gift bought just now, to show and share. */
  gift: string | null;
  connect: () => Promise<void>;
  buy: (product?: ProductId) => Promise<void>;
  restore: () => Promise<void>;
  /** Clears a note or error once the sheet has shown it. */
  settle: () => void;
}

let listening = false;
let connecting: Promise<void> | null = null;

const message = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && typeof (e as PurchaseError).message === 'string') return (e as PurchaseError).message;
  return String(e);
};

/**
 * Tells the server about a purchase when the build has accounts and the learner is signed in; the server asks the
 * store and records the entitlement (a gift comes back as a code). Quiet when it cannot: the store's own record
 * still unlocks the app on this phone, and a restore reports it again later.
 */
async function report(purchase: Purchase): Promise<(Me & { gift: string | null }) | null> {
  if (!accountsEnabled()) return null;
  const account = useAccount.getState();
  if (!account.signedIn) return null;
  try {
    const token = await account.getToken();
    if (!token) return null;
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    const storeToken = platform === 'android' ? (purchase.purchaseToken ?? '') : purchase.transactionId;
    if (!storeToken) return null;
    const me = await reportPurchase({ platform, productId: purchase.productId, token: storeToken }, token);
    useAccount.setState({ me, meAt: Date.now() });
    return me;
  } catch (e) {
    console.warn('[purchases] the server did not record the purchase:', e);
    return null;
  }
}

/** Keeps a purchase of one of our products and tells the store it has been delivered; true when it was ours and complete. */
async function adopt(purchase: Purchase): Promise<boolean> {
  if (!ALL_PRODUCTS.includes(purchase.productId as ProductId)) return false;
  if (purchase.purchaseState === 'pending') {
    usePurchases.setState({ busy: null, note: 'pending' });
    return false;
  }
  if (purchase.productId === PRODUCT_ID) {
    const record = purchaseRecordOf(purchase);
    if (!record) return false;
    useAccess.getState().setPurchase(record);
    void report(purchase);
    // Android refunds a purchase that is not acknowledged within three days; iOS replays an unfinished one at every start
    await finishTransaction({ purchase, isConsumable: false }).catch(() => undefined);
    return true;
  }
  // a fresh tutor or a gift lives on the account, not on the phone: the server must have it before the store is told
  const me = await report(purchase);
  if (!me) return false;
  if (purchase.productId === GIFT_ID && me.gift) usePurchases.setState({ gift: me.gift });
  await finishTransaction({ purchase, isConsumable: true }).catch(() => undefined);
  return true;
}

async function adoptAll(purchases: Purchase[] | null | undefined): Promise<boolean> {
  let found = false;
  for (const p of purchases ?? []) if (await adopt(p)) found = true;
  return found;
}

function listen() {
  if (listening) return;
  listening = true;
  purchaseUpdatedListener((purchase) => {
    void adopt(purchase).then((ours) => {
      if (ours) usePurchases.setState({ busy: null, error: null, note: null });
    });
  });
  purchaseErrorListener((error) => {
    if (error.code === ErrorCode.UserCancelled) {
      usePurchases.setState({ busy: null });
      return;
    }
    if (error.code === ErrorCode.AlreadyOwned) {
      // bought before on this account: the store will not sell it twice, so fetch what it has
      void usePurchases.getState().restore();
      return;
    }
    usePurchases.setState({ busy: null, error: t('unlock.errFailed', { reason: message(error) }) });
  });
}

export const usePurchases = create<PurchasesState>()((set, get) => ({
  status: 'idle',
  price: null,
  prices: {},
  busy: null,
  note: null,
  error: null,
  gift: null,

  connect: () => {
    if (get().status === 'ready') return Promise.resolve();
    if (connecting) return connecting;
    set({ status: 'connecting' });
    connecting = (async () => {
      try {
        listen();
        await initConnection();
        const products = await fetchProducts({ skus: ALL_PRODUCTS, type: 'in-app' });
        const prices: Partial<Record<ProductId, string>> = {};
        for (const p of products ?? []) if (ALL_PRODUCTS.includes(p.id as ProductId) && p.displayPrice) prices[p.id as ProductId] = p.displayPrice;
        set({ status: 'ready', price: prices[PRODUCT_ID] ?? null, prices });
      } catch {
        set({ status: 'unavailable', price: null });
        return;
      } finally {
        connecting = null;
      }
      // an earlier purchase (a reinstall, a new phone): both stores answer this without asking the learner anything
      try {
        await adoptAll(await getAvailablePurchases());
      } catch {
        // the price is known and the sheet works; a restore can be asked for by hand
      }
    })();
    return connecting;
  },

  buy: async (product: ProductId = PRODUCT_ID) => {
    if (get().busy) return;
    set({ busy: 'buy', error: null, note: null, gift: null });
    try {
      if (get().status !== 'ready') await get().connect();
      if (get().status !== 'ready') throw new Error(t('unlock.errUnavailable'));
      await requestPurchase({ request: { apple: { sku: product }, google: { skus: [product] } }, type: 'in-app' });
      // the outcome comes through the listeners above
    } catch (e) {
      set({ busy: null, error: t('unlock.errFailed', { reason: message(e) }) });
    }
  },

  restore: async () => {
    if (get().busy === 'restore') return;
    set({ busy: 'restore', error: null, note: null });
    try {
      if (get().status !== 'ready') await get().connect();
      if (get().status !== 'ready') throw new Error(t('unlock.errUnavailable'));
      await restorePurchases();
      const found = await adoptAll(await getAvailablePurchases());
      set({ busy: null, note: found ? 'restored' : 'restoreNone' });
    } catch (e) {
      set({ busy: null, error: t('unlock.errFailed', { reason: message(e) }) });
    }
  },

  settle: () => set({ note: null, error: null }),
}));
