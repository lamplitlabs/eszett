import { router } from 'expo-router';
import { BookOpen, Calculator, ChevronRight, Copy, PenLine, SquarePen } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Platform, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-screens/experimental';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { prepare, useChat, type Message, type Mode, type TutorMessage } from '@/features/chat';
import { statusLabel, tutorLine, useModelPercent } from '@/features/modelStatus';
import type { Level } from '@/harness/levels';
import { detectLang, translationTarget, type Lang } from '@/harness/route';
import { tIn, useI18n } from '@/i18n';
import { localizeGrammar } from '@/i18n/content';
import { LANGUAGE_NAMES } from '@/i18n/languages';
import { describeBytes, estimatedBytes } from '@/model/manifest';
import { cards, tutor, useModel } from '@/model/runtime';
import { isMtLang, useTranslated, useTranslator } from '@/mt';
import { useSettings } from '@/state/settings';
import { CheckFooter } from '@/ui/CheckFooter';
import { Composer } from '@/ui/Composer';
import { KeyboardAvoider } from '@/ui/KeyboardAvoider';
import { Button, IconButton, Paper, Pill, Press, SpeakButton } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { StatusLight } from '@/ui/Lamp';
import { AppMark } from '@/ui/Mark';
import { Markdown } from '@/ui/Markdown';
import { RedPen } from '@/ui/RedPen';
import { RuleLines } from '@/ui/RuleLines';
import { De, Txt } from '@/ui/Text';
import { Thinking } from '@/ui/Thinking';
import { gutter, radius, space, useTheme } from '@/ui/theme';

/**
 * Example requests per level. Questions and sentences to translate are catalog keys, shown in the tutor's
 * language (they are sent to the model as written); sentences to check are German with their mistakes.
 */
const SUGGESTIONS: Record<Level, ({ key: string; mode: 'ask' | 'translate' } | { text: string; mode: 'check' })[]> = {
  A1: [
    { key: 'tutor.suggestA1Introduce', mode: 'ask' },
    { key: 'tutor.suggestA1DuSie', mode: 'ask' },
    { text: 'Ich heiße Anna und ich komme aus Spanien und ich wohne in Berlin seit zwei Jahre.', mode: 'check' },
    { key: 'tutor.suggestA1Time', mode: 'ask' },
  ],
  A2: [
    { key: 'tutor.suggestA2SeitVor', mode: 'ask' },
    { text: 'Gestern ich bin mit meine Freundin ins Kino gegangen.', mode: 'check' },
    { key: 'tutor.suggestA2Flat', mode: 'translate' },
    { key: 'tutor.suggestA2Mit', mode: 'ask' },
  ],
  B1: [
    { key: 'tutor.suggestB1AlsWennWann', mode: 'ask' },
    { text: 'Ich weiß nicht, ob er kommt morgen zu der Party.', mode: 'check' },
    { key: 'tutor.suggestB1Konjunktiv', mode: 'ask' },
    { key: 'tutor.suggestB1Known', mode: 'translate' },
  ],
  B2: [
    { key: 'tutor.suggestB2Passive', mode: 'ask' },
    { text: 'Obwohl er krank war, er ist trotzdem zur Arbeit gegangen.', mode: 'check' },
    { key: 'tutor.suggestB2ObwohlTrotzdem', mode: 'ask' },
    { key: 'tutor.suggestB2Rain', mode: 'translate' },
  ],
  C1: [
    { key: 'tutor.suggestC1Nominalstil', mode: 'ask' },
    { text: 'Der Minister sagte, dass die Reform wird nächstes Jahr umgesetzt werden, obwohl viele Experten dagegen gewarnt haben.', mode: 'check' },
    { key: 'tutor.suggestC1KonjunktivI', mode: 'ask' },
    { key: 'tutor.suggestC1Proposal', mode: 'translate' },
  ],
  C2: [
    { key: 'tutor.suggestC2Paronyms', mode: 'ask' },
    { text: 'Sehr geehrte Damen und Herren, ich habe das Formular echt nicht hingekriegt und wäre Ihnen dankbar, wenn Sie mir weiterhelfen könnten.', mode: 'check' },
    { key: 'tutor.suggestC2Funktionsverb', mode: 'ask' },
    { key: 'tutor.suggestC2Compromise', mode: 'translate' },
  ],
};

