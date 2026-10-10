import { describe, expect, it } from 'vitest';

import { glossaryTerm } from '../glossary';
import { needsQuestionTranslation, readLangFor } from '../languages';
import { maskGerman, readsEnglish, translateLine, translateMarkdown, unmask, wholeGerman } from '../markdown';
import { maskQuestion, translateQuestion } from '../question';

/** A fake translator: upper-cases the English, keeps `[n]` placeholders, and "translates" nothing German. */
const fake = async (s: string) => s.replace(/[^[\]\d]+/g, (m) => m.toUpperCase());
/** A translator that drops every placeholder, like a careless engine. */
const dropping = async (s: string) => s.replace(/\[\d+\]/g, '').toUpperCase();
/** A translator that keeps the German words verbatim but loses the markers. */
const unmarking = async (s: string) => s.replace(/\*\*/g, '').toUpperCase();

describe('maskGerman', () => {
  it('swaps bold German for placeholders and marks English emphasis for its own translation', () => {
    const m = maskGerman('Use **trotz** with the Genitiv, like **Tip:** says.');
    expect(m).not.toBeNull();
    expect(m!.text).toBe('Use [1] with the [2], like [3] says.');
    expect(m!.spans).toEqual([{ text: 'trotz', bold: true }, { text: 'Genitiv' }, { text: 'Tip:', bold: true, english: true }]);
  });

  it('masks German grammar terms in the running English', () => {
    const m = maskGerman('The preposition **trotz** takes the Genitiv, not the Dativ.');
    expect(m!.text).toBe('The preposition [1] takes the [2], not the [3].');
  });

  it('masks quoted and bracketed German', () => {
    const m = maskGerman('The word „Schlüssel“ (der Schlüssel) means key.');
    expect(m!.text).toBe('The word [1] [2] means key.');
    expect(m!.spans.map((s) => s.text)).toEqual(['„Schlüssel“', '(der Schlüssel)']);
  });

  it('returns null when there is nothing to protect or set apart', () => {
    expect(maskGerman('The genitive marks possession.')).toBeNull();
    expect(maskGerman('Say "thank you" (politely).')).toBeNull();
  });

  it('keeps the translator away from Markdown markers around English', () => {
    expect(maskGerman('See **Note:** below.')!.text).toBe('See [1] below.');
    expect(maskGerman('This is **the most important** rule.')!.spans).toEqual([{ text: 'the most important', bold: true, english: true }]);
  });

  it('takes emphasised words without English function words for German', () => {
    expect(maskGerman('**wegen** also takes the genitive.')!.text).toBe('[1] also takes the genitive.');
    expect(maskGerman('Say **Guten Morgen** before noon.')!.text).toBe('Say [1] before noon.');
  });

  it('reads a bold line of its own as an English heading unless it is German', () => {
    expect(maskGerman('**Key differences**')!.spans[0]).toEqual({ text: 'Key differences', bold: true, english: true });
    expect(maskGerman('**Common mistakes:**')!.spans[0]).toEqual({ text: 'Common mistakes:', bold: true, english: true });
    expect(maskGerman('**Trotz des Regens**')!.spans[0]).toEqual({ text: 'Trotz des Regens', bold: true });
    // a capital inside the phrase is a German noun; a title-case English heading pays by staying English
    expect(maskGerman('**Guten Morgen**')!.spans[0]).toEqual({ text: 'Guten Morgen', bold: true });
    expect(maskGerman('**Examples**')!.spans[0]).toEqual({ text: 'Examples', bold: true });
    expect(maskGerman('`der Hund`')!.spans[0]).toEqual({ text: 'der Hund', code: true });
  });
});

describe('unmask', () => {
  it('puts the spans back with their markers', () => {
    expect(unmask('UŻYJ [1] Z [2].', [{ text: 'trotz', bold: true }, { text: 'der Regen', code: true }])).toBe('UŻYJ **trotz** Z `der Regen`.');
  });
  it('tolerates spaces the translator puts inside the brackets', () => {
    expect(unmask('UŻYJ [ 1 ].', [{ text: 'trotz', bold: true }])).toBe('UŻYJ **trotz**.');
  });
  it('fails when a placeholder is missing or doubled', () => {
    expect(unmask('UŻYJ Z.', [{ text: 'trotz', bold: true }])).toBeNull();
    expect(unmask('[1] UND [1]', [{ text: 'trotz', bold: true }])).toBeNull();
  });
});

describe('wholeGerman', () => {
  it('spots German example lines and leaves English alone', () => {
    expect(wholeGerman('Trotz des Regens gehen wir spazieren.')).toBe(true);
    expect(wholeGerman('**Ich wohne seit drei Jahren hier.**')).toBe(true);
    expect(wholeGerman('The genitive case marks possession.')).toBe(false);
    expect(wholeGerman('Example: der Hund')).toBe(false);
  });
});

