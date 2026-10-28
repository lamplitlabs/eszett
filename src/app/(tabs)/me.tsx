import { router } from 'expo-router';
import { ChevronRight, KeyRound, RefreshCw, Repeat, Star } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Platform, Switch, View } from 'react-native';

import modelInfo from '@/data/model.json';
import { useAccessView } from '@/features/access';
import { modelTitle, statusLabel, useModelPercent } from '@/features/modelStatus';
import { checkForUpdate, useRelease, type CheckOutcome } from '@/features/release';
import { openStorePage, storePageUrl } from '@/features/review';
import { LEVEL_INFO, LEVELS } from '@/harness/levels';
import { translationTarget } from '@/harness/route';
import { useI18n } from '@/i18n';
import { directionPending, resolveLanguage } from '@/i18n/bind';
import { localizeLevel } from '@/i18n/content';
import { isTutorLang, LANGUAGE_NAMES, LANGUAGES, tutorLangFor } from '@/i18n/languages';
import { useModel } from '@/model/runtime';
import { isMtLang, readLangFor, useTranslator } from '@/mt';
import { dueWords, useDeck } from '@/state/deck';
import { accuracy, streakOf, useProgress, type Area } from '@/state/progress';
import { useSettings, type ThemePref } from '@/state/settings';
import { dayKey } from '@/state/storage';
import { Divider, Paper, Pill, Press } from '@/ui/controls';
import { StatusLight } from '@/ui/Lamp';
import { Screen, Section } from '@/ui/Screen';
import { De, Txt } from '@/ui/Text';
import { APP_VERSION, useUpdateVerdict } from '@/ui/UpdateCard';
import { radius, space, useTheme } from '@/ui/theme';

function Row({ label, detail, right, onPress }: { label: string; detail?: string; right?: ReactNode; onPress?: () => void }) {
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.m }}>
      <View style={{ flex: 1 }}>
        <Txt variant="body">{label}</Txt>
        {detail ? (
          <Txt variant="small" color="inkSoft">
            {detail}
          </Txt>
        ) : null}
      </View>
      {right}
    </View>
  );
  return onPress ? (
    <Press onPress={onPress} scaleTo={0.99} accessibilityLabel={label}>
      {body}
    </Press>
  ) : (
    body
  );
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const { c } = useTheme();
  return <Switch value={value} onValueChange={onChange} trackColor={{ true: c.royal, false: c.rule }} thumbColor="#fff" accessibilityLabel={label} />;
}

/** The practice areas with the catalog key of their label. */
const AREAS: [Area, string][] = [
  ['article', 'me.area.article'],
  ['plural', 'me.area.plural'],
  ['meaning', 'me.area.meaning'],
  ['verbs', 'me.area.verbs'],
  ['numbers', 'me.area.numbers'],
  ['clock', 'me.area.clock'],
  ['dates', 'me.area.dates'],
  ['prices', 'me.area.prices'],
  ['grammar', 'me.area.grammar'],
  ['reading', 'me.area.reading'],
  ['speaking', 'me.area.speaking'],
  ['check', 'me.area.check'],
  ['review', 'me.area.review'],
];

function Week() {
  const { c } = useTheme();
  const { t } = useI18n();
  const days = useProgress((s) => s.days);
  const today = new Date();
  const items = Array.from({ length: 7 }, (_, i) => {
    const ms = today.getTime() - (6 - i) * 86_400_000;
    const d = new Date(ms);
    return { key: dayKey(ms), n: days[dayKey(ms)] ?? 0, label: t(`me.weekday${d.getDay()}`) };
  });
  const max = Math.max(10, ...items.map((i) => i.n));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.s, height: 92 }}>
      {items.map((i, k) => (
        <View key={i.key} style={{ flex: 1, alignItems: 'center', gap: 6 }} accessibilityLabel={t('me.dayItems', { day: i.label, count: i.n })}>
          <View style={{ width: '100%', height: 64, justifyContent: 'flex-end' }}>
            <View style={{ height: Math.max(4, (i.n / max) * 64), borderRadius: 5, backgroundColor: i.n ? (k === 6 ? c.amber : c.royal) : c.sheetAlt }} />
          </View>
          <Txt variant="caption" style={{ color: k === 6 ? c.ink : c.inkFaint }}>
            {i.label}
          </Txt>
        </View>
      ))}
    </View>
  );
}