/** The mode pills and the field's placeholder for each, as catalog keys. */
const MODES: { mode: Mode; label: string; placeholder: string }[] = [
  { mode: 'auto', label: 'tutor.modeAsk', placeholder: 'tutor.placeholderAsk' },
  { mode: 'check', label: 'tutor.modeCheck', placeholder: 'tutor.placeholderCheck' },
  { mode: 'translate', label: 'tutor.modeTranslate', placeholder: 'tutor.placeholderTranslate' },
];

/** How long the learner pauses typing before the model starts on the prompt's known beginning. */
const PREPARE_AFTER_MS = 400;

type Translate = ReturnType<typeof useI18n>['t'];

/**
 * The label of a translation request: the direction the tutor's finished reply took, or until then the one the
 * language of the learner's line suggests.
 */
const translateLabel = (text: string, explainIn: Lang, t: Translate, reply?: TutorMessage) => {
  const to = reply?.kind === 'translation' && reply.status === 'done' ? reply.lang : detectLang(text, explainIn) === 'de' ? translationTarget(explainIn) : 'de';
  return to === 'de' ? t('tutor.sayInGerman') : t('tutor.sayInYourLanguage', { name: LANGUAGE_NAMES[to] });
};

function LearnerBubble({ m, reply }: { m: Extract<Message, { role: 'learner' }>; reply?: TutorMessage }) {
  const { c } = useTheme();
  const { t } = useI18n();
  const explainIn = useSettings((s) => s.explainIn);
  const german = m.mode === 'check';
  return (
    <Animated.View entering={FadeInDown.duration(220)} style={{ alignItems: 'flex-end', marginVertical: space.s }}>
      {m.mode !== 'ask' ? (
        <Txt variant="caption" color="inkFaint" style={{ marginBottom: 4, marginRight: 4 }}>
          {m.mode === 'check' ? t('tutor.modeCheck') : translateLabel(m.text, explainIn, t, reply)}
        </Txt>
      ) : null}
      <View style={{ maxWidth: '86%', backgroundColor: c.royalTint, borderRadius: radius.sheet, borderBottomRightRadius: 6, paddingHorizontal: space.l, paddingVertical: space.m }}>
        {german ? (
          <De variant="german" style={{ color: c.royal }} selectable>
            {m.text}
          </De>
        ) : (
          <Txt variant="body" style={{ color: c.royal }} selectable>
            {m.text}
          </Txt>
        )}
      </View>
    </Animated.View>
  );
}

