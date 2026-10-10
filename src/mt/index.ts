// On-phone translation of the tutor's English into app languages the model cannot write (Google ML Kit through
// modules/eszett-translate). Display-side only: the model, its prompts and its parsers never see it.
export { isMtLang, MT_LANGUAGES, needsQuestionTranslation, readLangFor, type MtLang } from './languages';
export { readsEnglish, translateMarkdown } from './markdown';
export { maskQuestion, translateQuestion } from './question';
export { translateAnswer, translateText, translating, useTranslator, type PackStatus } from './store';
export { useTranslated } from './useTranslated';
