// What to show for the learner's account: their own photo when the sign-in method gave one (Google, Apple, or
// an upload), otherwise an initial. Pure, so the choice is testable without React Native.

/** The account's photo URL, or null. Clerk always sets `imageUrl` (a generated placeholder when there is no
 *  photo); `hasImage` says whether it is the learner's own. */
export const accountImage = (user: { hasImage?: boolean; imageUrl?: string | null } | null | undefined): string | null =>
  user?.hasImage && user.imageUrl ? user.imageUrl : null;

/** The letter for the fallback avatar: the first letter of the name, else of the e-mail, else nothing. */
export function initialOf(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name ?? '').trim() || (email ?? '').trim();
  const first = source.replace(/^[^\p{L}\p{N}]+/u, '')[0];
  return first ? first.toLocaleUpperCase() : '';
}
