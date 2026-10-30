import { describe, expect, it } from 'vitest';

import { MODEL_STUDENT } from '../manifest';
import { modelUpdateAction, mustRetireFirst, previousStudentModel } from '../update';

const file = (name: string, where: 'models' | 'documents' = 'models') => ({ name, edition: /Q5_K_M/.test(name) ? ('Q5_K_M' as const) : /Q8_0/.test(name) ? ('Q8_0' as const) : null, where });

describe('the previous student’s model', () => {
  it('is the complete export of another student in models/, the learner’s edition first', () => {
    const local = [file('light-german-tutor-phone-v25-Q8_0.gguf'), file('light-german-tutor-phone-v25-Q5_K_M.gguf'), file(`${MODEL_STUDENT}-Q5_K_M.gguf.part`)];
    expect(previousStudentModel(local, 'Q5_K_M')?.name).toBe('light-german-tutor-phone-v25-Q5_K_M.gguf');
    expect(previousStudentModel(local, 'Q8_0')?.name).toBe('light-german-tutor-phone-v25-Q8_0.gguf');
    expect(previousStudentModel([file('light-german-tutor-phone-v25-Q8_0.gguf')], 'Q5_K_M')?.name).toBe('light-german-tutor-phone-v25-Q8_0.gguf');
  });

  it('is not a half download, not the current student, not a file the learner dropped in', () => {
    expect(previousStudentModel([file('light-german-tutor-phone-v25-Q5_K_M.gguf.part')], 'Q5_K_M')).toBeNull();
    expect(previousStudentModel([file(`${MODEL_STUDENT}-Q5_K_M.gguf`)], 'Q5_K_M')).toBeNull();
    expect(previousStudentModel([file('light-german-tutor-phone-v25-Q5_K_M.gguf', 'documents')], 'Q5_K_M')).toBeNull();
    expect(previousStudentModel([file('my-tutor.gguf')], 'Q5_K_M')).toBeNull();
  });
});

describe('what the update card offers', () => {
  const paid = { kind: 'paid' as const, since: 1 };
  const trial = { kind: 'trial' as const, endsAt: 2, daysLeft: 3 };
  const ended = { kind: 'ended' as const, endedAt: 1 };
  it('nothing while the current model is in use, or after "Later" for this student', () => {
    expect(modelUpdateAction(false, paid, null)).toBe('none');
    expect(modelUpdateAction(true, paid, MODEL_STUDENT)).toBe('none');
    expect(modelUpdateAction(true, paid, 'light-german-tutor-phone-v25')).toBe('download');
  });
  it('download with full access, full access in the free week, nothing once the week is over', () => {
    expect(modelUpdateAction(true, paid, null)).toBe('download');
    expect(modelUpdateAction(true, trial, null)).toBe('unlock');
    expect(modelUpdateAction(true, ended, null)).toBe('none');
  });
});

describe('room for two models', () => {
  it('retires the old one first only when that makes the download fit', () => {
    const gb = 1_000_000_000;
    expect(mustRetireFirst(5 * gb, 2.7 * gb, 2.2 * gb)).toBe(false);
    expect(mustRetireFirst(1 * gb, 2.7 * gb, 2.2 * gb)).toBe(true);
    expect(mustRetireFirst(0.2 * gb, 2.7 * gb, 2.2 * gb)).toBe(false);
    expect(mustRetireFirst(-1, 2.7 * gb, 2.2 * gb)).toBe(false);
  });
});
