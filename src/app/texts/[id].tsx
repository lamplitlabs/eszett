// One text from the portfolio: the task it answered, the learner's text with the tutor's changes marked, the
// tutor's explanation, and the way back to the task to write it once more.

import { router, useLocalSearchParams } from 'expo-router';
import { RotateCcw, Trash2 } from 'lucide-react-native';
import { Alert, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { diffWords } from '@/harness/diff';
import { WRITE_TASKS } from '@/harness/writing';
import { useI18n } from '@/i18n';
import { localizeWriting } from '@/i18n/content';
import { useAuthored } from '@/state/authored';
import { useSettings } from '@/state/settings';
import { useTexts } from '@/state/texts';
import { Button, IconButton, Paper } from '@/ui/controls';
import { Markdown } from '@/ui/Markdown';
import { RedPen } from '@/ui/RedPen';
import { TopBar } from '@/ui/Screen';
import { De, Txt } from '@/ui/Text';
import { gutter, space, useTheme } from '@/ui/theme';

import { textDate } from './index';

export default function TextScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const explainIn = useSettings((s) => s.explainIn);
  const item = useTexts((s) => s.items[id]);
  const remove = useTexts((s) => s.remove);
  const ownTask = useAuthored((s) => (item ? s.tasks[item.taskId] : undefined));
  const task = ownTask ?? WRITE_TASKS.find((x) => x.id === item?.taskId);
  const shown = task ? localizeWriting(task, lang) : null;

  const confirmRemove = () =>
    Alert.alert(t('texts.remove'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          if (item) remove(item.id);
          router.back();
        },
      },
    ]);

  if (!item) {
    return (
      <View style={{ flex: 1, backgroundColor: c.paper }}>
        <TopBar title={t('texts.title')} />
      </View>
    );
  }
  const diff = item.corrected ? diffWords(item.text, item.corrected) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={shown?.title ?? item.title} right={<IconButton icon={Trash2} label={t('texts.remove')} size={36} onPress={confirmRemove} />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.m }}>
        <Txt variant="caption" color="inkSoft">
          {textDate(item.created, lang)} · {item.level} · {t('texts.words', { count: item.words })} · {t('texts.points', { hit: item.pointsHit, total: item.pointsTotal })}
        </Txt>
        {shown ? (
          <Txt variant="small" color="inkSoft">
            {shown.prompt}
          </Txt>
        ) : null}
        <Paper style={{ gap: space.m }}>
          <Txt variant="caption" color="inkSoft">
            {t('write.yourText')}
          </Txt>
          {item.corrected !== null || item.unchanged ? (
            <RedPen original={item.text} corrected={item.corrected} diff={diff} unchanged={item.unchanged} />
          ) : (
            <De variant="german">{item.text}</De>
          )}
        </Paper>
        {item.explanation ? (
          <Paper tone="alt" style={{ gap: space.s }}>
            <Txt variant="caption" color="inkSoft">
              {t('write.corrections')}
            </Txt>
            <Markdown text={item.explanation} lang={explainIn} onWord={(l) => router.push(`/word/${encodeURIComponent(l)}`)} />
          </Paper>
        ) : null}
        {task ? <Button label={t('texts.writeAgain')} icon={RotateCcw} kind="secondary" onPress={() => router.push(`/write/${task.id}` as never)} /> : null}
      </ScrollView>
    </View>
  );
}
