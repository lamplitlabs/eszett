// A writing task the tutor model sets for a topic the learner names. The harness reads the task back,
// normalises its key words so the precheck can find them, and keeps it on this phone.

import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthorBox } from '@/features/AuthorBox';
import { useI18n } from '@/i18n';
import { tutor } from '@/model/runtime';
import { useAuthored } from '@/state/authored';
import { useSettings } from '@/state/settings';
import { Pill } from '@/ui/controls';
import { TopBar } from '@/ui/Screen';
import { Txt } from '@/ui/Text';
import { gutter, space, useTheme } from '@/ui/theme';

export default function NewWriteTask() {
  const { topic } = useLocalSearchParams<{ topic?: string }>();
  const { c } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const level = useSettings((s) => s.level);
  const explainIn = useSettings((s) => s.explainIn);
  const addTask = useAuthored((s) => s.addTask);
  const [register, setRegister] = useState<'formal' | 'informal'>(level === 'A1' ? 'informal' : 'formal');

  const write = async (wish: string) => {
    const task = await tutor.designWriteTask(wish, register, { level, lang: explainIn });
    addTask({ ...task, generated: true, created: Date.now(), topic: wish });
    router.replace(`/write/${task.id}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={t('write.newTitle')} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.l }}>
        <Txt variant="body" color="inkSoft">
          {t('write.newIntro', { level })}
        </Txt>
        <AuthorBox
          title={t('write.newQuestion')}
          hint={t('write.newHint')}
          placeholder={t('write.newPlaceholder')}
          buttonLabel={t('write.setTask')}
          busyLabel={t('write.settingTask')}
          unusableKey="write.draftUnusable"
          initial={topic ?? ''}
          autoFocus={!topic}
          onSubmit={write}
          controls={
            <View style={{ flexDirection: 'row', gap: space.s }}>
              <Pill label={t('write.formal')} selected={register === 'formal'} onPress={() => setRegister('formal')} />
              <Pill label={t('write.informal')} selected={register === 'informal'} onPress={() => setRegister('informal')} />
            </View>
          }
        />
      </ScrollView>
    </View>
  );
}
