// Deterministic German rule engines: numbers, years, ordinals, dates, clock times and prices.
// A TypeScript port of the engines the licht toolkit uses to build the model's training drills and to
// check its release, so the app checks exactly the facts the model was taught.

const ONES = [
  '', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn',
  'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn',
];
const TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];
export const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];
export const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const ORDINAL_SPECIAL: Record<number, string> = { 1: 'erste', 3: 'dritte', 7: 'siebte', 8: 'achte' };

function belowHundred(n: number, final: boolean): string {
  if (n < 20) {
    if (n === 1) return final ? 'eins' : 'ein';
    return ONES[n];
  }
  const tens = Math.floor(n / 10);
  const unit = n % 10;
  if (unit === 0) return TENS[tens];
  return `${unit === 1 ? 'ein' : ONES[unit]}und${TENS[tens]}`;
}

function belowThousand(n: number, final: boolean, leading: boolean): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  let out = '';
  if (hundreds) out = hundreds === 1 ? (leading ? 'hundert' : 'einhundert') : `${ONES[hundreds]}hundert`;
  if (rest) out += belowHundred(rest, final);
  return out;
}

function belowMillion(n: number, final: boolean, leading: boolean): string {
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  let out = '';
  if (thousands) {
    out = thousands === 1 ? (leading ? 'tausend' : 'eintausend') : `${belowThousand(thousands, false, leading)}tausend`;
  }
  if (rest) out += belowThousand(rest, final, leading && !thousands);
  return out;
}

/** Cardinal in words: 21 -> einundzwanzig, 101 -> hunderteins, 2024 -> zweitausendvierundzwanzig. */
export function numberToGerman(n: number): string {
  if (n < 0) return `minus ${numberToGerman(-n)}`;
  if (n === 0) return 'null';
  if (n >= 1e12) throw new RangeError('numbers up to 999 999 999 999 are supported');
  const parts: string[] = [];
  const billions = Math.floor(n / 1e9);
  n %= 1e9;
  const millions = Math.floor(n / 1e6);
  const rest = n % 1e6;
  if (billions) parts.push(billions === 1 ? 'eine Milliarde' : `${belowThousand(billions, false, true)} Milliarden`);
  if (millions) parts.push(millions === 1 ? 'eine Million' : `${belowThousand(millions, false, true)} Millionen`);
  if (rest) parts.push(belowMillion(rest, true, true));
  return parts.join(' ');
}

/** Years 1100-1999 are read in hundreds (1999 -> neunzehnhundertneunundneunzig); others as cardinals. */
export function yearToGerman(year: number): string {
  if (year >= 1100 && year <= 1999) {
    const hundreds = Math.floor(year / 100);
    const rest = year % 100;
    return `${belowHundred(hundreds, false)}hundert${rest ? belowHundred(rest, true) : ''}`;
  }
  return numberToGerman(year);
}

/** Ordinal in the weak nominative form: 1 -> erste, 20 -> zwanzigste, 101 -> hunderterste. */
export function ordinalToGerman(n: number): string {
  if (n < 1) throw new RangeError('ordinals start at 1');
  const rest = n % 100;
  const prefix = n - rest ? numberToGerman(n - rest) : '';
  if (rest === 0) return `${prefix}ste`;
  const tail = rest < 20 ? ORDINAL_SPECIAL[rest] || `${ONES[rest]}te` : `${belowHundred(rest, false)}ste`;
  return prefix + tail;
}

const pad2 = (v: number) => String(v).padStart(2, '0');

export interface GermanDate {
  written: string;
  written_long: string;
  nominative: string;
  dative: string;
}

/** Spoken and written forms of a date (5.9.2024). */
export function dateToGerman(day: number, month: number, year: number | null = null): GermanDate {
  const ordinal = ordinalToGerman(day);
  const y = year ? ` ${year}` : '';
  const yWords = year ? ` ${yearToGerman(year)}` : '';
  return {
    written: year ? `${pad2(day)}.${pad2(month)}.${year}` : `${pad2(day)}.${pad2(month)}.`,
    written_long: `${day}. ${MONTHS[month - 1]}${y}`,
    nominative: `der ${ordinal} ${MONTHS[month - 1]}${yWords}`,
    dative: `am ${ordinal}n ${MONTHS[month - 1]}${yWords}`,
  };
}

