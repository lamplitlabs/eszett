// Today's lesson. The tutor model plans it: it picks and orders four activities from the app's menu and
// says why each one helps this learner. The app builds every activity itself (which noun, which scene,
// which grammar topic), so a plan can never point at something the app cannot check. A fixed plan is
// shown at once and replaced when the model's plan arrives; if the model is away, the fixed plan stays.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { DrillCategory } from '@/harness/drills';
import { atOrBelow, type Level } from '@/harness/levels';
import { sceneTitle, type SceneCard } from '@/harness/roleplay';
import { tasksFor } from '@/harness/writing';
import { getLanguage, tIn } from '@/i18n';
import { localizeGrammar, localizeScene, localizeWriting } from '@/i18n/content';
import type { AppLang } from '@/i18n/languages';
import { cards, isReady, tutor } from '@/model/runtime';
import scenesData from '@/data/scenes.json';
import { authoredCards, authoredScenes, authoredTasks, topicsFor, useAuthored } from '@/state/authored';
import { accuracy, type Area, useProgress } from '@/state/progress';
import { dayKey, storage } from '@/state/storage';

export const scenes = scenesData as unknown as SceneCard[];

export type ActivityType = 'articles' | 'plurals' | 'meanings' | 'verbs' | 'numbers' | 'clock' | 'dates' | 'prices' | 'grammar' | 'scene' | 'writing' | 'words';

export interface Activity {
  type: ActivityType;
  /** The card key, scene key, task id or topic the activity is about; drills have none. */
  item?: string;
  /** Title and detail as worded when the plan was made; `activityLabel` rewords them in the current language. */
  title: string;
  detail: string;
  why: string | null;
  href: string;
}

/** The menu the model plans from; aliases read its numbered lines back. */
export const MENU: { id: ActivityType; alias: RegExp }[] = [
  { id: 'articles', alias: /\barticles?\b|der,? die,? das|\bgender\b/i },
  { id: 'plurals', alias: /\bplurals?\b/i },
  { id: 'meanings', alias: /\bmeanings?\b/i },
  { id: 'verbs', alias: /\bverbs?\b/i },
  { id: 'numbers', alias: /\bnumbers?\b/i },
  { id: 'clock', alias: /\bclock\b|\btime\b/i },
  { id: 'dates', alias: /\bdates?\b/i },
  { id: 'prices', alias: /\bprices?\b/i },
  { id: 'grammar', alias: /\bgrammar\b/i },
  { id: 'scene', alias: /\bscenes?\b|role-?play/i },
  { id: 'writing', alias: /\bwriting\b|\bletter\b|\bemail\b/i },
  { id: 'words', alias: /\bwords\b|\bvocab(ulary)?\b/i },
];

/** The drills the plan can hold: category and the catalog keys of the row's title and detail. */
const DRILL: Partial<Record<ActivityType, { category: DrillCategory; title: string; detail: string }>> = {
  articles: { category: 'article', title: 'lesson.articlesTitle', detail: 'lesson.articlesDetail' },
  plurals: { category: 'plural', title: 'lesson.pluralsTitle', detail: 'lesson.pluralsDetail' },
  meanings: { category: 'meaning', title: 'lesson.meaningsTitle', detail: 'lesson.meaningsDetail' },
  verbs: { category: 'verbs', title: 'lesson.verbsTitle', detail: 'lesson.verbsDetail' },
  numbers: { category: 'numbers', title: 'lesson.numbersTitle', detail: 'lesson.numbersDetail' },
  clock: { category: 'clock', title: 'lesson.clockTitle', detail: 'lesson.clockDetail' },
  dates: { category: 'dates', title: 'lesson.datesTitle', detail: 'lesson.datesDetail' },
  prices: { category: 'prices', title: 'lesson.pricesTitle', detail: 'lesson.pricesDetail' },
};

/** Vocabulary topics, in English: they go to the model as written and name the list in `/words?topic=`. */
export const WORD_TOPICS: Record<Level, string[]> = {
  A1: ['food and drink', 'the family', 'the flat', 'clothes', 'the weather', 'the city'],
  A2: ['shopping', 'health and the doctor', 'travelling by train', 'work', 'free time', 'the post office and the bank'],
  B1: ['work and career', 'housing and renting', 'the environment', 'media and news', 'education', 'health'],
  B2: ['society and politics', 'technology', 'the economy', 'culture and art', 'science', 'the workplace'],
  C1: ['politics and the media', 'research and science', 'law and bureaucracy', 'the world of work', 'literature and the arts', 'the environment and energy'],
  C2: ['philosophy and ethics', 'finance and markets', 'medicine and bioethics', 'language and linguistics', 'history and remembrance', 'diplomacy and international relations'],
};

