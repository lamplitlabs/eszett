// A conjugation or declension table lifted out of a rule's text (src/harness/paradigm.ts), and the same table as
// an exercise: about half of the forms blanked, to type in; a typed form is checked by code (`sameForm`), the
// missed ones are shown, and the table can be dealt again with another pattern of blanks.

import { Check, RotateCcw, X } from 'lucide-react-native';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { blankCells, sameForm, type Paradigm } from '@/harness/paradigm';
import { useI18n } from '@/i18n';
import { useProgress } from '@/state/progress';
import { Button } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { De, Txt } from '@/ui/Text';
import { font, radius, space, useTheme } from '@/ui/theme';

/** The table as it reads: pronouns down the first column, a column per form, labels on top when the rule gave them. */
export function ParadigmTable({ paradigm }: { paradigm: Paradigm }) {
  const { c } = useTheme();
  const hasLabels = paradigm.labels.some(Boolean);
  return (
    <View style={{ borderRadius: radius.control, borderWidth: 1, borderColor: c.rule, overflow: 'hidden', backgroundColor: c.sheet }}>
      {hasLabels ? (
        <View style={{ flexDirection: 'row', backgroundColor: c.amberTint, borderBottomWidth: 1, borderBottomColor: c.rule }}>
          {paradigm.labels.map((label, j) => (
            <View key={j} style={{ flex: j === 0 ? 0.8 : 1, paddingHorizontal: space.m, paddingVertical: 6 }}>
              <Txt variant="caption" style={{ color: c.amberInk }}>
                {label ?? ''}
              </Txt>
            </View>
          ))}
        </View>
      ) : null}
      {paradigm.rows.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', backgroundColor: i % 2 ? c.sheetAlt : c.sheet }}>
          {row.map((cell, j) => (
            <View key={j} style={{ flex: j === 0 ? 0.8 : 1, paddingHorizontal: space.m, paddingVertical: 7, justifyContent: 'center' }}>
              {j === 0 ? (
                <Txt variant="smallStrong" color="inkSoft">
                  {cell}
                </Txt>
              ) : (
                <De variant="german" style={{ fontSize: 17, lineHeight: 23 }}>
                  {cell}
                </De>
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** The table with blanks to fill; `area` is the progress area the answers count in. */
export function ParadigmDrill({ paradigm, seed = 0 }: { paradigm: Paradigm; seed?: number }) {
  const { c } = useTheme();
  const { t } = useI18n();
  const record = useProgress((s) => s.record);
  const [round, setRound] = useState(seed);
  const [blanks, setBlanks] = useState(() => blankCells(paradigm, seed));
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);

  const key = (i: number, j: number) => `${i}:${j}`;
  const cells = paradigm.rows.flatMap((row, i) => row.map((_, j) => ({ i, j }))).filter(({ i, j }) => blanks[i][j]);
  const filled = cells.filter(({ i, j }) => (typed[key(i, j)] ?? '').trim()).length;
  const right = cells.filter(({ i, j }) => sameForm(typed[key(i, j)] ?? '', paradigm.rows[i][j])).length;

  const check = () => {
    setChecked(true);
    if (right === cells.length) haptic.success();
    else haptic.error();
    record('grammar', right === cells.length);
  };
  const again = () => {
    const next = round + 1;
    setRound(next);
    setBlanks(blankCells(paradigm, next));
    setTyped({});
    setChecked(false);
  };

  const hasLabels = paradigm.labels.some(Boolean);
  return (
    <View style={{ gap: space.m }}>
      <View style={{ borderRadius: radius.control, borderWidth: 1, borderColor: c.rule, overflow: 'hidden', backgroundColor: c.sheet }}>
        {hasLabels ? (
          <View style={{ flexDirection: 'row', backgroundColor: c.amberTint, borderBottomWidth: 1, borderBottomColor: c.rule }}>
            {paradigm.labels.map((label, j) => (
              <View key={j} style={{ flex: j === 0 ? 0.8 : 1, paddingHorizontal: space.m, paddingVertical: 6 }}>
                <Txt variant="caption" style={{ color: c.amberInk }}>
                  {label ?? ''}
                </Txt>
              </View>
            ))}
          </View>
        ) : null}
        {paradigm.rows.map((row, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: i % 2 ? c.sheetAlt : c.sheet }}>
            {row.map((cell, j) => {
              const blank = j > 0 && blanks[i][j];
              const value = typed[key(i, j)] ?? '';
              const ok = checked && sameForm(value, cell);
              const wrong = checked && !ok;
              return (
                <View key={j} style={{ flex: j === 0 ? 0.8 : 1, paddingHorizontal: space.s, paddingVertical: 5, justifyContent: 'center' }}>
                  {j === 0 ? (
                    <Txt variant="smallStrong" color="inkSoft" style={{ paddingHorizontal: space.xs }}>
                      {cell}
                    </Txt>
                  ) : blank ? (
                    <View style={{ gap: 2 }}>
                      <TextInput
                        value={value}
                        onChangeText={(x) => setTyped((m) => ({ ...m, [key(i, j)]: x }))}
                        editable={!checked}
                        autoCorrect={false}
                        autoCapitalize="none"
                        spellCheck={false}
                        placeholder="…"
                        placeholderTextColor={c.inkFaint}
                        accessibilityLabel={`${row[0]} ${paradigm.labels[j] ?? ''}`.trim()}
                        style={{ fontFamily: font.de, fontSize: 17, color: ok ? c.green : wrong ? c.red : c.royal, backgroundColor: c.paper, borderRadius: 8, borderWidth: 1.5, borderColor: ok ? c.green : wrong ? c.red : c.rule, paddingHorizontal: space.s, paddingVertical: 4, minWidth: 56 }}
                      />
                      {wrong ? (
                        <Animated.View entering={FadeIn.duration(200)}>
                          <De variant="german" style={{ fontSize: 14, lineHeight: 18, color: c.green }}>
                            {cell}
                          </De>
                        </Animated.View>
                      ) : null}
                    </View>
                  ) : (
                    <De variant="german" style={{ fontSize: 17, lineHeight: 23, paddingHorizontal: space.xs }}>
                      {cell}
                    </De>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </View>
      {checked ? (
        <Animated.View entering={FadeInDown.duration(240)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, flex: 1 }}>
            {right === cells.length ? <Check size={18} color={c.green} strokeWidth={2.6} /> : <X size={18} color={c.red} strokeWidth={2.6} />}
            <Txt variant="smallStrong" style={{ color: right === cells.length ? c.green : c.red }}>
              {t('grammar.tableScore', { right, total: cells.length })}
            </Txt>
          </View>
          <Button label={t('drill.again')} icon={RotateCcw} kind="secondary" size="small" onPress={again} />
        </Animated.View>
      ) : (
        <Button label={t('grammar.check')} size="medium" onPress={check} disabled={filled < cells.length} />
      )}
    </View>
  );
}
