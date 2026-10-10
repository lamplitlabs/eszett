import * as Device from 'expo-device';
import { router, useLocalSearchParams } from 'expo-router';
import { Activity, Check, ChevronDown, ChevronRight, Download, FolderOpen, KeyRound, Pause, Play, Trash2, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-screens/experimental';

import { modelTitle, pctOf, statusLabel } from '@/features/modelStatus';
import { useStreamTest } from '@/features/streamTest';
import { useI18n } from '@/i18n';
import { freeBytes, type LocalModel } from '@/model/files';
import { describeBytes, EDITIONS, editionFits, estimatedBytes, MODEL_BASE, type Edition } from '@/model/manifest';
import { useModel } from '@/model/runtime';
import { useSettings } from '@/state/settings';
import { Button, IconButton, Paper, Pill, Press, ProgressBar } from '@/ui/controls';
import { StatusLight } from '@/ui/Lamp';
import { Txt } from '@/ui/Text';
import { font, gutter, radius, space, useTheme } from '@/ui/theme';

/** Room to keep after the download, so the phone is not left full. */
const SPARE_BYTES = 500_000_000;

/** What the picker calls each edition: the catalog keys of its title and its one-line summary. */
const EDITION_KEYS: Record<Edition, { name: string; detail: string }> = {
  Q5_K_M: { name: 'model.editionPhone', detail: 'model.editionPhoneDetail' },
  Q8_0: { name: 'model.editionFull', detail: 'model.editionFullDetail' },
};

function freeOnPhone(): number | null {
  try {
    return freeBytes();
  } catch {
    return null;
  }
}

/** Which file to download: the phone edition for everyone, the larger one where the memory allows it. */
function EditionPicker({ value, onChange }: { value: Edition; onChange: (e: Edition) => void }) {
  const { c } = useTheme();
  const { t } = useI18n();
  const ram = Device.totalMemory;
  return (
    <View style={{ gap: space.s }}>
      {EDITIONS.map((e) => {
        const fits = editionFits(e.edition, ram);
        const on = e.edition === value;
        const size = describeBytes(estimatedBytes(e.edition));
        const name = t(EDITION_KEYS[e.edition].name);
        return (
          <Press
            key={e.edition}
            onPress={() => onChange(e.edition)}
            disabled={!fits}
            scaleTo={0.985}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled: !fits }}
            accessibilityLabel={t('model.editionWithSize', { edition: name, size })}
            style={{
              borderRadius: radius.control,
              borderWidth: on ? 2 : 1,
              borderColor: on ? c.royal : c.rule,
              backgroundColor: on ? c.royalTint : c.sheet,
              padding: space.m,
              paddingVertical: on ? space.m - 1 : space.m,
              gap: 2,
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s }}>
              <Txt variant="bodyStrong" style={{ color: on ? c.royal : c.ink }}>
                {name}
              </Txt>
              <Txt variant="caption" color="inkSoft">
                {e.edition}
              </Txt>
            </View>
            <Txt variant="small" color="inkSoft">
              {t(EDITION_KEYS[e.edition].detail, { size, minRamGb: e.minRamGb })}
            </Txt>
            {!fits ? (
              <Txt variant="caption" color="inkFaint">
                {t('model.needsRam', { minRamGb: e.minRamGb })}
              </Txt>
            ) : null}
          </Press>
        );
      })}
    </View>
  );
}

function LocalRow({ file, inUse, onUse }: { file: LocalModel; inUse: boolean; onUse: () => void }) {
  const { t } = useI18n();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: space.xs }}>
      <View style={{ flex: 1 }}>
        <Txt variant="small" numberOfLines={1}>
          {file.name}
        </Txt>
        <Txt variant="caption" color="inkSoft">
          {describeBytes(file.bytes)}
          {file.edition ? ` · ${file.edition}` : ''}
          {file.where === 'documents' ? ` · ${t('model.filesApp')}` : ''}
        </Txt>
      </View>
      {inUse ? <Pill label={t('model.inUse')} icon={Check} tone="amber" /> : <Button label={t('model.useThisFile')} kind="secondary" size="small" onPress={onUse} />}
    </View>
  );
}

