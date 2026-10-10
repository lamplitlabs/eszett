import { BadgeCheck } from 'lucide-react-native';
import { View } from 'react-native';

import type { RuleHit } from '@/harness/rules';
import { useI18n } from '@/i18n';

import { Txt } from './Text';
import { radius, space, useTheme } from './theme';

/** Where a rule hit comes from, as catalog keys. */
const SOURCE: Record<RuleHit['source'], string> = {
  'rule-card': 'ui.ruleSourceCard',
  note: 'ui.ruleSourceNote',
  lexicon: 'ui.ruleSourceLexicon',
};

/** The rules behind a correction, as code read them from the change: shown beside the tutor's explanation. */
export function RuleLines({ rules, compact }: { rules: RuleHit[]; compact?: boolean }) {
  const { c } = useTheme();
  const { t } = useI18n();
  if (!rules.length) return null;
  return (
    <View style={{ gap: space.s }}>
      {rules.map((r) => (
        <View key={r.kind} style={{ borderLeftWidth: 3, borderLeftColor: c.amber, backgroundColor: c.amberTint, borderRadius: radius.small, paddingVertical: space.s, paddingHorizontal: space.m, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <BadgeCheck size={14} color={c.amberInk} />
            <Txt variant="caption" style={{ color: c.amberInk }}>
              {t(SOURCE[r.source])}
            </Txt>
          </View>
          <Txt variant={compact ? 'smallStrong' : 'bodyStrong'}>{r.title}</Txt>
          <Txt variant="small">{r.detail}</Txt>
          {!compact ? (
            <Txt variant="small" color="inkSoft">
              {r.rule}
            </Txt>
          ) : null}
        </View>
      ))}
    </View>
  );
}
