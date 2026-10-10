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
import { create } from 'zustand';

import { t } from '@/i18n';

import { useAccess } from './access';
import { PRODUCT_ID, purchaseRecordOf } from './accessRules';

export type StoreStatus = 'idle' | 'connecting' | 'ready' | 'unavailable';
/** A short outcome for the sheet to word: the store is still confirming, a restore found the purchase, or found none. */
export type PurchaseNote = 'pending' | 'restored' | 'restoreNone';

export interface PurchasesState {
  status: StoreStatus;
  /** The store's own price line for the product ("4,99 €"), once fetched; null when the product is not listed. */
  price: string | null;
  busy: 'buy' | 'restore' | null;
  note: PurchaseNote | null;
  error: string | null;
  connect: () => Promise<void>;
  buy: () => Promise<void>;
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

/** Keeps a purchase of our product and tells the store it has been delivered; true when it was ours and complete. */
async function adopt(purchase: Purchase): Promise<boolean> {
  if (purchase.productId !== PRODUCT_ID) return false;
  if (purchase.purchaseState === 'pending') {
    usePurchases.setState({ busy: null, note: 'pending' });
    return false;
  }
  const record = purchaseRecordOf(purchase);
  if (!record) return false;
  useAccess.getState().setPurchase(record);
  // Android refunds a purchase that is not acknowledged within three days; iOS replays an unfinished one at every start
  await finishTransaction({ purchase, isConsumable: false }).catch(() => undefined);
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
  busy: null,
  note: null,
  error: null,

  connect: () => {
    if (get().status === 'ready') return Promise.resolve();
    if (connecting) return connecting;
    set({ status: 'connecting' });
    connecting = (async () => {
      try {
        listen();
        await initConnection();
        const products = await fetchProducts({ skus: [PRODUCT_ID], type: 'in-app' });
        const product = (products ?? []).find((p) => p.id === PRODUCT_ID);
        set({ status: 'ready', price: product?.displayPrice ?? null });
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

  buy: async () => {
    if (get().busy) return;
    set({ busy: 'buy', error: null, note: null });
    try {
      if (get().status !== 'ready') await get().connect();
      if (get().status !== 'ready') throw new Error(t('unlock.errUnavailable'));
      await requestPurchase({ request: { apple: { sku: PRODUCT_ID }, google: { skus: [PRODUCT_ID] } }, type: 'in-app' });
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
