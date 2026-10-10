// The learner-language wording of the prompts the app sends on the learner's behalf. The model answers in the
// language of the user turn (a system-prompt instruction is ignored, see files/model-wishlist.md §13), so each
// tutor language needs its own wording. English and German are the trained phrasings; French, Spanish, Italian,
// Portuguese and Chinese were probed on v23 and work with English glosses; Russian works, with Russian glosses,
// as long as the user turn asks in Russian and says so ("Ответь по-русски"), which these prompts do.
import type { Level } from './levels';
import type { Lang } from './route';

export interface PromptTexts {
  level: (level: Level) => string;
  correctSentence: (s: string) => string;
  correctText: (text: string, level: Level) => string;
  explainMistake: (task: string, answer: string, correct: string) => string;
  vocabList: (topic: string, level: Level, count: number) => string;
  word: (word: string, level: Level) => string;
  grammarExplain: (title: string, level: Level) => string;
  grammarContrast: (items: string[], level: Level) => string;
  grammarCheck: (sentence: string) => string;
  grammarExamples: (title: string) => string;
  translate: (text: string) => string;
  /** A German line into the learner's language, only the translation. */
  gloss: (german: string) => string;
  phrases: (situation: string, level: Level) => string;
}

const list = (items: string[], and: string) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} ${and} ${items.at(-1)}` : items[0]);

export const PROMPT_TEXTS: Record<Lang, PromptTexts> = {
  en: {
    level: (l) => `I'm at ${l} level.`,
    correctSentence: (s) => `Can you correct this sentence? '${s}'`,
    correctText: (text, l) =>
      `Correct this German text written by a ${l} learner. First give the corrected text, then list the mistakes (max 5) with a one-line reason each, then one short tip. Text:\n\n${text}`,
    explainMistake: (task, answer, correct) =>
      `A learner wrote "${answer}" for the task "${task}". The correct answer is "${correct}". Explain in 3 short sentences why, in English, and give one similar example.`,
    vocabList: (topic, l, n) => `Give me ${n} useful German words for ${topic} at level ${l}, each with article, plural, an example sentence and the English translation.`,
    word: (w, l) => `What does "${w}" mean and how do I use it? Give two short example sentences with translations. I'm at ${l} level.`,
    grammarExplain: (title, l) => `Can you explain ${title} to me? I'm at ${l} level.`,
    grammarContrast: (items, l) => `${list(items, 'and')} - which one do I use when? I'm at ${l} level.`,
    grammarCheck: (s) => `Is this sentence correct? '${s}'`,
    grammarExamples: (title) => `Give me three example sentences for ${title}, with translations.`,
    translate: (text) => `How do I say this in German? Give only the German sentence, nothing else: "${text}"`,
    gloss: (g) => `Translate into English, only the translation: "${g}"`,
    phrases: (situation, l) => `Give me 6 useful German phrases for ${situation} at ${l} level, with English translations.`,
  },
  de: {
    level: (l) => `Ich bin auf Niveau ${l}.`,
    correctSentence: (s) => `Kannst du diesen Satz korrigieren? „${s}“`,
    correctText: (text, l) =>
      `Korrigiere diesen Text eines Deutschlerners (Niveau ${l}). Gib zuerst den korrigierten Text, dann die Fehler (max. 5) mit je einer kurzen Begründung, dann einen kurzen Tipp. Text:\n\n${text}`,
    explainMistake: (task, answer, correct) =>
      `Ein Lernender hat „${answer}“ auf die Aufgabe „${task}“ geschrieben. Richtig ist „${correct}“. Erkläre in 3 kurzen Sätzen warum und gib ein ähnliches Beispiel.`,
    vocabList: (topic, l, n) => `Gib mir ${n} nützliche deutsche Wörter zum Thema ${topic} auf Niveau ${l}, jeweils mit Artikel, Plural und einem Beispielsatz.`,
    word: (w, l) => `Was bedeutet „${w}“ und wie benutze ich es? Gib zwei kurze Beispielsätze. Ich bin auf Niveau ${l}.`,
    grammarExplain: (title, l) => `Kannst du mir das Thema „${title}“ erklären? Ich bin ${l}-Lerner.`,
    grammarContrast: (items, l) => `${list(items, 'und')}: Wo ist der Unterschied? Ich bin ${l}-Lerner.`,
    grammarCheck: (s) => `Ist dieser Satz korrekt? „${s}“`,
    grammarExamples: (title) => `Gib mir drei Beispielsätze zu: ${title}.`,
    translate: (text) => `Wie sage ich das auf Deutsch? Gib nur den deutschen Satz, sonst nichts: „${text}“`,
    gloss: (g) => `Translate into English, only the translation: "${g}"`,
    phrases: (situation, l) => `Gib mir 6 nützliche deutsche Sätze für folgende Situation: ${situation} (Niveau ${l}).`,
  },
  fr: {
    level: (l) => `Je suis au niveau ${l}.`,
    correctSentence: (s) => `Peux-tu corriger cette phrase ? « ${s} »`,
    correctText: (text, l) =>
      `Corrige ce texte en allemand écrit par un apprenant de niveau ${l}. Donne d'abord le texte corrigé, puis la liste des erreurs (5 au maximum) avec une raison d'une ligne chacune, puis un conseil court. Texte :\n\n${text}`,
    explainMistake: (task, answer, correct) =>
      `Un apprenant a écrit « ${answer} » pour l'exercice « ${task} ». La bonne réponse est « ${correct} ». Explique pourquoi en 3 phrases courtes, en français, et donne un exemple semblable.`,
    vocabList: (topic, l, n) => `Donne-moi ${n} mots allemands utiles sur le thème « ${topic} » au niveau ${l}, chacun avec l'article, le pluriel, une phrase d'exemple et la traduction française.`,
    word: (w, l) => `Que veut dire « ${w} » et comment l'utiliser ? Donne deux phrases d'exemple courtes avec leur traduction. Je suis au niveau ${l}.`,
    grammarExplain: (title, l) => `Peux-tu m'expliquer « ${title} » ? Je suis au niveau ${l}.`,
    grammarContrast: (items, l) => `${list(items, 'et')} : lequel utiliser et quand ? Je suis au niveau ${l}.`,
    grammarCheck: (s) => `Cette phrase est-elle correcte ? « ${s} »`,
    grammarExamples: (title) => `Donne-moi trois phrases d'exemple pour « ${title} », avec leur traduction.`,
    translate: (text) => `Comment dit-on cela en allemand ? Donne seulement la phrase allemande, rien d'autre : « ${text} »`,
    gloss: (g) => `Traduis en français, seulement la traduction : « ${g} »`,
    phrases: (situation, l) => `Donne-moi 6 phrases allemandes utiles pour ${situation} au niveau ${l}, avec la traduction française.`,
  },
  es: {
    level: (l) => `Estoy en el nivel ${l}.`,
    correctSentence: (s) => `¿Puedes corregir esta frase? «${s}»`,
    correctText: (text, l) =>
      `Corrige este texto en alemán escrito por un estudiante de nivel ${l}. Da primero el texto corregido, luego la lista de errores (máximo 5) con una razón de una línea cada uno y después un consejo breve. Texto:\n\n${text}`,
    explainMistake: (task, answer, correct) =>
      `Un estudiante escribió «${answer}» en la tarea «${task}». La respuesta correcta es «${correct}». Explica por qué en 3 frases cortas, en español, y da un ejemplo parecido.`,
    vocabList: (topic, l, n) => `Dame ${n} palabras alemanas útiles sobre ${topic} en el nivel ${l}, cada una con artículo, plural, una frase de ejemplo y la traducción al español.`,
    word: (w, l) => `¿Qué significa «${w}» y cómo se usa? Da dos frases de ejemplo cortas con traducción. Estoy en el nivel ${l}.`,
    grammarExplain: (title, l) => `¿Puedes explicarme «${title}»? Estoy en el nivel ${l}.`,
    grammarContrast: (items, l) => `${list(items, 'y')}: ¿cuál uso y cuándo? Estoy en el nivel ${l}.`,
    grammarCheck: (s) => `¿Es correcta esta frase? «${s}»`,
    grammarExamples: (title) => `Dame tres frases de ejemplo para «${title}», con traducción.`,
    translate: (text) => `¿Cómo se dice esto en alemán? Da solo la frase alemana, nada más: «${text}»`,
    gloss: (g) => `Traduce al español, solo la traducción: «${g}»`,
    phrases: (situation, l) => `Dame 6 frases alemanas útiles para ${situation} en el nivel ${l}, con traducción al español.`,
  },
  it: {
    level: (l) => `Sono al livello ${l}.`,
    correctSentence: (s) => `Puoi correggere questa frase? «${s}»`,
    correctText: (text, l) =>
      `Correggi questo testo in tedesco scritto da uno studente di livello ${l}. Dai prima il testo corretto, poi l'elenco degli errori (massimo 5) con una riga di spiegazione ciascuno, poi un consiglio breve. Testo:\n\n${text}`,
    explainMistake: (task, answer, correct) =>
      `Uno studente ha scritto «${answer}» per il compito «${task}». La risposta giusta è «${correct}». Spiega perché in 3 frasi brevi, in italiano, e dai un esempio simile.`,
    vocabList: (topic, l, n) => `Dammi ${n} parole tedesche utili sul tema ${topic} al livello ${l}, ognuna con articolo, plurale, una frase di esempio e la traduzione italiana.`,
    word: (w, l) => `Cosa significa «${w}» e come si usa? Dai due frasi di esempio brevi con la traduzione. Sono al livello ${l}.`,
    grammarExplain: (title, l) => `Puoi spiegarmi «${title}»? Sono al livello ${l}.`,
    grammarContrast: (items, l) => `${list(items, 'e')}: quale uso e quando? Sono al livello ${l}.`,
    grammarCheck: (s) => `Questa frase è corretta? «${s}»`,
    grammarExamples: (title) => `Dammi tre frasi di esempio per «${title}», con la traduzione.`,
    translate: (text) => `Come si dice in tedesco? Dai solo la frase tedesca, nient'altro: «${text}»`,
    gloss: (g) => `Traduci in italiano, solo la traduzione: «${g}»`,
    phrases: (situation, l) => `Dammi 6 frasi tedesche utili per ${situation} al livello ${l}, con la traduzione italiana.`,
  },
  pt: {
    level: (l) => `Estou no nível ${l}.`,
    correctSentence: (s) => `Você pode corrigir esta frase? «${s}»`,
    correctText: (text, l) =>
      `Corrija este texto em alemão escrito por um aluno de nível ${l}. Dê primeiro o texto corrigido, depois a lista de erros (no máximo 5) com um motivo de uma linha cada, depois uma dica curta. Texto:\n\n${text}`,
    explainMistake: (task, answer, correct) =>
      `Um aluno escreveu «${answer}» na tarefa «${task}». A resposta certa é «${correct}». Explique por quê em 3 frases curtas, em português, e dê um exemplo parecido.`,
    vocabList: (topic, l, n) => `Dê-me ${n} palavras alemãs úteis sobre ${topic} no nível ${l}, cada uma com artigo, plural, uma frase de exemplo e a tradução em português.`,
    word: (w, l) => `O que significa «${w}» e como se usa? Dê duas frases de exemplo curtas com tradução. Estou no nível ${l}.`,
    grammarExplain: (title, l) => `Você pode me explicar «${title}»? Estou no nível ${l}.`,
    grammarContrast: (items, l) => `${list(items, 'e')}: qual eu uso e quando? Estou no nível ${l}.`,
    grammarCheck: (s) => `Esta frase está correta? «${s}»`,
    grammarExamples: (title) => `Dê-me três frases de exemplo para «${title}», com tradução.`,
    translate: (text) => `Como se diz isso em alemão? Dê apenas a frase em alemão, nada mais: «${text}»`,
    gloss: (g) => `Traduza para o português, apenas a tradução: «${g}»`,
    phrases: (situation, l) => `Dê-me 6 frases alemãs úteis para ${situation} no nível ${l}, com tradução em português.`,
  },
  ru: {
    level: (l) => `У меня уровень ${l}.`,
    correctSentence: (s) => `Можешь исправить это предложение? «${s}» Ответь по-русски.`,
    correctText: (text, l) =>
      `Исправь этот немецкий текст ученика уровня ${l}. Сначала дай исправленный текст, затем перечисли ошибки (не больше 5), по одной строке с причиной на каждую, затем один короткий совет. Ответь по-русски. Текст:\n\n${text}`,
    explainMistake: (task, answer, correct) =>
      `Ученик написал «${answer}» в задании «${task}». Правильный ответ: «${correct}». Объясни по-русски в трёх коротких предложениях, почему, и приведи один похожий пример.`,
    vocabList: (topic, l, n) => `Дай мне ${n} полезных немецких слов по теме «${topic}» для уровня ${l}, каждое с артиклем, формой множественного числа, примером предложения и переводом на русский.`,
    word: (w, l) => `Что значит «${w}» и как это слово использовать? Приведи два коротких примера с переводом на русский. У меня уровень ${l}.`,
    grammarExplain: (title, l) => `Можешь объяснить мне тему «${title}»? У меня уровень ${l}. Ответь по-русски.`,
    grammarContrast: (items, l) => `${list(items, 'и')}: что и когда использовать? У меня уровень ${l}. Ответь по-русски.`,
    grammarCheck: (s) => `Это предложение правильное? «${s}» Ответь по-русски.`,
    grammarExamples: (title) => `Приведи три примера предложений на тему «${title}», с переводом на русский.`,
    translate: (text) => `Как сказать это по-немецки? Дай только немецкое предложение, больше ничего: «${text}»`,
    gloss: (g) => `Переведи на русский, только перевод: «${g}»`,
    phrases: (situation, l) => `Дай мне 6 полезных немецких фраз для ситуации «${situation}» на уровне ${l}, с переводом на русский.`,
  },
  zh: {
    level: (l) => `我是${l}水平。`,
    correctSentence: (s) => `你能帮我改正这个句子吗？“${s}”`,
    correctText: (text, l) =>
      `请修改这篇由${l}水平学习者写的德语短文。先给出修改后的全文，然后列出错误（最多5个），每个错误用一行说明原因，最后给一条简短的建议。短文：\n\n${text}`,
    explainMistake: (task, answer, correct) =>
      `一位学习者在题目“${task}”中写了“${answer}”。正确答案是“${correct}”。请用中文、三句短话解释原因，并给一个类似的例子。`,
    vocabList: (topic, l, n) => `请给我${n}个关于“${topic}”的${l}水平常用德语单词，每个都带冠词、复数、一个例句和中文翻译。`,
    word: (w, l) => `“${w}”是什么意思，怎么用？请给两个简短的例句并附翻译。我是${l}水平。`,
    grammarExplain: (title, l) => `你能给我讲讲“${title}”吗？我是${l}水平。`,
    grammarContrast: (items, l) => `${items.join('、')}——什么时候用哪一个？我是${l}水平。`,
    grammarCheck: (s) => `这个句子对吗？“${s}”`,
    grammarExamples: (title) => `请给我三个关于“${title}”的例句，并附翻译。`,
    translate: (text) => `这句话用德语怎么说？只给德语句子，不要别的：“${text}”`,
    gloss: (g) => `请翻译成中文，只给翻译：“${g}”`,
    phrases: (situation, l) => `请给我6个在“${situation}”时常用的${l}水平德语句子，并附中文翻译。`,
  },
};
