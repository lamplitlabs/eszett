// Settings: the level, the app's languages and appearance, how the tutor works with the learner, reminders.
// Reached from Me; everything here used to sit on the Me tab itself.
import { GraduationCap } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { enableNotifications, openNotificationSettings, sendTestNotification, useNotifyPermission } from '@/features/notify';
import { REMINDER_HOURS, useNotify } from '@/features/notifyStore';
import { LEVEL_INFO, LEVELS } from '@/harness/levels';
import { translationTarget } from '@/harness/route';
import { useI18n } from '@/i18n';
import { directionPending, resolveLanguage } from '@/i18n/bind';
import { localizeLevel } from '@/i18n/content';
import { isTutorLang, LANGUAGE_NAMES, LANGUAGES, tutorLangFor } from '@/i18n/languages';
import { isMtLang, readLangFor, useTranslator } from '@/mt';
import { useSettings, type ThemePref } from '@/state/settings';
import { Divider, Paper, Pill, Press } from '@/ui/controls';
import { Row, Toggle } from '@/ui/Rows';
import { Section, TopBar } from '@/ui/Screen';
import { Txt } from '@/ui/Text';
import { gutter, radius, space, useTheme } from '@/ui/theme';

export default function SettingsScreen() {
  const { c } = useTheme();
  const { lang, t } = useI18n();
  const insets = useSafeAreaInsets();
  const s = useSettings();
  const notify = useNotify();
  const permission = useNotifyPermission();
  const [testSent, setTestSent] = useState<boolean | null>(null);
  const level = localizeLevel(LEVEL_INFO[s.level], lang);
  // every app language is listed under "Explanations in"; the ones the model cannot speak yet are greyed out
  const notSpoken = LANGUAGES.filter((l) => !isTutorLang(l));
  const pack = useTranslator();
  const translating = pack.status === 'ready' && pack.lang === lang;

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={t('me.settings')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: space.m, paddingBottom: insets.bottom + space.x4 }}>
        <Section title={t('me.yourLevel')}>
          <View style={{ flexDirection: 'row', gap: space.s }}>
            {LEVELS.map((l) => {
              const on = l === s.level;
              return (
                <Press
                  key={l}
                  onPress={() => s.set({ level: l })}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={t('me.levelLabel', { level: l, name: localizeLevel(LEVEL_INFO[l], lang).name })}
                  style={{ flex: 1, height: 52, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.royal : c.sheet, borderWidth: on ? 0 : 1, borderColor: c.rule }}>
                  <Txt variant="headline" style={{ color: on ? c.onRoyal : c.ink }}>
                    {l}
                  </Txt>
                </Press>
              );
            })}
          </View>
          <Txt variant="small" color="inkSoft" style={{ marginTop: space.m }}>
            {t('me.levelSummary', { name: level.name, canDo: level.canDo })}
          </Txt>
          <View style={{ marginTop: space.m, alignItems: 'flex-start' }}>
            <Pill label={t('me.placement')} icon={GraduationCap} tone="royal" onPress={() => router.push('/placement')} />
          </View>
        </Section>

        <Section title={t('me.appSection')}>
          <Paper style={{ paddingVertical: space.xs }}>
            <Row label={t('me.language')} detail={t('me.languageDetail')} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: space.m }}>
              <Pill label={t('onboarding.languageAuto', { name: LANGUAGE_NAMES[resolveLanguage('auto')] })} selected={s.language === 'auto'} onPress={() => s.set({ language: 'auto' })} />
              {LANGUAGES.map((l) => (
                <Pill key={l} label={LANGUAGE_NAMES[l]} selected={s.language === l} onPress={() => s.set({ language: l })} />
              ))}
            </View>
            {directionPending(lang) ? (
              <Txt variant="caption" color="inkSoft" style={{ paddingBottom: space.m }}>
                {t('me.restartForDirection')}
              </Txt>
            ) : null}
            <Divider />
            <Row label={t('me.explanationsIn')} detail={t('me.explanationsInDetail')} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: space.s }}>
              <Pill label={t('me.explainSameAsApp')} selected={!s.explainInPinned} onPress={() => s.set({ explainIn: tutorLangFor(lang), explainInPinned: false })} />
              {LANGUAGES.map((l) =>
                isTutorLang(l) ? (
                  <Pill key={l} label={LANGUAGE_NAMES[l]} selected={s.explainInPinned && s.explainIn === l} onPress={() => s.set({ explainIn: l, explainInPinned: true })} />
                ) : (
                  <Pill key={l} label={LANGUAGE_NAMES[l]} disabled />
                ),
              )}
            </View>
            <Txt variant="caption" color="inkSoft" style={{ paddingBottom: space.m }}>
              {isTutorLang(lang)
                ? t('me.explainUnavailable', { list: notSpoken.map((l) => LANGUAGE_NAMES[l]).join(t('common.listSeparator')) })
                : translating
                  ? t('me.explainTranslated', { lang: LANGUAGE_NAMES[lang] })
                  : t('me.explainFallback', { lang: LANGUAGE_NAMES[lang], name: LANGUAGE_NAMES[s.explainIn] })}
            </Txt>
            {isMtLang(lang) ? (
              <>
                <Divider />
                <Row label={t('me.translate')} detail={t('me.translateDetail', { name: LANGUAGE_NAMES[lang] })} right={<Toggle value={s.translate} onChange={(v) => s.set({ translate: v })} label={t('me.translate')} />} />
                {s.translate ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingBottom: space.m }}>
                    <Txt variant="caption" color={pack.status === 'error' ? 'red' : 'inkSoft'} style={{ flex: 1 }}>
                      {pack.status === 'ready'
                        ? t('me.translateReady', { name: LANGUAGE_NAMES[lang] })
                        : pack.status === 'error'
                          ? t('me.translateError', { error: pack.error ?? '' })
                          : pack.status === 'unavailable'
                            ? t('me.translateUnavailable')
                            : t('me.translateDownloading', { name: LANGUAGE_NAMES[lang] })}
                    </Txt>
                    {pack.status === 'error' ? <Pill label={t('me.translateRetry')} onPress={() => void pack.retry()} /> : null}
                  </View>
                ) : null}
              </>
            ) : null}
            <Divider />
            <Row
              label={t('me.appearance')}
              right={
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {(['system', 'light', 'dark'] as ThemePref[]).map((pref) => (
                    <Pill key={pref} label={pref === 'system' ? t('me.themeAuto') : pref === 'light' ? t('me.themeDay') : t('me.themeEvening')} selected={s.theme === pref} onPress={() => s.set({ theme: pref })} />
                  ))}
                </View>
              }
            />
          </Paper>
        </Section>

        <Section title={t('me.tutorSettings')}>
          <Paper style={{ paddingVertical: space.xs }}>
            <Row label={t('me.glosses')} detail={t('me.glossesDetail', { name: LANGUAGE_NAMES[readLangFor(lang, translationTarget(s.explainIn), translating)] })} right={<Toggle value={s.glosses} onChange={(v) => s.set({ glosses: v })} label={t('me.glosses')} />} />
            <Divider />
            <Row label={t('me.checkLines')} detail={t('me.checkLinesDetail')} right={<Toggle value={s.correctAsYouGo} onChange={(v) => s.set({ correctAsYouGo: v })} label={t('me.checkLines')} />} />
            <Divider />
            <Row label={t('me.readAloud')} detail={t('me.readAloudDetail')} right={<Toggle value={s.autoSpeak} onChange={(v) => s.set({ autoSpeak: v })} label={t('me.readAloud')} />} />
            <Divider />
            <Row
              label={t('me.speakingSpeed')}
              right={
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Pill label={t('me.speedSlow')} selected={s.speechRate < 0.8} onPress={() => s.set({ speechRate: 0.7 })} />
                  <Pill label={t('me.speedNormal')} selected={s.speechRate >= 0.8} onPress={() => s.set({ speechRate: 0.9 })} />
                </View>
              }
            />
          </Paper>
        </Section>

        {Platform.OS !== 'web' ? (
          <Section title={t('notify.settingsTitle')}>
            <Paper style={{ paddingVertical: space.xs }}>
              <Row
                label={t('notify.reminderSwitch')}
                detail={t('notify.reminderDetail')}
                right={<Toggle value={notify.reminder} onChange={(v) => (v ? void enableNotifications({ reminder: true }) : notify.set({ reminder: false }))} label={t('notify.reminderSwitch')} />}
              />
              {notify.reminder ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: space.m }}>
                  {REMINDER_HOURS.map((h) => (
                    <Pill key={h} label={t('notify.hourAt', { hour: h })} selected={notify.hour === h} onPress={() => notify.set({ hour: h })} />
                  ))}
                </View>
              ) : null}
              <Divider />
              <Row
                label={t('notify.wordSwitch')}
                detail={t('notify.wordDetail')}
                right={<Toggle value={notify.wordOfDay} onChange={(v) => (v ? void enableNotifications({ wordOfDay: true }) : notify.set({ wordOfDay: false }))} label={t('notify.wordSwitch')} />}
              />
              {permission === 'denied' ? (
                <>
                  <Divider />
                  <Row label={t('notify.permissionDenied')} right={<Pill label={t('notify.openSettings')} onPress={() => void openNotificationSettings()} />} />
                </>
              ) : permission === 'unavailable' ? (
                <Txt variant="caption" color="inkSoft" style={{ paddingBottom: space.m }}>
                  {t('notify.unavailable')}
                </Txt>
              ) : (
                <>
                  <Divider />
                  <Row
                    label={t('notify.testTitleRow')}
                    detail={testSent === null ? t('notify.testDetail') : testSent ? t('notify.testSent') : t('notify.testFailed')}
                    right={<Pill label={t('notify.testSend')} onPress={() => void sendTestNotification().then(setTestSent)} />}
                  />
                </>
              )}
            </Paper>
          </Section>
        ) : null}
      </ScrollView>
    </View>
  );
}
