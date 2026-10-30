import { describe, expect, it } from 'vitest';

import { accountImage, initialOf } from '../avatar';

describe('the account avatar', () => {
  it('uses the photo only when it is the learner’s own', () => {
    expect(accountImage({ hasImage: true, imageUrl: 'https://img.clerk.com/x' })).toBe('https://img.clerk.com/x');
    expect(accountImage({ hasImage: false, imageUrl: 'https://img.clerk.com/placeholder' })).toBeNull();
    expect(accountImage({ hasImage: true, imageUrl: '' })).toBeNull();
    expect(accountImage(null)).toBeNull();
  });

  it('falls back to an initial from the name, then the e-mail', () => {
    expect(initialOf('manish tiwari', null)).toBe('M');
    expect(initialOf('  Özlem', 'x@y.de')).toBe('Ö');
    expect(initialOf('', 'anna@example.com')).toBe('A');
    expect(initialOf(null, '+clerk_test@example.com')).toBe('C');
    expect(initialOf(null, null)).toBe('');
  });
});
