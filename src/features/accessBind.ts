// Keeps the tutor's lock in step with the learner's access (src/features/access.ts): notes the time at every
// start and return to the front, locks the model the moment the free week runs out (a timer set for that
// minute), unlocks it the moment a purchase lands, and asks the store at launch whether this account already
// owns Eszett (a reinstall, a new phone). Called in the root layout before useModelBoot, so the flag is in place
// before the first load.

import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useModel } from '@/model/runtime';

import { accessOf, useAccess } from './access';
import { usePurchases } from './purchases';

let bound = false;
// setTimeout takes a 32-bit delay: a longer wait is set again when it fires
const MAX_DELAY_MS = 2_147_000_000;

export function useAccessBind(hydrated: boolean) {
  useEffect(() => {
    if (!hydrated || bound) return;
    bound = true;

    let timer: ReturnType<typeof setTimeout> | null = null;
    // sync reads only, so the store subscription below cannot feed itself
    function sync() {
      const access = accessOf();
      void useModel.getState().setLocked(access.kind === 'ended');
      if (timer) clearTimeout(timer);
      timer = null;
      if (access.kind === 'trial') timer = setTimeout(apply, Math.min(MAX_DELAY_MS, Math.max(1000, access.endsAt - Date.now() + 500)));
    }
    function apply() {
      useAccess.getState().touch();
      sync();
    }

    apply();
    const unsubscribe = useAccess.subscribe(sync);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') apply();
    });
    // the store answers in the background; nothing here waits for it
    void usePurchases.getState().connect();

    return () => {
      bound = false;
      unsubscribe();
      sub.remove();
      if (timer) clearTimeout(timer);
    };
  }, [hydrated]);
}
