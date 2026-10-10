import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SUSPEND_SLACK_MS, watchdog } from '../watchdog';

describe('watchdog', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('calls back once the window passes without a reset', () => {
    const onStall = vi.fn();
    watchdog(30_000, onStall);
    vi.advanceTimersByTime(29_999);
    expect(onStall).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onStall).toHaveBeenCalledTimes(1);
  });

  it('does nothing once cancelled', () => {
    const onStall = vi.fn();
    const cancel = watchdog(30_000, onStall);
    cancel();
    vi.advanceTimersByTime(60_000);
    expect(onStall).not.toHaveBeenCalled();
  });

  it('re-arms for a full window when it fires late, as after the process was frozen', () => {
    const onStall = vi.fn();
    watchdog(30_000, onStall);
    // the clock jumps while timers stand still: the app was frozen in the background for 150 s
    vi.setSystemTime(Date.now() + 150_000);
    vi.advanceTimersByTime(30_000);
    expect(onStall).not.toHaveBeenCalled();
    // the model got its window back and is still silent: that is a stall
    vi.advanceTimersByTime(30_000);
    expect(onStall).toHaveBeenCalledTimes(1);
  });

  it('treats a small delay as a normal timer, not a suspension', () => {
    const onStall = vi.fn();
    watchdog(30_000, onStall);
    vi.setSystemTime(Date.now() + SUSPEND_SLACK_MS);
    vi.advanceTimersByTime(30_000);
    expect(onStall).toHaveBeenCalledTimes(1);
  });
});
