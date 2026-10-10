import { describe, expect, it } from 'vitest';

import { DEFAULT_EDITION } from '../../model/manifest';
import { migrateSettings } from '../settingsMigration';

describe('settings migration', () => {
  it('drops the laptop host of version 1 and fills in the on-device fields', () => {
    const migrated = migrateSettings({ onboarded: true, level: 'B1', hostUrl: 'http://192.168.1.20:8787' }, 1);
    expect(migrated.hostUrl).toBeUndefined();
    expect(migrated).toMatchObject({ onboarded: true, level: 'B1', edition: DEFAULT_EDITION, modelSource: '', modelFile: '', autoDownload: true });
  });

  it('moves the Q6_K edition of version 2 to the phone edition and turns the automatic download on', () => {
    const migrated = migrateSettings({ edition: 'Q6_K', modelSource: 'http://192.168.1.20:8000', modelFile: '' }, 2);
    expect(migrated.edition).toBe('Q5_K_M');
    expect(migrated.autoDownload).toBe(true);
    expect(migrated.modelSource).toBe('http://192.168.1.20:8000');
  });

  it('keeps an edition that still exists', () => {
    expect(migrateSettings({ edition: 'Q8_0' }, 2).edition).toBe('Q8_0');
    expect(migrateSettings({ edition: 'Q5_K_M' }, 2).edition).toBe('Q5_K_M');
  });

  it('normalises an unknown or missing edition whatever the version', () => {
    expect(migrateSettings({ edition: 'Q4_K_M' }, 3).edition).toBe(DEFAULT_EDITION);
    expect(migrateSettings({ edition: 42 }, 3).edition).toBe(DEFAULT_EDITION);
    expect(migrateSettings({}, 3).edition).toBe(DEFAULT_EDITION);
    expect(migrateSettings(null, 0).edition).toBe(DEFAULT_EDITION);
  });

  it('leaves a learner who opted out of the download alone from version 3 on', () => {
    expect(migrateSettings({ edition: 'Q5_K_M', autoDownload: false }, 3).autoDownload).toBe(false);
  });

  it('version 4 adds the app language and pins German explanations a learner had chosen', () => {
    expect(migrateSettings({ explainIn: 'de' }, 3)).toMatchObject({ language: 'auto', explainIn: 'de', explainInPinned: true });
    expect(migrateSettings({ explainIn: 'en' }, 3)).toMatchObject({ language: 'auto', explainIn: 'en', explainInPinned: false });
    expect(migrateSettings({ explainIn: 'xx' }, 3).explainIn).toBe('en');
    expect(migrateSettings({ language: 'fr', explainIn: 'fr', explainInPinned: false }, 4)).toMatchObject({ language: 'fr', explainIn: 'fr' });
  });
});
