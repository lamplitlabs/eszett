// The box a learner types a wish into and the tutor model writes content from: a scene, a writing task, a
// grammar card. It owns the request state; the screen that uses it says what to do with the result.

import { ChevronDown, Sparkles } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { notReadyNote, useModelPercent } from '@/features/modelStatus';
import { DraftError } from '@/harness/tutor';
import { useI18n } from '@/i18n';
import { describeError, useModel } from '@/model/runtime';
import { Button, Paper, Press } from '@/ui/controls';
import { haptic } from '@/ui/haptics';
import { Txt } from '@/ui/Text';
import { Thinking } from '@/ui/Thinking';
import { font, radius, space, useTheme } from '@/ui/theme';

interface Props {
  title: string;
  hint: string;
  placeholder: string;
  buttonLabel: string;
  busyLabel: string;
  /** What the thing is called in the failure note: "scene", "task", "card". */
  /** Catalog key of the sentence shown when the draft is unusable; takes {reason}. */
  unusableKey: string;
  /** Extra choices under the field (register pills and the like). */
  controls?: ReactNode;
  /** Writes and stores the item; throws DraftError when the model's draft was unusable. */
  onSubmit: (text: string) => Promise<void>;
  initial?: string;
  autoFocus?: boolean;
}

export function AuthorBox({ title, hint, placeholder, buttonLabel, busyLabel, unusableKey, controls, onSubmit, initial = '', autoFocus }: Props) {
  const { c } = useTheme();
  const { t, lang } = useI18n();
  const connection = useModel((s) => s.status);
  const pct = useModelPercent();
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; draft?: string } | null>(null);
  const [showDraft, setShowDraft] = useState(false);

  const submit = async () => {
    const wish = text.trim();
    if (!wish || busy) return;
    setBusy(true);
    setError(null);
    setShowDraft(false);
    try {
      await onSubmit(wish);
      setText(''); // the result has its own screen; coming back, the box is ready for the next wish
      haptic.success();
    } catch (e) {
      haptic.error();
      if (e instanceof DraftError) setError({ message: t(unusableKey, { reason: e.message }), draft: e.draft });
      else setError({ message: describeError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper style={{ gap: space.m }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
        <Sparkles size={18} color={c.amberInk} />
        <Txt variant="bodyStrong">{title}</Txt>
      </View>
      <Txt variant="small" color="inkSoft">
        {hint}
      </Txt>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        editable={!busy}
        autoFocus={autoFocus}
        placeholder={placeholder}
        placeholderTextColor={c.inkFaint}
        autoCorrect={false}
        accessibilityLabel={title}
        style={{ fontFamily: font.sans, fontSize: 16, lineHeight: 22, color: c.ink, minHeight: 66, textAlignVertical: 'top', padding: space.m, borderRadius: radius.control, backgroundColor: c.sheetAlt, outlineStyle: 'none' } as object}
      />
      {controls}
      {connection !== 'ready' ? (
        <Txt variant="small" color="inkSoft">
          {notReadyNote(connection, pct, lang)}
        </Txt>
      ) : null}
      {busy ? <Thinking label={busyLabel} /> : <Button label={buttonLabel} icon={Sparkles} onPress={() => void submit()} disabled={connection !== 'ready' || !text.trim()} />}
      {error ? (
        <Animated.View entering={FadeIn.duration(200)} style={{ gap: space.s }}>
          <Txt variant="small" style={{ color: c.red }}>
            {error.message}
          </Txt>
          {error.draft ? (
            <Press onPress={() => setShowDraft((o) => !o)} scaleTo={0.995} accessibilityLabel={showDraft ? t('author.hideDraftLabel') : t('author.showDraftLabel')}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Txt variant="caption" color="inkFaint">
                  {showDraft ? t('author.hideDraft') : t('author.showDraft')}
                </Txt>
                <ChevronDown size={14} color={c.inkFaint} style={{ transform: [{ rotate: showDraft ? '180deg' : '0deg' }] }} />
              </View>
            </Press>
          ) : null}
          {showDraft && error.draft ? (
            <Txt variant="caption" color="inkFaint" selectable>
              {error.draft}
            </Txt>
          ) : null}
        </Animated.View>
      ) : null}
    </Paper>
  );
}
