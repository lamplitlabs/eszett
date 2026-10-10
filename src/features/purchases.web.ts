// The web build: no store, so nothing can be bought here (the tutor model does not run on the web either). Same
// exports as purchases.ts; everything answers "not available".
import { create } from 'zustand';

export type StoreStatus = 'idle' | 'connecting' | 'ready' | 'unavailable';
export type PurchaseNote = 'pending' | 'restored' | 'restoreNone';

export interface PurchasesState {
  status: StoreStatus;
  price: string | null;
  busy: 'buy' | 'restore' | null;
  note: PurchaseNote | null;
  error: string | null;
  connect: () => Promise<void>;
  buy: () => Promise<void>;
  restore: () => Promise<void>;
  settle: () => void;
}

export const usePurchases = create<PurchasesState>()((set) => ({
  status: 'unavailable',
  price: null,
  busy: null,
  note: null,
  error: null,
  connect: () => Promise.resolve(),
  buy: () => Promise.resolve(),
  restore: () => Promise.resolve(),
  settle: () => set({ note: null, error: null }),
}));