// the bundled topics stay English identifiers (routes, lesson plans, progress); this says each one in the app language
const WORD_TOPIC_KEY: Record<string, string> = {
  'food and drink': 'topics.food',
  'the family': 'topics.family',
  'the flat': 'topics.flat',
  clothes: 'topics.clothes',
  'the weather': 'topics.weather',
  'the city': 'topics.city',
  shopping: 'topics.shopping',
  'health and the doctor': 'topics.healthDoctor',
  'travelling by train': 'topics.train',
  work: 'topics.work',
  'free time': 'topics.freeTime',
  'the post office and the bank': 'topics.postBank',
  'work and career': 'topics.career',
  'housing and renting': 'topics.housing',
  'the environment': 'topics.environment',
  'media and news': 'topics.media',
  education: 'topics.education',
  health: 'topics.health',
  'society and politics': 'topics.society',
  technology: 'topics.technology',
  'the economy': 'topics.economy',
  'culture and art': 'topics.culture',
  science: 'topics.science',
  'the workplace': 'topics.workplace',
  'politics and the media': 'topics.politicsMedia',
  'research and science': 'topics.research',
  'law and bureaucracy': 'topics.law',
  'the world of work': 'topics.worldOfWork',
  'literature and the arts': 'topics.literature',
  'the environment and energy': 'topics.energy',
  'philosophy and ethics': 'topics.philosophy',
  'finance and markets': 'topics.finance',
  'medicine and bioethics': 'topics.medicine',
  'language and linguistics': 'topics.linguistics',
  'history and remembrance': 'topics.history',
  'diplomacy and international relations': 'topics.diplomacy',
};

/** A word-list topic as the learner reads it: bundled ones translated, ones the tutor named kept as it said them. */
export function wordTopicLabel(topic: string, lang: AppLang = getLanguage()): string {
  const key = WORD_TOPIC_KEY[topic];
  return key ? tIn(lang, key) : topic;
}

const AREA_OF: Partial<Record<ActivityType, Area>> = { articles: 'article', plurals: 'plural', meanings: 'meaning', verbs: 'verbs', numbers: 'numbers', clock: 'clock', dates: 'dates', prices: 'prices' };

function pick<T>(items: T[], done: (t: T) => boolean, salt: number): T | undefined {
  const fresh = items.filter((t) => !done(t));
  const pool = fresh.length ? fresh : items;
  return pool[salt % Math.max(1, pool.length)];
}

type Label = Pick<Activity, 'title' | 'detail'>;

/** The row's title and detail for an activity about `item`, in `lang`; null when the card, scene or task is gone. */
function labelOf(type: ActivityType, level: Level, item: string | undefined, lang: AppLang): Label | null {
  const drill = DRILL[type];
  if (drill) return { title: tIn(lang, drill.title), detail: tIn(lang, drill.detail) };
  if (type === 'grammar') {
    const card = [...cards, ...authoredCards()].find((c) => c.key === item);
    return card ? { title: localizeGrammar(card, lang).title_en, detail: tIn(lang, 'lesson.grammarAt', { level: card.level }) } : null;
  }
  if (type === 'scene') {
    const scene = [...scenes, ...authoredScenes()].find((s) => s.key === item);
    if (!scene) return null;
    const shown = localizeScene(scene, lang);
    return { title: sceneTitle(shown), detail: tIn(lang, 'lesson.sceneDetail', { level: scene.level, role: shown.role_en }) };
  }
  if (type === 'writing') {
    const task = [...tasksFor(level), ...authoredTasks()].find((t) => t.id === item);
    return task ? { title: localizeWriting(task, lang).title, detail: tIn(lang, 'lesson.writingDetail', { min: task.words[0], max: task.words[1] }) } : null;
  }
  return item ? { title: tIn(lang, 'lesson.wordsTitle', { topic: wordTopicLabel(item, lang) }), detail: tIn(lang, 'lesson.wordsDetail') } : null;
}

/** An activity's title and detail in the learner's language (a plan outlives a language change). */
export function activityLabel(a: Activity, level: Level, lang: AppLang = getLanguage()): Label {
  return labelOf(a.type, level, a.item, lang) ?? { title: a.title, detail: a.detail };
}

