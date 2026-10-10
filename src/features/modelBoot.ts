// Wakes the tutor model up when the app starts: one boot once the settings are back from disk, then a cheap
// look for new files whenever the app returns to the front (a GGUF may have been dropped in via the Files app).

import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useModel } from '@/model/runtime';

let booted = false;

export function useModelBoot(hydrated: boolean) {
  useEffect(() => {
    if (!hydrated || booted) return;
    booted = true;
    void useModel.getState().boot();
  }, [hydrated]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const { status, rescan } = useModel.getState();
      if (status === 'absent' || status === 'ready') rescan();
    });
    return () => sub.remove();
  }, []);
}
