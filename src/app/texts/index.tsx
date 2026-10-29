// The portfolio (src/state/texts.ts): every text the learner sent to the tutor from a writing task, newest first,
// with the words, the content points the precheck found and whether the tutor changed anything. Reached from
// Me › Progress and Practice › Writing.

import { router } from 'expo-router';
import { ChevronRight, NotebookPen } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/i18n';
import { recentPointsRatio, textsNewestFirst, useTexts } from '@/state/texts';
import { Paper, Press } from '@/ui/controls';
import { TopBar } from '@/ui/Screen';
import { Txt } from '@/ui/Text';
import { gutter, space, useTheme } from '@/ui/theme';

export function textDate(created: number, lang: string): string {
  try {
    return new Date(created).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return new Date(created).toISOString().slice(0, 10);
  }
}

export default function TextsScreen() {
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const items = useTexts((s) => s.items);
  const list = textsNewestFirst(items);
  const ratio = recentPointsRatio(items);

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title={t('texts.title')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: insets.bottom + space.x4, gap: space.m }}>
        {!list.length ? (
          <Paper tone="alt" style={{ gap: space.xs }}>
            <Txt variant="small" color="inkSoft">
              {t('texts.empty')}
            </Txt>
          </Paper>
        ) : (
          <>
            <Txt variant="body" color="inkSoft">
              {ratio === null ? t('texts.count', { count: list.length }) : t('texts.summary', { count: list.length, percent: Math.round(ratio * 100) })}
            </Txt>
            <View style={{ gap: space.s }}>
              {list.map((x, i) => (
                <Animated.View key={x.id} entering={FadeInDown.delay(Math.min(i, 8) * 40).duration(260)}>
                  <Press onPress={() => router.push(`/texts/${x.id}` as never)} scaleTo={0.99} accessibilityLabel={x.title}>
                    <Paper style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
                      <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: x.unchanged && x.ok ? c.greenTint : c.redTint }}>
                        <NotebookPen size={20} color={x.unchanged && x.ok ? c.green : c.red} strokeWidth={2.2} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Txt variant="bodyStrong" numberOfLines={1}>
                          {x.title}
                        </Txt>
                        <Txt variant="caption" color="inkSoft">
                          {textDate(x.created, lang)} · {x.level} · {t('texts.words', { count: x.words })} · {t('texts.points', { hit: x.pointsHit, total: x.pointsTotal })}
                          {x.unchanged ? ` · ${t('texts.noChanges')}` : ''}
                        </Txt>
                      </View>
                      <ChevronRight size={18} color={c.inkFaint} />
                    </Paper>
                  </Press>
                </Animated.View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