export function buildActivity(type: ActivityType, level: Level, why: string | null, salt: number): Activity | null {
  const done = useProgress.getState().done;
  const lang = getLanguage();
  const drill = DRILL[type];
  if (drill) return { type, title: tIn(lang, drill.title), detail: tIn(lang, drill.detail), why, href: `/drill/${drill.category}` };
  // content the tutor wrote on this phone counts like the bundled kind
  if (type === 'grammar') {
    const all = [...cards, ...authoredCards()];
    const atLevel = all.filter((c) => c.level === level);
    const card = pick(atLevel.length ? atLevel : all.filter((c) => atOrBelow(c.level, level)), (c) => Boolean(done[`grammar:${c.key}`]), salt);
    const label = card && labelOf(type, level, card.key, lang);
    return card && label ? { type, item: card.key, ...label, why, href: `/grammar/${card.key}` } : null;
  }
  if (type === 'scene') {
    const all = [...scenes, ...authoredScenes()];
    const atLevel = all.filter((s) => s.level === level);
    const scene = pick(atLevel.length ? atLevel : all, (s) => Boolean(done[`scene:${s.key}`]), salt);
    const label = scene && labelOf(type, level, scene.key, lang);
    return scene && label ? { type, item: scene.key, ...label, why, href: `/scene/${scene.key}` } : null;
  }
  if (type === 'writing') {
    const task = pick([...tasksFor(level), ...authoredTasks().filter((t) => t.level === level)], (t) => Boolean(done[`write:${t.id}`]), salt);
    const label = task && labelOf(type, level, task.id, lang);
    return task && label ? { type, item: task.id, ...label, why, href: `/write/${task.id}` } : null;
  }
  const topics = [...WORD_TOPICS[level], ...topicsFor(useAuthored.getState(), level)];
  const topic = topics[salt % topics.length];
  const label = labelOf('words', level, topic, lang);
  return label ? { type: 'words', item: topic, ...label, why, href: `/words?topic=${encodeURIComponent(topic)}` } : null;
}

/** The weakest drill area with enough answers to judge, if any. */
export function weakestArea(): ActivityType | null {
  const areas = useProgress.getState().areas;
  let worst: [ActivityType, number] | null = null;
  for (const [type, area] of Object.entries(AREA_OF) as [ActivityType, Area][]) {
    const a = accuracy(areas[area]);
    if (a !== null && a < 0.8 && (!worst || a < worst[1])) worst = [type, a];
  }
  return worst?.[0] ?? null;
}

export function fixedPlan(level: Level, salt: number): Activity[] {
  const first: ActivityType = weakestArea() ?? (level === 'A1' ? 'articles' : level === 'A2' ? 'verbs' : 'meanings');
  const order: ActivityType[] = [first, 'grammar', 'scene', level === 'A1' ? 'numbers' : salt % 2 ? 'writing' : 'words'];
  return order.map((t) => buildActivity(t, level, null, salt)).filter((a): a is Activity => a !== null);
}

interface LessonState {
  date: string;
  level: Level | null;
  activities: Activity[];
  plannedBy: 'tutor' | 'app';
  planning: boolean;
  ensure: (level: Level) => void;
  replan: (level: Level) => Promise<void>;
}

const saltOf = (date: string) => Number(date.replace(/-/g, '')) % 97;

export const useLesson = create<LessonState>()(
  persist(
    (set, get) => ({
      date: '',
      level: null,
      activities: [],
      plannedBy: 'app',
      planning: false,
      ensure: (level) => {
        const today = dayKey();
        const s = get();
        if (s.date === today && s.level === level && s.activities.length) {
          if (s.plannedBy === 'app' && !s.planning && isReady()) void get().replan(level);
          return;
        }
        set({ date: today, level, activities: fixedPlan(level, saltOf(today)), plannedBy: 'app' });
        if (isReady()) void get().replan(level);
      },
      replan: async (level) => {
        if (get().planning) return;
        set({ planning: true });
        const today = dayKey();
        const weakest = weakestArea();
        const goal = `I'm at ${level} level and I want to get better at everyday German.${weakest ? ` My weakest area so far: ${weakest}.` : ''}`;
        try {
          const plan = await tutor.plan(goal, MENU, { level, lang: 'en' }, 4, saltOf(today));
          if (plan) {
            const activities = plan.map((p, i) => buildActivity(p.id as ActivityType, level, p.why, saltOf(today) + i)).filter((a): a is Activity => a !== null);
            if (activities.length >= 3) set({ activities, plannedBy: 'tutor', date: today, level });
          }
        } catch {
          // the fixed plan stays
        } finally {
          set({ planning: false });
        }
      },
    }),
    {
      name: 'eszett.lesson',
      storage,
      version: 1,
      partialize: ({ date, level, activities, plannedBy }) => ({ date, level, activities, plannedBy }),
    },
  ),
);

export const lessonKey = (index: number) => `lesson:${dayKey()}:${index}`;