function hourWord(h: number): string {
  h = h % 12 || 12;
  return h === 1 ? 'eins' : numberToGerman(h);
}

export interface GermanClock {
  digital: string;
  formal: string;
  informal: string;
  regional: string;
}

/** Formal 24-hour reading plus the informal 12-hour reading (with regional variants). */
export function clockToGerman(hour: number, minute: number): GermanClock {
  const formalHour = hour === 1 ? 'ein' : numberToGerman(hour);
  const formal = `${formalHour} Uhr${minute ? ` ${numberToGerman(minute)}` : ''}`;
  const thisH = hour % 12 || 12;
  const nextH = (hour + 1) % 12 || 12;
  let informal: string;
  let regional = '';
  if (minute === 0) informal = `${thisH === 1 ? 'ein' : numberToGerman(thisH)} Uhr`;
  else if (minute === 15) {
    informal = `Viertel nach ${hourWord(thisH)}`;
    regional = `viertel ${hourWord(nextH)}`;
  } else if (minute === 30) informal = `halb ${hourWord(nextH)}`;
  else if (minute === 45) {
    informal = `Viertel vor ${hourWord(nextH)}`;
    regional = `drei viertel ${hourWord(nextH)}`;
  } else if (minute < 30) {
    informal = `${numberToGerman(minute)} nach ${hourWord(thisH)}`;
    if (minute >= 20 && minute <= 29) regional = `${numberToGerman(30 - minute)} vor halb ${hourWord(nextH)}`;
  } else {
    informal = `${numberToGerman(60 - minute)} vor ${hourWord(nextH)}`;
    if (minute >= 31 && minute <= 40) regional = `${numberToGerman(minute - 30)} nach halb ${hourWord(nextH)}`;
  }
  return { digital: `${pad2(hour)}:${pad2(minute)}`, formal, informal, regional };
}

/** (3, 40) -> "drei Euro vierzig" spoken, "3,40 €" written (thousands take a point: 1.250,75 €). */
export function priceToGerman(euros: number, cents = 0): { spoken: string; written: string } {
  const euroWord = euros === 1 ? 'ein Euro' : `${numberToGerman(euros)} Euro`;
  const centWord = cents === 1 ? 'ein Cent' : `${numberToGerman(cents)} Cent`;
  let spoken: string;
  if (euros === 0) spoken = centWord;
  else if (cents === 1) spoken = `${euroWord} und ${centWord}`;
  else if (cents) spoken = `${euroWord} ${numberToGerman(cents)}`;
  else spoken = euroWord;
  const whole = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return { spoken, written: `${whole},${pad2(cents)} €` };
}

// ------------------------------------------------------------------------------------------------
// normalisation and the answer matcher used by every drill
// ------------------------------------------------------------------------------------------------

const UMLAUT: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue' };

/** Case-, whitespace-, ß/umlaut-, dash-, quote- and markdown-insensitive form used for matching. */
export function normalise(text: string): string {
  let t = String(text)
    .replace(/ß/g, 'ss')
    .replace(/[äöüÄÖÜ]/g, (c) => UMLAUT[c.toLowerCase()]);
  t = t.replace(/[‐-―−]/g, '-');
  t = t.replace(/[‘’‚‛′´`]/g, "'");
  t = t.replace(/[“”„‟«»″]/g, '"');
  t = t.replace(/[*_`#>|]/g, '');
  return t.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Number words are one word in German; learners often write "vier und neunzig" - compare without gaps. */
export function compact(text: string): string {
  return normalise(text).replace(/[\s\-.,;:!?'"()]/g, '');
}

/** True when the answer contains any alternative (normalised, and again with all gaps removed). */
export function matchesAny(answer: string, alternatives: string[]): boolean {
  const hay = normalise(answer);
  const hayCompact = compact(answer);
  return alternatives.some((alt) => {
    const n = normalise(alt);
    return n.length > 0 && (hay.includes(n) || hayCompact.includes(compact(alt)));
  });
}

/** Exact match after normalisation (and again without gaps): for single-word answers like articles. */
export function matchesExactly(answer: string, alternatives: string[]): boolean {
  const n = normalise(answer).replace(/[.!?]+$/, '');
  const c = compact(answer);
  return alternatives.some((alt) => normalise(alt) === n || compact(alt) === c);
}