/** The tutor model on this phone: get it, watch it arrive, see how it runs. */
export default function ModelSheet() {
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const { status, progress, bytes, total, detail, error, edition, info, stats, local, removed, checking } = useModel();
  const retired = removed.filter((name) => /\.gguf/i.test(name));
  const download = useModel((s) => s.download);
  const pause = useModel((s) => s.pause);
  const resume = useModel((s) => s.resume);
  const cancel = useModel((s) => s.cancel);
  const pickLocal = useModel((s) => s.useLocal);
  const importFile = useModel((s) => s.importFile);
  const remove = useModel((s) => s.remove);
  const refreshStats = useModel((s) => s.refreshStats);
  const modelSource = useSettings((s) => s.modelSource);
  const modelFile = useSettings((s) => s.modelFile);
  const setEdition = useSettings((s) => s.setEdition);
  const setModelSource = useSettings((s) => s.setModelSource);
  const [pick, setPick] = useState<Edition>(edition);
  const [advanced, setAdvanced] = useState(false);
  const [test, runTest] = useStreamTest();
  const { autotest } = useLocalSearchParams<{ autotest?: string }>();
  const autoRan = useRef(false);

  useEffect(() => {
    refreshStats();
  }, [refreshStats, test?.status]);
  useEffect(() => {
    if (autotest === '1' && status === 'ready' && !autoRan.current) {
      autoRan.current = true;
      runTest();
    }
  }, [autotest, status, runTest]);

  const pct = pctOf(progress);
  const inFlight = status === 'downloading' || status === 'paused' || status === 'loading';
  const settled = status === 'absent' || status === 'ready' || status === 'paused' || status === 'error' || status === 'locked';
  const free = status === 'absent' ? freeOnPhone() : null;
  const need = estimatedBytes(pick);
  const tight = free !== null && free < need + SPARE_BYTES;
  const fileInUse = (f: LocalModel) => status === 'ready' && (modelFile ? f.uri === modelFile : f.where === 'models' && f.edition === edition);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const startDownload = (e: Edition) => {
    setEdition(e);
    void download(e);
  };
  const confirmRemove = () =>
    Alert.alert(t('model.removeTitle'), t('model.removeMessage'), [
      { text: t('model.keepIt'), style: 'cancel' },
      { text: t('model.remove'), style: 'destructive', onPress: () => void remove() },
    ]);

  const speed = (avg: number, last: number | null) => (last ? t('model.speedWithLast', { avg: avg.toFixed(1), last: last.toFixed(1) }) : t('model.speed', { avg: avg.toFixed(1) }));
  const facts: [string, string][] =
    status === 'ready' && info
      ? [
          [t('model.factModel'), modelTitle(info, ', ')],
          modelFile ? [t('model.factFile'), modelFile.split('/').pop() ?? modelFile] : [t('model.factEdition'), t('model.editionWithSize', { edition, size: describeBytes(estimatedBytes(edition)) })],
          [t('model.factRunsOn'), info.gpu ? (Platform.OS === 'ios' ? t('model.gpuMetal') : t('model.gpu')) : `${t('model.cpu')}${info.reasonNoGPU ? ` · ${info.reasonNoGPU}` : ''}`],
          [t('model.factSpeed'), stats.avgTokS ? speed(stats.avgTokS, stats.lastTokS) : t('model.speedPending')],
          [t('model.factAnswers'), String(stats.requests)],
          [t('model.factChecks'), checking ? t('model.checksFull') : t('model.checksCore')],
        ]
      : [];
  const testSummary = test
    ? [
        t('model.testPieces', { count: test.pieces }),
        test.firstMs !== null ? t('model.testFirstAfter', { seconds: (test.firstMs / 1000).toFixed(1) }) : '',
        test.totalMs !== null ? t('model.testDoneIn', { seconds: (test.totalMs / 1000).toFixed(1) }) : '',
      ]
        .filter(Boolean)
        .join(', ')
    : '';

  return (
    <SafeAreaView edges={{ top: true }} style={{ flex: 1, backgroundColor: c.sheet }}>
      <ScrollView style={{ flex: 1, backgroundColor: c.sheet }} contentContainerStyle={{ padding: gutter, paddingTop: space.x3, gap: space.l }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
          <Txt variant="title" style={{ flex: 1 }} accessibilityRole="header">
            {t('model.title')}
          </Txt>
          <IconButton icon={X} label={t('common.close')} tone="sheet" size={34} onPress={close} />
        </View>

        <Paper tone="alt" style={{ gap: space.s }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
            <StatusLight connection={status} size={12} />
            <Txt variant="bodyStrong" style={{ flex: 1 }}>
              {statusLabel(status, pct, lang)}
            </Txt>
          </View>
          {detail && status !== 'ready' ? (
            <Txt variant="small" color="inkSoft">
              {detail}
            </Txt>
          ) : null}
          {inFlight ? (
            <View style={{ gap: 6, marginTop: space.xs }}>
              <ProgressBar value={progress} color={status === 'paused' ? 'inkFaint' : 'royal'} />
              {status !== 'loading' ? (
                <Txt variant="caption" color="inkSoft">
                  {t('model.bytesOf', { done: describeBytes(bytes), total: describeBytes(total > 0 ? total : estimatedBytes(edition)) })}
                </Txt>
              ) : null}
            </View>
          ) : null}
        </Paper>

        {status === 'error' ? (
          <Paper tone="red" style={{ gap: space.m }}>
            <Txt variant="small" style={{ color: c.red }}>
              {error ?? detail ?? t('model.somethingWrong')}
            </Txt>
            <Button label={t('model.retryDownload')} icon={Download} kind="secondary" size="medium" onPress={() => startDownload(edition)} />
          </Paper>
        ) : null}

        {status === 'unavailable' ? (
          <Txt variant="small" color="inkSoft">
            {t('model.unavailable')}
          </Txt>
        ) : null}

        {status === 'locked' ? (
          <Paper tone="amber" style={{ gap: space.m }}>
            <Txt variant="small">{t('model.noteLocked')}</Txt>
            <Button label={t('unlock.open')} icon={KeyRound} size="medium" onPress={() => router.push('/unlock')} />
          </Paper>
        ) : null}

        {status === 'absent' ? (
          <View style={{ gap: space.m }}>
            <Txt variant="body" color="inkSoft">
              {t('model.absentIntro')}
            </Txt>
            <EditionPicker value={pick} onChange={setPick} />
            {free !== null ? (
              <Txt variant="small" color={tight ? 'red' : 'inkSoft'}>
                {tight ? t('model.freeOnPhoneTight', { free: describeBytes(free), need: describeBytes(need) }) : t('model.freeOnPhone', { free: describeBytes(free) })}
              </Txt>
            ) : null}
            <Button label={t('model.download', { size: describeBytes(need) })} icon={Download} onPress={() => startDownload(pick)} />
            <Txt variant="small" color="inkSoft" center>
              {t('model.bestOverWifi')}
            </Txt>
          </View>
        ) : null}

        {status === 'downloading' ? (
          <View style={{ flexDirection: 'row', gap: space.s }}>
            <Button label={t('model.pause')} icon={Pause} kind="secondary" size="medium" grow onPress={() => void pause()} />
            <Button label={t('common.cancel')} kind="quiet" size="medium" grow onPress={() => void cancel()} />
          </View>
        ) : null}

        {status === 'paused' ? (
          <View style={{ flexDirection: 'row', gap: space.s }}>
            <Button label={t('model.resume')} icon={Play} size="medium" grow onPress={() => void resume()} />
            <Button label={t('common.cancel')} kind="quiet" size="medium" grow onPress={() => void cancel()} />
          </View>
        ) : null}

        {facts.length ? (
          <View style={{ gap: space.s }}>
            {facts.map(([k, v]) => (
              <View key={k} style={{ flexDirection: 'row', gap: space.m }}>
                <Txt variant="small" color="inkSoft" style={{ width: 118 }}>
                  {k}
                </Txt>
                <Txt variant="small" style={{ flex: 1 }}>
                  {v}
                </Txt>
              </View>
            ))}
          </View>
        ) : null}

        {status === 'ready' ? (
          <View style={{ gap: space.s }}>
            <Button label={test?.status === 'running' ? t('model.testing') : t('model.testTutor')} icon={Activity} kind="secondary" size="medium" disabled={test?.status === 'running'} onPress={runTest} />
            {test ? (
              <Paper tone={test.status === 'error' ? 'red' : 'alt'} style={{ gap: 4 }}>
                {test.text ? (
                  <Txt variant="body" style={{ fontFamily: 'Vollkorn_400Regular', fontSize: 18 }}>
                    {test.text.split('\n')[0].replace(/\*\*/g, '')}
                  </Txt>
                ) : null}
                <Txt variant="small" color="inkSoft">
                  {test.status === 'error' ? test.error : testSummary}
                </Txt>
              </Paper>
            ) : null}
          </View>
        ) : null}

        {settled ? (
          <View style={{ gap: space.s }}>
            <Txt variant="smallStrong">{t('model.foundOnPhone')}</Txt>
            {local.length ? (
              <Paper style={{ paddingVertical: space.s }}>
                {local.map((f) => (
                  <LocalRow key={f.uri} file={f} inUse={fileInUse(f)} onUse={() => void pickLocal(f)} />
                ))}
              </Paper>
            ) : (
              <Txt variant="small" color="inkSoft">
                {t('model.noFile')}
              </Txt>
            )}
            {retired.length ? (
              <Txt variant="small" color="inkSoft">
                {t('model.retired', { count: retired.length, files: retired.join(', ') })}
              </Txt>
            ) : null}
            <Button label={t('model.chooseFile')} icon={FolderOpen} kind="secondary" size="medium" onPress={() => void importFile()} />
          </View>
        ) : null}

        {settled ? (
          <View style={{ gap: space.s }}>
            <Press onPress={() => setAdvanced((v) => !v)} accessibilityLabel={t('model.advanced')} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {advanced ? <ChevronDown size={16} color={c.inkSoft} /> : <ChevronRight size={16} color={c.inkSoft} />}
                <Txt variant="smallStrong" color="inkSoft">
                  {t('model.advanced')}
                </Txt>
              </View>
            </Press>
            {advanced ? (
              <View style={{ gap: space.m }}>
                <View style={{ gap: space.s }}>
                  <Txt variant="smallStrong">{t('model.downloadSource')}</Txt>
                  <TextInput
                    value={modelSource}
                    onChangeText={setModelSource}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    placeholder={MODEL_BASE}
                    placeholderTextColor={c.inkFaint}
                    accessibilityLabel={t('model.downloadSource')}
                    style={{ fontFamily: font.sans, fontSize: 15, color: c.ink, backgroundColor: c.paper, borderRadius: radius.control, borderWidth: 1, borderColor: c.rule, paddingHorizontal: space.l, paddingVertical: 12, outlineStyle: 'none' } as object}
                  />
                  <Txt variant="small" color="inkSoft">
                    {t('model.downloadSourceHint')}
                  </Txt>
                </View>
                {status !== 'absent' ? <Button label={t('model.removeFromPhone')} icon={Trash2} kind="pen" size="medium" onPress={confirmRemove} /> : null}
              </View>
            ) : null}
          </View>
        ) : null}

        <Txt variant="caption" color="inkFaint" center>
          {t('model.staysOnPhone')}
        </Txt>
      </ScrollView>
    </SafeAreaView>
  );
}
