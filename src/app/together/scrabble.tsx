import { router } from 'expo-router';
import { ArrowLeftRight, Check, Pencil, RotateCcw, Shuffle, SkipForward, Trophy, Undo2, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, ScrollView, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlayerNames } from '@/features/PlayerNames';
import { playerName, useTogether } from '@/features/together';
import { makeRng } from '@/harness/drills';
import {
  BINGO_BONUS,
  BONUS,
  canSwap,
  CENTRE,
  commitMove,
  judgeMove,
  lastMove,
  type Judged,
  type Move,
  type MoveProblem,
  newGame,
  passTurn,
  type Placement,
  type PlayedWord,
  type ScrabbleState,
  shuffleRack,
  SIZE,
  swapTiles,
  VALUES,
  type Verdict,
  winner as winnerOf,
  wordVerdict,
} from '@/harness/scrabble';
import { useI18n } from '@/i18n';
import { wordMeaning } from '@/i18n/content';
import { coreLexicon, tutor } from '@/model/runtime';
import { Button, IconButton, Paper, Press } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { TopBar } from '@/ui/Screen';
import { De, Txt } from '@/ui/Text';
import { font, gutter, radius, space, useTheme, type Palette } from '@/ui/theme';

const PROBLEM_KEYS: Record<MoveProblem, string> = {
  empty: 'together.scrabbleHint',
  notInLine: 'together.scrabbleNotInLine',
  gap: 'together.scrabbleGap',
  centre: 'together.scrabbleCentre',
  tooShort: 'together.scrabbleTooShort',
  notConnected: 'together.scrabbleNotConnected',
};
const BONUS_LABEL = { TW: '3W', DW: '2W', TL: '3L', DL: '2L' } as const;
const BONUS_TINT: Record<keyof typeof BONUS_LABEL, keyof Palette> = { TW: 'redTint', DW: 'amberTint', TL: 'royalTint', DL: 'dasTint' };
const BONUS_INK: Record<keyof typeof BONUS_LABEL, keyof Palette> = { TW: 'red', DW: 'amberInk', TL: 'royal', DL: 'das' };

type Pick = { kind: 'tile'; index: number } | { kind: 'cell'; cell: number } | null;
interface Ask {
  placements: Placement[];
  judged: Judged & { ok: true };
  verdicts: Verdict[];
}

/** Removes each pending letter once, so the rack shows what is still in hand. */
function inHand(rack: string[], pending: Placement[]): string[] {
  const left = [...rack];
  for (const p of pending) {
    const i = left.indexOf(p.letter);
    if (i >= 0) left.splice(i, 1);
  }
  return left;
}

function Tile({ letter, size, pending, selected, onPress, label }: { letter: string; size: number; pending?: boolean; selected?: boolean; onPress?: () => void; label: string }) {
  const { c } = useTheme();
  const body = (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(4, size * 0.16),
        backgroundColor: pending ? c.royalTint : c.amberTint,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? c.royal : pending ? c.royal : c.amber,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Txt style={{ fontFamily: font.deSemi, fontSize: size * 0.52, lineHeight: size * 0.62, color: c.ink }}>{letter}</Txt>
      <Txt style={{ position: 'absolute', right: 2, bottom: 0, fontFamily: font.sansMedium, fontSize: Math.max(7, size * 0.22), lineHeight: Math.max(9, size * 0.3), color: c.inkSoft }}>{VALUES[letter]}</Txt>
    </View>
  );
  if (!onPress) return body;
  return (
    <Press onPress={onPress} scaleTo={0.92} accessibilityLabel={label} accessibilityState={{ selected: Boolean(selected) }}>
      {body}
    </Press>
  );
}

