// The mistakes notebook (src/state/mistakes.ts): the sentences the learner got wrong in the course's checks, to
// meet again - a Lerncheck sentence to fix, a Sprechen or Hören sentence to write down after hearing it. An item
// leaves after two right answers in a row. Checked by code only (the pitfall's right sentence, the exact
// sentence), so it works without the tutor; the card behind a sentence is a tap away.

import { router } from 'expo-router';
import { Check, Headphones, Trash2, X } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import grammarData from '@/data/grammar.json';
import { compact } from '@/harness/engines';
import { compareSpoken } from '@/harness/speaking';
import type { GrammarCard } from '@/harness/tutor';
import { useI18n } from '@/i18n';
import { localizeGrammar } from '@/i18n/content';
import { mistakesToReview, useMistakes, type Mistake } from '@/state/mistakes';
import { useProgress } from '@/state/progress';
import { Button, IconButton, Paper, Pill, ProgressBar } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { KeyboardAvoider } from '@/ui/KeyboardAvoider';
import { TopBar } from '@/ui/Screen';
import { speak, stopSpeaking } from '@/ui/speech';
import { De, Txt } from '@/ui/Text';
import { font, gutter, radius, space, useTheme } from '@/ui/theme';

const grammar = grammarData as unknown as GrammarCard[];

