// What the app checked about an answer, under the answer. Collapsed it is one quiet line ("Checked:
// 4 nouns, rule note Perfekt"); a problem turns it red pen; tapped, it lists every check.

import { BadgeCheck, ChevronDown, Info, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { describeChecks, issueCount, type AnswerChecks } from '@/harness/verify';
import { useI18n } from '@/i18n';

import { Press } from './controls';
import { Txt } from './Text';
import { radius, space, useTheme } from './theme';

export function CheckFooter({ checks, noteTitle }: { checks: AnswerChecks; noteTitle: (key: string) => string }) {
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const lines = describeChecks(checks, noteTitle, lang);
  if (!lines.length) return null;
  const issues = issueCount(checks);
  const okCount = checks.lexicon?.verified.length ?? 0;
  const summary = issues
    ? t('check.summaryDiffers', { count: issues })
    : [
        okCount ? t('check.summaryNouns', { count: okCount }) : null,
        checks.engine?.agrees ? t('check.summaryEngine') : null,
        checks.quotes.some((q) => q.source && !q.exact) ? t('check.summaryQuote') : null,
        checks.grounded.length ? t('check.summaryGrounded') : null,
      ]
        .filter(Boolean)
        .join(t('common.listSeparator')) || t('check.summaryChecked');
  const tone = issues ? c.red : c.amberInk;
  return (
    <Animated.View layout={LinearTransition.duration(220)} style={{ marginTop: space.m }}>
      <Press onPress={() => setOpen((o) => !o)} scaleTo={0.99} accessibilityLabel={t('check.checksLabel', { summary })} accessibilityState={{ selected: open }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 }}>
          {issues ? <TriangleAlert size={15} color={tone} strokeWidth={2.2} /> : <BadgeCheck size={15} color={tone} strokeWidth={2.2} />}
          <Txt variant="caption" style={{ color: tone }}>
            {summary.charAt(0).toUpperCase() + summary.slice(1)}
          </Txt>
          <ChevronDown size={14} color={tone} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
        </View>
      </Press>
      {open ? (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={{ marginTop: space.s, gap: space.s, backgroundColor: c.sheetAlt, borderRadius: radius.small, padding: space.m }}>
          {lines.map((l, i) => {
            const Icon = l.tone === 'warn' ? TriangleAlert : l.tone === 'ok' ? BadgeCheck : Info;
            const color = l.tone === 'warn' ? c.red : l.tone === 'ok' ? c.green : c.inkSoft;
            return (
              <View key={i} style={{ flexDirection: 'row', gap: space.s }}>
                <Icon size={16} color={color} strokeWidth={2.2} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Txt variant="smallStrong">{l.title}</Txt>
                  {l.detail ? (
                    <Txt variant="small" color="inkSoft">
                      {l.detail}
                    </Txt>
                  ) : null}
                </View>
              </View>
            );
          })}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}
