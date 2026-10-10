// eszett://selftest — a hidden harness self-test, only alive in builds made with EXPO_PUBLIC_SELFTEST=1.
// It waits for the tutor, runs the battery in src/features/selfTest.ts and logs every case for logcat.

import * as Device from 'expo-device';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';

import { MENU, scenes } from '@/features/lesson';
import { briefOf, runSelfTest, type SelfTestProgress, type SelfTestRecord, type SelfTestSummary } from '@/features/selfTest';
import { engine } from '@/model/engine';
import { cards, coreLexicon, describeError, tutor, useModel } from '@/model/runtime';
import { translator } from '@/mt/native';
import { Button, Paper, ProgressBar } from '@/ui/controls';
import { TopBar } from '@/ui/Screen';
import { Txt } from '@/ui/Text';
import { gutter, space, useTheme } from '@/ui/theme';

const ENABLED = process.env.EXPO_PUBLIC_SELFTEST === '1';

export default function SelfTestScreen() {
  const { c } = useTheme();
  if (!ENABLED) {
    return (
      <View style={{ flex: 1, backgroundColor: c.paper }}>
        <TopBar title="Self-test" />
        <Txt color="inkSoft" center style={{ padding: gutter }}>
          Not available in this build
        </Txt>
      </View>
    );
  }
  return <SelfTestRunner />;
}

function SelfTestRunner() {
  const { c } = useTheme();
  const status = useModel((s) => s.status);
  // eszett://selftest?only=chat-01,K runs a subset: ids, id prefixes or group letters, comma-separated
  const params = useLocalSearchParams<{ only?: string | string[] }>();
  const onlyParam = Array.isArray(params.only) ? params.only.join(',') : (params.only ?? '');
  const [records, setRecords] = useState<SelfTestRecord[]>([]);
  const [progress, setProgress] = useState<SelfTestProgress | null>(null);
  const [summary, setSummary] = useState<SelfTestSummary | null>(null);
  const [running, setRunning] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (status !== 'ready' || controller.current) return;
    const ac = new AbortController();
    controller.current = ac;
    // A beat later, so a strict-mode remount or a quick unmount never starts the model twice.
    const timer = setTimeout(() => {
      if (ac.signal.aborted) return;
      setRecords([]);
      setProgress(null);
      setSummary(null);
      setRunning(true);
      const m = useModel.getState();
      const begin = {
        edition: m.edition,
        info: m.info,
        checking: m.checking,
        platform: `${Platform.OS} ${Platform.Version}`,
        device: Device.modelName,
        totalMemory: Device.totalMemory,
        date: new Date().toISOString(),
      };
      const deps = { tutor, cards, scenes, menu: MENU, lexicon: tutor.lexicon ?? coreLexicon, stats: () => engine.stats, describeError, translator };
      const only = onlyParam
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
      runSelfTest(deps, begin, {
        signal: ac.signal,
        only,
        onProgress: setProgress,
        onRecord: (r) => setRecords((prev) => [...prev, r]),
      })
        .then((s) => {
          if (!ac.signal.aborted) setSummary(s);
        })
        .catch((e: unknown) => console.log(`SELFTEST FAILED ${describeError(e)}`))
        .finally(() => {
          if (controller.current === ac) {
            controller.current = null;
            setRunning(false);
          }
        });
    }, 50);
    return () => {
      clearTimeout(timer);
      ac.abort();
      if (controller.current === ac) controller.current = null;
    };
  }, [status, attempt, onlyParam]);

  const total = progress?.total ?? 0;
  const line = summary
    ? `Done: ${summary.ok} ok, ${summary.failed} failed, ${summary.cases} cases in ${(summary.totalMs / 1000).toFixed(1)} s${summary.aborted ? ' (stopped)' : ''}`
    : status !== 'ready'
      ? 'Waiting for the tutor to load'
      : progress
        ? `Case ${progress.i}/${total} · running: ${progress.id}`
        : 'Starting';

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <TopBar title="Self-test" />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: gutter, gap: space.l, paddingBottom: 56 }}>
        <Paper tone="alt" style={{ gap: space.s }}>
          <Txt variant="bodyStrong">{line}</Txt>
          {total > 0 && !summary ? <ProgressBar value={(progress?.i ?? 0) / total} /> : null}
          <Button label="Run again" kind="secondary" size="medium" disabled={running || status !== 'ready'} onPress={() => setAttempt((n) => n + 1)} />
        </Paper>
        <View style={{ gap: space.xs }}>
          {records.map((r) => (
            <View key={`${attempt}-${r.i}`} style={{ flexDirection: 'row', gap: space.s, alignItems: 'baseline' }}>
              <Txt variant="caption" color={r.ok ? 'inkSoft' : 'red'} style={{ width: 150 }} numberOfLines={1}>
                {r.id} · {r.ms} ms
              </Txt>
              <Txt variant="small" color={r.ok ? 'ink' : 'red'} style={{ flex: 1 }} numberOfLines={2}>
                {briefOf(r)}
              </Txt>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