export default function Me() {
  const { c } = useTheme();
  const { lang, t } = useI18n();
  const s = useSettings();
  const areas = useProgress((p) => p.areas);
  const days = useProgress((p) => p.days);
  const words = useDeck((d) => d.words);
  const connection = useModel((h) => h.status);
  const info = useModel((h) => h.info);
  const detail = useModel((h) => h.detail);
  const pct = useModelPercent();
  const access = useAccessView();
  const [updateCheck, setUpdateCheck] = useState<'idle' | 'busy' | CheckOutcome>('idle');
  const update = useUpdateVerdict(false);
  const streak = streakOf(days);
  const due = dueWords(words).length;
  const practised = AREAS.filter(([a]) => (areas[a]?.seen ?? 0) > 0);
  const level = localizeLevel(LEVEL_INFO[s.level], lang);
  const checkUpdatesNow = async () => {
    if (updateCheck === 'busy') return;
    setUpdateCheck('busy');
    // a learner who asks wants to see a card they put off earlier
    useRelease.getState().set({ dismissed: null });
    setUpdateCheck(await checkForUpdate({ force: true }));
  };
  const updateNote =
    updateCheck === 'busy'
      ? t('me.checkingUpdates')
      : updateCheck === 'failed'
        ? t('me.checkFailed')
        : updateCheck === 'idle'
          ? t('me.versionInstalled', { version: APP_VERSION })
          : update.available && update.version
            ? t('me.updateFound', { version: update.version })
            : t('me.upToDate', { version: APP_VERSION });
  // every app language is listed under "Explanations in"; the ones the model cannot speak yet are greyed out
  const notSpoken = LANGUAGES.filter((l) => !isTutorLang(l));
  const pack = useTranslator();
  const translating = pack.status === 'ready' && pack.lang === lang;

  return (
    <Screen title={t('me.title')}>
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
          {practised.length ? (
            <View style={{ gap: space.s }}>
              {practised.map(([a, key]) => {
                const acc = accuracy(areas[a]);
                const seen = areas[a]?.seen ?? 0;
                return (
                  <View key={a} style={{ gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Txt variant="small">{t(key)}</Txt>
                      <Txt variant="caption" color="inkSoft">
                        {acc === null ? t('me.answered', { count: seen }) : t('me.accuracyOf', { percent: Math.round(acc * 100), count: seen })}
                      </Txt>
                    </View>
                    <View style={{ height: 5, borderRadius: 3, backgroundColor: c.sheetAlt }}>
                      <View style={{ height: 5, borderRadius: 3, width: `${Math.round((acc ?? 0) * 100)}%`, backgroundColor: (acc ?? 0) >= 0.8 ? c.green : (acc ?? 0) >= 0.5 ? c.amber : c.red }} />
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <Txt variant="small" color="inkSoft">
              {t('me.accuracyEmpty')}
            </Txt>
          )}
        </Paper>
        <Press onPress={() => router.push('/review')} scaleTo={0.99} accessibilityLabel={t('me.reviewMyWords')} style={{ marginTop: space.m }}>
          <Paper tone="royal" style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
            <Repeat size={18} color={c.royal} />
            <Txt variant="bodyStrong" style={{ flex: 1, color: c.royal }}>
              {due ? t('me.reviewDue', { count: due }) : t('me.myWords')}
            </Txt>
            <ChevronRight size={18} color={c.royal} />
          </Paper>
        </Press>
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

      <Section title={t('me.yourTutor')}>
        <Press onPress={() => router.push('/model')} scaleTo={0.99} accessibilityLabel={t('me.yourTutor')}>
          <Paper style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
            <StatusLight connection={connection} size={12} />
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong">{statusLabel(connection, pct, lang)}</Txt>
              <Txt variant="small" color="inkSoft" numberOfLines={1}>
                {connection === 'ready' && info
                  ? t(info.gpu ? 'me.runsOnGpu' : 'me.runsOnCpu', { model: modelTitle(info) })
                  : connection === 'absent'
                    ? t('me.tutorAbsent')
                    : detail}
              </Txt>
            </View>
            <ChevronRight size={18} color={c.inkFaint} />
          </Paper>
        </Press>
      </Section>

      {Platform.OS === 'web' ? null : (
        <Section title={t('me.fullAccess')}>
          <Press onPress={() => router.push('/unlock')} scaleTo={0.99} accessibilityLabel={t('me.fullAccess')}>
            <Paper style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
              <KeyRound size={18} color={access.kind === 'ended' ? c.amberInk : c.royal} />
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">{access.kind === 'paid' ? t('unlock.paid') : access.kind === 'ended' ? t('unlock.trialEnded') : t('unlock.trialLeft', { count: access.daysLeft })}</Txt>
                <Txt variant="small" color="inkSoft" numberOfLines={2}>
                  {access.kind === 'paid' ? t('unlock.paidDetail') : t('unlock.rowDetail')}
                </Txt>
              </View>
              <ChevronRight size={18} color={c.inkFaint} />
            </Paper>
          </Press>
        </Section>
      )}

      <Section title={t('me.about')}>
        <Paper tone="alt" style={{ gap: space.s }}>
          <De variant="germanStrong">Eszett</De>
          <Txt variant="small" color="inkSoft">
            {t('me.aboutText', { repo: modelInfo.hub.repo, student: modelInfo.student })}
          </Txt>
          <Txt variant="small" color="inkSoft">
            {t('me.licence', { attribution: t('me.attribution') })}
          </Txt>
        </Paper>
        <Press onPress={() => void checkUpdatesNow()} scaleTo={0.99} accessibilityLabel={t('me.checkUpdates')} style={{ marginTop: space.m }}>
          <Paper style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
            <RefreshCw size={18} color={c.royal} />
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong">{t('me.checkUpdates')}</Txt>
              <Txt variant="small" color="inkSoft">
                {updateNote}
              </Txt>
            </View>
            <ChevronRight size={18} color={c.inkFaint} />
          </Paper>
        </Press>
        {storePageUrl() ? (
          <Press onPress={() => void openStorePage()} scaleTo={0.99} accessibilityLabel={t('me.rate')} style={{ marginTop: space.m }}>
            <Paper style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
              <Star size={18} color={c.royal} />
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">{t('me.rate')}</Txt>
                <Txt variant="small" color="inkSoft">
                  {t('me.rateDetail')}
                </Txt>
              </View>
              <ChevronRight size={18} color={c.inkFaint} />
            </Paper>
          </Press>
        ) : null}
      </Section>
    </Screen>
  );
}
