// Plaudern - a free conversation with a tandem partner (src/harness/talk.ts). Pick a topic, talk; the partner
// answers in German at the level and always asks back. She knows the learner's profile (src/state/profile.ts)
// and what they said last time (src/state/speaking.ts), so the talk is about the learner's life. Nothing is
// corrected mid-flow; at the end the tutor goes through the learner's lines in a recap.

import { router, useLocalSearchParams } from 'expo-router';
import { Check, Languages, Lightbulb, RotateCcw, UserRound } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFieldDictation } from '@/features/dictation';
import { glossInAppLanguage } from '@/features/sceneGloss';
import type { DiffOp } from '@/harness/diff';
import { LEVELS, type Level } from '@/harness/levels';
import { speakerLabel, type SceneCard, type TranscriptLine } from '@/harness/roleplay';
import { translationTarget } from '@/harness/route';
import type { RuleHit } from '@/harness/rules';
import { keepTalking, learnerLabel, partnerFor, talkCard, talkTopicsFor, thingTold, wordsOf, type TalkTopic } from '@/harness/talk';
import { useI18n } from '@/i18n';
import { describeError, isReady, tutor, useModel } from '@/model/runtime';
import { useTranslator } from '@/mt';
import { filledFields, useProfile } from '@/state/profile';
import { useProgress } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { memoryOf, useSpeaking } from '@/state/speaking';
import { uid } from '@/state/storage';
import { AuthorBox } from '@/features/AuthorBox';
import { Composer } from '@/ui/Composer';
import { Button, Paper, Pill, Press, SpeakButton } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { KeyboardAvoider } from '@/ui/KeyboardAvoider';
import { RedPen } from '@/ui/RedPen';
import { RuleLines } from '@/ui/RuleLines';
import { TopBar } from '@/ui/Screen';
import { speak } from '@/ui/speech';
import { De, Txt } from '@/ui/Text';
import { Thinking } from '@/ui/Thinking';
import { font, gutter, radius, space, useTheme } from '@/ui/theme';

interface Turn {
  id: string;
  who: 'them' | 'me';
  german: string;
  gloss: string | null;
  status: 'done' | 'thinking' | 'streaming' | 'error';
  error?: string;
  /** The recap's correction of a learner line. */
  check?: { status: 'waiting' | 'checking' | 'done' | 'error'; unchanged?: boolean; corrected?: string | null; diff?: DiffOp[] | null; note?: string; rules?: RuleHit[] };
}

