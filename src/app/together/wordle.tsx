import { router, useLocalSearchParams } from 'expo-router';
import { CornerDownLeft, Delete, Eye, Pencil, RotateCcw, Trophy } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, ScrollView, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FlipInEasyX, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlayerNames } from '@/features/PlayerNames';
import { playerName, useTogether } from '@/features/together';
import { makeRng } from '@/harness/drills';
import { LEVELS, type Level } from '@/harness/levels';
import { articleLabel, wordVerdict } from '@/harness/scrabble';
import {
  answerOf,
  answersFor,
  canGiveUp,
  giveUp,
  type GuessProblem,
  guessProblem,
  type Hint,
  hintFor,
  KEY_ROWS,
  HINT_AFTER,
  keyboardMarks,
  LAST_HINT_AFTER,
  type Mark,
  MAX_GUESSES,
  newMatch,
  nextRound,
  over as isOver,
  roundDone as isRoundDone,
  ROUNDS,
  submitGuess,
  turnOf,
  winner as winnerOf,
  WORD_LENGTH,
  type WordleState,
} from '@/harness/wordle';
import { useI18n } from '@/i18n';
import { wordMeaning } from '@/i18n/content';
import { coreLexicon, tutor } from '@/model/runtime';
import { useSettings } from '@/state/settings';
import { Button, IconButton, Paper, Press, SpeakButton } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { TopBar } from '@/ui/Screen';
import { De, Txt } from '@/ui/Text';
import { font, gutter, radius, space, useTheme, type Palette } from '@/ui/theme';

const PROBLEM_KEYS: Record<GuessProblem, string> = {
  tooShort: 'together.wordleTooShort',
  notAWord: 'together.wordleNotAWord',
  alreadyTried: 'together.wordleAlreadyTried',
};
const MARK_KEYS: Record<Mark, string> = { correct: 'together.wordleMarkCorrect', present: 'together.wordleMarkPresent', absent: 'together.wordleMarkAbsent' };
const MARK_BG: Record<Mark, keyof Palette> = { correct: 'green', present: 'amber', absent: 'rule' };
const MARK_INK: Record<Mark, keyof Palette> = { correct: 'onRoyal', present: 'onRoyal', absent: 'inkSoft' };
const HINT_KEYS: Record<Hint['kind'], string> = { article: 'together.wordleHintArticle', meaning: 'together.wordleHintMeaning', letter: 'together.wordleHintLetter' };
const GAP = 6;
/** Everything above and below the board (bars, header, hint line, keyboard), so the tiles can shrink to fit a short screen without scrolling. */
const CHROME_HEIGHT = 340;

/** A shape next to the colour, for players who cannot tell green from amber: a dot for the right place, a ring for a letter elsewhere. */
function MarkDot({ mark, color, size = 6 }: { mark?: Mark; color: string; size?: number }) {
  if (!mark || mark === 'absent') return null;
  const filled = mark === 'correct';
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', right: 3, bottom: 3, width: size, height: size, borderRadius: size / 2, backgroundColor: filled ? color : 'transparent', borderWidth: filled ? 0 : 1.5, borderColor: color }}
    />
  );
}

function Tile({ letter, mark, size, label }: { letter?: string; mark?: Mark; size: number; label?: string }) {
  const { c } = useTheme();
  return (
    <View
      accessibilityLabel={label}
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(4, size * 0.14),
        backgroundColor: mark ? c[MARK_BG[mark]] : c.sheet,
        borderWidth: mark ? 0 : letter ? 2 : 1,
        borderColor: letter ? c.inkFaint : c.rule,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {letter ? <Txt style={{ fontFamily: font.deSemi, fontSize: size * 0.5, lineHeight: size * 0.62, color: mark ? c[MARK_INK[mark]] : c.ink }}>{letter}</Txt> : null}
      {mark ? <MarkDot mark={mark} color={c[MARK_INK[mark]]} size={Math.max(5, Math.round(size * 0.12))} /> : null}
    </View>
  );
}