export default function MistakesScreen() {
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const items = useMistakes((s) => s.items);
  const hit = useMistakes((s) => s.hit);
  const miss = useMistakes((s) => s.miss);
  const remove = useMistakes((s) => s.remove);
  const record = useProgress((s) => s.record);
  // the round is fixed when the screen opens; items cleared on the way stay in it until the end
  const [round] = useState<Mistake[]>(() => mistakesToReview(items));
  const [index, setIndex] = useState(0);
  const current = round[index];
  const [attempt, setAttempt] = useState(current?.kind === 'fix' ? current.text : '');
  const [verdict, setVerdict] = useState<{ ok: boolean; left: boolean } | null>(null);
  const [cleared, setCleared] = useState(0);
  const [finished, setFinished] = useState(false);

  const card = current?.card ? grammar.find((x) => x.key === current.card) : undefined;
  const why = card && current?.index !== undefined ? localizeGrammar(card, lang).pitfalls[current.index]?.why_en : undefined;

  const check = () => {
    if (!current || !attempt.trim()) return;
    stopSpeaking();
    const ok = current.kind === 'fix' ? compact(attempt) === compact(current.right ?? '') : compareSpoken(current.text, attempt).words.every((w) => w.ok);
    if (ok) {
      haptic.success();
      const left = hit(current.key);
      setVerdict({ ok: true, left });
      setCleared((n) => n + 1);
    } else {
      haptic.error();
      miss({ key: current.key, kind: current.kind, text: current.text, right: current.right, card: current.card, index: current.index, gloss: current.gloss, source: current.source });
      setVerdict({ ok: false, left: false });
    }
    record('review', ok);
  };

  const next = () => {
    const n = index + 1;
    setVerdict(null);
    if (n >= round.length) {
      setFinished(true);
      haptic.success();
      return;
    }
    setIndex(n);
    setAttempt(round[n].kind === 'fix' ? round[n].text : '');
  };

  const drop = () => {
    if (!current) return;
    remove(current.key);
    next();
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/practice' as never));

  return (
    <KeyboardAvoider style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={t('mistakes.title')} close onBack={close} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.m }}>
        {!round.length ? (
          <Paper tone="green" style={{ gap: space.xs }}>
            <Txt variant="headline" style={{ color: c.green }}>
              {t('mistakes.emptyTitle')}
            </Txt>
            <Txt variant="small" color="inkSoft">
              {t('mistakes.emptyBody')}
            </Txt>
          </Paper>
        ) : finished ? (
          <Animated.View entering={ZoomIn.duration(380)} style={{ gap: space.m }}>
            <Paper tone={cleared === round.length ? 'green' : 'amber'} style={{ gap: space.xs }}>
              <Txt variant="headline" style={{ color: cleared === round.length ? c.green : c.amberInk }}>
                {t('mistakes.result', { right: cleared, total: round.length })}
              </Txt>
              <Txt variant="small" color="inkSoft">
                {t('mistakes.resultBody', { count: Object.keys(items).length })}
              </Txt>
            </Paper>
            <Button label={t('common.done')} onPress={close} />
          </Animated.View>
        ) : current ? (
          <Animated.View key={current.key} entering={FadeIn.duration(220)} style={{ gap: space.m }}>
            <ProgressBar value={index / round.length} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s }}>
              <Txt variant="caption" color="inkSoft">
                {t('grammar.counter', { n: index + 1, total: round.length })} · {t('mistakes.missedTimes', { count: current.misses })}
              </Txt>
              <View style={{ flexShrink: 1, alignItems: 'flex-end' }}>
                {card ? <Pill label={localizeGrammar(card, lang).title_en} tone="royal" onPress={() => router.push(`/grammar/${card.key}`)} /> : null}
              </View>
            </View>

            {current.kind === 'fix' ? (
              <>
                <Txt variant="body" color="inkSoft">
                  {t('grammar.correctIt')}
                </Txt>
                <TextInput
                  value={attempt}
                  onChangeText={setAttempt}
                  editable={!verdict}
                  multiline
                  autoCorrect={false}
                  autoCapitalize="sentences"
                  style={{ fontFamily: font.de, fontSize: 19, lineHeight: 27, color: c.ink, backgroundColor: c.sheet, borderRadius: radius.control, borderWidth: 1, borderColor: c.rule, paddingHorizontal: space.l, paddingVertical: space.m, minHeight: 84 }}
                  accessibilityLabel={t('grammar.fixTheSentence')}
                />
              </>
            ) : (
              <>
                <Txt variant="body" color="inkSoft">
                  {t('listen.intro')}
                </Txt>
                <Button label={t('read.listen')} icon={Headphones} kind="secondary" size="medium" onPress={() => void speak(current.text)} />
                <TextInput
                  value={attempt}
                  onChangeText={setAttempt}
                  editable={!verdict}
                  multiline
                  autoCorrect={false}
                  autoCapitalize="sentences"
                  placeholder={t('listen.placeholder')}
                  placeholderTextColor={c.inkFaint}
                  style={{ fontFamily: font.de, fontSize: 19, lineHeight: 27, color: c.ink, backgroundColor: c.sheet, borderRadius: radius.control, borderWidth: 1, borderColor: c.rule, paddingHorizontal: space.l, paddingVertical: space.m, minHeight: 84 }}
                  accessibilityLabel={t('listen.placeholder')}
                />
              </>
            )}

            {!verdict ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
                <View style={{ flex: 1 }}>
                  <Button label={t('grammar.check')} onPress={check} disabled={!attempt.trim() || (current.kind === 'fix' && compact(attempt) === compact(current.text))} />
                </View>
                <IconButton icon={Trash2} onPress={drop} label={t('mistakes.drop')} size={48} tone="sheet" />
              </View>
            ) : (
              <Animated.View entering={FadeInDown.duration(260)} style={{ gap: space.m }}>
                <Paper tone={verdict.ok ? 'green' : 'red'} style={{ gap: space.s }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
                    {verdict.ok ? <Check size={18} color={c.green} strokeWidth={2.6} /> : <X size={18} color={c.red} strokeWidth={2.6} />}
                    <Txt variant="bodyStrong" style={{ color: verdict.ok ? c.green : c.red }}>
                      {verdict.ok ? (verdict.left ? t('mistakes.cleared') : t('mistakes.rightOnce')) : t('drill.notQuite')}
                    </Txt>
                  </View>
                  {!verdict.ok || current.kind === 'say' ? (
                    <>
                      <Txt variant="caption" color="inkSoft">
                        {current.kind === 'fix' ? t('grammar.answerOnCard') : t('mistakes.theSentence')}
                      </Txt>
                      <De variant="german" speakable>
                        {current.kind === 'fix' ? (current.right ?? '') : current.text}
                      </De>
                    </>
                  ) : null}
                  {current.gloss ? (
                    <Txt variant="small" color="inkSoft">
                      {current.gloss}
                    </Txt>
                  ) : null}
                  {!verdict.ok && why ? (
                    <Txt variant="small" color="inkSoft">
                      {why}
                    </Txt>
                  ) : null}
                </Paper>
                <Button label={index + 1 >= round.length ? t('grammar.finish') : t('common.next')} onPress={next} />
              </Animated.View>
            )}
          </Animated.View>
        ) : null}
      </ScrollView>
    </KeyboardAvoider>
  );
}
