import { router } from 'expo-router';
import { Check, Download, FolderOpen } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { statusLabel, useModelPercent } from '@/features/modelStatus';
import { LEVEL_INFO, LEVELS, type Level } from '@/harness/levels';
import { useI18n } from '@/i18n';
import { resolveLanguage } from '@/i18n/bind';
import { localizeLevel } from '@/i18n/content';
import { LANGUAGE_NAMES, LANGUAGES } from '@/i18n/languages';
import { freeBytes } from '@/model/files';
import { describeBytes, estimatedBytes } from '@/model/manifest';
import { useModel } from '@/model/runtime';
import { useSettings } from '@/state/settings';
import { Button, Paper, Pill, Press, ProgressBar } from '@/ui/controls';
import { LampGlow, StatusLight } from '@/ui/Lamp';
import { AppMark } from '@/ui/Mark';
import { De, Txt } from '@/ui/Text';
import { gutter, radius, space, useTheme } from '@/ui/theme';

type Step = 'welcome' | 'language' | 'level' | 'tutor';

/** The welcome points, as catalog keys of their title and detail. */
const WELCOME_POINTS: [string, string][] = [
  ['onboarding.onPhone', 'onboarding.onPhoneDetail'],
  ['onboarding.checksAnswers', 'onboarding.checksAnswersDetail'],
];

function freeOnPhone(): number | null {
  try {
    return freeBytes();
  } catch {
    return null;
  }
}

