// Which learners the on-phone translator is for, and when a line or a question goes through it. Pure, tested.

import { detectLang, foreignScript, langVotes } from '@/harness/route';
import { isTutorLang, type AppLang, type TutorLang } from '@/i18n/languages';

/**
 * App languages the translator is offered for: the ones the model cannot explain in (Polish, Ukrainian, Turkish,
 * Arabic), and the ones it explains in but translates German into unreliably (Portuguese, Russian, Chinese — their
 * role-play glosses come from the model's English, see `translationTarget`). French, Spanish and Italian need no
 * help; English and German are the tutor's own.
 */
export const MT_LANGUAGES = ['pt', 'ru', 'zh', 'pl', 'uk', 'tr', 'ar'] as const satisfies readonly AppLang[];
export type MtLang = (typeof MT_LANGUAGES)[number];

export const isMtLang = (x: unknown): x is MtLang => typeof x === 'string' && (MT_LANGUAGES as readonly string[]).includes(x);

/**
 * The language the learner reads the tutor's explanations in: the app language when the translator is on and
 * ready for it and the tutor would otherwise be writing English, else the explanation language itself.
 */
export function readLangFor(app: AppLang, explainIn: TutorLang, translating: boolean): AppLang {
  return translating && isMtLang(app) && explainIn === 'en' ? app : explainIn;
}

// the words a Polish or Turkish question is likely to contain, without the ones English or German also use
// ("to", "a", "i", "do", "ten"; Turkish has none of those collisions)
const PL_WORDS = new Set(
  'co czy jak jest nie na w z po o dla ale lub bo tak mam jestem mi mnie moje mój ten ta te tego jaki jaka jakie który która które znaczy oznacza zdanie słowo słowa różnica między powiedzieć mówi się używa poprawnie poprawne dobrze źle kiedy gdzie dlaczego może proszę chcę muszę trzeba można niemiecku niemiecki polsku przetłumacz popraw sprawdź wyjaśnij przykład'.split(
    ' ',
  ),
);
const TR_WORDS = new Set(
  'bir bu şu ne nasıl neden niçin nerede için ile ve mi mı mu mü değil var yok demek anlamı anlama kelime cümle fark arasında nedir zaman kullanılır doğru yanlış söylenir almanca türkçe çevir düzelt kontrol lütfen istiyorum ben sen bana benim bunu şunu hangi örnek açıkla'.split(
    ' ',
  ),
);
const OWN_WORDS: Partial<Record<AppLang, Set<string>>> = { pl: PL_WORDS, tr: TR_WORDS };

/** How many words of the app language's own list a question contains (Polish and Turkish; the others write in another script). */
export function ownVotes(text: string, app: AppLang): number {
  const own = OWN_WORDS[app];
  if (!own) return 0;
  return text
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((w) => own.has(w)).length;
}

/**
 * True when the learner's question is in an app language the model does not read (Polish, Ukrainian, Turkish,
 * Arabic) and should be translated into English before it goes to the tutor. English and German questions, and
 * anything the model handles itself, pass through. A Polish or Turkish sentence with German quoted inside it is
 * still a Polish or Turkish sentence (the German is kept from the translator by `maskQuestion`).
 */
export function needsQuestionTranslation(text: string, app: AppLang): boolean {
  if (isTutorLang(app)) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (foreignScript(trimmed)) return true;
  const own = ownVotes(trimmed, app);
  if (own >= 2) return true;
  if (detectLang(trimmed) === 'de') return false;
  const en = langVotes(trimmed).en;
  return own > 0 ? own >= en : en <= 1;
}
