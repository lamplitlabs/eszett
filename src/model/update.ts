// When a new build of the app ships a newer tutor model, the learner is asked, not switched: the model already
// on the phone keeps working, a card says a new tutor is ready, and the download is theirs to start - with full
// access; in the free week the card points to it instead. The rules here are pure, so they can be tested; the
// store (src/model/runtime.ts) and the card (src/features/ModelUpdateCard.tsx) act on them.

import type { Access } from '@/features/accessRules';
import { isRetiredModelName, MODEL_STUDENT, type Edition } from '@/model/manifest';

export interface ModelFile {
  name: string;
  edition: Edition | null;
  where: 'models' | 'documents';
}

/**
 * The previous student's complete model in models/, if there is one to keep running until the new one is
 * downloaded: the same edition the learner uses when it is there, else any. Files the learner dropped into
 * Documents are theirs and not "previous"; other quantisations of the current student are not either.
 */
export function previousStudentModel<T extends ModelFile>(local: T[], edition: Edition): T | null {
  const previous = local.filter((m) => m.where === 'models' && isRetiredModelName(m.name) && !/\.part$/i.test(m.name));
  return previous.find((m) => m.edition === edition) ?? previous.find((m) => m.edition !== null) ?? previous[0] ?? null;
}

export type ModelUpdateAction =
  /** Nothing to show: the current model is in use, or no model at all (the first download is free for everyone). */
  | 'none'
  /** Full access: the Download button starts the download. */
  | 'download'
  /** In the free week: the card points to full access; the old model keeps working. */
  | 'unlock';

/**
 * What the update card offers. `outdated` is the runtime's word that the model in use belongs to a previous
 * student; `dismissed` is the student the learner put the card off for (the card comes back with the next one).
 */
export function modelUpdateAction(outdated: boolean, access: Access, dismissed: string | null): ModelUpdateAction {
  if (!outdated) return 'none';
  if (dismissed === MODEL_STUDENT) return 'none';
  if (access.kind === 'paid') return 'download';
  // the week is over: the tutor is locked anyway and the unlock screen says so; no second card
  if (access.kind === 'ended') return 'none';
  return 'unlock';
}

/**
 * Whether the old model must go before the new one can be downloaded: the phone has room for one model, not two.
 * `free` is the space on the phone, `needed` the download with its headroom, `oldBytes` what retiring frees.
 */
export function mustRetireFirst(free: number, needed: number, oldBytes: number): boolean {
  if (free < 0) return false;
  return free < needed && free + oldBytes >= needed;
}
