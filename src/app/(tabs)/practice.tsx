import { router } from 'expo-router';
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  Clock4,
  Euro,
  Hash,
  Layers,
  ListChecks,
  NotebookPen,
  Repeat,
  Route,
  Shapes,
  Sparkles,
  WholeWord,
  type LucideIcon,
} from 'lucide-react-native';
import { View } from 'react-native';

import type { DrillCategory } from '@/harness/drills';
import { atOrBelow, LEVELS } from '@/harness/levels';
import { levelProgress, nextStep } from '@/harness/path';
import { tasksFor } from '@/harness/writing';
import { WORD_TOPICS, wordTopicLabel } from '@/features/lesson';
import { stepLabel } from '@/features/path';
import { useI18n } from '@/i18n';
import { localizeGrammar, localizeWriting } from '@/i18n/content';
import { cards } from '@/model/runtime';
import { newestFirst, topicsFor, useAuthored } from '@/state/authored';
import { dueWords, useDeck } from '@/state/deck';
import { accuracy, useProgress, type Area } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { Paper, Press } from '@/ui/controls';
import { Screen, Section } from '@/ui/Screen';
import { Txt } from '@/ui/Text';
import { radius, space, useTheme, type Palette } from '@/ui/theme';

interface Row {
  title: string;
  detail: string;
  icon: LucideIcon;
  tone: keyof Palette;
  tint: keyof Palette;
  href: string;
  area?: Area;
  badge?: string;
}

function Score({ area }: { area?: Area }) {
  const stats = useProgress((s) => (area ? s.areas[area] : undefined));
  const a = accuracy(stats);
  const { c } = useTheme();
  if (a === null) return null;
  const pct = Math.round(a * 100);
  return (
    <Txt variant="caption" style={{ color: pct >= 80 ? c.green : pct >= 50 ? c.amberInk : c.red }}>
      {pct}%
    </Txt>
  );
}

function List({ rows }: { rows: Row[] }) {
  const { c } = useTheme();
  const { t } = useI18n();
  return (
    <Paper style={{ padding: 0, overflow: 'hidden' }}>
      {rows.map((r, i) => (
        <Press
          key={r.href + r.title}
          onPress={() => router.push(r.href as never)}
          scaleTo={0.99}
          accessibilityLabel={t('practice.rowLabel', { title: r.title, detail: r.detail })}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderTopColor: c.rule }}>
            <View style={{ width: 38, height: 38, borderRadius: radius.small, backgroundColor: c[r.tint], alignItems: 'center', justifyContent: 'center' }}>
              <r.icon size={19} color={c[r.tone]} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong">{r.title}</Txt>
              <Txt variant="small" color="inkSoft" numberOfLines={2}>
                {r.detail}
              </Txt>
            </View>
            {r.badge ? (
              <View style={{ backgroundColor: c.royal, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Txt variant="caption" style={{ color: c.onRoyal }}>
                  {r.badge}
                </Txt>
              </View>
            ) : (
              <Score area={r.area} />
            )}
            <ChevronRight size={18} color={c.inkFaint} />
          </View>
        </Press>
      ))}
    </Paper>
  );
}

const drill = (category: DrillCategory) => `/drill/${category}`;

