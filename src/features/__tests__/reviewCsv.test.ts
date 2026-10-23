// The review screen's saved-words CSV export used to fail silently: a share-sheet error hit an empty catch and
// the tap looked dead. shareWordsCsv now catches a write/share failure and shows a localized, retryable alert.
// `expo-file-system` is swapped for a node-safe stub by vitest.config.ts; the tests drive its `File.prototype.write`.
import * as FileSystem from 'expo-file-system';
import { Alert, Share } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { shareWordsCsv, type ShareFailedStrings } from '../reviewCsv';

vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Share: { share: vi.fn() },
}));

const strings: ShareFailedStrings = {
  title: 'Export failed',
  message: 'The words list could not be shared. Try again?',
  retry: 'Retry',
  cancel: 'Cancel',
};

const press = (button: { onPress?: () => void } | undefined): void => {
  if (button?.onPress) button.onPress();
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('shareWordsCsv', () => {
  it('shares the CSV through the OS share sheet without an alert', async () => {
    const write = vi.spyOn(FileSystem.File.prototype, 'write').mockImplementation(() => {});
    const alert = vi.mocked(Alert.alert);
    const share = vi.mocked(Share.share).mockResolvedValue({ action: 'sharedAction' } as never);
    await shareWordsCsv('word;meaning\nApfel;apple', strings);
    expect(write).toHaveBeenCalledWith('word;meaning\nApfel;apple');
    expect(share).toHaveBeenCalledTimes(1);
    expect(share.mock.calls[0][0].message).toContain('Apfel;apple');
    expect(alert).not.toHaveBeenCalled();
  });

  it('shows a retryable localized alert when the share fails', async () => {
    vi.spyOn(FileSystem.File.prototype, 'write').mockImplementation(() => {});
    const alert = vi.mocked(Alert.alert);
    vi.mocked(Share.share).mockRejectedValue(new Error('share sheet dismissed'));
    await shareWordsCsv('word;meaning', strings);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith(
      'Export failed',
      'The words list could not be shared. Try again?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Retry', onPress: expect.any(Function) },
      ],
    );
  });

  it('retry button runs the export again', async () => {
    vi.spyOn(FileSystem.File.prototype, 'write').mockImplementation(() => {});
    const alert = vi.mocked(Alert.alert);
    const share = vi.mocked(Share.share).mockRejectedValue(new Error('boom'));
    await shareWordsCsv('word;meaning', strings);
    expect(share).toHaveBeenCalledTimes(1);
    const buttons = alert.mock.calls[0][2] ?? [];
    press(buttons.find((b) => b?.text === 'Retry'));
    await new Promise((resolve) => setImmediate(resolve));
    expect(share).toHaveBeenCalledTimes(2);
    expect(alert).toHaveBeenCalledTimes(2);
  });

  it('cancel button does not retry', async () => {
    vi.spyOn(FileSystem.File.prototype, 'write').mockImplementation(() => {});
    const alert = vi.mocked(Alert.alert);
    const share = vi.mocked(Share.share).mockRejectedValue(new Error('boom'));
    await shareWordsCsv('word;meaning', strings);
    const buttons = alert.mock.calls[0][2] ?? [];
    press(buttons.find((b) => b?.text === 'Cancel'));
    expect(share).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it('shows the alert when writing the CSV file fails', async () => {
    vi.spyOn(FileSystem.File.prototype, 'write').mockImplementation(() => {
      throw new Error('disk full');
    });
    const alert = vi.mocked(Alert.alert);
    const share = vi.mocked(Share.share).mockResolvedValue({ action: 'sharedAction' } as never);
    await shareWordsCsv('word;meaning', strings);
    expect(share).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledTimes(1);
  });
});
