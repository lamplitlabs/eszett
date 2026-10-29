// Living in Germany (src/harness/alltag.ts): the everyday situations with offices, landlords, doctors,
// employers, banks, schools and transport, grouped by domain. Each offers the typical letter to read (the tutor
// writes it, src/app/read.tsx with `alltag=`), and the app's own role-play scene and writing task where they
// exist. Reached from Practice › Living in Germany.

import { router } from 'expo-router';
import { Check, FileText, MessageSquare, NotebookPen } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import scenesData from '@/data/scenes.json';
import { ALLTAG, ALLTAG_DOMAINS, alltagKey, type AlltagItem } from '@/harness/alltag';
import type { Level } from '@/harness/levels';
import { tasksFor } from '@/harness/writing';
import { useI18n } from '@/i18n';
import { useAuthored } from '@/state/authored';
import { useProgress } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { Button, Paper, Pill } from '@/ui/controls';
import { TopBar } from '@/ui/Screen';
import { Txt } from '@/ui/Text';
import { gutter, space, useTheme } from '@/ui/theme';

const SCENE_LEVELS: Record<string, Level> = Object.fromEntries((scenesData as { key: string; level: Level }[]).map((s) => [s.key, s.level]));
const TASK_LEVELS: Record<string, Level> = Object.fromEntries((['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as Level[]).flatMap((l) => tasksFor(l).map((task) => [task.id, l])));

function Situation({ item, level }: { item: AlltagItem; level: Level }) {
  const { t, lang } = useI18n();
  const read = useAuthored((s) => s.readings[alltagKey(level, item.key)]);
  const done = useProgress((s) => s.done);
  const title = lang === 'de' ? item.title_de : item.title_en;
  const sceneLevel = item.scene ? SCENE_LEVELS[item.scene] : undefined;
  const taskLevel = item.write ? TASK_LEVELS[item.write] : undefined;
  const written = item.write ? Boolean(done[`write:${item.write}`]) : false;
  return (
    <Paper style={{ gap: space.s }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
        <Txt variant="bodyStrong" style={{ flex: 1 }}>
          {title}
        </Txt>
        <Txt variant="caption" color="inkFaint">
          {item.levels.join(' · ')}
        </Txt>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
        <Pill label={read ? t('alltag.readAgain') : t('alltag.readLetter')} tone={read ? 'green' : 'amber'} onPress={() => router.push(`/read?alltag=${item.key}` as never)} />
        {item.scene && sceneLevel ? <Pill label={`${t('alltag.rolePlay')} · ${sceneLevel}`} tone="royal" onPress={() => router.push(`/scene/${item.scene}` as never)} /> : null}
        {item.write && taskLevel ? <Pill label={`${t('alltag.write')} · ${taskLevel}${written ? ' ✓' : ''}`} tone={written ? 'green' : 'red'} onPress={() => router.push(`/write/${item.write}` as never)} /> : null}
      </View>
    </Paper>
  );
}

export default function AlltagScreen() {
  const { c } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const level = useSettings((s) => s.level);
  const mine = ALLTAG.filter((a) => a.levels.includes(level));

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={t('alltag.title')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.l }}>
        <Txt variant="body" color="inkSoft">
          {t('alltag.intro', { count: ALLTAG.length })}
        </Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s, alignItems: 'center' }}>
          <FileText size={16} color={c.amberInk} />
          <Txt variant="caption" color="inkSoft">
            {t('alltag.legendLetter')}
          </Txt>
          <MessageSquare size={16} color={c.royal} />
          <Txt variant="caption" color="inkSoft">
            {t('alltag.legendScene')}
          </Txt>
          <NotebookPen size={16} color={c.red} />
          <Txt variant="caption" color="inkSoft">
            {t('alltag.legendWrite')}
          </Txt>
        </View>
        {mine.length ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
            <Check size={16} color={c.green} />
            <Txt variant="small" color="inkSoft">
              {t('alltag.atYourLevel', { count: mine.length, level })}
            </Txt>
          </View>
        ) : null}
        {ALLTAG_DOMAINS.map((domain, d) => {
          const items = ALLTAG.filter((a) => a.domain === domain);
          if (!items.length) return null;
          return (
            <Animated.View key={domain} entering={FadeInDown.delay(Math.min(d, 6) * 50).duration(240)} style={{ gap: space.s }}>
              <Txt variant="headline" accessibilityRole="header">
                {t(`alltag.domain.${domain}`)}
              </Txt>
              {items.map((item) => (
                <Situation key={item.key} item={item} level={level} />
              ))}
            </Animated.View>
          );
        })}
        <Button label={t('common.done')} kind="secondary" size="medium" onPress={() => (router.canGoBack() ? router.back() : router.replace('/practice' as never))} />
      </ScrollView>
    </View>
  );
}
