// Living in Germany: the letters, notices and conversations that make up everyday life with German offices,
// landlords, doctors, employers, banks, schools and transport - the situations learners in Germany say they
// want to handle without anyone translating. Each situation has the kind of letter or notice it brings (the
// tutor writes a typical one to read, in the reading draft's shape with three questions, like a listening
// situation but on paper), and where the app already has a role-play scene or a writing task for it, the link.
// Grouped by domain, placed by level, reached from Practice › Living in Germany.

import type { Level } from './levels';

export type AlltagDomain = 'offices' | 'housing' | 'health' | 'work' | 'money' | 'family' | 'transport';

export const ALLTAG_DOMAINS: AlltagDomain[] = ['offices', 'housing', 'health', 'work', 'money', 'family', 'transport'];

export interface AlltagItem {
  key: string;
  domain: AlltagDomain;
  levels: Level[];
  title_de: string;
  title_en: string;
  /** The letter or notice the tutor writes to read, English brief: who writes, what it says, which facts it carries. */
  letter_en: string;
  /** A role-play scene of the app (src/data/scenes.json) for the situation, if one exists. */
  scene?: string;
  /** A writing task of the app (src/harness/writing.ts) for the situation, if one exists. */
  write?: string;
}

export const ALLTAG: AlltagItem[] = [
  // offices
  { key: 'anmeldung', domain: 'offices', levels: ['A2', 'B1'], title_de: 'Anmeldung beim Bürgeramt', title_en: 'Registering your address at the Bürgeramt', letter_en: 'a letter from the Bürgeramt confirming an appointment for the Anmeldung: date, time, room number, the documents to bring (passport, Wohnungsgeberbestätigung, the filled form) and what happens if one cannot come', scene: 'buergeramt' },
  { key: 'auslaenderbehoerde', domain: 'offices', levels: ['B1', 'B2'], title_de: 'Termin bei der Ausländerbehörde', title_en: 'An appointment at the immigration office', letter_en: 'a letter from the Ausländerbehörde inviting to an appointment to extend a residence permit (Aufenthaltstitel): date and time, the counter, the list of documents (passport, photos, proof of income, rental contract, health insurance), the fee, and that the old permit stays valid until the decision', scene: 'immigration_office' },
  { key: 'rundfunkbeitrag', domain: 'offices', levels: ['B1', 'B2'], title_de: 'Der Rundfunkbeitrag', title_en: 'The broadcasting fee letter', letter_en: 'a letter from the Beitragsservice about the Rundfunkbeitrag for a new flat: the monthly amount, that one fee is due per household, how to register or to say that a flatmate already pays, the payment options and the deadline' },
  { key: 'finanzamt', domain: 'offices', levels: ['B2', 'C1'], title_de: 'Post vom Finanzamt', title_en: 'A letter from the tax office', letter_en: 'a letter from the Finanzamt asking for missing documents for the income tax return: which documents (Lohnsteuerbescheinigung, receipts for Werbungskosten, insurance certificates), the deadline, the consequence of missing it (Schätzung), and how to send them (ELSTER or post)', scene: 'tax_office_objection', write: 'c2-tax-office-objection' },
  // housing
  { key: 'mietvertrag', domain: 'housing', levels: ['B1', 'B2'], title_de: 'Mietvertrag und Kaution', title_en: 'The rental contract and the deposit', letter_en: 'a letter from a landlord after a flat viewing offering the flat: the Kaltmiete, the Nebenkosten, the Kaution (three months), the move-in date, what to bring to sign the contract (Schufa, proof of income, ID), and by when to reply', scene: 'flat_viewing', write: 'b1-flat-enquiry' },
  { key: 'nebenkosten', domain: 'housing', levels: ['B2', 'C1'], title_de: 'Die Nebenkostenabrechnung', title_en: 'The annual utility bill', letter_en: 'the yearly Nebenkostenabrechnung from a landlord: the period, the total costs by item (heating, water, Hausmeister, Müllabfuhr, Grundsteuer), the share of the flat, the prepayments made, the resulting Nachzahlung with the due date, and the right to see the receipts within twelve months', scene: 'utility_bill', write: 'b2-deposit-letter' },
  { key: 'hausordnung', domain: 'housing', levels: ['A2', 'B1'], title_de: 'Aushang im Treppenhaus', title_en: 'A notice in the stairwell', letter_en: 'a notice from the Hausverwaltung posted in the stairwell: the water will be shut off on a given day and time for repairs, the Treppenhausreinigung rota, where to put bikes and rubbish, and whom to call in an emergency, with a phone number', scene: 'landlord_washing', write: 'a2-heating-broken' },
  { key: 'mieterhoehung', domain: 'housing', levels: ['C1', 'C2'], title_de: 'Die Mieterhöhung', title_en: 'A rent increase', letter_en: 'a landlord\'s letter announcing a rent increase with reference to the Mietspiegel: the current rent, the new rent and the percentage, from when, the legal basis in one sentence, the request to agree in writing within two months, and the tenant\'s right to object', scene: 'rent_increase', write: 'c1-rent-increase-objection' },
  // health
  { key: 'arzttermin', domain: 'health', levels: ['A1', 'A2'], title_de: 'Termin in der Arztpraxis', title_en: 'An appointment at the doctor\'s', letter_en: 'a short reminder letter from a doctor\'s practice: the appointment\'s day and time, to bring the Versichertenkarte and a list of medicines, to come fifteen minutes early, and to call if one cannot come, with the phone number and opening hours', scene: 'doctor_phone', write: 'a1-ill-message-course' },
  { key: 'krankschreibung', domain: 'health', levels: ['B1', 'B2'], title_de: 'Krank: die Krankschreibung', title_en: 'Off sick: the sick note', letter_en: 'a letter from the Krankenkasse to a member who has been ill for six weeks: that the employer\'s pay ends after six weeks, that Krankengeld follows, how much (seventy per cent of gross, at most ninety per cent of net), which form the doctor must fill, and whom to call with questions', scene: 'sick_call', write: 'a2-sick-course' },
  { key: 'apotheke', domain: 'health', levels: ['A2', 'B1'], title_de: 'In der Apotheke: der Beipackzettel', title_en: 'At the pharmacy: the medicine leaflet', letter_en: 'the key part of a medicine leaflet (Beipackzettel) for a painkiller: what it is for, how many tablets a day and when, the maximum per day, that it is taken with water after a meal, who must not take it (children under twelve, pregnancy), and to ask the doctor if the pain lasts more than three days', scene: 'pharmacy' },
  // work
  { key: 'bewerbung', domain: 'work', levels: ['B1', 'B2'], title_de: 'Einladung zum Vorstellungsgespräch', title_en: 'An invitation to a job interview', letter_en: 'a letter from a company inviting an applicant to a job interview: the position, the date, time and address, who will be there, how long it takes, what to bring (certificates, ID), that travel costs are reimbursed, and to confirm by email', scene: 'job_interview', write: 'b2-application' },
  { key: 'arbeitsvertrag', domain: 'work', levels: ['B2', 'C1'], title_de: 'Der Arbeitsvertrag', title_en: 'The employment contract', letter_en: 'the main clauses of an employment contract in plain words: the start date, the Probezeit of six months, the weekly hours, the gross salary, the thirty days of holiday, the Kündigungsfrist, and the duty to report sickness on the first day with a certificate from the third day', scene: 'salary_negotiation' },
  // money
  { key: 'konto', domain: 'money', levels: ['B1', 'B2'], title_de: 'Das Girokonto', title_en: 'The current account', letter_en: 'a letter from a bank to a new customer: the account is open, the IBAN, the card arrives separately and the PIN in another letter, the monthly fee and when it is free, how to activate online banking, and whom to call if the card is lost, with the number', scene: 'bank_account', write: 'b1-bank-account-email' },
  { key: 'mahnung', domain: 'money', levels: ['B1', 'B2'], title_de: 'Die Mahnung', title_en: 'A payment reminder', letter_en: 'a Mahnung from an online shop or a phone company: the invoice number and date, the open amount, the Mahngebühr, the new deadline, the account to pay to with the reference, and what follows if it is not paid (Inkasso), plus a sentence for the case the payment has already been made', scene: 'mobile_cancel', write: 'b1-complaint-online-order' },
  { key: 'versicherung', domain: 'money', levels: ['B2', 'C1'], title_de: 'Die Haftpflichtversicherung', title_en: 'Liability insurance', letter_en: 'a letter from an insurer about a private Haftpflichtversicherung: what the policy covers (damage to others, up to a sum), the yearly premium and the Selbstbeteiligung, how to report a claim (within a week, with photos), and that a change of address must be reported' },
  // family
  { key: 'kita', domain: 'family', levels: ['A2', 'B1'], title_de: 'Elternbrief aus Kita und Schule', title_en: 'A letter to parents from the nursery or school', letter_en: 'an Elternbrief from a Kita or primary school: the Elternabend\'s date and time, the day trip (where, when, cost, what to pack, lunch), that the children need rubber boots and a change of clothes, and the slip to sign and return by a date' },
  // transport
  { key: 'deutschlandticket', domain: 'transport', levels: ['A2', 'B1'], title_de: 'Das Deutschlandticket', title_en: 'The Deutschlandticket', letter_en: 'a confirmation from a transport company for a Deutschlandticket subscription: the monthly price, that it is valid on all local and regional trains and buses in Germany but not on ICE and IC, that it is personal and shown on the phone, the monthly payment date, and how and until when to cancel each month', scene: 'travel_centre' },
  { key: 'fuehrerschein', domain: 'transport', levels: ['B1', 'B2'], title_de: 'Führerschein umschreiben', title_en: 'Converting a foreign driving licence', letter_en: 'a letter from the Führerscheinstelle about converting a foreign driving licence: within which period after moving one may still drive with it, which documents to bring (licence, translation, passport, biometric photo, eye test, registration), whether a test is needed, the fee, and the appointment booking online' },
];

export const alltagByKey = (key: string | undefined): AlltagItem | undefined => (key ? ALLTAG.find((a) => a.key === key) : undefined);

/** The situations at a level, or the nearest level's for an A1 learner, grouped by domain in the domains' order. */
export function alltagFor(level: Level): AlltagItem[] {
  const own = ALLTAG.filter((a) => a.levels.includes(level));
  if (own.length) return own;
  return ALLTAG.filter((a) => a.levels.includes('A2'));
}

export const alltagKey = (level: Level, key: string): string => `alltag:${level}:${key}`;