describe('translateLine', () => {
  it('translates only the gloss of a "German – English" pair', async () => {
    expect(await translateLine('**Trotz des Regens gehen wir.** – Despite the rain we go.', fake)).toBe('**Trotz des Regens gehen wir.** – DESPITE THE RAIN WE GO.');
  });

  it('keeps German spans through the translation', async () => {
    expect(await translateLine('Use **trotz** with the genitive: **trotz des Regens**.', fake)).toBe('USE **trotz** WITH THE GENITIVE: **trotz des Regens**.');
  });

  it('falls back to the whole line when placeholders are lost and the German survives', async () => {
    expect(await translateLine('Use **trotz** with the genitive.', unmarking)).toBe('USE **trotz** WITH THE GENITIVE.');
  });

  it('keeps the English when the translator loses the German', async () => {
    expect(await translateLine('Use **trotz** with the genitive.', dropping)).toBe('Use **trotz** with the genitive.');
  });

  it('leaves a German line untouched', async () => {
    expect(await translateLine('Trotz des Regens gehen wir spazieren.', fake)).toBe('Trotz des Regens gehen wir spazieren.');
  });

  it('translates only the bracketed gloss of a German example sentence, bold and all', async () => {
    expect(await translateLine('Ich weiß, dass er morgen **kommt**. (I know that he is coming tomorrow.)', fake)).toBe('Ich weiß, dass er morgen **kommt**. (I KNOW THAT HE IS COMING TOMORROW.)');
    expect(await translateLine('Sie sagt, dass sie das Buch (das Buch, Pl. die Bücher) schon **gelesen hat**. (She says she has already read the book.)', fake)).toBe(
      'Sie sagt, dass sie das Buch (das Buch, Pl. die Bücher) schon **gelesen hat**. (SHE SAYS SHE HAS ALREADY READ THE BOOK.)',
    );
    expect(await translateLine('**Guten Morgen** (a greeting until about eleven)', fake)).toBe('**Guten Morgen** (A GREETING UNTIL ABOUT ELEVEN)');
    // an English sentence with a bracket at the end, and a German one with a German bracket, go their usual ways
    expect(await translateLine('Use the dative here (see the table above).', fake)).toBe('USE THE DATIVE HERE (SEE THE TABLE ABOVE).');
    expect(await translateLine('Er kommt morgen (vielleicht).', fake)).toBe('Er kommt morgen (vielleicht).');
  });

  it('protects a quote that runs across bold, and short quoted German without umlauts', async () => {
    const line = 'So it must be "die Reform … **umgesetzt** wird", not "umgesetzt werden".';
    const m = maskGerman(line)!;
    expect(m.text).toBe('So it must be [1], not [2].');
    expect(m.spans.map((s) => s.text)).toEqual(['"die Reform … **umgesetzt** wird"', '"umgesetzt werden"']);
    expect(await translateLine(line, fake)).toBe('SO IT MUST BE "die Reform … **umgesetzt** wird", NOT "umgesetzt werden".');
    expect(maskGerman('Say "thank you" (politely).')).toBeNull();
  });

  it('translates emphasised English on its own, so the markers never reach the translator', async () => {
    const seen: string[] = [];
    const spy = async (s: string) => {
      seen.push(s);
      return fake(s);
    };
    expect(await translateLine('**Position:** Obwohl usually starts a clause.', spy)).toBe('**POSITION:** OBWOHL USUALLY STARTS A CLAUSE.');
    expect(seen.every((s) => !s.includes('**'))).toBe(true);
  });

  it('keeps the colon of a label the translator drops and reads the glossary first', async () => {
    const colonless = async (s: string) => (await fake(s)).replace(/:$/, '');
    expect(await translateLine('**Tip:** say it slowly.', colonless)).toBe('**TIP:** SAY IT SLOWLY.');
    expect(await translateLine('**Tip:** say it slowly.', fake, (t) => (t === 'Tip:' ? 'Wskazówka:' : null))).toBe('**Wskazówka:** SAY IT SLOWLY.');
  });

  it('translates a bold heading line without a second round trip', async () => {
    const seen: string[] = [];
    const spy = async (s: string) => {
      seen.push(s);
      return fake(s);
    };
    expect(await translateLine('**Key differences**', spy)).toBe('**KEY DIFFERENCES**');
    expect(seen).toEqual(['Key differences']);
    expect(await translateLine('**Guten Morgen**', spy)).toBe('**Guten Morgen**');
  });
});

