// Renders the tutor's light Markdown. German is recognised and set in Vollkorn, so a learner can tell at a
// glance what to learn: example lines "German – English" split into a German line (tap to hear) and its
// gloss, and nouns cited with their article ("die Abfahrt") turn into gender-coloured words that open the
// word sheet.

import { Fragment, memo, useEffect } from 'react';
import { ScrollView, Text, View, type TextStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { bilingual, englishWords, looksGerman, NOUN_SPAN } from '@/harness/german';
import { lineText, parseInline, parseMarkdown, settleStreaming, type Block, type Line, type Span } from '@/harness/markdown';
import type { Lang } from '@/harness/route';

import { speak } from './speech';
import { font, genderColor, space, type as typeScale, useTheme, type Palette } from './theme';


interface Props {
  text: string;
  /** The language the answer is written in; a German answer is set in Vollkorn throughout. */
  lang?: Lang;
  streaming?: boolean;
  onWord?: (lemma: string, article: string | null) => void;
  /** Muted, smaller rendering (inside cards). */
  compact?: boolean;
}

function Caret() {
  const { c } = useTheme();
  const o = useSharedValue(1);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!reduced) o.set(withRepeat(withSequence(withTiming(0.15, { duration: 480 }), withTiming(1, { duration: 480 })), -1));
  }, [o, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View style={[{ width: 8, height: 17, borderRadius: 2, backgroundColor: c.royal, marginLeft: 2, transform: [{ translateY: 3 }] }, style]} />;
}

function spanStyle(s: Span, base: TextStyle, german: boolean, c: Palette): TextStyle {
  const style: TextStyle = {};
  if (s.bold) style.fontFamily = german ? font.deSemi : font.sansSemi;
  if (s.italic) style.fontFamily = german ? (s.bold ? font.deSemiItalic : font.deItalic) : font.sansItalic;
  if (s.strike) {
    style.textDecorationLine = 'line-through';
    style.textDecorationColor = c.red;
  }
  if (s.code) {
    style.fontFamily = base.fontFamily;
    style.backgroundColor = c.sheetAlt;
  }
  return style;
}

const InlineLine = memo(function InlineLine({ line, german, base, onWord }: { line: Line; german: boolean; base: TextStyle; onWord?: Props['onWord'] }) {
  const { c } = useTheme();
  return (
    <>
      {line.map((s, i) => {
        if (!german && (s.bold || s.italic) && !s.code) {
          const noun = NOUN_SPAN.exec(s.text.trim());
          if (noun) {
            const [, article, lemma] = noun;
            return (
              <Text
                key={i}
                onPress={onWord ? () => onWord(lemma, article) : () => speak(s.text)}
                suppressHighlighting
                style={{ fontFamily: font.deSemi, fontSize: (base.fontSize ?? 16) + 1, color: c.ink }}>
                <Text style={{ color: genderColor(c, article) }}>{article}</Text> {lemma}
              </Text>
            );
          }
          if (looksGerman(s.text)) {
            return (
              <Text key={i} onPress={() => speak(s.text)} suppressHighlighting style={{ fontFamily: s.bold ? font.deSemi : font.deItalic, fontSize: (base.fontSize ?? 16) + 1, color: c.ink }}>
                {s.text}
              </Text>
            );
          }
        }
        return (
          <Text key={i} style={spanStyle(s, base, german, c)}>
            {s.text}
          </Text>
        );
      })}
    </>
  );
});

function LineView({ line, answerGerman, base, onWord, caret }: { line: Line; answerGerman: boolean; base: TextStyle; onWord?: Props['onWord']; caret?: boolean }) {
  const { c } = useTheme();
  const pair = answerGerman ? null : bilingual(line);
  if (pair) {
    return (
      <View style={{ marginVertical: 2 }}>
        <Text onPress={() => speak(pair[0])} suppressHighlighting style={[typeScale.german, { color: c.ink }]}>
          {pair[0]}
        </Text>
        <Text style={[typeScale.small, { color: c.inkSoft }]}>{pair[1]}</Text>
        {caret ? <Caret /> : null}
      </View>
    );
  }
  const text = lineText(line);
  // a German sentence, not an English explanation that quotes German examples
  const germanLine = answerGerman || (text.split(/\s+/).length >= 3 && looksGerman(text) && englishWords(text) <= 1 && !/[a-z]+:\s/i.test(text.slice(0, 14)));
  const style: TextStyle = germanLine ? { ...typeScale.german, fontSize: (base.fontSize ?? 16) + 1, lineHeight: (base.lineHeight ?? 23) + 3 } : base;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <Text style={[style, { color: c.ink, flexShrink: 1 }]} onPress={germanLine && !answerGerman ? () => speak(text) : undefined} suppressHighlighting>
        <InlineLine line={line} german={germanLine} base={style} onWord={onWord} />
      </Text>
      {caret ? <Caret /> : null}
    </View>
  );
}

