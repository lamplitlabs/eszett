// The progress pictures of the Me tab and the Progress screen: the week's bars, the accuracy by practice area,
// the speaking numbers with their fourteen-day chart.
import { View } from 'react-native';

import { useI18n } from '@/i18n';
import { accuracy, useProgress, type Area } from '@/state/progress';
import { summarise, useSpeaking, wordsByDay } from '@/state/speaking';
import { dayKey } from '@/state/storage';
import { Paper } from '@/ui/controls';
import { Txt } from '@/ui/Text';
import { space, useTheme } from '@/ui/theme';

/** The practice areas with the catalog key of their label. */
export const AREAS: [Area, string][] = [
  ['article', 'me.area.article'],
  ['plural', 'me.area.plural'],
  ['meaning', 'me.area.meaning'],
  ['verbs', 'me.area.verbs'],
  ['numbers', 'me.area.numbers'],
  ['clock', 'me.area.clock'],
  ['dates', 'me.area.dates'],
  ['prices', 'me.area.prices'],
  ['grammar', 'me.area.grammar'],
  ['reading', 'me.area.reading'],
  ['listening', 'me.area.listening'],
  ['speaking', 'me.area.speaking'],
  ['check', 'me.area.check'],
  ['review', 'me.area.review'],
];

/** Seven bars, one per day, today in amber. */
export function Week() {
  const { c } = useTheme();
  const { t } = useI18n();
  const days = useProgress((s) => s.days);
  const today = new Date();
  const items = Array.from({ length: 7 }, (_, i) => {
    const ms = today.getTime() - (6 - i) * 86_400_000;
    const d = new Date(ms);
    return { key: dayKey(ms), n: days[dayKey(ms)] ?? 0, label: t(`me.weekday${d.getDay()}`) };
  });
  const max = Math.max(10, ...items.map((i) => i.n));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.s, height: 92 }}>
      {items.map((i, k) => (
        <View key={i.key} style={{ flex: 1, alignItems: 'center', gap: 6 }} accessibilityLabel={t('me.dayItems', { day: i.label, count: i.n })}>
          <View style={{ width: '100%', height: 64, justifyContent: 'flex-end' }}>
            <View style={{ height: Math.max(4, (i.n / max) * 64), borderRadius: 5, backgroundColor: i.n ? (k === 6 ? c.amber : c.royal) : c.sheetAlt }} />
          </View>
          <Txt variant="caption" style={{ color: k === 6 ? c.ink : c.inkFaint }}>
            {i.label}
          </Txt>
        </View>
      ))}
    </View>
  );
}

/** One bar per practised area, coloured by accuracy. */
export function AreaBars() {
  const { c } = useTheme();
  const { t } = useI18n();
  const areas = useProgress((p) => p.areas);
  const practised = AREAS.filter(([a]) => (areas[a]?.seen ?? 0) > 0);
  if (!practised.length) {
    return (
      <Txt variant="small" color="inkSoft">
        {t('me.accuracyEmpty')}
      </Txt>
    );
  }
  return (
    <View style={{ gap: space.s }}>
      {practised.map(([a, key]) => {
        const acc = accuracy(areas[a]);
        const seen = areas[a]?.seen ?? 0;
        return (
          <View key={a} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Txt variant="small">{t(key)}</Txt>
              <Txt variant="caption" color="inkSoft">
                {acc === null ? t('me.answered', { count: seen }) : t('me.accuracyOf', { percent: Math.round(acc * 100), count: seen })}
              </Txt>
            </View>
            <View style={{ height: 5, borderRadius: 3, backgroundColor: c.sheetAlt }}>
              <View style={{ height: 5, borderRadius: 3, width: `${Math.round((acc ?? 0) * 100)}%`, backgroundColor: (acc ?? 0) >= 0.8 ? c.green : (acc ?? 0) >= 0.5 ? c.amber : c.red }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function SpeakingCard() {
  const { c } = useTheme();
  const { t } = useI18n();
  const talks = useSpeaking((s) => s.talks);
  const chats = useSpeaking((s) => s.chats);
  const summary = summarise(talks, chats);
  const days = wordsByDay(talks, chats, 14);
  const max = Math.max(60, ...days.map((d) => d.words));
  const trend = summary.recentWpm !== null && summary.earlierWpm !== null ? summary.recentWpm - summary.earlierWpm : null;
  return (
    <Paper style={{ gap: space.l }}>
      <View style={{ flexDirection: 'row', gap: space.xl }}>
        <View>
          <Txt variant="title">{summary.talks}</Txt>
          <Txt variant="small" color="inkSoft">
            {t('me.speakingTalks', { count: summary.talks })}
          </Txt>
        </View>
        <View>
          <Txt variant="title">{summary.chats}</Txt>
          <Txt variant="small" color="inkSoft">
            {t('me.speakingChats', { count: summary.chats })}
          </Txt>
        </View>
        <View>
          <Txt variant="title">{summary.words}</Txt>
          <Txt variant="small" color="inkSoft">
            {t('me.speakingWords')}
          </Txt>
        </View>
      </View>
      {summary.talks ? (
        <Txt variant="small" color="inkSoft">
          {summary.recentWpm !== null ? t('me.speakingPace', { wpm: summary.recentWpm, best: summary.bestWpm }) : ''}
          {trend !== null ? ` ${trend > 0 ? t('me.speakingUp', { n: trend }) : trend < 0 ? t('me.speakingDown', { n: -trend }) : t('me.speakingSame')}` : ''}
        </Txt>
      ) : (
        <Txt variant="small" color="inkSoft">
          {t('me.speakingEmpty')}
        </Txt>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 56 }} accessibilityLabel={t('me.speakingChart')}>
        {days.map((d, i) => (
          <View key={d.key} style={{ flex: 1, height: 56, justifyContent: 'flex-end' }}>
            <View style={{ height: Math.max(3, (d.words / max) * 56), borderRadius: 3, backgroundColor: d.words ? (i === days.length - 1 ? c.amber : c.red) : c.sheetAlt }} />
          </View>
        ))}
      </View>
    </Paper>
  );
}