describe('translateMarkdown', () => {
  const answer = [
    '## Genitiv after trotz',
    '',
    'The preposition **trotz** takes the Genitiv.',
    '- **Trotz des Regens** – despite the rain',
    '- Trotz der Kälte gehen wir raus.',
    '',
    '| Case | Example |',
    '|---|---|',
    '| Genitiv | **des Regens** |',
    '',
    '> Tip: in speech people also say **trotz dem Regen**.',
  ].join('\n');

  it('keeps markers, blank lines, tables and German while translating the English', async () => {
    const out = await translateMarkdown(answer, fake);
    expect(out.split('\n')).toEqual([
      '## Genitiv AFTER TROTZ',
      '',
      'THE PREPOSITION **trotz** TAKES THE Genitiv.',
      '- **Trotz des Regens** – DESPITE THE RAIN',
      '- Trotz der Kälte gehen wir raus.',
      '',
      '| CASE | EXAMPLE |',
      '|---|---|',
      '| Genitiv | **des Regens** |',
      '',
      '> TIP: IN SPEECH PEOPLE ALSO SAY **trotz dem Regen**.',
    ]);
  });

  it('keeps a line in English when the translator throws for it', async () => {
    const flaky = async (s: string) => {
      if (s.includes('preposition')) throw new Error('boom');
      return fake(s);
    };
    const out = await translateMarkdown('The preposition **trotz** takes the Genitiv.\nIt is formal.', flaky);
    expect(out).toBe('The preposition **trotz** takes the Genitiv.\nIT IS FORMAL.');
  });
});

describe('glossary', () => {
  it('translates standalone terms, keeping the capital and the colon', () => {
    expect(glossaryTerm('Case', 'pl')).toBe('Przypadek');
    expect(glossaryTerm('Examples:', 'uk')).toBe('Приклади:');
    expect(glossaryTerm('tip', 'tr')).toBe('ipucu');
    expect(glossaryTerm('The case', 'pl')).toBeNull();
    expect(glossaryTerm('Genitiv', 'pl')).toBeNull();
  });

  it('is used for table headers and labels, with the formatting kept', async () => {
    const pl = (t: string) => glossaryTerm(t, 'pl');
    expect(await translateMarkdown('| Case | Example |\n|---|---|\n| Genitiv | **des Regens** |', fake, pl)).toBe('| Przypadek | Przykład |\n|---|---|\n| Genitiv | **des Regens** |');
    expect(await translateLine('**Tip:**', fake, pl)).toBe('**Wskazówka:**');
    expect(await translateLine('The case matters.', fake, pl)).toBe('THE CASE MATTERS.');
  });
});

describe('readLangFor', () => {
  it('reads in the app language only when translating English for a translator language', () => {
    expect(readLangFor('pl', 'en', true)).toBe('pl');
    expect(readLangFor('pl', 'en', false)).toBe('en');
    expect(readLangFor('pl', 'fr', true)).toBe('fr');
    expect(readLangFor('fr', 'en', true)).toBe('en');
    expect(readLangFor('ru', 'en', true)).toBe('ru');
  });
});

describe('needsQuestionTranslation', () => {
  it('sends Polish, Ukrainian, Turkish and Arabic questions through the translator', () => {
    expect(needsQuestionTranslation('Jak używać dopełniacza?', 'pl')).toBe(true);
    expect(needsQuestionTranslation('Co to znaczy trotzdem?', 'pl')).toBe(true);
    expect(needsQuestionTranslation('Як сказати "добрий день"?', 'uk')).toBe(true);
    expect(needsQuestionTranslation('Dativ ne zaman kullanılır?', 'tr')).toBe(true);
    expect(needsQuestionTranslation('ما معنى trotzdem؟', 'ar')).toBe(true);
  });
  it('lets English and German questions through untouched', () => {
    expect(needsQuestionTranslation('How do I use the genitive?', 'pl')).toBe(false);
    expect(needsQuestionTranslation('Was bedeutet trotzdem?', 'pl')).toBe(false);
    expect(needsQuestionTranslation('Ich habe gestern Fußball gespielt.', 'tr')).toBe(false);
    expect(needsQuestionTranslation('What is the difference between obwohl and trotzdem?', 'pl')).toBe(false);
  });
  it('reads Polish and Turkish by their own words, German quoted inside or not', () => {
    // "to" and "i" are English words too; the Polish ones decide
    expect(needsQuestionTranslation('Co to jest i jak to dziala?', 'pl')).toBe(true);
    expect(needsQuestionTranslation('Czy "Ich habe Hunger" jest poprawne?', 'pl')).toBe(true);
    expect(needsQuestionTranslation('Bu cümle doğru mu: Ich habe Hunger?', 'tr')).toBe(true);
    expect(needsQuestionTranslation('Ich habe Hunger', 'tr')).toBe(false);
  });
  it('never translates for languages the model reads itself', () => {
    expect(needsQuestionTranslation('Como se usa o genitivo?', 'pt')).toBe(false);
    expect(needsQuestionTranslation('Как использовать Genitiv?', 'ru')).toBe(false);
  });
});