/** The first real sentence of the tutor's explanation: markdown, headings ("Mistakes:") and list numbers dropped. */
function firstSentence(md: string): string {
  const lines = md.split('\n').map((l) => l.replace(/\*\*|__|[*_`#>]/g, '').replace(/^\s*\d+[.)]\s*/, '').trim());
  return lines.find((l) => l.split(/\s+/).length >= 4 && !/:$/.test(l)) ?? lines.find((l) => l.length > 3) ?? '';
}

export default function TalkScreen() {
  const params = useLocalSearchParams<{ level?: Level; topic?: string }>();
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const learnerLevel = useSettings((s) => s.level);
  const explainIn = useSettings((s) => s.explainIn);
  const autoSpeak = useSettings((s) => s.autoSpeak);
  const level: Level = params.level && LEVELS.includes(params.level) ? params.level : learnerLevel;
  const connection = useModel((s) => s.status);
  const profile = useProfile((s) => s.profile);
  const chats = useSpeaking((s) => s.chats);
  const addChat = useSpeaking((s) => s.addChat);
  const record = useProgress((s) => s.record);
  const mtReady = useTranslator((s) => s.status === 'ready' && s.lang === lang);
  const glossTo = translationTarget(explainIn);
  const glossVia = glossTo === 'en' && lang !== 'en' && mtReady ? lang : null;

  const [partner] = useState(() => partnerFor());
  const memory = memoryOf(chats);
  const topics = talkTopicsFor(level);
  const [card, setCard] = useState<SceneCard | null>(null);
  const [topicId, setTopicId] = useState('');
  const [topicTitle, setTopicTitle] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const dictation = useFieldDictation(text, setText);
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [glossing, setGlossing] = useState<string | null>(null);
  const [phase, setPhase] = useState<'pick' | 'chat' | 'recap'>('pick');
  const scroll = useRef<ScrollView>(null);

  const me = learnerLabel(profile);
  const update = useCallback((id: string, patch: Partial<Turn>) => setTurns((ts) => ts.map((x) => (x.id === id ? { ...x, ...patch } : x))), []);

  const begin = (topic: TalkTopic | { id: 'own'; title_de: string }) => {
    const next = talkCard(topic, partner, profile, memory, level);
    setCard(next);
    setTopicId(topic.id);
    setTopicTitle(topic.title_de);
    setTurns([{ id: 'opening', who: 'them', german: next.opening, gloss: null, status: 'done' }]);
    setText('');
    setPhase('chat');
    haptic.tap();
    if (autoSpeak) setTimeout(() => speak(next.opening), 400);
  };

  const glossLine = async (turn: Turn) => {
    setGlossing(turn.id);
    try {
      const g = await glossInAppLanguage(await tutor.gloss(turn.german, { level, lang: glossTo }), glossVia);
      update(turn.id, { gloss: g || t('talk.noGloss') });
    } catch {
      update(turn.id, { gloss: t('talk.noGloss') });
    } finally {
      setGlossing(null);
    }
  };

  const send = async (raw: string) => {
    const line = raw.trim();
    if (!line || busy || !card) return;
    setText('');
    const mine: Turn = { id: uid(), who: 'me', german: line, gloss: null, status: 'done' };
    const theirs: Turn = { id: uid(), who: 'them', german: '', gloss: null, status: 'thinking' };
    const history = [...turns.filter((x) => x.status === 'done'), mine];
    setTurns((ts) => [...ts, mine, theirs]);
    setBusy(true);
    haptic.soft();
    const role = speakerLabel(card.role_de);
    const transcript: TranscriptLine[] = history.map((x) => [x.who === 'them' ? role : me, x.german]);
    try {
      const turn = await tutor.sceneTurn(card, transcript, {
        level,
        lang: explainIn,
        help: false,
        onText: (full) => update(theirs.id, { status: 'streaming', german: full.split('\n')[0].replace(/^[^:]{1,30}:\s+/, '').replace(/\s*\([^)]*$/, '') }),
      });
      const german = keepTalking(turn.line.german, history.length);
      update(theirs.id, { status: 'done', german });
      record('scene', null);
      if (autoSpeak) speak(german);
    } catch (e) {
      update(theirs.id, { status: 'error', error: describeError(e) });
    }
    setBusy(false);
  };

  const suggest = async () => {
    if (!card) return;
    setSuggesting(true);
    try {
      const role = speakerLabel(card.role_de);
      const transcript: TranscriptLine[] = turns.filter((x) => x.status === 'done').map((x) => [x.who === 'them' ? role : me, x.german]);
      const [first] = await tutor.suggestReplies(card, transcript, { level, lang: explainIn });
      if (first?.german) setText(first.german);
    } catch {
      // the learner can still write their own line
    } finally {
      setSuggesting(false);
    }
  };

  const mine = turns.filter((x) => x.who === 'me');

  // the recap: the tutor goes through the learner's lines one after another, so the flow was never interrupted
  const end = async () => {
    if (!card) return;
    setPhase('recap');
    const lines = mine.map((x) => x.german);
    addChat({ level, topic: topicId, title: topicTitle, lines: lines.length, words: lines.reduce((n, l) => n + wordsOf(l), 0), told: thingTold(lines) });
    setTurns((ts) => ts.map((x) => (x.who === 'me' ? { ...x, check: { status: 'waiting' } } : x)));
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 120);
    for (const x of mine) {
      if (!isReady()) {
        update(x.id, { check: { status: 'error' } });
        continue;
      }
      update(x.id, { check: { status: 'checking' } });
      try {
        const r = await tutor.correct(x.german, { level, lang: explainIn });
        update(x.id, { check: { status: 'done', unchanged: r.correction.unchanged || !r.correction.corrected, corrected: r.correction.corrected, diff: r.diff, note: firstSentence(r.correction.explanation), rules: r.rules } });
        record('check', r.correction.unchanged);
      } catch {
        update(x.id, { check: { status: 'error' } });
      }
    }
  };

  const again = () => {
    setCard(null);
    setTurns([]);
    setPhase('pick');
  };

  if (phase === 'pick') {
    const filled = filledFields(profile).length;
    return (
      <View style={{ flex: 1, backgroundColor: c.paper }}>
        <TopBar title={t('talk.title')} />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.xl }}>
          <Paper tone="royal" style={{ gap: space.s }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.royal, alignItems: 'center', justifyContent: 'center' }}>
                <Txt variant="headline" style={{ color: c.onRoyal }}>
                  {partner.name[0]}
                </Txt>
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">{t('talk.partnerIs', { name: partner.name })}</Txt>
                <Txt variant="small" color="inkSoft">
                  {t(`talk.partner.${partner.id}`)}
                </Txt>
              </View>
            </View>
            {memory.topics.length ? (
              <Txt variant="small" color="inkSoft">
                {t('talk.remembers', { name: partner.name, topics: memory.topics.join(', ') })}
              </Txt>
            ) : null}
          </Paper>

          <Txt variant="body" color="inkSoft">
            {t('talk.intro')}
          </Txt>

          <Press onPress={() => router.push('/profile')} scaleTo={0.99} accessibilityLabel={t('profile.title')}>
            <Paper tone={filled ? 'alt' : 'amber'} style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
              <UserRound size={18} color={filled ? c.inkSoft : c.amberInk} />
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">{filled ? t('talk.aboutYouFilled', { name: me === 'Tandempartner' ? t('talk.you') : me }) : t('talk.aboutYouEmpty')}</Txt>
                <Txt variant="small" color="inkSoft">
                  {filled ? t('talk.aboutYouEdit') : t('talk.aboutYouWhy')}
                </Txt>
              </View>
            </Paper>
          </Press>

          <View style={{ gap: space.m }}>
            <Txt variant="headline" accessibilityRole="header">
              {t('talk.pickTopic')}
            </Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
              {topics.map((topic) => (
                <Pill key={topic.id} label={`${topic.title_de}${topic.level !== level ? ` · ${topic.level}` : ''}`} tone={topic.level === level ? 'royal' : undefined} onPress={() => begin(topic)} />
              ))}
            </View>
            <AuthorBox title={t('talk.ownTitle')} hint={t('talk.ownHint')} placeholder={t('talk.ownPlaceholder')} buttonLabel={t('talk.ownStart')} busyLabel={t('talk.ownStart')} unusableKey="talk.ownUnusable" onSubmit={async (topic) => begin({ id: 'own', title_de: topic })} />
          </View>
        </ScrollView>
      </View>
    );
  }

  const role = card ? speakerLabel(card.role_de) : partner.name;
  const corrected = mine.filter((x) => x.check?.status === 'done' && !x.check.unchanged).length;
  const checked = mine.filter((x) => x.check?.status === 'done').length;
  const words = mine.reduce((n, x) => n + wordsOf(x.german), 0);

  return (
    <KeyboardAvoider style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={topicTitle} right={phase === 'chat' && mine.length > 0 ? <Button label={t('talk.end')} kind="quiet" size="small" onPress={() => void end()} /> : null} />
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })} contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: space.xl, gap: space.m }}>
        <Txt variant="caption" color="inkFaint" center>
          {t('talk.withAt', { name: role, level })}
        </Txt>
        {turns.map((turn) =>
          turn.who === 'them' ? (
            <Animated.View key={turn.id} entering={FadeInDown.duration(240)} style={{ flexDirection: 'row', gap: space.m, alignItems: 'flex-start', marginTop: space.s }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.royalTint, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                <Txt style={{ fontFamily: font.deSemi, fontSize: 16, color: c.royal }}>{role.charAt(0)}</Txt>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Txt variant="caption" color="inkSoft">
                  {role}
                </Txt>
                {turn.status === 'thinking' ? <Thinking label={t('talk.thinking', { name: role })} /> : null}
                {turn.status === 'error' ? (
                  <Txt variant="small" style={{ color: c.red }}>
                    {turn.error ?? t('talk.lineFailed')}
                  </Txt>
                ) : null}
                {turn.german ? (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.s }}>
                    <De variant="german" speakable={turn.status === 'done'} style={{ flex: 1, fontSize: 19, lineHeight: 27 }}>
                      {turn.german}
                    </De>
                    {turn.status === 'done' ? <SpeakButton text={turn.german} size={32} /> : null}
                  </View>
                ) : null}
                {turn.gloss ? (
                  <Txt variant="small" color="inkSoft">
                    {turn.gloss}
                  </Txt>
                ) : turn.status === 'done' && lang !== 'de' ? (
                  <Press onPress={() => void glossLine(turn)} accessibilityLabel={t('scene.translateA11y')} hitSlop={6} style={{ alignSelf: 'flex-start' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Languages size={13} color={c.royal} />
                      <Txt variant="caption" style={{ color: c.royal }}>
                        {glossing === turn.id ? t('scene.translating') : t('scene.translate')}
                      </Txt>
                    </View>
                  </Press>
                ) : null}
              </View>
            </Animated.View>
          ) : (
            <Animated.View key={turn.id} entering={FadeInDown.duration(200)} style={{ alignItems: 'flex-end', gap: space.s }}>
              <View style={{ maxWidth: '88%', backgroundColor: c.royalTint, borderRadius: radius.sheet, borderBottomRightRadius: 6, paddingHorizontal: space.l, paddingVertical: space.m }}>
                <De variant="german" style={{ color: c.royal, fontSize: 18 }}>
                  {turn.german}
                </De>
              </View>
              {turn.check?.status === 'checking' ? <Thinking label={t('scene.checkingGerman')} /> : null}
              {turn.check?.status === 'done' && turn.check.unchanged ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Check size={14} color={c.green} strokeWidth={2.6} />
                  <Txt variant="caption" style={{ color: c.green }}>
                    {t('scene.correctGerman')}
                  </Txt>
                </View>
              ) : null}
              {turn.check?.status === 'done' && !turn.check.unchanged && turn.check.corrected ? (
                <View style={{ width: '92%', gap: space.s }}>
                  <RedPen original={turn.german} corrected={turn.check.corrected} diff={turn.check.diff ?? null} unchanged={false} />
                  {turn.check.rules?.length ? (
                    <RuleLines rules={turn.check.rules} compact />
                  ) : turn.check.note ? (
                    <Txt variant="small" color="inkSoft">
                      {turn.check.note}
                    </Txt>
                  ) : null}
                </View>
              ) : null}
              {turn.check?.status === 'error' ? (
                <Txt variant="caption" color="inkFaint">
                  {t('talk.notChecked')}
                </Txt>
              ) : null}
            </Animated.View>
          ),
        )}

        {phase === 'recap' ? (
          <Animated.View entering={FadeInDown.duration(300)}>
            <Paper tone="amber" style={{ gap: space.m, marginTop: space.l }}>
              <De variant="germanLarge">Schön, dass wir geredet haben!</De>
              <Txt variant="body">
                {t('talk.summary', { count: mine.length, words })}
                {checked === mine.length ? ` ${corrected ? t('talk.summaryCorrected', { count: corrected }) : t('talk.summaryAllCorrect')}` : ` ${t('talk.summaryChecking')}`}
              </Txt>
              <Txt variant="small" color="inkSoft">
                {t('talk.remembersNext', { name: role })}
              </Txt>
              <View style={{ flexDirection: 'row', gap: space.s, marginTop: space.s }}>
                <Button label={t('talk.anotherTopic')} icon={RotateCcw} kind="secondary" size="medium" onPress={again} grow />
                <Button label={t('common.done')} size="medium" onPress={() => router.back()} grow />
              </View>
            </Paper>
          </Animated.View>
        ) : null}
      </ScrollView>

      {phase === 'chat' ? (
        <View style={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.s }}>
          <Composer
            value={text}
            onChange={setText}
            onSend={() => void send(text)}
            busy={busy}
            german
            dictation={dictation}
            disabled={connection !== 'ready'}
            placeholder={connection === 'ready' ? t('talk.placeholder', { name: role }) : connection === 'absent' ? t('scene.tutorAbsent') : t('scene.tutorNotReady')}
            above={
              isReady() ? (
                <View style={{ flexDirection: 'row', gap: space.s }}>
                  <Pill label={suggesting ? t('scene.thinkingOfLine') : t('scene.helpMeAnswer')} icon={Lightbulb} tone="amber" onPress={() => void suggest()} />
                </View>
              ) : null
            }
          />
        </View>
      ) : null}
    </KeyboardAvoider>
  );
}
