// Today's one-minute talk on the Home tab (src/harness/minute.ts): the prompt of the day, a Start button, and
// once it is done the pace and the streak of days. Speaking every day is the habit the card is for, so it
// stays on the screen after the talk as a small tick rather than disappearing.

import { router } from 'expo-router';
import { Check, Mic, MessagesSquare } from 'lucide-react-native';
import { View } from 'react-native';

import { minutePromptsFor, promptOfDay } from '@/harness/minute';
import { useI18n } from '@/i18n';
import { useSettings } from '@/state/settings';
import { newestFirst, summarise, talkToday, useSpeaking } from '@/state/speaking';
import { Button, Paper, Press } from '@/ui/controls';
import { De, Txt } from '@/ui/Text';
import { space, useTheme } from '@/ui/theme';

export default function MinuteCard() {
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const level = useSettings((s) => s.level);
  const talks = useSpeaking((s) => s.talks);
  const chats = useSpeaking((s) => s.chats);
  const today = talkToday(talks);
  const done = newestFirst(talks)
    .filter((x) => x.level === level)
    .map((x) => x.prompt);
  const prompt = today ? (minutePromptsFor(today.level).find((p) => p.id === today.prompt) ?? promptOfDay(level, done)) : promptOfDay(level, done);
  const summary = summarise(talks, chats);

  return (
    <Paper tone={today ? 'green' : 'amber'} style={{ gap: space.s, marginBottom: space.x3 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
        {today ? <Check size={18} color={c.green} strokeWidth={2.6} /> : <Mic size={18} color={c.amberInk} />}
        <Txt variant="bodyStrong" style={{ flex: 1, color: today ? c.green : c.amberInk }}>
          {today ? t('home.minuteDone', { wpm: today.wpm }) : t('home.minuteTitle')}
        </Txt>
        {summary.streak > 1 ? (
          <Txt variant="caption" color="inkSoft">
            {t('home.minuteStreak', { count: summary.streak })}
          </Txt>
        ) : null}
      </View>
      <Press onPress={() => router.push({ pathname: '/minute', params: { level, prompt: prompt.id } })} scaleTo={0.99} accessibilityLabel={t('home.minuteTitle')}>
        <De variant="germanStrong">{prompt.prompt_de}</De>
        {lang !== 'de' ? (
          <Txt variant="small" color="inkSoft">
            {t(`minute.prompt.${prompt.id}`)}
          </Txt>
        ) : null}
      </Press>
      <View style={{ flexDirection: 'row', gap: space.s, marginTop: space.xs }}>
        <Button label={today ? t('home.minuteAgain') : t('home.minuteStart')} icon={Mic} size="medium" kind={today ? 'secondary' : 'primary'} grow onPress={() => router.push({ pathname: '/minute', params: { level, prompt: prompt.id } })} />
        <Button label={t('home.talkStart')} icon={MessagesSquare} size="medium" kind="secondary" grow onPress={() => router.push({ pathname: '/talk', params: { level } })} />
      </View>
    </Paper>
  );
}