export default function ScrabbleScreen() {
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const names = useTogether((s) => s.names);
  const game = useTogether((s) => s.scrabble);
  const setGame = useTogether((s) => s.setScrabble);
  const finished = useTogether((s) => s.finished);
  const name = (p: 0 | 1) => playerName(names, p, (n) => t('together.playerN', { n }));
  const lex = tutor.lexicon ?? coreLexicon;

  const [pending, setPending] = useState<Placement[]>([]);
  const [pick, setPick] = useState<Pick>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [swapping, setSwapping] = useState<number[] | null>(null);
  const [naming, setNaming] = useState(false);
  // a game found in progress opens behind the curtain so the other player's tiles stay private
  const [curtain, setCurtain] = useState(() => Boolean(game && !game.over && game.moves.length));

  const cell = Math.floor((width - 2 * space.m) / SIZE);
  const rackTile = Math.min(48, Math.floor((width - 2 * gutter - 6 * space.s) / 7));

  const turn = game?.turn ?? 0;
  const other: 0 | 1 = turn === 0 ? 1 : 0;
  const hand = useMemo(() => (game ? inHand(game.racks[turn], pending) : []), [game, turn, pending]);

  // what a laid word is, for the player who laid it: "die Straße · street", "plural of Haus", "accepted by Ben"
  const describe = (w: PlayedWord, player: 0 | 1) => {
    const v = w.verdict;
    if (v.kind === 'noun') return `${v.articles.join('/')} ${v.lemma}${v.meaning ? ` · ${wordMeaning(v.lemma, v.meaning, lang)}` : ''}`;
    if (v.kind === 'plural') return v.lemma ? t('together.scrabblePluralOf', { lemma: v.lemma }) : t('together.scrabblePlural');
    if (v.kind === 'accepted') return t('together.scrabbleAcceptedBy', { name: name(player === 0 ? 1 : 0) });
    if (v.kind === 'word' && v.lemma && v.meaning) return `${v.lemma} · ${wordMeaning(v.lemma, v.meaning, lang)}`;
    return '';
  };
  const moveLine = (m: Move) => {
    if (m.kind === 'pass') return t('together.scrabblePassed', { name: name(m.player) });
    if (m.kind === 'swap') return t('together.scrabbleSwapped', { name: name(m.player), count: m.count ?? 0 });
    return t('together.scrabbleLaid', { name: name(m.player), words: m.words.map((w) => w.word).join(', '), points: t('together.scrabblePoints', { count: m.score }) });
  };

  const reset = () => {
    setPending([]);
    setPick(null);
    setProblem(null);
    setAsk(null);
    setSwapping(null);
  };
  const start = () => {
    haptic.tap();
    setGame(newGame(makeRng(Date.now())));
    reset();
    setCurtain(false);
  };
  const apply = (next: ScrabbleState) => {
    setGame(next);
    reset();
    if (next.over) finished('scrabble');
    else setCurtain(true);
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
        <TopBar title={t('together.scrabbleTitle')} />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.xl }}>
          <Txt variant="body" color="inkSoft">
            {t('together.scrabbleIntro', { a: name(0), b: name(1) })}
          </Txt>
          <PlayerNames />
          <Paper tone="alt" style={{ gap: space.s }}>
            <Txt variant="smallStrong">{t('together.howItGoes')}</Txt>
            <Txt variant="small" color="inkSoft">
              {t('together.scrabbleRules', { bonus: BINGO_BONUS })}
            </Txt>
          </Paper>
          <Button label={t('together.start')} onPress={start} />
        </ScrollView>
      </View>
    );
  }

  if (game.over) {
    const winner = winnerOf(game);
    const plays = game.moves.filter((m) => m.kind === 'play');
    return (
      <View style={{ flex: 1, backgroundColor: c.paper, paddingTop: insets.top + space.l }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.xl }}>
          <Animated.View entering={ZoomIn.duration(400)} style={{ alignItems: 'center', marginTop: space.x3, gap: space.m }}>
            <Trophy size={48} color={c.amberInk} />
            <De variant="display">{winner === null ? t('together.draw') : t('together.wins', { name: name(winner) })}</De>
            <Txt variant="body" color="inkSoft" center>
              {t('together.finalScore', { a: name(0), sa: game.scores[0], b: name(1), sb: game.scores[1] })}
            </Txt>
            <Txt variant="small" color="inkFaint" center>
              {game.endedBy === 'out' ? t('together.scrabbleDoneOut', { name: name(lastMove(game)?.player ?? 0) }) : t('together.scrabbleDonePasses')}
            </Txt>
          </Animated.View>
          {plays.length ? (
            <View style={{ gap: space.s }}>
              <Txt variant="smallStrong" color="inkSoft">
                {t('together.scrabbleWordsPlayed')}
              </Txt>
              <Paper style={{ padding: 0 }}>
                {plays.map((m, i) => (
                  <View key={i} style={{ padding: space.m, borderTopWidth: i ? 1 : 0, borderTopColor: c.rule, gap: 2 }}>
                    {m.words.map((w, j) => (
                      <View key={j} style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s }}>
                        <De variant="germanStrong" style={{ fontSize: 17, lineHeight: 23 }}>
                          {w.word}
                        </De>
                        <Txt variant="small" color="inkSoft" style={{ flex: 1 }} numberOfLines={1}>
                          {describe(w, m.player)}
                        </Txt>
                        <Txt variant="smallStrong" style={{ fontVariant: ['tabular-nums'] }}>
                          {w.score}
                        </Txt>
                      </View>
                    ))}
                    <Txt variant="caption" color={m.player === 0 ? 'royal' : 'amberInk'}>
                      {name(m.player)}
                      {m.bingo ? ` · ${t('together.scrabbleBingo', { bonus: BINGO_BONUS })}` : ''}
                    </Txt>
                  </View>
                ))}
              </Paper>
            </View>
          ) : null}
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

  const last = lastMove(game);
  if (curtain) {
    return (
      <View style={{ flex: 1, backgroundColor: c.paper }}>
        <TopBar title={t('together.scrabbleTitle')} close onBack={close} />
        <View style={{ flex: 1, paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, justifyContent: 'center', gap: space.xl }}>
          <Animated.View entering={FadeInDown.duration(260)} style={{ alignItems: 'center', gap: space.m }}>
            <De variant="display" style={{ textAlign: 'center' }}>
              {t('together.scrabbleHandOver', { name: name(turn) })}
            </De>
            <Txt variant="body" color="inkSoft" center style={{ fontVariant: ['tabular-nums'] }}>
              {name(0)} {game.scores[0]} · {game.scores[1]} {name(1)}
            </Txt>
          </Animated.View>
          {last ? (
            <Paper tone={last.player === 0 ? 'royal' : 'amber'} style={{ gap: space.s }}>
              <Txt variant="bodyStrong">{moveLine(last)}</Txt>
              {last.words.map((w, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s }}>
                  <De variant="germanStrong" style={{ fontSize: 17, lineHeight: 23 }}>
                    {w.word}
                  </De>
                  <Txt variant="small" color="inkSoft" style={{ flex: 1 }}>
                    {describe(w, last.player)}
                  </Txt>
                  <Txt variant="smallStrong" style={{ fontVariant: ['tabular-nums'] }}>
                    {w.score}
                  </Txt>
                </View>
              ))}
              {last.bingo ? (
                <Txt variant="small" style={{ color: c.amberInk }}>
                  {t('together.scrabbleBingo', { bonus: BINGO_BONUS })}
                </Txt>
              ) : null}
            </Paper>
          ) : null}
          <Button label={t('together.scrabbleShowTiles')} onPress={() => setCurtain(false)} />
        </View>
      </View>
    );
  }

  const board = game.board;
  const pendingAt = new Map(pending.map((p) => [p.cell, p.letter]));

  const place = (index: number, at: number) => {
    const letter = hand[index];
    if (!letter || board[at] || pendingAt.has(at)) return;
    haptic.soft();
    setPending((ps) => [...ps, { cell: at, letter }]);
    setPick(null);
    setProblem(null);
  };
  const tapCell = (at: number) => {
    if (swapping) return;
    if (pendingAt.has(at)) {
      haptic.tap();
      setPending((ps) => ps.filter((p) => p.cell !== at));
      setPick(null);
      setProblem(null);
      return;
    }
    if (board[at]) return;
    if (pick?.kind === 'tile') place(pick.index, at);
    else {
      haptic.tap();
      setPick(pick?.kind === 'cell' && pick.cell === at ? null : { kind: 'cell', cell: at });
    }
  };
  const tapTile = (index: number) => {
    haptic.tap();
    if (swapping) {
      setSwapping((s) => (s ? (s.includes(index) ? s.filter((i) => i !== index) : [...s, index]) : s));
      return;
    }
    if (pick?.kind === 'cell') place(index, pick.cell);
    else setPick(pick?.kind === 'tile' && pick.index === index ? null : { kind: 'tile', index });
  };
  const recall = () => {
    haptic.tap();
    setPending([]);
    setPick(null);
    setProblem(null);
    setAsk(null);
  };
  const commit = (a: Ask) => {
    haptic.success();
    apply(commitMove(game, a.placements, a.judged, a.verdicts));
  };
  const play = () => {
    const judged = judgeMove(board, pending);
    if (!judged.ok) {
      haptic.error();
      setProblem(t(PROBLEM_KEYS[judged.reason]));
      return;
    }
    const verdicts = judged.words.map((w) => wordVerdict(w.word, lex));
    const next: Ask = { placements: pending, judged, verdicts };
    if (verdicts.some((v) => v.kind === 'unknown')) {
      haptic.soft();
      setProblem(null);
      setAsk(next);
      return;
    }
    commit(next);
  };
  const accept = () => {
    if (!ask) return;
    commit({ ...ask, verdicts: ask.verdicts.map((v) => (v.kind === 'unknown' ? { kind: 'accepted' } : v)) });
  };
  const reject = () => {
    haptic.error();
    setAsk(null);
    setProblem(t('together.scrabbleRejected', { name: name(other) }));
  };
  const confirmPass = () =>
    Alert.alert(t('together.scrabblePassTitle'), t('together.scrabblePassMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('together.scrabblePass'), onPress: () => apply(passTurn(game)) },
    ]);
  const beginSwap = () => {
    if (!canSwap(game)) {
      haptic.error();
      setProblem(t('together.scrabbleSwapUnavailable'));
      return;
    }
    recall();
    setSwapping([]);
  };
  const doSwap = () => {
    if (!swapping?.length) return;
    apply(swapTiles(game, swapping.map((i) => hand[i]), makeRng(Date.now())));
  };
  const shuffle = () => {
    haptic.tap();
    setPick(null);
    setSwapping((s) => (s ? [] : s));
    setGame(shuffleRack(game, turn, makeRng(Date.now())));
  };

  const unknownWords = ask ? ask.judged.words.filter((_, i) => ask.verdicts[i].kind === 'unknown').map((w) => w.word) : [];
  const hint = swapping ? t('together.scrabbleSwapHint') : problem ?? (pick?.kind === 'tile' ? t('together.scrabbleHintSquare') : t('together.scrabbleHint'));

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar
        title={t('together.scrabbleTitle')}
        close
        onBack={close}
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
            <IconButton icon={Pencil} label={t('together.editNames')} onPress={() => setNaming((n) => !n)} tone={naming ? 'filled' : 'sheet'} size={38} />
            <IconButton icon={RotateCcw} label={t('together.again')} onPress={confirmRestart} tone="sheet" size={38} />
          </View>
        }
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + space.xl, gap: space.m }}>
        {naming ? (
          <Animated.View entering={FadeIn.duration(200)} style={{ paddingHorizontal: gutter, paddingBottom: space.s }}>
            <PlayerNames autoFocus />
          </Animated.View>
        ) : null}
        <View style={{ paddingHorizontal: gutter, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: turn === 0 ? c.royal : c.amber }} />
            <Txt variant="smallStrong">{t('together.turnOf', { name: name(turn) })}</Txt>
          </View>
          <Txt variant="smallStrong" color="inkSoft" style={{ fontVariant: ['tabular-nums'] }}>
            {name(0)} {game.scores[0]} · {game.scores[1]} {name(1)}
          </Txt>
        </View>

        <View style={{ alignSelf: 'center', width: cell * SIZE, height: cell * SIZE, flexDirection: 'row', flexWrap: 'wrap', borderRadius: radius.small, overflow: 'hidden', backgroundColor: c.rule }} accessibilityRole="none">
          {board.map((fixed, at) => {
            const letter = fixed ?? pendingAt.get(at) ?? null;
            const bonus = BONUS[at];
            const target = pick?.kind === 'cell' && pick.cell === at;
            return (
              <Press
                key={at}
                onPress={() => tapCell(at)}
                scaleTo={1}
                feedback={false}
                disabled={Boolean(fixed)}
                dimWhenDisabled={false}
                accessibilityLabel={letter ?? `${Math.floor(at / SIZE) + 1}/${(at % SIZE) + 1}`}
                style={{ width: cell, height: cell, padding: 1 }}
              >
                {letter ? (
                  <Tile letter={letter} size={cell - 2} pending={!fixed} label={letter} />
                ) : (
                  <View
                    style={{
                      flex: 1,
                      borderRadius: 3,
                      backgroundColor: bonus ? c[BONUS_TINT[bonus]] : c.sheet,
                      borderWidth: target ? 2 : 0,
                      borderColor: c.royal,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {at === CENTRE ? (
                      <Txt style={{ fontFamily: font.sansMedium, fontSize: cell * 0.5, lineHeight: cell * 0.6, color: c.amberInk }}>★</Txt>
                    ) : bonus ? (
                      <Txt style={{ fontFamily: font.sansMedium, fontSize: Math.max(8, cell * 0.28), lineHeight: Math.max(10, cell * 0.36), color: c[BONUS_INK[bonus]] }}>{BONUS_LABEL[bonus]}</Txt>
                    ) : null}
                  </View>
                )}
              </Press>
            );
          })}
        </View>
        <Txt variant="caption" color="inkFaint" center>
          {t('together.scrabbleBag', { count: game.bag.length })} · {t('together.scrabbleLegend')}
        </Txt>

        <View style={{ paddingHorizontal: gutter, gap: space.m }}>
          {ask ? (
            <Animated.View entering={FadeInDown.duration(240)}>
              <Paper tone="amber" style={{ gap: space.m }}>
                <Txt variant="bodyStrong">{t('together.scrabbleUnknownAsk', { name: name(other), count: unknownWords.length })}</Txt>
                <De variant="germanLarge">{unknownWords.join(', ')}</De>
                <View style={{ flexDirection: 'row', gap: space.s }}>
                  <Button label={t('together.scrabbleAccept')} icon={Check} size="medium" grow onPress={accept} />
                  <Button label={t('together.scrabbleReject')} icon={X} kind="secondary" size="medium" grow onPress={reject} />
                </View>
              </Paper>
            </Animated.View>
          ) : (
            <Txt variant="small" style={{ color: problem && !swapping ? c.red : c.inkSoft }} center>
              {hint}
            </Txt>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.s, minHeight: rackTile }}>
            {hand.map((letter, i) => (
              <Tile
                key={`${i}-${letter}`}
                letter={letter}
                size={rackTile}
                selected={swapping ? swapping.includes(i) : pick?.kind === 'tile' && pick.index === i}
                onPress={() => tapTile(i)}
                label={letter}
              />
            ))}
          </View>

          {swapping ? (
            <View style={{ flexDirection: 'row', gap: space.s }}>
              <Button label={t('together.scrabbleSwapConfirm', { count: swapping.length })} icon={ArrowLeftRight} size="medium" grow disabled={!swapping.length} onPress={doSwap} />
              <Button label={t('common.cancel')} kind="secondary" size="medium" onPress={() => setSwapping(null)} />
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
              <IconButton icon={Undo2} label={t('together.scrabbleRecall')} onPress={recall} tone="sheet" size={44} disabled={!pending.length} />
              <IconButton icon={Shuffle} label={t('together.scrabbleShuffle')} onPress={shuffle} tone="sheet" size={44} />
              <Button label={t('together.scrabblePlay')} size="medium" grow disabled={!pending.length || Boolean(ask)} onPress={play} />
              <IconButton icon={ArrowLeftRight} label={t('together.scrabbleSwap')} onPress={beginSwap} tone="sheet" size={44} disabled={!canSwap(game)} />
              <IconButton icon={SkipForward} label={t('together.scrabblePass')} onPress={confirmPass} tone="sheet" size={44} />
            </View>
          )}
          <Txt variant="caption" color="inkFaint">
            {t('together.scrabbleControls')}
          </Txt>
        </View>
      </ScrollView>
    </View>
  );
}
