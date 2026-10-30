// Who the learner is, in their own words: the name the tutor may use, where they live and come from, what they
// do, what they like, why they learn German. The free conversation (src/harness/talk.ts) hands these to the
// partner as facts, so the talk is about the learner's life and not about a stranger's. Every field is optional
// and everything stays on the phone.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { storage } from './storage';

export interface Profile {
  name: string;
  /** Where the learner lives now (a city, a town). */
  city: string;
  /** Where the learner comes from (a country, a city). */
  from: string;
  /** Work or studies. */
  work: string;
  /** Free-time interests, as typed ("Fußball, Kochen, Serien"). */
  hobbies: string;
  /** Why German: the goal that keeps the learner going. */
  why: string;
}

export const PROFILE_FIELDS = ['name', 'city', 'from', 'work', 'hobbies', 'why'] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];
export const MAX_FIELD = 80;

export const EMPTY_PROFILE: Profile = { name: '', city: '', from: '', work: '', hobbies: '', why: '' };

interface ProfileState {
  profile: Profile;
  set: (field: ProfileField, value: string) => void;
  clear: () => void;
}

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      profile: EMPTY_PROFILE,
      set: (field, value) => set((s) => ({ profile: { ...s.profile, [field]: value.replace(/\s+/g, ' ').trimStart().slice(0, MAX_FIELD) } })),
      clear: () => set({ profile: EMPTY_PROFILE }),
    }),
    { name: 'eszett.profile', storage, version: 1 },
  ),
);

/** The fields the learner filled in, trimmed. */
export const filledFields = (p: Profile): ProfileField[] => PROFILE_FIELDS.filter((f) => p[f].trim().length > 0);

/** The first name for a greeting ("Guten Morgen, Manish"): the first word of the name, or '' when none was typed. */
export const firstName = (p: Profile): string => p.name.trim().split(/\s+/)[0] ?? '';
