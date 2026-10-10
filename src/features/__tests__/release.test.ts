import { describe, expect, it } from 'vitest';

import { compareVersions, evaluateRelease, isReleaseInfo } from '../releaseRules';

const info = {
  android: { version: '1.2.0', minimum: '1.1.0', storeUrl: 'https://play.google.com/store/apps/details?id=com.lamplitlabs.eszett', notes: { en: 'Faster answers', fr: 'Réponses plus rapides' } },
  ios: { version: '1.2.0', storeUrl: 'https://apps.apple.com/app/id1' },
};

describe('compareVersions', () => {
  it('compares numerically part by part', () => {
    expect(compareVersions('1.0.10', '1.0.9')).toBe(1);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.1-beta', '1.0.1')).toBe(0);
    expect(compareVersions('0.9.9', '1.0.0')).toBe(-1);
    expect(compareVersions('2', '10')).toBe(-1);
  });
});

describe('evaluateRelease', () => {
  it('is quiet on the latest version or without a listing', () => {
    expect(evaluateRelease(info, 'android', '1.2.0').available).toBe(false);
    expect(evaluateRelease(info, 'android', '1.3.0').available).toBe(false);
    expect(evaluateRelease(info, 'web', '1.0.0').available).toBe(false);
    expect(evaluateRelease(null, 'android', '1.0.0').available).toBe(false);
  });
  it('offers the update, in the learner language, and requires it below the minimum', () => {
    const fr = evaluateRelease(info, 'android', '1.1.5', 'fr');
    expect(fr).toMatchObject({ available: true, required: false, version: '1.2.0', notes: 'Réponses plus rapides' });
    expect(evaluateRelease(info, 'android', '1.1.5', 'pl').notes).toBe('Faster answers');
    expect(evaluateRelease(info, 'android', '1.0.0').required).toBe(true);
    expect(evaluateRelease(info, 'ios', '1.0.0')).toMatchObject({ available: true, required: false, notes: null });
  });
  it('accepts only well-formed files', () => {
    expect(isReleaseInfo(info)).toBe(true);
    expect(isReleaseInfo({ android: { storeUrl: 'x' } })).toBe(false);
    expect(isReleaseInfo('1.2.0')).toBe(false);
    expect(isReleaseInfo({ _comment: 'published at …', ...info })).toBe(true);
  });
});
