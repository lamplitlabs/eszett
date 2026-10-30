import { router } from 'expo-router';
import { BadgeCheck, Bookmark, BookmarkCheck, Check, ChevronRight, Flame, MessageCircle, RefreshCw, Route, Sparkles } from 'lucide-react-native';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { CourseCard } from '@/features/CourseCard';
import MinuteCard from '@/features/MinuteCard';
import ReminderCard from '@/features/ReminderCard';
import { activityLabel, lessonKey, useLesson } from '@/features/lesson';
import { levelProgress, weekNumber } from '@/harness/path';
import { tutorLine, useModelPercent } from '@/features/modelStatus';
import { GENUS_ARTICLE, nounsUpTo } from '@/harness/lexicon';
import { LEVEL_INFO } from '@/harness/levels';
import { useI18n } from '@/i18n';
import { localizeLevel, wordMeaning } from '@/i18n/content';
import { coreLexicon, useModel } from '@/model/runtime';
import { dueWords, nounKey, useDeck } from '@/state/deck';
import { streakOf, useProgress } from '@/state/progress';
import { firstName, useProfile } from '@/state/profile';
import { useSettings } from '@/state/settings';
import { dayKey } from '@/state/storage';
import { Button, GenderChip, Paper, Pill, Press, SpeakButton } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { LampGlow, StatusLight } from '@/ui/Lamp';
import { Screen, Section } from '@/ui/Screen';
import { De, Txt } from '@/ui/Text';
import { space, useTheme } from '@/ui/theme';

function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 5) return 'Gute Nacht';
  if (h < 11) return 'Guten Morgen';
  if (h < 18) return 'Guten Tag';
  return 'Guten Abend';
}