function BlockView({ block, answerGerman, base, onWord, caret }: { block: Block; answerGerman: boolean; base: TextStyle; onWord?: Props['onWord']; caret: boolean }) {
  const { c } = useTheme();
  switch (block.type) {
    case 'rule':
      return <View style={{ height: 1, backgroundColor: c.rule, marginVertical: space.s }} />;
    case 'heading':
      return (
        <Text style={[typeScale.headline, { color: c.ink, marginTop: space.xs }, answerGerman && { fontFamily: font.deSemi }]}>
          <InlineLine line={block.line} german={answerGerman} base={typeScale.headline} onWord={onWord} />
        </Text>
      );
    case 'quote':
      return (
        <View style={{ borderLeftWidth: 3, borderLeftColor: c.amber, backgroundColor: c.amberTint, borderRadius: 6, paddingVertical: space.s, paddingHorizontal: space.m, gap: 4 }}>
          {block.lines.map((l, i) => (
            <LineView key={i} line={l} answerGerman={answerGerman} base={{ ...typeScale.small, lineHeight: 21 }} onWord={onWord} caret={caret && i === block.lines.length - 1} />
          ))}
        </View>
      );
    case 'list':
      return (
        <View style={{ gap: 6 }}>
          {block.items.map((item, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: space.s, paddingLeft: item.depth ? space.xl : 0 }}>
              {item.marker ? (
                <Text style={[typeScale.smallStrong, { color: c.inkFaint, minWidth: 16, lineHeight: base.lineHeight }]}>{/\d/.test(item.marker) ? item.marker.replace(')', '.') : '•'}</Text>
              ) : null}
              <View style={{ flex: 1 }}>
                <LineView line={item.line} answerGerman={answerGerman} base={base} onWord={onWord} caret={caret && i === block.items.length - 1} />
              </View>
            </View>
          ))}
        </View>
      );
    case 'table':
      return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -2 }}>
          <View style={{ borderWidth: 1, borderColor: c.rule, borderRadius: 10, overflow: 'hidden' }}>
            {[block.header, ...block.rows].map((row, r) => (
              <View key={r} style={{ flexDirection: 'row', backgroundColor: r === 0 ? c.sheetAlt : 'transparent', borderTopWidth: r ? 1 : 0, borderTopColor: c.rule }}>
                {row.map((cell, k) => (
                  <View key={k} style={{ minWidth: 96, maxWidth: 200, padding: space.s, borderLeftWidth: k ? 1 : 0, borderLeftColor: c.rule }}>
                    <Text style={[typeScale.small, { color: c.ink }, r === 0 && { fontFamily: font.sansSemi }]}>
                      <InlineLine line={cell} german={false} base={typeScale.small} onWord={onWord} />
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      );
    case 'para':
      return (
        <View style={{ gap: 4 }}>
          {block.lines.map((l, i) => (
            <LineView key={i} line={l} answerGerman={answerGerman} base={base} onWord={onWord} caret={caret && i === block.lines.length - 1} />
          ))}
        </View>
      );
  }
}

/** The tutor's answer, rendered. */
export function Markdown({ text, lang = 'en', streaming, onWord, compact }: Props) {
  const blocks = parseMarkdown(streaming ? settleStreaming(text) : text);
  const base: TextStyle = compact ? typeScale.small : typeScale.body;
  if (!blocks.length && streaming) return <Caret />;
  return (
    <View style={{ gap: space.m }}>
      {blocks.map((b, i) => (
        <Fragment key={i}>
          <BlockView block={b} answerGerman={lang === 'de'} base={base} onWord={onWord} caret={Boolean(streaming) && i === blocks.length - 1} />
        </Fragment>
      ))}
    </View>
  );
}

export { parseInline };
