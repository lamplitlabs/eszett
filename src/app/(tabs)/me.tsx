// The Me tab: who you are, how it is going, and the doors to everything else - your tutor, full access, the
// profile the tutor talks about, settings, the account, about. Each door is a screen of its own; the tab stays
// one screen high.
import { router } from 'expo-router';
import { BookMarked, Info, KeyRound, NotebookPen, Repeat, Settings, UserRound } from 'lucide-react-native';
import { View } from 'react-native';

import { useAccessView } from '@/features/access';
import { useAccount } from '@/features/account';
import { modelTitle, statusLabel, useModelPercent } from '@/features/modelStatus';
import { Week } from '@/features/ProgressCards';
import { LEVEL_INFO } from '@/harness/levels';
import { useI18n } from '@/i18n';
import { localizeLevel } from '@/i18n/content';
import { useModel } from '@/model/runtime';
import { dueWords, useDeck } from '@/state/deck';
import { useMistakes } from '@/state/mistakes';
import { filledFields, firstName, useProfile } from '@/state/profile';
import { streakOf, useProgress } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { useTexts } from '@/state/texts';
import { Avatar } from '@/ui/Avatar';
import { Divider, Paper, Pill, Press } from '@/ui/controls';
import { StatusLight } from '@/ui/Lamp';
import { LinkRow } from '@/ui/Rows';
import { Screen, Section } from '@/ui/Screen';
import { Txt } from '@/ui/Text';
import { APP_VERSION } from '@/ui/UpdateCard';
import { radius, space, useTheme } from '@/ui/theme';
import { StreakFlame } from '@/ui/motion/StreakFlame';

export default function Me() {
  const { c } = useTheme();
  const { lang, t } = useI18n();
  const level = useSettings((s) => s.level);
  const days = useProgress((p) => p.days);
  const words = useDeck((d) => d.words);
  const connection = useModel((h) => h.status);
  const info = useModel((h) => h.info);
  const detail = useModel((h) => h.detail);
  const pct = useModelPercent();
  const access = useAccessView();
  const account = useAccount();
  const profile = useProfile((x) => x.profile);
  const profileFilled = filledFields(profile).length;
  const streak = streakOf(days);
  const due = dueWords(words).length;
  const mistakeCount = useMistakes((x) => Object.keys(x.items).length);
  const textCount = useTexts((x) => Object.keys(x.items).length);
  const name = firstName(profile) || account.name || '';
  const levelInfo = localizeLevel(LEVEL_INFO[level], lang);

  return (
    <Screen title={t('me.title')}>
      <Press onPress={() => router.push(account.enabled ? '/account' : '/profile')} scaleTo={0.99} accessibilityLabel={account.enabled ? t('me.account') : t('profile.title')}>
        <Paper style={{ flexDirection: 'row', alignItems: 'center', gap: space.l }}>
          <Avatar uri={account.imageUrl} name={name || account.name} email={account.email} size={64} />
          <View style={{ flex: 1, gap: 4 }}>
            <Txt variant="headline" numberOfLines={1}>
              {name || t('me.title')}
            </Txt>
            <Txt variant="small" color="inkSoft" numberOfLines={1}>
              {account.enabled ? (account.signedIn ? (account.email ?? t('unlock.signedIn')) : t('me.accountSignIn')) : levelInfo.canDo}
            </Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              <Pill label={`${level} ${levelInfo.name}`} tone="royal" onPress={() => router.push('/settings')} />
              {streak > 0 ? (
                <View accessibilityLabel={t('home.days', { count: streak })} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 8, paddingRight: 10, height: 26, borderRadius: radius.pill, backgroundColor: c.amberTint }}>
                  <StreakFlame streak={streak} size={13} />
                  <Txt variant="caption" style={{ color: c.amberInk }}>
                    {t('home.days', { count: streak })}
                  </Txt>
                </View>
              ) : null}
            </View>
          </View>
        </Paper>
      </Press>

      <Section title={t('me.progress')} style={{ marginTop: space.x3 }}>
        <Press onPress={() => router.push('/progress')} scaleTo={0.99} accessibilityLabel={t('me.progress')}>
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
            <Txt variant="small" style={{ color: c.royal }}>
              {t('me.progressDetail')} ›
            </Txt>
          </Paper>
        </Press>
        <Paper style={{ paddingVertical: space.xs, marginTop: space.m }}>
          <LinkRow icon={Repeat} tone="royal" label={due ? t('me.reviewDue', { count: due }) : t('me.myWords')} onPress={() => router.push('/review')} />
          <Divider />
          <LinkRow icon={NotebookPen} tone={mistakeCount ? 'red' : 'soft'} label={mistakeCount ? t('mistakes.practiceDetail', { count: mistakeCount }) : t('mistakes.title')} onPress={() => router.push('/mistakes')} />
          <Divider />
          <LinkRow icon={BookMarked} label={textCount ? t('texts.practiceDetail', { count: textCount }) : t('texts.title')} onPress={() => router.push('/texts')} />
        </Paper>
      </Section>

      <Section title={t('me.more')}>
        <Paper style={{ paddingVertical: space.xs }}>
          <LinkRow
            left={<StatusLight connection={connection} size={12} />}
            label={statusLabel(connection, pct, lang)}
            detail={connection === 'ready' && info ? t(info.gpu ? 'me.runsOnGpu' : 'me.runsOnCpu', { model: modelTitle(info) }) : connection === 'absent' ? t('me.tutorAbsent') : detail}
            onPress={() => router.push('/model')}
          />
          <Divider />
          <LinkRow
            icon={KeyRound}
            tone={access.kind === 'ended' ? 'amber' : 'soft'}
            label={access.kind === 'paid' ? t('unlock.paid') : access.kind === 'ended' ? t('unlock.trialEnded') : t('unlock.trialLeft', { count: access.daysLeft })}
            detail={access.kind === 'paid' ? t('unlock.paidDetail') : t('unlock.rowDetail')}
            onPress={() => router.push('/unlock')}
          />
          <Divider />
          <LinkRow icon={UserRound} tone={profileFilled ? 'soft' : 'amber'} label={profileFilled ? t('me.profileFilled', { count: profileFilled }) : t('me.profileEmpty')} detail={t('me.profileWhy')} onPress={() => router.push('/profile')} />
          <Divider />
          <LinkRow icon={Settings} label={t('me.settings')} detail={t('me.settingsDetail')} onPress={() => router.push('/settings')} />
          <Divider />
          <LinkRow icon={Info} label={t('me.about')} detail={t('me.versionInstalled', { version: APP_VERSION })} onPress={() => router.push('/about')} />
        </Paper>
      </Section>
    </Screen>
  );
}