export default function Today() {
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const level = useSettings((s) => s.level);
  const connection = useModel((s) => s.status);
  const pct = useModelPercent();
  const days = useProgress((s) => s.days);
  const done = useProgress((s) => s.done);
  const words = useDeck((s) => s.words);
  const add = useDeck((s) => s.add);
  const { activities, plannedBy, planning, ensure, replan } = useLesson();
  const name = firstName(useProfile((p) => p.profile));
  const streak = streakOf(days);
  const due = dueWords(words).length;

  useEffect(() => {
    ensure(level);
  }, [level, connection, ensure]);

  const word = useMemo(() => {
    const pool = nounsUpTo(coreLexicon, level).filter((n) => n.example);
    const seed = Number(dayKey().replace(/-/g, ''));
    return pool[seed % pool.length];
  }, [level]);
  const wordSaved = word ? Boolean(words[nounKey(word.lemma)]) : false;
  const meaning = word ? wordMeaning(word.lemma, word.meaning ?? '', lang) : '';

  const courseUnit = levelProgress(level, done).current;
  const finished = activities.map((_, i) => Boolean(done[lessonKey(i)]));
  const next = finished.findIndex((f) => !f);
  const lessonDone = activities.length > 0 && next === -1;

  const open = (i: number) => {
    const a = activities[i];
    router.push(`${a.href}${a.href.includes('?') ? '&' : '?'}lesson=${i}` as never);
  };

  return (
    <Screen backdrop={<LampGlow connection={connection} />}>
      <Animated.View entering={FadeIn.duration(450)}>
        <De variant="display" speakable style={{ fontSize: 38, lineHeight: 44 }}>
          {name ? `${greeting()}, ${name}` : greeting()}
        </De>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.s, marginTop: space.m }}>
          <Pill label={`${level} ${localizeLevel(LEVEL_INFO[level], lang).name}`} tone="royal" onPress={() => router.navigate('/me')} />
          {streak > 0 ? <Pill label={t('home.days', { count: streak })} icon={Flame} tone="amber" /> : null}
        </View>
        <Press onPress={() => router.push(connection === 'locked' ? '/unlock' : '/model')} scaleTo={0.99} accessibilityLabel={tutorLine(connection, pct, lang)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, marginTop: space.l, marginBottom: space.xxl }}>
            <StatusLight connection={connection} />
            <Txt variant="small" color="inkSoft">
              {tutorLine(connection, pct, lang)}
            </Txt>
          </View>
        </Press>
      </Animated.View>

      <Section title={t('path.title')}>
        <CourseCard level={level} />
      </Section>

      <MinuteCard />
      <ReminderCard />

      <Section
        title={t('home.lessonTitle')}
        action={
          plannedBy !== 'app' && !planning ? (
            <Press onPress={() => void replan(level)} accessibilityLabel={t('home.planAgain')} hitSlop={8}>
              <RefreshCw size={17} color={c.inkSoft} />
            </Press>
          ) : null
        }>
        <Paper style={{ padding: 0, overflow: 'hidden' }}>
          {activities.map((a, i) => {
            const isDone = finished[i];
            const { title, detail } = activityLabel(a, level, lang);
            return (
              <Press key={`${a.href}${i}`} onPress={() => open(i)} scaleTo={0.99} accessibilityLabel={isDone ? t('home.activityDoneLabel', { index: i + 1, title }) : t('home.activityLabel', { index: i + 1, title })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: space.l, borderTopWidth: i ? 1 : 0, borderTopColor: c.rule }}>
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isDone ? c.green : i === next ? c.royal : c.sheetAlt,
                    }}>
                    {isDone ? (
                      <Check size={16} color="#fff" strokeWidth={3} />
                    ) : (
                      <Txt variant="smallStrong" style={{ color: i === next ? c.onRoyal : c.inkSoft }}>
                        {i + 1}
                      </Txt>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt variant="bodyStrong" style={isDone && { color: c.inkSoft }}>
                      {title}
                    </Txt>
                    <Txt variant="small" color="inkSoft" numberOfLines={2}>
                      {lang === 'en' ? (a.why ?? detail) : detail}
                    </Txt>
                  </View>
                  <ChevronRight size={18} color={c.inkFaint} />
                </View>
              </Press>
            );
          })}
        </Paper>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.m }}>
          {planning ? (
            <>
              <Sparkles size={14} color={c.amberInk} />
              <Txt variant="caption" style={{ color: c.amberInk }}>
                {t('home.planning')}
              </Txt>
            </>
          ) : plannedBy === 'tutor' ? (
            <>
              <BadgeCheck size={14} color={c.amberInk} />
              <Txt variant="caption" style={{ color: c.amberInk }}>
                {t('home.plannedByTutor')}
              </Txt>
            </>
          ) : plannedBy === 'course' ? (
            <>
              <Route size={14} color={c.royal} />
              <Txt variant="caption" style={{ color: c.royal }}>
                {courseUnit ? t('home.plannedByCourse', { n: weekNumber(courseUnit), title: courseUnit.title_de }) : t('path.title')}
              </Txt>
            </>
          ) : (
            <Txt variant="caption" color="inkFaint">
              {connection === 'ready' ? t('home.starterPlan') : t('home.starterPlanNotReady')}
            </Txt>
          )}
        </View>
        <Button
          label={lessonDone ? t('home.lessonDone') : next > 0 ? t('home.continueLesson') : t('home.startLesson')}
          kind={lessonDone ? 'secondary' : 'primary'}
          onPress={() => (lessonDone ? router.navigate('/practice') : open(Math.max(0, next)))}
          style={{ marginTop: space.l }}
        />
      </Section>

      {due > 0 ? (
        <Section title={t('home.reviewTitle')}>
          <Press onPress={() => router.push('/review')} scaleTo={0.99} accessibilityLabel={t('home.reviewLabel', { count: due })}>
            <Paper tone="royal" style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong" style={{ color: c.royal }}>
                  {t('home.due', { count: due })}
                </Txt>
                <Txt variant="small" color="inkSoft">
                  {t('home.reviewBody')}
                </Txt>
              </View>
              <ChevronRight size={20} color={c.royal} />
            </Paper>
          </Press>
        </Section>
      ) : null}

      {word ? (
        <Section title={t('home.wordOfDay')}>
          <Paper style={{ gap: space.s }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
              <GenderChip article={GENUS_ARTICLE[word.genus]} size="large" />
              <De variant="germanLarge" fit speakable={`${GENUS_ARTICLE[word.genus]} ${word.lemma}`} style={{ flex: 1, fontSize: 30, lineHeight: 36 }}>
                {word.lemma}
              </De>
              <SpeakButton text={`${GENUS_ARTICLE[word.genus]} ${word.lemma}`} />
            </View>
            <Txt variant="body" color="inkSoft">
              {word.plural[0] ? meaning : t('home.meaningNoPlural', { meaning })}
            </Txt>
            {word.plural[0] ? (
              <Txt variant="small" color="inkSoft">
                {t('home.plural')} <Txt variant="small" style={{ fontFamily: 'Vollkorn_600SemiBold', color: c.ink, fontSize: 16 }}>die {word.plural.join(' / die ')}</Txt>
              </Txt>
            ) : null}
            {word.example ? (
              <De variant="german" italic speakable style={{ marginTop: space.xs }}>
                {word.example}
              </De>
            ) : null}
            <View style={{ flexDirection: 'row', gap: space.s, marginTop: space.s }}>
              <Button
                label={wordSaved ? t('home.saved') : t('common.save')}
                icon={wordSaved ? BookmarkCheck : Bookmark}
                kind="secondary"
                size="medium"
                grow
                disabled={wordSaved}
                onPress={() => {
                  add({ key: nounKey(word.lemma), kind: 'noun', german: `${GENUS_ARTICLE[word.genus]} ${word.lemma}`, article: GENUS_ARTICLE[word.genus], lemma: word.lemma, plural: word.plural[0], meaning, example: word.example, sourceKey: 'home.wordOfDay' });
                  haptic.success();
                }}
              />
              <Button label={t('home.askTutor')} icon={MessageCircle} kind="secondary" size="medium" grow onPress={() => router.push(`/word/${encodeURIComponent(word.lemma)}`)} />
            </View>
          </Paper>
        </Section>
      ) : null}
    </Screen>
  );
}