export default function Practice() {
  const { t, lang } = useI18n();
  const level = useSettings((s) => s.level);
  const words = useDeck((s) => s.words);
  const done = useProgress((s) => s.done);
  const due = dueWords(words).length;
  const total = Object.keys(words).length;
  const ownTasks = useAuthored((s) => s.tasks);
  const ownCards = useAuthored((s) => s.cards);
  const ownTopics = useAuthored((s) => topicsFor(s, level));
  const topics = [...WORD_TOPICS[level], ...ownTopics];
  const topic = topics[new Date().getDay() % topics.length];
  // a comma-separated run of facts about a card or task, each already in the app language
  const facts = (parts: (string | false)[]) => parts.filter((p): p is string => Boolean(p)).join(t('practice.listSeparator'));

  const course = levelProgress(level, done);
  const courseStep = course.current ? nextStep(course.current, done) : null;
  const courseRows: Row[] = [
    {
      title: t('path.practiceTitle', { level }),
      detail: course.current
        ? t('path.practiceDetail', { done: course.finished, total: course.units.length, title: courseStep !== null ? stepLabel(course.current, courseStep, lang).title : course.current.title_de })
        : t('path.practiceDetailDone', { total: course.units.length }),
      icon: Route,
      tone: 'royal',
      tint: 'royalTint',
      href: course.current ? `/path/${course.current.key}` : '/path',
    },
  ];
  const wordRows: Row[] = [
    { title: t('practice.articleTitle'), detail: t('practice.articleDetail', { level }), icon: Shapes, tone: 'die', tint: 'dieTint', href: drill('article'), area: 'article' },
    { title: t('practice.pluralTitle'), detail: t('practice.pluralDetail'), icon: Layers, tone: 'der', tint: 'derTint', href: drill('plural'), area: 'plural' },
    { title: t('practice.meaningTitle'), detail: t('practice.meaningDetail'), icon: WholeWord, tone: 'das', tint: 'dasTint', href: drill('meaning'), area: 'meaning' },
    { title: t('practice.newWordsTitle', { topic: wordTopicLabel(topic, lang) }), detail: t('practice.newWordsDetail'), icon: Sparkles, tone: 'amberInk', tint: 'amberTint', href: `/words?topic=${encodeURIComponent(topic)}` },
    {
      title: t('practice.myWordsTitle'),
      detail: total ? t('practice.myWordsDetail', { saved: t('practice.savedCount', { count: total }), due: t('practice.dueCount', { count: due }) }) : t('practice.myWordsEmpty'),
      icon: Repeat,
      tone: 'royal',
      tint: 'royalTint',
      href: '/review',
      badge: due ? String(due) : undefined,
    },
  ];
  const verbRows: Row[] = [{ title: t('practice.verbsTitle'), detail: t('practice.verbsDetail'), icon: ListChecks, tone: 'royal', tint: 'royalTint', href: drill('verbs'), area: 'verbs' }];
  const numberRows: Row[] = [
    { title: t('practice.numbersTitle'), detail: level === 'A1' ? t('practice.numbersDetailA1') : t('practice.numbersDetail'), icon: Hash, tone: 'ink', tint: 'sheetAlt', href: drill('numbers'), area: 'numbers' },
    { title: t('practice.clockTitle'), detail: t('practice.clockDetail'), icon: Clock4, tone: 'ink', tint: 'sheetAlt', href: drill('clock'), area: 'clock' },
    { title: t('practice.datesTitle'), detail: t('practice.datesDetail'), icon: CalendarDays, tone: 'ink', tint: 'sheetAlt', href: drill('dates'), area: 'dates' },
    { title: t('practice.pricesTitle'), detail: t('practice.pricesDetail'), icon: Euro, tone: 'ink', tint: 'sheetAlt', href: drill('prices'), area: 'prices' },
    ...(level === 'A1'
      ? []
      : [{ title: t('practice.sentenceTitle'), detail: t('practice.sentenceDetail'), icon: CalendarDays, tone: 'ink' as const, tint: 'sheetAlt' as const, href: drill('sentence'), area: 'sentence' as const }]),
  ];
  const grammar: Row[] = [
    { title: t('practice.grammarNewTitle'), detail: t('practice.grammarNewDetail'), icon: Sparkles, tone: 'amberInk', tint: 'amberTint', href: '/grammar/new' },
    ...[...newestFirst(ownCards).filter((k) => atOrBelow(k.level, level)), ...cards.filter((k) => atOrBelow(k.level, level)).sort((a, b) => LEVELS.indexOf(b.level) - LEVELS.indexOf(a.level))].map<Row>((k) => ({
      title: localizeGrammar(k, lang).title_en,
      detail: facts([k.level, 'generated' in k && t('practice.byTutor'), Boolean(done[`grammar:${k.key}`]) && t('practice.doneMark'), k.pitfalls.length > 0 && t('practice.exerciseCount', { count: k.pitfalls.length })]),
      icon: BookOpen,
      tone: done[`grammar:${k.key}`] ? 'green' : 'royal',
      tint: done[`grammar:${k.key}`] ? 'greenTint' : 'royalTint',
      href: `/grammar/${k.key}`,
    })),
  ];
  const writing: Row[] = [
    { title: t('practice.writeNewTitle'), detail: t('practice.writeNewDetail'), icon: Sparkles, tone: 'amberInk', tint: 'amberTint', href: '/write/new' },
    ...[...newestFirst(ownTasks).filter((task) => task.level === level), ...tasksFor(level)].map<Row>((task) => ({
      title: localizeWriting(task, lang).title,
      detail: facts([
        task.register === 'formal' ? t('practice.formal') : t('practice.informal'),
        t('practice.wordRange', { lo: task.words[0], hi: task.words[1] }),
        'generated' in task && t('practice.byTutor'),
        Boolean(done[`write:${task.id}`]) && t('practice.doneMark'),
      ]),
      icon: NotebookPen,
      tone: 'red',
      tint: 'redTint',
      href: `/write/${task.id}`,
    })),
  ];

  return (
    <Screen title={t('practice.title')} subtitle={t('practice.subtitle', { level })}>
      <Section title={t('path.title')}>
        <List rows={courseRows} />
      </Section>
      <Section title={t('practice.words')}>
        <List rows={wordRows} />
      </Section>
      <Section title={t('practice.verbs')}>
        <List rows={verbRows} />
      </Section>
      <Section title={t('practice.numbersAndTime')}>
        <List rows={numberRows} />
      </Section>
      <Section title={t('practice.writing')}>
        <List rows={writing} />
      </Section>
      <Section title={t('practice.grammar')}>
        <List rows={grammar} />
      </Section>
    </Screen>
  );
}