export default function Onboarding() {
  const { c } = useTheme();
  const { lang, t } = useI18n();
  const insets = useSafeAreaInsets();
  const set = useSettings((s) => s.set);
  const current = useSettings((s) => s.level);
  const language = useSettings((s) => s.language);
  const [step, setStep] = useState<Step>('welcome');
  const [level, setLevel] = useState<Level>(current);
  const status = useModel((s) => s.status);
  const progress = useModel((s) => s.progress);
  const detail = useModel((s) => s.detail);
  const error = useModel((s) => s.error);
  const edition = useModel((s) => s.edition);
  const local = useModel((s) => s.local);
  const pct = useModelPercent();
  const size = describeBytes(estimatedBytes(edition));
  const free = step === 'tutor' && status === 'absent' ? freeOnPhone() : null;

  const finish = () => {
    set({ onboarded: true, level, glosses: level === 'A1' || level === 'A2' });
    router.replace('/');
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <LampGlow connection={step === 'welcome' ? 'ready' : status} height={420} />
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + space.x4, paddingBottom: insets.bottom + space.xl, paddingHorizontal: gutter }}>
        {step === 'welcome' ? (
          <Animated.View key="welcome" entering={FadeIn.duration(500)} exiting={FadeOut.duration(150)} style={{ flex: 1, justifyContent: 'space-between' }}>
            <View style={{ alignItems: 'center', marginTop: space.x4 }}>
              <AppMark size={84} />
              <De variant="cue" style={{ marginTop: space.xxl, fontSize: 52, lineHeight: 58 }}>
                Eszett
              </De>
              <Txt variant="body" color="inkSoft" center style={{ marginTop: space.m, maxWidth: 320 }}>
                {t('onboarding.welcomeText')}
              </Txt>
            </View>
            <View style={{ gap: space.l }}>
              <Paper tone="alt" style={{ gap: space.m }}>
                {WELCOME_POINTS.map(([title, detailKey]) => (
                  <View key={title} style={{ flexDirection: 'row', gap: space.m }}>
                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.amberTint, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                      <Check size={14} color={c.amberInk} strokeWidth={2.6} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Txt variant="bodyStrong">{t(title)}</Txt>
                      <Txt variant="small" color="inkSoft">
                        {t(detailKey)}
                      </Txt>
                    </View>
                  </View>
                ))}
              </Paper>
              <Button label={t('onboarding.getStarted')} onPress={() => setStep('language')} />
            </View>
          </Animated.View>
        ) : null}

        {step === 'language' ? (
          <Animated.View key="language" entering={FadeInDown.duration(380)} exiting={FadeOut.duration(150)} style={{ flex: 1, gap: space.l }}>
            <View>
              <Txt variant="title">{t('onboarding.languageTitle')}</Txt>
              <Txt variant="body" color="inkSoft" style={{ marginTop: 4 }}>
                {t('onboarding.languageSubtitle')}
              </Txt>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
              <Pill label={t('onboarding.languageAuto', { name: LANGUAGE_NAMES[resolveLanguage('auto')] })} selected={language === 'auto'} onPress={() => set({ language: 'auto' })} />
              {LANGUAGES.map((l) => (
                <Pill key={l} label={LANGUAGE_NAMES[l]} selected={language === l} onPress={() => set({ language: l })} />
              ))}
            </View>
            <Button label={t('common.continue')} onPress={() => setStep('level')} style={{ marginTop: space.s }} />
          </Animated.View>
        ) : null}

        {step === 'level' ? (
          <Animated.View key="level" entering={FadeInDown.duration(380)} exiting={FadeOut.duration(150)} style={{ flex: 1, gap: space.l }}>
            <View>
              <Txt variant="title">{t('onboarding.levelTitle')}</Txt>
              <Txt variant="body" color="inkSoft" style={{ marginTop: 4 }}>
                {t('onboarding.levelSubtitle')}
              </Txt>
            </View>
            <View style={{ gap: space.m }}>
              {LEVELS.map((l) => {
                const info = localizeLevel(LEVEL_INFO[l], lang);
                const on = l === level;
                return (
                  <Press
                    key={l}
                    onPress={() => setLevel(l)}
                    scaleTo={0.985}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={t('onboarding.levelLabel', { level: l, name: info.name })}
                    style={{
                      borderRadius: radius.sheet,
                      borderWidth: on ? 2 : 1,
                      borderColor: on ? c.royal : c.rule,
                      backgroundColor: on ? c.royalTint : c.sheet,
                      padding: space.l,
                      paddingVertical: on ? space.l - 1 : space.l,
                      gap: 6,
                    }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s }}>
                      <Txt variant="headline" style={{ color: on ? c.royal : c.ink }}>
                        {l}
                      </Txt>
                      <Txt variant="smallStrong" color="inkSoft">
                        {info.name}
                      </Txt>
                    </View>
                    <Txt variant="small" color="inkSoft">
                      {info.canDo}
                    </Txt>
                    <De variant="german" italic style={{ fontSize: 16, lineHeight: 23 }}>
                      {info.example}
                    </De>
                  </Press>
                );
              })}
            </View>
            <Button label={t('common.continue')} onPress={() => setStep('tutor')} style={{ marginTop: space.s }} />
          </Animated.View>
        ) : null}

        {step === 'tutor' ? (
          <Animated.View key="tutor" entering={FadeInDown.duration(380)} style={{ flex: 1, gap: space.xl }}>
            <View>
              <Txt variant="title">{t('onboarding.tutorTitle')}</Txt>
              <Txt variant="body" color="inkSoft" style={{ marginTop: 4 }}>
                {t('onboarding.tutorSubtitle', { size })}
              </Txt>
            </View>
            <Paper style={{ gap: space.m }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
                <StatusLight connection={status} size={12} />
                <Txt variant="bodyStrong" style={{ flex: 1 }}>
                  {status === 'ready' ? t('onboarding.tutorReady') : statusLabel(status, pct, lang)}
                </Txt>
              </View>
              {status === 'downloading' ? (
                <Txt variant="small" color="inkSoft">
                  {t('onboarding.downloadingNote')}
                </Txt>
              ) : null}
              {status === 'downloading' || status === 'paused' || status === 'loading' ? <ProgressBar value={progress} color={status === 'paused' ? 'inkFaint' : 'royal'} /> : null}
              {status === 'error' ? (
                <Txt variant="small" style={{ color: c.red }}>
                  {error ?? detail}
                </Txt>
              ) : detail && status !== 'ready' && status !== 'absent' ? (
                <Txt variant="small" color="inkSoft">
                  {detail}
                </Txt>
              ) : null}
              {status === 'absent' ? (
                <Txt variant="small" color="inkSoft">
                  {free !== null ? t('onboarding.absentNoteFree', { free: describeBytes(free) }) : t('onboarding.absentNote')}
                </Txt>
              ) : null}
            </Paper>
            {status === 'absent' || status === 'error' ? (
              <Paper tone="alt" style={{ gap: space.s }}>
                <Txt variant="small" color="inkSoft">
                  {t('onboarding.withoutTutor')}
                </Txt>
              </Paper>
            ) : null}
            <View style={{ flex: 1 }} />
            <View style={{ gap: space.s }}>
              {status === 'absent' || status === 'error' ? (
                <>
                  <Button label={status === 'error' ? t('onboarding.retryDownload', { size }) : t('onboarding.download', { size })} icon={Download} onPress={() => void useModel.getState().download()} />
                  {local.length ? <Button label={t('onboarding.useLocalFile')} icon={FolderOpen} kind="secondary" onPress={() => void useModel.getState().useLocal(local[0])} /> : null}
                  <Button label={t('onboarding.later')} kind="quiet" onPress={finish} />
                </>
              ) : status === 'ready' ? (
                <Button label={t('onboarding.startLearning')} onPress={finish} />
              ) : (
                <>
                  {status === 'paused' ? <Button label={t('onboarding.resumeDownload')} icon={Download} kind="secondary" onPress={() => void useModel.getState().resume()} /> : null}
                  <Button label={t('common.continue')} onPress={finish} />
                </>
              )}
            </View>
          </Animated.View>
        ) : null}
      </ScrollView>
    </View>
  );
}
