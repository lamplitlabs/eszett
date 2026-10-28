import { router, useLocalSearchParams } from 'expo-router';
import { Check, ChevronDown, Languages, Lightbulb, MessageSquareQuote, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFieldDictation } from '@/features/dictation';
import { lessonKey, scenes } from '@/features/lesson';
import { glossInAppLanguage } from '@/features/sceneGloss';
import { SceneIcon } from '@/features/sceneIcons';
import type { DiffOp } from '@/harness/diff';
import type { Phrase } from '@/harness/parse';
import { pathDoneKey } from '@/harness/path';
import { factsRevealed, sceneTitle, speakerLabel, type TranscriptLine } from '@/harness/roleplay';
import { translationTarget } from '@/harness/route';
import { useI18n } from '@/i18n';
import { localizeScene } from '@/i18n/content';
import { describeError, isReady, tutor, useModel } from '@/model/runtime';
import { useTranslator } from '@/mt';
import { useAuthored } from '@/state/authored';
import { useDeck } from '@/state/deck';
import { useProgress } from '@/state/progress';
import { useSettings } from '@/state/settings';
import { uid } from '@/state/storage';
import { Composer } from '@/ui/Composer';
import { KeyboardAvoider } from '@/ui/KeyboardAvoider';
import { Button, GermanChip, Paper, Pill, Press, SpeakButton } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { RedPen } from '@/ui/RedPen';
import { RuleLines } from '@/ui/RuleLines';
import type { RuleHit } from '@/harness/rules';
import { TopBar } from '@/ui/Screen';
import { speak } from '@/ui/speech';
import { De, Txt } from '@/ui/Text';
import { Thinking } from '@/ui/Thinking';
import { font, genderColor, genderTint, gutter, radius, space, useTheme } from '@/ui/theme';

interface LineCheck {
  status: 'checking' | 'done' | 'error';
  unchanged?: boolean;
  corrected?: string | null;
  diff?: DiffOp[] | null;
  note?: string;
  rules?: RuleHit[];
}

interface Turn {
  id: string;
  who: 'them' | 'me';
  german: string;
  gloss: string | null;
  status: 'thinking' | 'streaming' | 'done' | 'error';
  error?: string;
  /** The last tap-to-translate of this line failed; the learner can retry it. */
  glossError?: boolean;
  check?: LineCheck;
  /** The model's reply needed another frame (it broke character the first time). */
  retried?: boolean;
}

const articleOf = (role: string) => (/^(der|die|das)\s/i.exec(role)?.[1].toLowerCase() ?? null);