function Key({ label, width, height, mark, onPress, icon: Icon, accessibilityLabel }: { label?: string; width: number; height: number; mark?: Mark; onPress: () => void; icon?: typeof Delete; accessibilityLabel: string }) {
  const { c } = useTheme();
  return (
    <Press onPress={onPress} scaleTo={0.9} accessibilityLabel={accessibilityLabel}>
      <View style={{ width, height, borderRadius: radius.small, backgroundColor: mark ? c[MARK_BG[mark]] : c.sheet, borderWidth: mark ? 0 : 1, borderColor: c.rule, alignItems: 'center', justifyContent: 'center' }}>
        {Icon ? <Icon size={20} color={c.ink} /> : <Txt style={{ fontFamily: font.deSemi, fontSize: 16, lineHeight: 20, color: mark ? c[MARK_INK[mark]] : c.ink }}>{label}</Txt>}
        {mark ? <MarkDot mark={mark} color={c[MARK_INK[mark]]} size={5} /> : null}
      </View>
    </Press>
  );
}

export default function WordleScreen() {
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const params = useLocalSearchParams<{ level?: Level }>();
  const learnerLevel = useSettings((s) => s.level);
  const level: Level = params.level && LEVELS.includes(params.level) ? params.level : learnerLevel;
  const names = useTogether((s) => s.names);
  // the match lives in the store, so a pair can leave mid-word and pick it up from the hub
  const game = useTogether((s) => s.wordle);
  const setGame = useTogether((s) => s.setWordle);
  const finished = useTogether((s) => s.finished);
  const name = (p: 0 | 1) => playerName(names, p, (n) => t('together.playerN', { n }));
  const lex = tutor.lexicon ?? coreLexicon;

  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<GuessProblem | null>(null);
  const [naming, setNaming] = useState(false);
  // the last word is revealed like the others before the result screen takes over; a match found already over opens on its result
  const [finale, setFinale] = useState(() => Boolean(game && isOver(game)));

  const byWidth = Math.floor((width - 2 * gutter - 32 - (WORD_LENGTH - 1) * GAP) / WORD_LENGTH);
  const byHeight = Math.floor((height - insets.top - insets.bottom - CHROME_HEIGHT - (MAX_GUESSES - 1) * GAP) / MAX_GUESSES);
  const tile = Math.max(34, Math.min(56, byWidth, byHeight));
  const key = Math.floor((width - 2 * space.m - 10 * space.xs) / 11);
  const keyHeight = 46;

  // what a solved or missed word is: "der Apfel · apple"
  const describe = (answer: string) => {
    const v = wordVerdict(answer, lex);
    const lemma = v.kind === 'noun' ? v.lemma : answer[0] + answer.slice(1).toLowerCase();
    const article = articleLabel(v);
    return { word: article ? `${article} ${lemma}` : lemma, meaning: v.kind === 'noun' && v.meaning ? wordMeaning(lemma, v.meaning, lang) : null };
  };
  const foundLine = (winner: 0 | 1 | null, guesses: number) => (winner === null ? t('together.wordleNobody') : t('together.wordleFound', { name: name(winner), count: guesses }));

  const start = () => {
    haptic.tap();
    setGame(newMatch(makeRng(Date.now()), ROUNDS, answersFor(level)));
    setTyped('');
    setProblem(null);
    setFinale(false);
  };
  const confirmRestart = () =>
    Alert.alert(t('together.restartTitle'), t('together.restartMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('together.again'), style: 'destructive', onPress: start },
    ]);
  const close = () => router.back();

  if (!game) {
    return (
      <View style={{ flex: 1, backgroundColor: c.paper }}>
        <TopBar title={t('together.wordleTitle')} />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.xl }}>
          <Txt variant="body" color="inkSoft">
            {t('together.wordleIntro', { a: name(0), b: name(1) })}
          </Txt>
          <PlayerNames />
          <Paper tone="alt" style={{ gap: space.s }}>
            <Txt variant="smallStrong">{t('together.howItGoes')}</Txt>
            <Txt variant="small" color="inkSoft">
              {t('together.wordleRules', { n: ROUNDS, tries: MAX_GUESSES })}
            </Txt>
            <Txt variant="small" color="inkSoft">
              {t('together.wordleRulesHints', { hint: HINT_AFTER, last: LAST_HINT_AFTER })}
            </Txt>
          </Paper>
          <Txt variant="caption" color="inkFaint" center>
            {t('together.wordleLevelNote', { level })}
          </Txt>
          <Button label={t('together.start')} onPress={start} />
        </ScrollView>
      </View>
    );
  }

  const over = isOver(game);
  if (over && finale) {
    const winner = winnerOf(game);
    return (
      <View style={{ flex: 1, backgroundColor: c.paper, paddingTop: insets.top + space.l }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.xl }}>
          <Animated.View entering={ZoomIn.duration(400)} style={{ alignItems: 'center', marginTop: space.x3, gap: space.m }}>
            <Trophy size={48} color={c.amberInk} />
            <De variant="display">{winner === null ? t('together.draw') : t('together.wins', { name: name(winner) })}</De>
            <Txt variant="body" color="inkSoft" center>
              {t('together.finalScore', { a: name(0), sa: game.scores[0], b: name(1), sb: game.scores[1] })}
            </Txt>
          </Animated.View>
          <View style={{ gap: space.s }}>
            <Txt variant="smallStrong" color="inkSoft">
              {t('together.wordleWordsTitle')}
            </Txt>
            <Paper style={{ padding: 0 }}>
              {game.results.map((r, i) => {
                const d = describe(r.answer);
                return (
                  <View key={i} style={{ padding: space.m, borderTopWidth: i ? 1 : 0, borderTopColor: c.rule, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s }}>
                      <De variant="germanStrong" style={{ fontSize: 17, lineHeight: 23 }}>
                        {d.word}
                      </De>
                      {d.meaning ? (
                        <Txt variant="small" color="inkSoft" style={{ flex: 1 }} numberOfLines={1}>
                          {d.meaning}
                        </Txt>
                      ) : null}
                    </View>
                    <Txt variant="caption" color={r.winner === null ? 'inkFaint' : r.winner === 0 ? 'royal' : 'amberInk'}>
                      {foundLine(r.winner, r.guesses)}
                    </Txt>
                  </View>
                );
              })}
            </Paper>
          </View>
          <View style={{ gap: space.s }}>
            <Button label={t('together.again')} icon={RotateCcw} onPress={start} />
            <Button
              label={t('common.done')}
              kind="secondary"
              onPress={() => {
                setGame(null);
                close();
              }}
            />
          </View>
        </ScrollView>
      </View>
    );
  }

  const roundDone = isRoundDone(game);
  const turn = turnOf(game);
  const marks = keyboardMarks(game.guesses);
  const result = roundDone ? game.results[game.round] : null;
  const letters = [...typed];
  const hint = hintFor(game, lex);
  const hintText = hint && t(HINT_KEYS[hint.kind], hint.kind === 'meaning' ? { meaning: wordMeaning(hint.lemma, hint.meaning, lang) } : hint);

  // a round closing by a hit, a sixth miss or a surrender
  const apply = (next: WordleState) => {
    setGame(next);
    setTyped('');
    setProblem(null);
    if (isRoundDone(next)) {
      if (next.results[next.round].winner === null) haptic.soft();
      else haptic.success();
      if (isOver(next)) finished('wordle');
    }
  };
  const confirmGiveUp = () =>
    Alert.alert(t('together.wordleGiveUpTitle'), t('together.wordleGiveUpMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('together.wordleGiveUp'), style: 'destructive', onPress: () => apply(giveUp(game)) },
    ]);

  const press = (letter: string) => {
    if (roundDone || letters.length >= WORD_LENGTH) return;
    haptic.tap();
    setTyped((s) => ([...s].length < WORD_LENGTH ? s + letter : s));
    setProblem(null);
  };
  const backspace = () => {
    if (roundDone || !letters.length) return;
    haptic.tap();
    setTyped((s) => [...s].slice(0, -1).join(''));
    setProblem(null);
  };
  const enter = () => {
    if (roundDone) return;
    const why = guessProblem(game, typed, lex);
    if (why) {
      haptic.error();
      setProblem(why);
      return;
    }
    apply(submitGuess(game, typed));
  };
  const advance = () => {
    haptic.tap();
    if (over) setFinale(true);
    else setGame(nextRound(game));
  };

  const rows = Array.from({ length: MAX_GUESSES }, (_, i) => i);
  const revealed = result ? describe(answerOf(game)) : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar
        title={t('together.wordleTitle')}
        close
        onBack={close}
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
            <IconButton icon={Pencil} label={t('together.editNames')} onPress={() => setNaming((n) => !n)} tone={naming ? 'filled' : 'sheet'} size={38} />
            <IconButton icon={RotateCcw} label={t('together.again')} onPress={confirmRestart} tone="sheet" size={38} />
          </View>
        }
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: space.m, gap: space.m }}>
        {naming ? (
          <Animated.View entering={FadeIn.duration(200)} style={{ paddingHorizontal: gutter, paddingBottom: space.s }}>
            <PlayerNames autoFocus />
          </Animated.View>
        ) : null}
        <View style={{ paddingHorizontal: gutter, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
              {roundDone ? null : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: turn === 0 ? c.royal : c.amber }} />}
              <Txt variant="smallStrong">{roundDone ? t('together.wordleWordOf', { n: game.round + 1, total: game.answers.length }) : t('together.turnOf', { name: name(turn) })}</Txt>
            </View>
            <Txt variant="smallStrong" color="inkSoft" style={{ fontVariant: ['tabular-nums'] }}>
              {name(0)} {game.scores[0]} · {game.scores[1]} {name(1)}
            </Txt>
          </View>
          {roundDone ? null : (
            <Txt variant="caption" color="inkFaint">
              {t('together.wordleWordOf', { n: game.round + 1, total: game.answers.length })}
            </Txt>
          )}
        </View>

        <View style={{ alignSelf: 'center', gap: GAP }} accessibilityRole="none">
          {rows.map((i) => {
            const guess = game.guesses[i];
            const typing = !roundDone && i === game.guesses.length;
            const owner = guess ? guess.player : typing ? turn : null;
            return (
              <View key={guess ? `g${game.round}-${i}` : `e${i}`} style={{ flexDirection: 'row', gap: GAP }}>
                {owner !== null ? <View style={{ position: 'absolute', left: -space.l, top: tile / 2 - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: owner === 0 ? c.royal : c.amber }} /> : null}
                {Array.from({ length: WORD_LENGTH }, (_, j) =>
                  guess ? (
                    <Animated.View key={j} entering={FlipInEasyX.delay(j * 110).duration(320)}>
                      <Tile letter={guess.word[j]} mark={guess.marks[j]} size={tile} label={`${guess.word[j]} · ${t(MARK_KEYS[guess.marks[j]])}`} />
                    </Animated.View>
                  ) : (
                    <Tile key={j} letter={typing ? letters[j] : undefined} size={tile} label={typing ? letters[j] : undefined} />
                  ),
                )}
              </View>
            );
          })}
        </View>

        {result && revealed ? (
          <Animated.View entering={FadeInDown.duration(240)} style={{ paddingHorizontal: gutter }}>
            <Paper tone={result.winner === null ? 'alt' : 'green'} style={{ gap: space.m }}>
              <Txt variant="bodyStrong">{foundLine(result.winner, result.guesses)}</Txt>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="caption" color="inkSoft">
                    {t('together.wordleAnswerWas')}
                  </Txt>
                  <De variant="germanLarge">{revealed.word}</De>
                  {revealed.meaning ? (
                    <Txt variant="small" color="inkSoft">
                      {revealed.meaning}
                    </Txt>
                  ) : null}
                </View>
                <SpeakButton text={revealed.word} />
              </View>
              <Button label={over ? t('together.wordleResult') : t('together.wordleNext')} size="medium" onPress={advance} />
            </Paper>
          </Animated.View>
        ) : (
          <View style={{ alignItems: 'center', gap: space.xs }}>
            <Txt variant="small" style={{ color: problem ? c.red : hintText ? c.amberInk : c.inkSoft }} center>
              {problem ? t(PROBLEM_KEYS[problem]) : (hintText ?? t('together.wordleHint'))}
            </Txt>
            {canGiveUp(game) ? <Button label={t('together.wordleGiveUp')} kind="quiet" size="small" icon={Eye} onPress={confirmGiveUp} /> : null}
          </View>
        )}
      </ScrollView>

      {roundDone ? null : (
        <View style={{ paddingHorizontal: space.m, paddingBottom: insets.bottom + space.m, gap: space.xs, alignItems: 'center' }}>
          {KEY_ROWS.map((row, r) => (
            <View key={r} style={{ flexDirection: 'row', gap: space.xs }}>
              {r === 2 ? <Key icon={Delete} width={Math.floor(key * 1.5)} height={keyHeight} onPress={backspace} accessibilityLabel={t('together.wordleBackspace')} /> : null}
              {[...row].map((letter) => (
                <Key key={letter} label={letter} width={key} height={keyHeight} mark={marks[letter]} onPress={() => press(letter)} accessibilityLabel={letter} />
              ))}
              {r === 2 ? <Key icon={CornerDownLeft} width={Math.floor(key * 1.5)} height={keyHeight} onPress={enter} accessibilityLabel={t('together.wordleEnter')} /> : null}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
