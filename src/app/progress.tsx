// Progress in full: the streak and the words, the week, accuracy by area, speaking, and the three notebooks
// (words to review, mistakes, saved texts). The Me tab shows the short version and leads here.
import { router } from 'expo-router';
import { BookMarked, Mic, NotebookPen, Repeat } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AreaBars, SpeakingCard, Week } from '@/features/ProgressCards';
import { useI18n } from '@/i18n';
import { dueWords, useDeck } from '@/state/deck';
import { useMistakes } from '@/state/mistakes';
import { streakOf, useProgress } from '@/state/progress';
import { useTexts } from '@/state/texts';
import { Divider, Paper } from '@/ui/controls';
import { LinkRow } from '@/ui/Rows';
import { Section, TopBar } from '@/ui/Screen';
import { Txt } from '@/ui/Text';
import { gutter, space, useTheme } from '@/ui/theme';

export default function ProgressScreen() {
  const { c } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const days = useProgress((p) => p.days);
  const words = useDeck((d) => d.words);
  const streak = streakOf(days);
  const due = dueWords(words).length;
  const mistakeCount = useMistakes((x) => Object.keys(x.items).length);
  const textCount = useTexts((x) => Object.keys(x.items).length);

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={t('me.progress')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: space.m, paddingBottom: insets.bottom + space.x4 }}>
        <Section title={t('me.progress')}>
          <Paper style={{ gap: space.l }}>
            <View style={{ flexDirection: 'row', gap: space.xl }}>
              <View>
                <Txt variant="title">{streak}</Txt>
                <Txt variant="small" color="inkSoft">
                  {t('me.daysInARow', { count: streak })}
                </Txt>
              </View>
              <View>
                <Txt variant="title">{Object.keys(words).length}</Txt>
                <Txt variant="small" color="inkSoft">
                  {t('me.savedWords', { count: Object.keys(words).length })}
                </Txt>
              </View>
            </View>
            <Week />
            <AreaBars />
          </Paper>
          <Paper style={{ paddingVertical: space.xs, marginTop: space.m }}>
            <LinkRow icon={Repeat} tone="royal" label={due ? t('me.reviewDue', { count: due }) : t('me.myWords')} onPress={() => router.push('/review')} />
            <Divider />
            <LinkRow icon={NotebookPen} tone={mistakeCount ? 'red' : 'soft'} label={mistakeCount ? t('mistakes.practiceDetail', { count: mistakeCount }) : t('mistakes.title')} onPress={() => router.push('/mistakes')} />
            <Divider />
            <LinkRow icon={BookMarked} label={textCount ? t('texts.practiceDetail', { count: textCount }) : t('texts.title')} onPress={() => router.push('/texts')} />
          </Paper>
        </Section>

        <Section title={t('me.speaking')}>
          <SpeakingCard />
          <Paper style={{ paddingVertical: space.xs, marginTop: space.m }}>
            <LinkRow icon={Mic} tone="red" label={t('me.speakNow')} onPress={() => router.push('/minute')} />
          </Paper>
        </Section>
      </ScrollView>
    </View>
  );
}
