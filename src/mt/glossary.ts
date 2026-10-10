// Grammar words the translator gets wrong on their own ("Case" in a table header became "Walizka", the
// suitcase, on the phone): a standalone term — a table cell, a label, a one-word line — is looked up here
// instead. Only exact matches are replaced, so the inflected forms inside sentences are left to the translator.

import type { MtLang } from './languages';

type Entry = Record<MtLang, string>;

const T = (pt: string, ru: string, zh: string, pl: string, uk: string, tr: string, ar: string): Entry => ({ pt, ru, zh, pl, uk, tr, ar });

const GLOSSARY: Record<string, Entry> = {
  case: T('caso', 'падеж', '格', 'przypadek', 'відмінок', 'durum', 'الحالة'),
  cases: T('casos', 'падежи', '格', 'przypadki', 'відмінки', 'durumlar', 'الحالات'),
  example: T('exemplo', 'пример', '例句', 'przykład', 'приклад', 'örnek', 'مثال'),
  examples: T('exemplos', 'примеры', '例句', 'przykłady', 'приклади', 'örnekler', 'أمثلة'),
  meaning: T('significado', 'значение', '意思', 'znaczenie', 'значення', 'anlam', 'المعنى'),
  translation: T('tradução', 'перевод', '翻译', 'tłumaczenie', 'переклад', 'çeviri', 'الترجمة'),
  preposition: T('preposição', 'предлог', '介词', 'przyimek', 'прийменник', 'edat', 'حرف جر'),
  prepositions: T('preposições', 'предлоги', '介词', 'przyimki', 'прийменники', 'edatlar', 'حروف الجر'),
  noun: T('substantivo', 'существительное', '名词', 'rzeczownik', 'іменник', 'isim', 'اسم'),
  nouns: T('substantivos', 'существительные', '名词', 'rzeczowniki', 'іменники', 'isimler', 'أسماء'),
  verb: T('verbo', 'глагол', '动词', 'czasownik', 'дієслово', 'fiil', 'فعل'),
  verbs: T('verbos', 'глаголы', '动词', 'czasowniki', 'дієслова', 'fiiller', 'أفعال'),
  adjective: T('adjetivo', 'прилагательное', '形容词', 'przymiotnik', 'прикметник', 'sıfat', 'صفة'),
  adjectives: T('adjetivos', 'прилагательные', '形容词', 'przymiotniki', 'прикметники', 'sıfatlar', 'صفات'),
  article: T('artigo', 'артикль', '冠词', 'rodzajnik', 'артикль', 'artikel', 'أداة التعريف'),
  articles: T('artigos', 'артикли', '冠词', 'rodzajniki', 'артиклі', 'artikeller', 'أدوات التعريف'),
  pronoun: T('pronome', 'местоимение', '代词', 'zaimek', 'займенник', 'zamir', 'ضمير'),
  pronouns: T('pronomes', 'местоимения', '代词', 'zaimki', 'займенники', 'zamirler', 'ضمائر'),
  singular: T('singular', 'единственное число', '单数', 'liczba pojedyncza', 'однина', 'tekil', 'مفرد'),
  plural: T('plural', 'множественное число', '复数', 'liczba mnoga', 'множина', 'çoğul', 'جمع'),
  masculine: T('masculino', 'мужской род', '阳性', 'rodzaj męski', 'чоловічий рід', 'eril', 'مذكر'),
  feminine: T('feminino', 'женский род', '阴性', 'rodzaj żeński', 'жіночий рід', 'dişil', 'مؤنث'),
  neuter: T('neutro', 'средний род', '中性', 'rodzaj nijaki', 'середній рід', 'nötr', 'محايد'),
  tip: T('dica', 'совет', '提示', 'wskazówka', 'порада', 'ipucu', 'نصيحة'),
  note: T('nota', 'примечание', '注意', 'uwaga', 'примітка', 'not', 'ملاحظة'),
  word: T('palavra', 'слово', '单词', 'słowo', 'слово', 'kelime', 'كلمة'),
  words: T('palavras', 'слова', '单词', 'słowa', 'слова', 'kelimeler', 'كلمات'),
  sentence: T('frase', 'предложение', '句子', 'zdanie', 'речення', 'cümle', 'جملة'),
  english: T('inglês', 'английский', '英语', 'angielski', 'англійська', 'İngilizce', 'الإنجليزية'),
  german: T('alemão', 'немецкий', '德语', 'niemiecki', 'німецька', 'Almanca', 'الألمانية'),
  correct: T('correto', 'правильно', '正确', 'poprawnie', 'правильно', 'doğru', 'صحيح'),
  wrong: T('errado', 'неправильно', '错误', 'błędnie', 'неправильно', 'yanlış', 'خطأ'),
  formal: T('formal', 'формально', '正式', 'formalnie', 'формально', 'resmî', 'رسمي'),
  informal: T('informal', 'неформально', '非正式', 'nieformalnie', 'неформально', 'günlük', 'غير رسمي'),
};

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The translation of a standalone term ("Case", "Examples:", "tip"), keeping its capital and trailing colon;
 * null for anything that is not exactly one glossary entry.
 */
export function glossaryTerm(text: string, to: MtLang): string | null {
  const m = /^\s*([A-Za-z]+)(:?)\s*$/.exec(text);
  if (!m) return null;
  const entry = GLOSSARY[m[1].toLowerCase()];
  if (!entry) return null;
  const word = entry[to];
  return (/^[A-Z]/.test(m[1]) ? capital(word) : word) + m[2];
}
