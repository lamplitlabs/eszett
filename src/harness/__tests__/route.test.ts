import { describe, expect, it } from 'vitest';

import { detectLang, foreignScript, isRussian, route, translationTarget } from '../route';

describe('detectLang', () => {
  it('keeps the English/German behaviour', () => {
    expect(detectLang('What does "die Verabredung" mean?')).toBe('en');
    expect(detectLang('Wie sagt man das auf Deutsch?')).toBe('de');
    expect(detectLang('Ich habe gestern ins Kino gegangen.')).toBe('de');
    expect(detectLang('Schönes Wetter')).toBe('de');
    expect(detectLang('Hello')).toBe('en');
    // "an" and "um" are English/Portuguese words too: they vote for German as well, so the article decides
    expect(detectLang('Der Zug kommt um acht Uhr an.')).toBe('de');
    expect(detectLang('Der Zug kommt um acht Uhr an.', 'ru')).toBe('de');
    expect(detectLang('Can you give me an example?')).toBe('en');
    expect(detectLang('Como se diz um café em alemão?')).toBe('pt');
  });
  it('recognises the other tutor languages', () => {
    expect(detectLang('Quelle est la différence entre « als » et « wenn » ?')).toBe('fr');
    expect(detectLang('¿Cuál es la diferencia entre «als» y «wenn»?')).toBe('es');
    expect(detectLang('Qual è la differenza tra «als» e «wenn»?')).toBe('it');
    expect(detectLang('Qual é a diferença entre «als» e «wenn»? Estou no nível B1.')).toBe('pt');
    expect(detectLang('“als”和“wenn”有什么区别？')).toBe('zh');
  });
  it('answers in the fallback for a language the model does not handle', () => {
    expect(detectLang('Jaka jest różnica między als a wenn?', 'fr')).toBe('fr');
    expect(detectLang('ما الفرق بين als و wenn؟')).toBe('en');
    expect(foreignScript('Hallo')).toBe(false);
  });
  it('answers Russian in Russian, but does not route a Ukrainian question there', () => {
    expect(detectLang('В чём разница между als и wenn?')).toBe('ru');
    expect(detectLang('В чём разница между als и wenn?', 'de')).toBe('ru');
    expect(isRussian('Что значит Haus?', 'en')).toBe(false);
    expect(detectLang('Что значит Haus?', 'ru')).toBe('ru');
    expect(detectLang('Что значит Haus?', 'en')).toBe('en');
    expect(detectLang('Яка різниця між als і wenn?', 'en')).toBe('en');
    expect(detectLang('Яка різниця між als і wenn?', 'ru')).toBe('ru');
    expect(detectLang('Чи правильно: ich habe gestern ins Kino gegangen?', 'de')).toBe('de');
  });
  it('the fallback decides a tie', () => {
    expect(detectLang('Puedes corregir: Ich habe gestern', 'es')).toBe('es');
    expect(detectLang('Puedes corregir: Ich habe gestern', 'en')).toBe('es');
  });
});

describe('route cues in the other languages', () => {
  it('check and translate requests', () => {
    expect(route('Peux-tu corriger : Ich habe gestern ins Kino gegangen.')).toMatchObject({ intent: 'check', text: 'Ich habe gestern ins Kino gegangen.' });
    expect(route('¿Puedes corregir esta frase? Ich habe gestern ins Kino gegangen.')).toMatchObject({ intent: 'check' });
    expect(route('Correggi: Ich habe gestern ins Kino gegangen.')).toMatchObject({ intent: 'check' });
    expect(route('Comment dit-on « merci » en allemand ?')).toMatchObject({ intent: 'translate' });
    expect(route('¿Cómo se dice "gracias" en alemán?')).toMatchObject({ intent: 'translate' });
    expect(route('Come si dice "grazie" in tedesco?')).toMatchObject({ intent: 'translate' });
    expect(route('Como se diz "obrigado" em alemão?')).toMatchObject({ intent: 'translate' });
    expect(route('Pourquoi dit-on « der Tisch » ?')).toMatchObject({ intent: 'ask' });
  });
  it('Russian check and translate requests', () => {
    expect(route('Проверь: Ich habe gestern ins Kino gegangen.')).toMatchObject({ intent: 'check', text: 'Ich habe gestern ins Kino gegangen.' });
    expect(route('Исправь, пожалуйста: «Ich habe gestern ins Kino gegangen.»')).toMatchObject({ intent: 'check', text: 'Ich habe gestern ins Kino gegangen.' });
    expect(route('Это правильно? Ich habe gestern ins Kino gegangen.')).toMatchObject({ intent: 'check' });
    expect(route('Как сказать «спасибо» по-немецки?')).toMatchObject({ intent: 'translate' });
    expect(route('Переведи: большое спасибо')).toMatchObject({ intent: 'translate' });
    expect(route('Что значит «die Verabredung»?')).toMatchObject({ intent: 'ask' });
    expect(route('Почему говорят «der Tisch»?')).toMatchObject({ intent: 'ask' });
  });
  it('a German line is translated into the learner language where the model is reliable', () => {
    expect(translationTarget('fr')).toBe('fr');
    // Russian glosses on the phone negated the sentence or copied the German: English until a model does better
    expect(translationTarget('ru')).toBe('en');
    expect(translationTarget('pt')).toBe('en');
    expect(translationTarget('de')).toBe('en');
  });
});