function firstSentence(md: string) {
  const line = md
    .split('\n')
    .map((l) => l.replace(/\*\*|__|[*_`#>]/g, '').trim())
    .find((l) => l.length > 3);
  return line ?? '';
}

/** A translated sentence whose `{de}` placeholder is a German word set in the German face. */
function WithGerman({ text, de }: { text: string; de: string }) {
  const [before, after = ''] = text.split('{de}');
  return (
    <>
      {before}
      <De variant="german" style={{ fontSize: 16 }}>
        {de}
      </De>
      {after}
    </>
  );
}

export default function SceneScreen() {
  const { key, lesson, path } = useLocalSearchParams<{ key: string; lesson?: string; path?: string }>();
  const own = useAuthored((s) => s.scenes[key]);
  const removeScene = useAuthored((s) => s.removeScene);
  const card = own ?? scenes.find((s) => s.key === key) ?? scenes[0];
  const { c } = useTheme();
  const { t, lang } = useI18n();
  // the card as read by the learner; `card` itself stays English for the model and the fact matching
  const shown = localizeScene(card, lang);
  const insets = useSafeAreaInsets();
  const { level, explainIn, glosses, correctAsYouGo, autoSpeak } = useSettings();
  const connection = useModel((s) => s.status);
  const markDone = useProgress((s) => s.markDone);
  const record = useProgress((s) => s.record);
  const addWord = useDeck((s) => s.add);
  const role = speakerLabel(card.role_de);
  const me = speakerLabel(card.learner_de);
  const article = articleOf(card.role_de);
  const help = glosses;
  // the model glosses its lines in English as it writes them; a tutor language it can gloss in (French, Spanish,
  // Italian) gets each line translated right after instead, so the glosses read in the learner's language
  const glossTo = translationTarget(explainIn);
  const glossAfter = help && glossTo !== 'en';
  // an English gloss is translated into the app language on this phone when the learner turned that on
  const mtReady = useTranslator((s) => s.status === 'ready' && s.lang === lang);
  const glossVia = help && glossTo === 'en' && lang !== 'en' && mtReady ? lang : null;
  const inAppLanguage = (gloss: string | null) => glossInAppLanguage(gloss, glossVia);

  const opening: Turn = { id: 'opening', who: 'them', german: card.opening, gloss: shown.opening_gloss, status: 'done' };
  const [turns, setTurns] = useState<Turn[]>([opening]);
  const [text, setText] = useState('');
  const dictation = useFieldDictation(text, setText);
  const [busy, setBusy] = useState(false);
  const [briefOpen, setBriefOpen] = useState(true);
  const [phrases, setPhrases] = useState<{ status: 'idle' | 'loading' | 'done' | 'error'; items: Phrase[]; error?: string }>({ status: 'idle', items: [] });
  const [suggesting, setSuggesting] = useState(false);
  const [ended, setEnded] = useState(false);
  const [glossing, setGlossing] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    if (autoSpeak) setTimeout(() => speak(card.opening), 400);
  }, [autoSpeak, card.opening]);

  const update = useCallback((id: string, patch: Partial<Turn>) => setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t))), []);
  const revealed = new Set(turns.filter((t) => t.who === 'them' && t.status === 'done').flatMap((t) => factsRevealed(card, t.german)));
  const learnerTurns = turns.filter((t) => t.who === 'me').length;
  const scripted = card.beats[learnerTurns]?.learner ?? [];

  const glossLine = async (turn: Turn, fallback: string | null = null) => {
    setGlossing(turn.id);
    try {
      const g = await inAppLanguage(await tutor.gloss(turn.german, { level, lang: glossTo }));
      if (g) update(turn.id, { gloss: g, glossError: false });
      else if (fallback) update(turn.id, { gloss: fallback, glossError: false });
      else update(turn.id, { glossError: true });
    } catch {
      // no translated gloss to show: surface a retryable error rather than the raw English
      if (fallback) update(turn.id, { gloss: fallback, glossError: false });
      else update(turn.id, { glossError: true });
    } finally {
      setGlossing(null);
    }
  };

  const send = async (raw: string) => {
    const line = raw.trim();
    if (!line || busy) return;
    setBriefOpen(false);
    setText('');
    const mine: Turn = { id: uid(), who: 'me', german: line, gloss: null, status: 'done', check: correctAsYouGo && isReady() ? { status: 'checking' } : undefined };
    const theirs: Turn = { id: uid(), who: 'them', german: '', gloss: null, status: 'thinking' };
    const history = [...turns.filter((t) => t.status === 'done'), mine];
    setTurns((ts) => [...ts, mine, theirs]);
    setBusy(true);
    haptic.soft();
    const transcript: TranscriptLine[] = history.map((t) => [t.who === 'them' ? role : me, t.german]);
    try {
      const turn = await tutor.sceneTurn(card, transcript, {
        level,
        lang: explainIn,
        help: help && !glossAfter,
        onText: (full) => update(theirs.id, { status: 'streaming', german: full.split('\n')[0].replace(/^[^:]{1,30}:\s+/, '').replace(/\s*\([^)]*$/, '') }),
      });
      // the model may add its English gloss even when not asked; it only serves as the fallback when a gloss in the learner's language is coming
      update(theirs.id, { status: 'done', german: turn.line.german, gloss: glossAfter ? null : turn.line.gloss, retried: turn.attempts > 1 });
      record('scene', null);
      if (autoSpeak) speak(turn.line.german);
      if (glossAfter && turn.line.german) await glossLine({ ...theirs, german: turn.line.german }, turn.line.gloss);
      else if (glossVia && turn.line.gloss) update(theirs.id, { gloss: await inAppLanguage(turn.line.gloss) });
    } catch (e) {
      update(theirs.id, { status: 'error', error: describeError(e) });
    }
    if (mine.check) {
      try {
        const r = await tutor.correct(line, { level, lang: explainIn });
        update(mine.id, {
          check: {
            status: 'done',
            unchanged: r.correction.unchanged || !r.correction.corrected,
            corrected: r.correction.corrected,
            diff: r.diff,
            note: firstSentence(r.correction.explanation),
            rules: r.rules,
          },
        });
        record('check', r.correction.unchanged);
      } catch {
        update(mine.id, { check: { status: 'error' } });
      }
    }
    setBusy(false);
  };

  const suggest = async () => {
    if (scripted.length) return;
    setSuggesting(true);
    try {
      const transcript: TranscriptLine[] = turns.filter((t) => t.status === 'done').map((t) => [t.who === 'them' ? role : me, t.german]);
      const [first] = await tutor.suggestReplies(card, transcript, { level, lang: explainIn });
      if (first?.german) setText(first.german);
    } catch {
      // the learner can still type their own line
    } finally {
      setSuggesting(false);
    }
  };

  const loadPhrases = async () => {
    setPhrases({ status: 'loading', items: [] });
    try {
      const items = await tutor.phrases(card.situation_en, { level, lang: explainIn });
      setPhrases({ status: 'done', items });
    } catch (e) {
      setPhrases({ status: 'error', items: [], error: describeError(e) });
    }
  };

  const end = () => {
    setEnded(true);
    markDone(`scene:${card.key}`);
    if (lesson !== undefined) markDone(lessonKey(Number(lesson)));
    if (path) markDone(pathDoneKey(path));
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 120);
  };

  const restart = () => {
    setTurns([opening]);
    setEnded(false);
    setBriefOpen(true);
    if (autoSpeak) speak(card.opening);
  };

  const corrections = turns.filter((t) => t.who === 'me' && t.check?.status === 'done' && !t.check.unchanged);

  return (
    <KeyboardAvoider style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={sceneTitle(shown)} right={!ended && learnerTurns > 0 ? <Button label={t('scene.end')} kind="quiet" size="small" onPress={end} /> : null} />
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })} contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: space.xl, gap: space.m }}>
        <Animated.View layout={LinearTransition.duration(220)}>
          <Paper style={{ gap: space.m }}>
            <Press onPress={() => setBriefOpen((o) => !o)} scaleTo={0.995} accessibilityLabel={briefOpen ? t('scene.hideBrief') : t('scene.showBrief')}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
                <View style={{ width: 44, height: 44, borderRadius: radius.control, backgroundColor: genderTint(c, article), alignItems: 'center', justifyContent: 'center' }}>
                  <SceneIcon sceneKey={card.key} size={22} color={genderColor(c, article)} />
                </View>
                <View style={{ flex: 1 }}>
                  <De variant="germanStrong" style={{ fontSize: 17, lineHeight: 22 }}>
                    {card.situation_de}
                  </De>
                  <Txt variant="small" color="inkSoft">
                    {[card.place, card.level, card.register === 'Sie' ? t('scene.formalSie') : t('scene.informalDu')].filter(Boolean).join(', ')}
                  </Txt>
                </View>
                <ChevronDown size={18} color={c.inkSoft} style={{ transform: [{ rotate: briefOpen ? '180deg' : '0deg' }] }} />
              </View>
            </Press>
            {briefOpen ? (
              <Animated.View entering={FadeIn.duration(200)} style={{ gap: space.m }}>
                <Txt variant="body">
                  <WithGerman text={t('scene.youAre', { learner: shown.learner_en })} de={card.learner_de} /> <WithGerman text={t('scene.tutorPlays', { role: shown.role_en })} de={card.role_de} />
                </Txt>
                <View style={{ gap: 6 }}>
                  <Txt variant="caption" color="inkSoft">
                    {t('scene.factsIntro')}
                  </Txt>
                  {shown.facts.map((f) => {
                    const found = revealed.has(f.key);
                    return (
                      <View key={f.key} style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
                        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: found ? c.green : c.sheetAlt, alignItems: 'center', justifyContent: 'center' }}>
                          {found ? <Check size={12} color="#fff" strokeWidth={3} /> : null}
                        </View>
                        <Txt variant="small" style={{ flex: 1 }}>
                          {f.label_en}: <De variant="german" style={{ fontSize: 15, color: found ? c.ink : c.inkSoft }}>{f.value}</De>
                        </Txt>
                      </View>
                    );
                  })}
                </View>
                {own ? (
                  <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Sparkles size={14} color={c.amberInk} />
                      <Txt variant="caption" style={{ color: c.amberInk }}>
                        {t('scene.writtenByTutor')}
                      </Txt>
                    </View>
                    {[...own.notes, ...own.warnings.map((w) => t('scene.lexiconDisagrees', { warning: w }))].map((n) => (
                      <Txt key={n} variant="caption" color="inkSoft">
                        {n}
                      </Txt>
                    ))}
                    <Button
                      label={t('scene.deleteScene')}
                      icon={Trash2}
                      kind="quiet"
                      size="small"
                      onPress={() => {
                        removeScene(card.key);
                        router.back();
                      }}
                    />
                  </View>
                ) : null}
                {phrases.status === 'idle' ? (
                  <Button label={t('scene.usefulPhrases')} icon={MessageSquareQuote} kind="secondary" size="medium" onPress={() => void loadPhrases()} disabled={connection !== 'ready'} />
                ) : null}
                {phrases.status === 'loading' ? <Thinking label={t('scene.collectingPhrases')} /> : null}
                {phrases.status === 'error' ? (
                  <Txt variant="small" style={{ color: c.red }}>
                    {phrases.error}
                  </Txt>
                ) : null}
                {phrases.items.length ? (
                  <View style={{ gap: space.s }}>
                    {phrases.items.map((p) => (
                      <View key={p.german} style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
                        <View style={{ flex: 1 }}>
                          <De variant="german" speakable style={{ fontSize: 17, lineHeight: 23 }}>
                            {p.german}
                          </De>
                          {p.english ? (
                            <Txt variant="small" color="inkSoft">
                              {p.english}
                            </Txt>
                          ) : null}
                        </View>
                        <Press
                          onPress={() => {
                            addWord({ key: `phrase:${p.german}`, kind: 'phrase', german: p.german, meaning: p.english ?? '', sourceKey: 'scene.phraseSource', sourceVars: { title: sceneTitle(shown) } });
                            haptic.success();
                          }}
                          accessibilityLabel={t('scene.savePhraseA11y')}
                          hitSlop={8}>
                          <Plus size={18} color={c.royal} />
                        </Press>
                      </View>
                    ))}
                  </View>
                ) : null}
              </Animated.View>
            ) : (
              <Txt variant="caption" color="inkSoft">
                {t('scene.foundOut', { found: revealed.size, total: card.facts.length })}
              </Txt>
            )}
          </Paper>
        </Animated.View>

        {turns.map((turn) =>
          turn.who === 'them' ? (
            <Animated.View key={turn.id} entering={FadeInDown.duration(240)} style={{ flexDirection: 'row', gap: space.m, alignItems: 'flex-start', marginTop: space.s }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: genderTint(c, article), alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                <Txt style={{ fontFamily: font.deSemi, fontSize: 16, color: genderColor(c, article) }}>{role.charAt(0)}</Txt>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Txt variant="caption" color="inkSoft">
                  {role}
                </Txt>
                {turn.status === 'thinking' ? <Thinking label={t('scene.isAnswering', { name: role })} /> : null}
                {turn.status === 'error' ? (
                  <Txt variant="small" style={{ color: c.red }}>
                    {turn.error}
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
                {turn.status === 'done' && turn.gloss ? (
                  <Txt variant="small" color="inkSoft">
                    {turn.gloss}
                  </Txt>
                ) : null}
                {turn.glossError && glossing !== turn.id ? (
                  <Press onPress={() => void glossLine(turn)} accessibilityLabel={t('scene.translateA11y')} hitSlop={6} style={{ alignSelf: 'flex-start' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <RotateCcw size={13} color={c.red} />
                      <Txt variant="caption" style={{ color: c.red }}>
                        {t('scene.glossFailed')}
                      </Txt>
                    </View>
                  </Press>
                ) : null}
                {turn.status === 'done' && !turn.gloss && !turn.glossError && (!help || glossing === turn.id) ? (
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
            <Animated.View key={turn.id} entering={FadeInDown.duration(200)} style={{ alignItems: 'flex-end', gap: space.s, marginTop: space.s }}>
              <View style={{ maxWidth: '85%', backgroundColor: c.royalTint, borderRadius: radius.sheet, borderBottomRightRadius: 6, paddingHorizontal: space.l, paddingVertical: space.m }}>
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
            </Animated.View>
          ),
        )}

        {ended ? (
          <Animated.View entering={FadeInDown.duration(300)}>
            <Paper tone="amber" style={{ gap: space.m, marginTop: space.l }}>
              <De variant="germanLarge">Gut gemacht!</De>
              <Txt variant="body">
                {t('scene.summary', { found: revealed.size, total: card.facts.length, count: learnerTurns })}
                {correctAsYouGo ? ` ${corrections.length ? t('scene.summaryCorrected', { count: corrections.length }) : t('scene.summaryAllCorrect')}` : null}
              </Txt>
              {corrections.map((turn) => (
                <View key={turn.id} style={{ gap: 2 }}>
                  <De variant="german" style={{ fontSize: 16, lineHeight: 22, textDecorationLine: 'line-through', color: c.inkFaint }}>
                    {turn.german}
                  </De>
                  <De variant="germanStrong" style={{ fontSize: 16, lineHeight: 22 }}>
                    {turn.check?.corrected}
                  </De>
                </View>
              ))}
              <View style={{ flexDirection: 'row', gap: space.s }}>
                <Button label={t('scene.again')} icon={RotateCcw} kind="secondary" size="medium" grow onPress={restart} />
                <Button label={t('common.done')} size="medium" grow onPress={() => router.back()} />
              </View>
            </Paper>
          </Animated.View>
        ) : null}
      </ScrollView>

      {!ended ? (
        <View style={{ paddingBottom: insets.bottom }}>
          <Composer
            value={text}
            onChange={setText}
            onSend={() => void send(text)}
            busy={busy}
            german
            dictation={dictation}
            disabled={connection !== 'ready'}
            placeholder={connection === 'ready' ? t('scene.answerPlaceholder', { name: role }) : connection === 'absent' ? t('scene.tutorAbsent') : t('scene.tutorNotReady')}
            above={
              scripted.length || isReady() ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.s }}>
                  {scripted.length ? (
                    scripted.map((s) => <GermanChip key={s} text={s} onPress={() => setText(s)} />)
                  ) : (
                    <Pill label={suggesting ? t('scene.thinkingOfLine') : t('scene.helpMeAnswer')} icon={Lightbulb} tone="amber" onPress={() => void suggest()} />
                  )}
                </ScrollView>
              ) : null
            }
          />
        </View>
      ) : null}
    </KeyboardAvoider>
  );
}
