// The word-list topics per level. They are English identifiers: they go to the model as written, name the list in
// `/words?topic=`, and are stored in lesson plans and progress; `wordTopicLabel` says each one in the app language.
// This module is pure (no model, no Expo) so the learning path and the tests can read it under node.

import type { Level } from '@/harness/levels';
import { getLanguage, tIn } from '@/i18n';
import type { AppLang } from '@/i18n/languages';

/** Vocabulary topics, in English: they go to the model as written and name the list in `/words?topic=`. */
export const WORD_TOPICS: Record<Level, string[]> = {
  // the first six of each level are the original pools (the first is the default list, the day picks one for Practice); the rest came with the learning path
  A1: ['food and drink', 'the family', 'the flat', 'clothes', 'the weather', 'the city', 'greetings and introductions', 'the daily routine', 'hobbies and sport', 'the body and health', 'transport and travel', 'work'],
  A2: ['shopping', 'health and the doctor', 'travelling by train', 'work', 'free time', 'the post office and the bank', 'celebrations and invitations', 'the household', 'holidays', 'school and learning', 'feelings and character', 'nature and animals'],
  B1: ['work and career', 'housing and renting', 'the environment', 'media and news', 'education', 'health', 'relationships and family life', 'consumption and advertising', 'nutrition and sport', 'travel and tourism', 'festivals and traditions', 'the digital world', 'money and banking'],
  B2: ['society and politics', 'technology', 'the economy', 'culture and art', 'science', 'the workplace', 'migration and integration', 'climate change', 'psychology and personality', 'crime and justice', 'city and countryside', 'globalisation'],
  C1: ['politics and the media', 'research and science', 'law and bureaucracy', 'the world of work', 'literature and the arts', 'the environment and energy', 'demographic change', 'artificial intelligence', 'the welfare state', 'mobility of the future'],
  C2: ['philosophy and ethics', 'finance and markets', 'medicine and bioethics', 'language and linguistics', 'history and remembrance', 'diplomacy and international relations', 'rhetoric and argumentation', 'the arts and criticism', 'economic policy'],
};

// the bundled topics stay English identifiers (routes, lesson plans, progress); this says each one in the app language
export const WORD_TOPIC_KEY: Record<string, string> = {
  'greetings and introductions': 'topics.greetings',
  'food and drink': 'topics.food',
  'the family': 'topics.family',
  'the flat': 'topics.flat',
  clothes: 'topics.clothes',
  'the daily routine': 'topics.dailyRoutine',
  'the weather': 'topics.weather',
  'the city': 'topics.city',
  'hobbies and sport': 'topics.hobbies',
  'the body and health': 'topics.body',
  'transport and travel': 'topics.transport',
  shopping: 'topics.shopping',
  'health and the doctor': 'topics.healthDoctor',
  'travelling by train': 'topics.train',
  work: 'topics.work',
  'free time': 'topics.freeTime',
  'the post office and the bank': 'topics.postBank',
  'celebrations and invitations': 'topics.celebrations',
  'the household': 'topics.household',
  holidays: 'topics.holidays',
  'school and learning': 'topics.school',
  'feelings and character': 'topics.feelings',
  'nature and animals': 'topics.nature',
  'work and career': 'topics.career',
  'housing and renting': 'topics.housing',
  'the environment': 'topics.environment',
  'media and news': 'topics.media',
  education: 'topics.education',
  health: 'topics.health',
  'relationships and family life': 'topics.relationships',
  'consumption and advertising': 'topics.consumption',
  'nutrition and sport': 'topics.nutrition',
  'travel and tourism': 'topics.tourism',
  'festivals and traditions': 'topics.traditions',
  'the digital world': 'topics.digital',
  'money and banking': 'topics.money',
  'society and politics': 'topics.society',
  technology: 'topics.technology',
  'the economy': 'topics.economy',
  'culture and art': 'topics.culture',
  science: 'topics.science',
  'the workplace': 'topics.workplace',
  'migration and integration': 'topics.migration',
  'climate change': 'topics.climate',
  'psychology and personality': 'topics.psychology',
  'crime and justice': 'topics.crime',
  'city and countryside': 'topics.urbanRural',
  globalisation: 'topics.globalisation',
  'politics and the media': 'topics.politicsMedia',
  'research and science': 'topics.research',
  'law and bureaucracy': 'topics.law',
  'the world of work': 'topics.worldOfWork',
  'literature and the arts': 'topics.literature',
  'the environment and energy': 'topics.energy',
  'demographic change': 'topics.demography',
  'artificial intelligence': 'topics.ai',
  'the welfare state': 'topics.welfare',
  'mobility of the future': 'topics.mobility',
  'philosophy and ethics': 'topics.philosophy',
  'finance and markets': 'topics.finance',
  'medicine and bioethics': 'topics.medicine',
  'language and linguistics': 'topics.linguistics',
  'history and remembrance': 'topics.history',
  'diplomacy and international relations': 'topics.diplomacy',
  'rhetoric and argumentation': 'topics.rhetoric',
  'the arts and criticism': 'topics.criticism',
  'economic policy': 'topics.economicPolicy',
};

/** A word-list topic as the learner reads it: bundled ones translated, ones the tutor named kept as it said them. */
export function wordTopicLabel(topic: string, lang: AppLang = getLanguage()): string {
  const key = WORD_TOPIC_KEY[topic];
  return key ? tIn(lang, key) : topic;
}