describe('maskQuestion', () => {
  it('keeps the German words of a Polish question from the translator', () => {
    const m = maskQuestion('Co to znaczy trotzdem?', 'pl');
    expect(m!.text).toBe('Co to znaczy [1]?');
    expect(m!.spans).toEqual([{ text: 'trotzdem' }]);
  });
  it('joins adjoining German words and the noun after them into one span', () => {
    expect(maskQuestion('Co znaczy ich habe keine Ahnung?', 'pl')!.text).toBe('Co znaczy [1]?');
    expect(maskQuestion('Jaka jest różnica między der Hund a die Katze?', 'pl')!.spans.map((s) => s.text)).toEqual(['der Hund', 'die Katze']);
    expect(maskQuestion('Jak powiedzieć zur Arbeit, nie zum Arbeit?', 'pl')!.spans.map((s) => s.text)).toEqual(['zur Arbeit', 'zum Arbeit']);
  });
  it('keeps quoted German whole and leaves quoted Polish to the translator', () => {
    expect(maskQuestion('Czy "Ich habe Hunger" jest poprawne?', 'pl')!.text).toBe('Czy [1] jest poprawne?');
    expect(maskQuestion("Jak powiedzieć 'dziękuję bardzo' po niemiecku?", 'pl')).toBeNull();
  });
  it('leaves everyday Polish and Turkish words that German also has', () => {
    expect(maskQuestion('Nie rozumiem tego zdania.', 'pl')).toBeNull();
    expect(maskQuestion('Bin kelime ne demek?', 'tr')).toBeNull();
    // Turkish shares ö and ü: only listed German words with them count
    expect(maskQuestion('Görmek ne demek Almanca?', 'tr')).toBeNull();
    expect(maskQuestion('Schön ne demek?', 'tr')!.text).toBe('[1] ne demek?');
    expect(maskQuestion('Für ne demek?', 'tr')!.text).toBe('[1] ne demek?');
    expect(maskQuestion('Co znaczy görmek?', 'pl')!.text).toBe('Co znaczy [1]?');
  });
  it('takes every Latin word of a Ukrainian or Arabic question for German', () => {
    expect(maskQuestion('Що означає trotzdem?', 'uk')!.text).toBe('Що означає [1]?');
    expect(maskQuestion('Як сказати "добрий день"?', 'uk')).toBeNull();
    expect(maskQuestion('ما معنى ich habe Hunger؟', 'ar')!.text).toBe('ما معنى [1]؟');
  });
});

describe('translateQuestion', () => {
  it('translates around the German and puts it back', async () => {
    expect(await translateQuestion('Co to znaczy trotzdem?', 'pl', fake)).toBe('CO TO ZNACZY trotzdem?');
  });
  it('falls back to the whole question when the German survives, else sends it as typed', async () => {
    const keeping = async (s: string) => (s.includes('[') ? 'LOST' : s.replace(/\b[a-z]+\b/gi, (w) => (w === 'trotzdem' ? w : w.toUpperCase())));
    expect(await translateQuestion('Co to znaczy trotzdem?', 'pl', keeping)).toBe('CO TO ZNACZY trotzdem?');
    const mangling = async (s: string) => (s.includes('[') ? 'LOST' : s.toUpperCase().replace('TROTZDEM', 'TROTZZZTE'));
    expect(await translateQuestion('Co to znaczy trotzdem?', 'pl', mangling)).toBe('Co to znaczy trotzdem?');
  });
});

describe('readsEnglish', () => {
  it('tells an English explanation with German examples from a German answer', () => {
    expect(readsEnglish(['**Key differences**', '- **Position:** Obwohl usually starts a clause.', '- Es regnet, trotzdem gehen wir spazieren.', '  It rains, nevertheless we go for a walk.'].join('\n'))).toBe(true);
    expect(readsEnglish(['„Trotzzzt“ ist ein umgangssprachliches Wort und bedeutet „total“.', '**Beispiele:**', '- Das ist doch ein Trotzzzt!', '- Deine Ausrede ist ein Trotzzzt.'].join('\n'))).toBe(false);
    expect(readsEnglish('Il genitivo indica il possesso e segue la preposizione trotz.')).toBe(false);
  });
});
