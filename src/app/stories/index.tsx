// The story library (src/harness/stories.ts): every text of the pack grouped by level, with its author, length
// and how many parts are done. Reached from Practice › Stories.

import { router } from 'expo-router';
import { BookOpen, Check, ChevronRight } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LEVELS } from '@/harness/levels';
import { STORIES, storyMinutes, storyProgress } from '@/harness/stories';
import { useI18n } from '@/i18n';
import { useProgress } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { Paper, Press } from '@/ui/controls';
import { TopBar } from '@/ui/Screen';
import { Txt } from '@/ui/Text';
import { gutter, space, useTheme } from '@/ui/theme';

export default function StoriesScreen() {
  const { c } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const level = useSettings((s) => s.level);
  const done = useProgress((s) => s.done);
  const levels = LEVELS.filter((l) => STORIES.some((s) => s.level === l));

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={t('story.library')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.l }}>
        <Txt variant="body" color="inkSoft">
          {t('story.libraryIntro', { count: STORIES.length })}
        </Txt>
        {levels.map((l) => (
          <View key={l} style={{ gap: space.s }}>
            <Txt variant="headline" accessibilityRole="header">
              {l}
              {l === level ? ` · ${t('story.yourLevel')}` : ''}
            </Txt>
            {STORIES.filter((s) => s.level === l).map((s, i) => {
              const progress = storyProgress(s, done);
              const finished = progress.done === s.parts.length;
              return (
                <Animated.View key={s.id} entering={FadeInDown.delay(Math.min(i, 6) * 40).duration(240)}>
                  <Press onPress={() => router.push(`/stories/${s.id}` as never)} scaleTo={0.99} accessibilityLabel={`${s.title}, ${s.author}`}>
                    <Paper style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
                      <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: finished ? c.greenTint : c.amberTint }}>
                        {finished ? <Check size={20} color={c.green} strokeWidth={2.4} /> : <BookOpen size={20} color={c.amberInk} strokeWidth={2.2} />}
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Txt variant="bodyStrong" numberOfLines={1}>
                          {s.title}
                        </Txt>
                        <Txt variant="caption" color="inkSoft">
                          {s.author} · {t('story.minutes', { count: storyMinutes(s.words) })} · {t('story.parts', { count: s.parts.length })}
                          {progress.done ? ` · ${t('story.partsDone', { done: progress.done, total: s.parts.length })}` : ''}
                        </Txt>
                      </View>
                      <ChevronRight size={18} color={c.inkFaint} />
                    </Paper>
                  </Press>
                </Animated.View>
              );
            })}
          </View>
        ))}
        <Txt variant="caption" color="inkFaint">
          {t('story.licence')}
        </Txt>
      </ScrollView>
    </View>
  );
}