function FactCard({ m }: { m: TutorMessage }) {
  const { c } = useTheme();
  const { t } = useI18n();
  if (!m.fact) return null;
  const { fact } = m;
  return (
    <Paper tone="amber" style={{ marginBottom: space.m, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Calculator size={14} color={c.amberInk} />
        <Txt variant="caption" style={{ color: c.amberInk }}>
          {t('tutor.computedByRules')}
        </Txt>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
        <View style={{ flex: 1 }}>
          <Txt variant="small" color="inkSoft">
            {fact.value}
          </Txt>
          <De variant="germanLarge" speakable>
            {fact.answer}
          </De>
        </View>
        <SpeakButton text={fact.answer} />
      </View>
      {fact.note ? (
        <Txt variant="small" color="inkSoft">
          {fact.note}
        </Txt>
      ) : null}
    </Paper>
  );
}

function TutorBubble({ m }: { m: TutorMessage }) {
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const card = m.cardKey ? cards.find((k) => k.key === m.cardKey) : null;
  const shownCard = card ? localizeGrammar(card, lang) : null;
  const onWord = (lemma: string) => router.push(`/word/${encodeURIComponent(lemma)}`);
  const done = m.status === 'done' || m.status === 'stopped';
  // the tutor's English read in the app language, translated on this phone when the learner turned that on
  const [original, setOriginal] = useState(false);
  const text = useTranslated(m.text, { from: m.lang, to: lang, streaming: m.status === 'streaming', enabled: !original });
  const explanation = useTranslated(m.explanation, { from: m.lang, to: lang, enabled: !original });
  const translatable = text.available || explanation.available;
  return (
    <Animated.View entering={FadeIn.duration(250)} style={{ marginVertical: space.m, gap: space.s }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
        <AppMark size={22} lit={m.status !== 'error'} />
        <Txt variant="caption" color="inkSoft">
          {m.kind === 'correction' ? t('tutor.correction') : m.kind === 'translation' ? (m.lang === 'de' ? t('tutor.inGerman') : t('tutor.inLanguage', { name: LANGUAGE_NAMES[m.lang] })) : t('tutor.tutor')}
        </Txt>
      </View>
      <View style={{ paddingLeft: 2 }}>
        {m.kind === 'answer' ? <FactCard m={m} /> : null}
        {m.status === 'thinking' ? <Thinking /> : null}
        {m.status === 'error' ? (
          <Paper tone="red">
            <Txt variant="small" style={{ color: c.red }}>
              {m.error}
            </Txt>
          </Paper>
        ) : null}

        {m.kind === 'correction' && done && m.original ? (
          <View style={{ gap: space.m }}>
            <RedPen original={m.original} corrected={m.corrected ?? null} diff={m.diff ?? null} unchanged={Boolean(m.unchanged)} />
            {m.unchanged ? (
              <Txt variant="bodyStrong" style={{ color: c.red, fontFamily: 'Vollkorn_600SemiBold_Italic', fontSize: 19 }}>
                {t('tutor.nothingToCorrect')}
              </Txt>
            ) : null}
            {m.explanation ? <Markdown text={explanation.text} lang={m.lang} onWord={onWord} /> : null}
            {m.rules?.length ? <RuleLines rules={m.rules} /> : null}
            {!m.corrected && m.text ? <Markdown text={text.text} lang={m.lang} onWord={onWord} /> : null}
          </View>
        ) : null}

        {m.kind === 'translation' && (m.status === 'streaming' || done) && m.text ? (
          <Paper style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
            {m.lang === 'en' ? (
              // an English line: no German voice for it
              <Txt variant="body" style={{ flex: 1, fontSize: 18, lineHeight: 26 }} selectable>
                {text.text.split('\n')[0].replace(/\*\*/g, '')}
              </Txt>
            ) : (
              <>
                <De variant="germanLarge" speakable style={{ flex: 1 }} selectable>
                  {m.text.split('\n')[0].replace(/\*\*/g, '')}
                </De>
                <SpeakButton text={m.text} />
              </>
            )}
          </Paper>
        ) : null}

        {(m.kind === 'answer' && m.text && m.status !== 'error') || (m.kind === 'correction' && m.status === 'streaming') ? (
          <Markdown text={text.text} lang={m.lang} streaming={m.status === 'streaming'} onWord={onWord} />
        ) : null}
        {translatable && done ? (
          <Press onPress={() => setOriginal((o) => !o)} accessibilityLabel={original ? t('tutor.showTranslation') : t('tutor.showOriginal')} style={{ marginTop: space.xs }}>
            <Txt variant="caption" color="inkFaint">
              {t('tutor.translatedFrom')} · <Txt variant="caption" color="royal">{original ? t('tutor.showTranslation') : t('tutor.showOriginal')}</Txt>
            </Txt>
          </Press>
        ) : null}

        {card && shownCard && done ? (
          <Press onPress={() => router.push(`/grammar/${card.key}`)} scaleTo={0.99} accessibilityLabel={t('tutor.openRuleCard', { title: shownCard.title_en })} style={{ marginTop: space.m }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, backgroundColor: c.sheetAlt, borderRadius: radius.control, padding: space.m }}>
              <BookOpen size={18} color={c.royal} />
              <View style={{ flex: 1 }}>
                <Txt variant="smallStrong">{shownCard.title_en}</Txt>
                <Txt variant="caption" color="inkSoft">
                  {t('tutor.ruleCardDetail', { level: card.level })}
                </Txt>
              </View>
              <ChevronRight size={18} color={c.inkFaint} />
            </View>
          </Press>
        ) : null}

        {done && m.checks ? <CheckFooter checks={m.checks} noteTitle={tutor.noteTitle} /> : null}
        {m.status === 'stopped' ? (
          <Txt variant="caption" color="inkFaint" style={{ marginTop: space.xs }}>
            {t('tutor.stopped')}
          </Txt>
        ) : null}
        {done && m.text ? (
          <View style={{ flexDirection: 'row', gap: space.xs, marginTop: space.xs }}>
            <IconButton
              icon={Copy}
              label={t('tutor.copyAnswer')}
              size={32}
              onPress={() => {
                void Clipboard.setStringAsync(m.kind === 'correction' ? (m.corrected ?? m.text) : m.text);
                haptic.success();
              }}
            />
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

function Empty({ onPick }: { onPick: (text: string, mode: Mode, label: string) => void }) {
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const level = useSettings((s) => s.level);
  const explainIn = useSettings((s) => s.explainIn);
  const translated = useTranslator((s) => s.status === 'ready' && s.lang === lang);
  const connection = useModel((s) => s.status);
  const edition = useModel((s) => s.edition);
  const pct = useModelPercent();
  // the chips read in the app language; what is sent is the same request in the language the tutor answers in
  // (the two differ for a learner whose language the model cannot speak yet, or who pinned another one)
  const suggestions = SUGGESTIONS[level].map((s) => ({ mode: s.mode, label: 'key' in s ? tIn(lang, s.key) : s.text, text: 'key' in s ? tIn(explainIn, s.key) : s.text }));
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: gutter, gap: space.xl }} keyboardShouldPersistTaps="handled">
      <View style={{ alignItems: 'center', gap: space.m }}>
        <AppMark size={56} lit={connection === 'ready'} />
        <Txt variant="headline" center>
          {t('tutor.emptyTitle')}
        </Txt>
        <Txt variant="body" color="inkSoft" center style={{ maxWidth: 320 }}>
          {t('tutor.emptyBody')}
        </Txt>
        {explainIn !== lang ? (
          <Txt variant="caption" color="inkSoft" center style={{ maxWidth: 320 }}>
            {translated ? t('tutor.answersTranslated', { name: LANGUAGE_NAMES[lang] }) : t('tutor.answersIn', { name: LANGUAGE_NAMES[explainIn] })}
          </Txt>
        ) : null}
        {explainIn === 'en' && isMtLang(lang) && !translated ? (
          <Press onPress={() => router.navigate('/me')} accessibilityLabel={t('tutor.turnOnTranslation', { name: LANGUAGE_NAMES[lang] })}>
            <Txt variant="caption" color="royal" center style={{ maxWidth: 320 }}>
              {t('tutor.turnOnTranslation', { name: LANGUAGE_NAMES[lang] })}
            </Txt>
          </Press>
        ) : null}
      </View>
      {connection !== 'ready' ? (
        <Paper tone="alt" style={{ gap: space.m }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
            <StatusLight connection={connection} size={12} />
            <Txt variant="bodyStrong" style={{ flex: 1 }}>
              {connection === 'absent' ? t('tutor.notOnPhone') : tutorLine(connection, pct, lang)}
            </Txt>
          </View>
          <Txt variant="small" color="inkSoft">
            {connection === 'absent'
              ? t('tutor.downloadNote', { size: describeBytes(estimatedBytes(edition)) })
              : connection === 'unavailable'
                ? t('tutor.unavailableNote')
                : t('tutor.notReadyNote')}
          </Txt>
          {connection !== 'unavailable' ? <Button label={connection === 'absent' ? t('tutor.getTutor') : t('tutor.seeProgress')} kind="secondary" size="medium" onPress={() => router.push('/model')} /> : null}
        </Paper>
      ) : null}
      <View style={{ gap: space.s }}>
        {suggestions.map((s) => (
          <Press key={s.text} onPress={() => onPick(s.text, s.mode, s.label)} scaleTo={0.985} accessibilityLabel={s.label}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, backgroundColor: c.sheet, borderWidth: 1, borderColor: c.rule, borderRadius: radius.control, padding: space.m }}>
              {s.mode === 'check' ? <PenLine size={17} color={c.red} /> : <ChevronRight size={17} color={c.royal} />}
              {s.mode === 'check' ? (
                <De variant="german" style={{ flex: 1, fontSize: 16, lineHeight: 22 }}>
                  {s.label}
                </De>
              ) : (
                <Txt variant="small" style={{ flex: 1 }}>
                  {s.mode !== 'translate'
                    ? s.label
                    : detectLang(s.text, explainIn) === 'de'
                      ? t('tutor.suggestTranslateTo', { name: LANGUAGE_NAMES[translationTarget(explainIn)], text: s.label })
                      : t('tutor.suggestTranslate', { text: s.label })}
                </Txt>
              )}
            </View>
          </Press>
        ))}
      </View>
    </ScrollView>
  );
}

export default function TutorScreen() {
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const { messages, busy, send, stop, clear } = useChat();
  const connection = useModel((s) => s.status);
  const explainIn = useSettings((s) => s.explainIn);
  const pct = useModelPercent();
  const [text, setText] = useState('');
  const [mode, setMode] = useState<Mode>('auto');
  const input = useRef<TextInput>(null);
  // While the learner types, the model gets a head start on the part of the prompt that is already known.
  useEffect(() => {
    if (connection !== 'ready' || busy) return;
    const timer = setTimeout(() => prepare(text, mode), PREPARE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [text, mode, connection, busy]);
  const submit = (value = text, m = mode, shown?: string) => {
    if (!value.trim()) return;
    void send(value, m, shown);
    setText('');
  };
  const current = MODES.find((x) => x.mode === mode) ?? MODES[0];

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <View style={{ paddingTop: insets.top + space.s, paddingHorizontal: gutter, paddingBottom: space.s, flexDirection: 'row', alignItems: 'center', gap: space.m, borderBottomWidth: messages.length ? 1 : 0, borderBottomColor: c.rule }}>
        <Txt variant="title" style={{ flex: 1 }} accessibilityRole="header">
          {t('tutor.title')}
        </Txt>
        <Press onPress={() => router.push('/model')} accessibilityLabel={t('tutor.yourTutor')} hitSlop={8}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <StatusLight connection={connection} />
            <Txt variant="caption" color="inkSoft">
              {connection === 'absent' ? t('tutor.getTutor') : statusLabel(connection, pct, lang)}
            </Txt>
          </View>
        </Press>
        {messages.length ? <IconButton icon={SquarePen} label={t('tutor.newConversation')} onPress={clear} tone="sheet" size={36} /> : null}
      </View>
      {/* iOS lays the screen under the translucent tab bar, so the composer is lifted by the bottom inset; Android
          ends the screen above the bar already, and the inset (bar plus navigation bar) would leave a hole */}
      <SafeAreaView edges={{ bottom: Platform.OS === 'ios' }} style={{ flex: 1 }}>
        <KeyboardAvoider style={{ flex: 1 }}>
          {messages.length ? (
            <FlatList
              inverted
              data={[...messages].reverse()}
              keyExtractor={(m) => m.id}
              contentInsetAdjustmentBehavior="never"
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              contentContainerStyle={{ paddingHorizontal: gutter, paddingVertical: space.l }}
              renderItem={({ item, index }) => {
                if (item.role !== 'learner') return <TutorBubble m={item} />;
                // the list is reversed: the reply to this message is the one before it in the data
                const next = messages[messages.length - index];
                return <LearnerBubble m={item} reply={next?.role === 'tutor' ? next : undefined} />;
              }}
            />
          ) : (
            <Empty onPick={(value, m, label) => submit(value, m, label !== value ? label : undefined)} />
          )}
          <Composer
            ref={input}
            value={text}
            onChange={setText}
            onSend={() => submit()}
            onStop={stop}
            busy={busy}
            german={mode === 'check'}
            placeholder={t(current.placeholder, { name: LANGUAGE_NAMES[translationTarget(explainIn)] })}
            above={
              <View style={{ flexDirection: 'row', gap: space.s }}>
                {MODES.map((x) => (
                  <Pill key={x.mode} label={t(x.label)} selected={mode === x.mode} onPress={() => setMode(x.mode)} />
                ))}
              </View>
            }
          />
        </KeyboardAvoider>
      </SafeAreaView>
    </View>
  );
}
