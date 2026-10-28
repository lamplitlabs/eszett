import { router, useLocalSearchParams } from 'expo-router';
import { Check, ChevronRight, Sparkles, Trash2, Users } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { AuthorBox } from '@/features/AuthorBox';
import { scenes } from '@/features/lesson';
import { SceneIcon } from '@/features/sceneIcons';
import { LEVELS, type Level } from '@/harness/levels';
import { pathDoneKey } from '@/harness/path';
import { sceneTitle, speakerLabel, type SceneCard } from '@/harness/roleplay';
import { useI18n } from '@/i18n';
import { localizeScene } from '@/i18n/content';
import { tutor } from '@/model/runtime';
import { newestFirst, useAuthored } from '@/state/authored';
import { useProgress } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { IconButton, Paper, Pill, Press } from '@/ui/controls';
import { Screen, Section } from '@/ui/Screen';
import { De, Txt } from '@/ui/Text';
import { genderColor, genderTint, radius, space, useTheme } from '@/ui/theme';

const articleOf = (role: string) => (/^(der|die|das)\s/i.exec(role)?.[1].toLowerCase() ?? null);

function SceneList({ list, onRemove }: { list: SceneCard[]; onRemove?: (key: string) => void }) {
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const done = useProgress((s) => s.done);
  return (
    <Paper style={{ padding: 0, overflow: 'hidden' }}>
      {list.map((s, i) => {
        const shown = localizeScene(s, lang);
        const title = sceneTitle(shown);
        const article = articleOf(s.role_de);
        const finished = Boolean(done[`scene:${s.key}`]);
        return (
          <Press key={s.key} onPress={() => router.push(`/scene/${s.key}`)} scaleTo={0.99} accessibilityLabel={t('scenes.itemA11y', { title, learner: shown.learner_en })}>
            <View style={{ flexDirection: 'row', gap: space.m, paddingHorizontal: space.l, paddingVertical: space.l, borderTopWidth: i ? 1 : 0, borderTopColor: c.rule, alignItems: 'center' }}>
              <View style={{ width: 46, height: 46, borderRadius: radius.control, backgroundColor: genderTint(c, article), alignItems: 'center', justifyContent: 'center' }}>
                <SceneIcon sceneKey={s.key} size={22} color={genderColor(c, article)} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="bodyStrong">{title}</Txt>
                <De variant="german" style={{ fontSize: 15, lineHeight: 20, color: c.inkSoft }} numberOfLines={1}>
                  {s.situation_de}
                </De>
                <View style={{ flexDirection: 'row', gap: space.s, marginTop: 4, alignItems: 'center' }}>
                  <Txt variant="caption" color="inkFaint">
                    {t('scenes.with', { name: speakerLabel(s.role_de) })}
                  </Txt>
                  <Txt variant="caption" color="inkFaint">
                    {s.register === 'Sie' ? t('scenes.formalSie') : t('scenes.informalDu')}
                  </Txt>
                  {finished ? <Check size={14} color={c.green} strokeWidth={2.6} /> : null}
                </View>
              </View>
              {onRemove ? <IconButton icon={Trash2} label={t('scenes.deleteA11y', { title })} size={34} onPress={() => onRemove(s.key)} /> : <ChevronRight size={18} color={c.inkFaint} />}
            </View>
          </Press>
        );
      })}
    </Paper>
  );
}

export default function Scenes() {
  const { c } = useTheme();
  const { t } = useI18n();
  const learnerLevel = useSettings((s) => s.level);
  const explainIn = useSettings((s) => s.explainIn);
  const [level, setLevel] = useState<Level>(learnerLevel);
  const ownScenes = useAuthored((s) => s.scenes);
  const allOwn = useMemo(() => newestFirst(ownScenes), [ownScenes]);
  const own = allOwn.filter((s) => s.level === level);
  const addScene = useAuthored((s) => s.addScene);
  const removeScene = useAuthored((s) => s.removeScene);
  const list = scenes.filter((s) => s.level === level);
  // a situation handed over by the course (a unit's own-scene step) prefills the box; a scene written from there marks the step
  const params = useLocalSearchParams<{ own?: string; path?: string }>();
  const markDone = useProgress((s) => s.markDone);

  // the model writes a scene card for the learner's own situation; the harness checks it and keeps it on this phone
  const write = async (description: string) => {
    const draft = await tutor.designScene(description, { level, lang: explainIn });
    addScene({ ...draft.card, generated: true, created: Date.now(), notes: draft.notes, warnings: draft.warnings });
    if (params.path) markDone(pathDoneKey(params.path));
    router.push(`/scene/${draft.card.key}`);
  };

  return (
    <Screen title={t('scenes.title')} subtitle={t('scenes.subtitle')}>
      <Press onPress={() => router.push('/together')} style={{ marginBottom: space.xl }} accessibilityLabel={t('together.cardTitle')} accessibilityHint={t('together.cardDetail')}>
        <Paper tone="royal" style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
          <View style={{ width: 44, height: 44, borderRadius: radius.control, backgroundColor: c.royal, alignItems: 'center', justifyContent: 'center' }}>
            <Users size={22} color={c.paper} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="bodyStrong">{t('together.cardTitle')}</Txt>
            <Txt variant="small" color="inkSoft">
              {t('together.cardDetail')}
            </Txt>
          </View>
          <ChevronRight size={20} color={c.inkFaint} />
        </Paper>
      </Press>
      <View style={{ flexDirection: 'row', gap: space.s, marginBottom: space.xl }} accessibilityRole="tablist">
        {LEVELS.map((l) => (
          <Pill key={l} label={`${l}  ${scenes.filter((s) => s.level === l).length + allOwn.filter((s) => s.level === l).length}`} selected={l === level} onPress={() => setLevel(l)} />
        ))}
      </View>
      <View style={{ marginBottom: space.xl }}>
        <AuthorBox
          key={params.own ?? 'own'}
          initial={params.own ?? ''}
          autoFocus={Boolean(params.own)}
          title={t('scenes.ownTitle')}
          hint={t('scenes.ownHint', { level })}
          placeholder={t('scenes.ownPlaceholder')}
          buttonLabel={t('scenes.ownWrite')}
          busyLabel={t('scenes.ownWriting')}
          unusableKey="scenes.draftUnusable"
          onSubmit={write}
        />
      </View>
      {own.length ? (
        <Section title={t('scenes.writtenByTutor')} action={<Sparkles size={16} color={c.amberInk} />}>
          <SceneList list={own} onRemove={removeScene} />
        </Section>
      ) : null}
      <Section title={own.length ? t('scenes.fromTheBook') : t('scenes.title')}>
        <SceneList list={list} />
      </Section>
    </Screen>
  );
}
