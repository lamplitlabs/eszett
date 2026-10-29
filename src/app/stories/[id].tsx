// One story of the pack (src/harness/stories.ts): author, edition and licence, the parts with their length and a
// tick for the ones done, and a button to start or continue. Each part opens in the reading step
// (`/read?story=<id>&part=<n>`), so it can be listened to, read, and read aloud.

import { router, useLocalSearchParams } from 'expo-router';
import { BookOpen, Check, ChevronRight, ExternalLink } from 'lucide-react-native';
import { Linking, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { storyById, storyKey, storyMinutes, storyProgress } from '@/harness/stories';
import { useI18n } from '@/i18n';
import { useProgress } from '@/state/progress';
import { Button, Paper, Press } from '@/ui/controls';
import { TopBar } from '@/ui/Screen';
import { Txt } from '@/ui/Text';
import { gutter, space, useTheme } from '@/ui/theme';

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

export default function StoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const done = useProgress((s) => s.done);
  const story = storyById(id);

  if (!story) {
    return (
      <View style={{ flex: 1, backgroundColor: c.paper }}>
        <TopBar title={t('story.library')} />
      </View>
    );
  }
  const progress = storyProgress(story, done);
  const open = (part: number) => router.push(`/read?story=${story.id}&part=${part}` as never);
  const startLabel = progress.done === 0 ? t('story.start') : progress.next === null ? t('story.again') : t('story.continue', { n: progress.next + 1 });

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={t('story.library')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.m }}>
        <Txt variant="title">{story.title}</Txt>
        <Txt variant="body" color="inkSoft">
          {t('story.intro', { author: story.author, year: story.year ?? '', level: story.level })}
        </Txt>
        <Txt variant="small" color="inkSoft">
          {t('story.minutes', { count: storyMinutes(story.words) })} · {t('story.words', { count: story.words })} · {t('story.parts', { count: story.parts.length })}
          {progress.done ? ` · ${t('story.partsDone', { done: progress.done, total: story.parts.length })}` : ''}
        </Txt>
        <Button label={startLabel} icon={BookOpen} onPress={() => open(progress.next ?? 0)} />

        {story.parts.length > 1 ? (
          <View style={{ gap: space.s, marginTop: space.s }}>
            {story.parts.map((p, i) => {
              const isDone = Boolean(done[storyKey(story.id, i)]);
              return (
                <Animated.View key={i} entering={FadeInDown.delay(Math.min(i, 6) * 40).duration(240)}>
                  <Press onPress={() => open(i)} scaleTo={0.99} accessibilityLabel={t('story.part', { n: i + 1, total: story.parts.length })}>
                    <Paper style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
                      <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: isDone ? c.greenTint : c.sheetAlt }}>
                        {isDone ? (
                          <Check size={18} color={c.green} strokeWidth={2.4} />
                        ) : (
                          <Txt variant="smallStrong" color="inkSoft">
                            {i + 1}
                          </Txt>
                        )}
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Txt variant="bodyStrong">{t('story.part', { n: i + 1, total: story.parts.length })}</Txt>
                        <Txt variant="caption" color="inkSoft" numberOfLines={1}>
                          {t('story.words', { count: wordCount(p.text) })} · {p.text.replace(/\s+/g, ' ').slice(0, 60)}…
                        </Txt>
                      </View>
                      <ChevronRight size={18} color={c.inkFaint} />
                    </Paper>
                  </Press>
                </Animated.View>
              );
            })}
          </View>
        ) : null}

        <Paper tone="alt" style={{ gap: space.s, marginTop: space.s }}>
          <Txt variant="caption" color="inkSoft">
            {t('story.source', { edition: story.edition })}
          </Txt>
          <Txt variant="caption" color="inkSoft">
            {t('story.licence')}
          </Txt>
          <Button label={t('story.openSource')} icon={ExternalLink} kind="quiet" size="medium" onPress={() => void Linking.openURL(story.source)} />
        </Paper>
      </ScrollView>
    </View>
  );
}
