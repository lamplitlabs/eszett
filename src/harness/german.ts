// Telling German from the explanation around it. The tutor writes in the learner's language and quotes German
// in bold, in quotes or as "German – gloss" example lines; the renderer sets those in the German face and the
// on-phone translator (src/mt) leaves them alone. Pure functions, tested in Node.

import { lineText, type Line } from './markdown';
import { detectLang } from './route';

// function words, the connectors and particles learners ask about, and the grammar terms; nothing that is also
// a word of English or of the other app languages ("also", "da", "mal", "will", "am")
const GERMAN_WORDS = new Set(
  (
    'der die das den dem des ein eine einen einem einer eines kein keine keinen nicht und oder aber denn weil dass ob wenn als wann seit vor für mit bei nach von zu aus um durch gegen ohne bis an auf in über unter neben zwischen hinter ich du er sie es wir ihr sein haben werden ist sind bin hat habe wird würde hätte wäre ' +
    'schön müde früh können müssen dürfen hören zurück fünf zwölf glück stück küche übung lösung tür möchte trotzdem obwohl trotz wegen deshalb deswegen dennoch allerdings jedoch sondern während statt anstatt außer seitdem nachdem bevor damit sodass falls sobald solange indem schon noch auch nur jetzt immer heute morgen gestern sehr ziemlich eigentlich überhaupt vielleicht natürlich genau nein danke bitte hallo tschüss gern gerne lieber zum zur vom beim ins kann soll darf mag muss weiß geht gibt macht kommt sagt heißt wohne wohnt lerne lernt spreche spricht verstehe versteht ' +
    'perfekt präteritum dativ akkusativ nominativ genitiv plural singular konjunktiv nebensatz hauptsatz partizip infinitiv'
  ).split(' '),
);

/** True for a word of the German list above (the lists of a question's own language decide the rest). */
export const knownGermanWord = (word: string) => GERMAN_WORDS.has(word.toLowerCase());

/** True for a stretch of text that reads as German. */
export function looksGerman(text: string): boolean {
  const t = text.replace(/[*_`"„“”'()[\].,;:!?–—-]/g, ' ').trim();
  if (!t) return false;
  const words = t.split(/\s+/);
  if (words.length === 1) {
    const w = t.toLowerCase();
    return /[äöüß]/.test(w) || GERMAN_WORDS.has(w) || /(ung|keit|heit|schaft|chen|lein|lich|isch)$/.test(w) || /^ge[a-z]{3,}(t|en)$/.test(w);
  }
  if (/^(der|die|das|den|dem|des) [A-ZÄÖÜ]/.test(t) && words.length <= 3) return true;
  return detectLang(t) === 'de';
}

const ENGLISH_FUNCTION = new Set('the a an and or but is are was were be to of in on at for with from by as it this that these those you your can will would should could do does did have has had not only also when which who why how what'.split(' '));
/** English function words in a stretch of text: two or more mean it is an English sentence. */
export function englishWords(text: string): number {
  return text
    .toLowerCase()
    .split(/[^a-z']+/)
    .filter((w) => ENGLISH_FUNCTION.has(w)).length;
}

const SPLIT = /\s[–—]\s|\s-\s|\s=\s/;

/** "Ich wohne seit drei Jahren hier. – I have lived here for three years." -> [German, English]. */
export function bilingual(line: Line): [string, string] | null {
  const text = lineText(line);
  const m = SPLIT.exec(text);
  if (!m) return null;
  const left = text.slice(0, m.index).trim();
  const right = text.slice(m.index + m[0].length).trim();
  if (left.split(/\s+/).length < 2 || !right) return null;
  if (!looksGerman(left) || looksGerman(right)) return null;
  return [left, right];
}

export const NOUN_SPAN = /^(der|die|das)\s+([A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?)$/;
