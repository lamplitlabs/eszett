// The update card's "Open in the store" tap used to fail silently: Linking.openURL rejected into an empty
// catch and the tap looked dead. openUpdateLink now shows a localized, retryable alert — the same pattern as
// shareWordsCsv in reviewCsv.ts. UpdateCard.tsx is imported whole, so every module it touches (expo-constants,
// react-native, safe-area-context, the release feature, i18n and the UI kit) is stubbed node-safe here.
import { Alert, Linking } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { openUpdateLink } from '../UpdateCard';

vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Linking: { openURL: vi.fn() },
  Platform: { OS: 'ios' },
  View: 'View',
}));

vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' }, nativeAppVersion: '1.0.0' },
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('@/features/release', () => ({
  checkForUpdate: vi.fn(),
  evaluateRelease: vi.fn(),
  useRelease: vi.fn(),
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, lang: 'en' }),
}));

vi.mock('../controls', () => ({ Button: 'Button', Paper: 'Paper' }));
vi.mock('../Text', () => ({ Txt: 'Txt' }));
vi.mock('../theme', () => ({
  gutter: 16,
  space: { xs: 4, s: 8, m: 16, l: 24 },
  useTheme: () => ({ c: { rule: '#000', paper: '#fff', inkSoft: '#333' } }),
}));

const t = (key: string): string => key;

const press = (button: { onPress?: () => void } | undefined): void => {
  if (button?.onPress) button.onPress();
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('openUpdateLink', () => {
  it('opens the store URL without an alert when the link works', async () => {
    const openURL = vi.mocked(Linking.openURL).mockResolvedValue(true as never);
    const alert = vi.mocked(Alert.alert);
    await openUpdateLink('https://apps.apple.com/app/id1', t);
    expect(openURL).toHaveBeenCalledWith('https://apps.apple.com/app/id1');
    expect(alert).not.toHaveBeenCalled();
  });

  it('shows a retryable localized alert when opening the link fails', async () => {
    vi.mocked(Linking.openURL).mockRejectedValue(new Error('no store app'));
    const alert = vi.mocked(Alert.alert);
    await openUpdateLink('itms-apps://apps.apple.com/app/id1', t);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith(
      'update.openFailedTitle',
      'update.openFailedMessage',
      [
        { text: 'common.cancel', style: 'cancel' },
        { text: 'common.retry', onPress: expect.any(Function) },
      ],
    );
  });

  it('retry button opens the link again', async () => {
    const openURL = vi.mocked(Linking.openURL).mockRejectedValue(new Error('boom'));
    const alert = vi.mocked(Alert.alert);
    await openUpdateLink('https://apps.apple.com/app/id1', t);
    expect(openURL).toHaveBeenCalledTimes(1);
    const buttons = alert.mock.calls[0][2] ?? [];
    press(buttons.find((b) => b?.text === 'common.retry'));
    await new Promise((resolve) => setImmediate(resolve));
    expect(openURL).toHaveBeenCalledTimes(2);
    expect(alert).toHaveBeenCalledTimes(2);
  });

  it('cancel button does not retry', async () => {
    const openURL = vi.mocked(Linking.openURL).mockRejectedValue(new Error('boom'));
    const alert = vi.mocked(Alert.alert);
    await openUpdateLink('https://apps.apple.com/app/id1', t);
    const buttons = alert.mock.calls[0][2] ?? [];
    press(buttons.find((b) => b?.text === 'common.cancel'));
    expect(openURL).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledTimes(1);
  });
});
