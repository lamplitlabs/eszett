import "@/global.css";

import {
  FiraSans_400Regular,
  FiraSans_400Regular_Italic,
  FiraSans_500Medium,
  FiraSans_600SemiBold,
  FiraSans_700Bold,
} from "@expo-google-fonts/fira-sans";
import {
  Vollkorn_400Regular,
  Vollkorn_400Regular_Italic,
  Vollkorn_500Medium,
  Vollkorn_600SemiBold,
  Vollkorn_600SemiBold_Italic,
  Vollkorn_700Bold,
} from "@expo-google-fonts/vollkorn";
import { useFonts } from "expo-font";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { AppState, Platform, useColorScheme, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useAccessBind } from "@/features/accessBind";
import { useAccess } from "@/features/access";
import { useModelBoot } from "@/features/modelBoot";
import { maybeAskForReview } from "@/features/review";
import { bindLanguage } from "@/i18n/bind";
import { bindTranslator } from "@/mt/bind";
import { useDeck } from "@/state/deck";
import { useProgress } from "@/state/progress";
import { useSettings } from "@/state/settings";
import { dark, light, ThemeContext, type Theme } from "@/ui/theme";
import { UpdateCard, UpdateRequired, useUpdateVerdict } from "@/ui/UpdateCard";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Fonts and the stores take well under a second; past this the app shows anyway rather than sit behind the splash. */
const SPLASH_MAX_MS = 2500;

function useHydrated() {
  const [done, setDone] = useState(() =>
    [useSettings, useProgress, useDeck, useAccess].every((s) =>
      s.persist.hasHydrated(),
    ),
  );
  useEffect(() => {
    if (done) return;
    const check = () =>
      setDone(
        [useSettings, useProgress, useDeck, useAccess].every((s) =>
          s.persist.hasHydrated(),
        ),
      );
    const unsubs = [useSettings, useProgress, useDeck, useAccess].map((s) =>
      s.persist.onFinishHydration(check),
    );
    check();
    return () => unsubs.forEach((u) => u());
  }, [done]);
  return done;
}

/** A store review is asked for after a few days of use, a moment after an exercise is finished (see features/review). */
function useReviewPrompt(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = useProgress.subscribe((s, prev) => {
      if (s.days === prev.days) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void maybeAskForReview(), 1500);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);
}

/** On a desktop browser the app keeps a phone's width; on phones this is a plain full-size view. */
function PhoneColumn({
  children,
  color,
}: {
  children: React.ReactNode;
  color: string;
}) {
  if (Platform.OS !== "web") return <>{children}</>;
  return (
    <View
      style={{
        flex: 1,
        width: "100%",
        maxWidth: 480,
        alignSelf: "center",
        backgroundColor: color,
        overflow: "hidden",
      }}
    >
      {children}
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    FiraSans_400Regular,
    FiraSans_400Regular_Italic,
    FiraSans_500Medium,
    FiraSans_600SemiBold,
    FiraSans_700Bold,
    Vollkorn_400Regular,
    Vollkorn_400Regular_Italic,
    Vollkorn_500Medium,
    Vollkorn_600SemiBold,
    Vollkorn_600SemiBold_Italic,
    Vollkorn_700Bold,
  });
  const hydrated = useHydrated();
  // the saved language (or the phone's) once the settings are in; English until then, behind the splash
  useEffect(() => (hydrated ? bindLanguage() : undefined), [hydrated]);
  // the on-phone translator follows the app language and its own switch
  useEffect(() => (hydrated ? bindTranslator() : undefined), [hydrated]);
  // the access lock first, so the model boot below finds the flag in place
  useAccessBind(hydrated);
  useModelBoot(hydrated);
  const update = useUpdateVerdict(hydrated);
  useReviewPrompt(hydrated);
  const system = useColorScheme();
  const pref = useSettings((s) => s.theme);
  const scheme: "light" | "dark" =
    pref === "system" ? (system === "dark" ? "dark" : "light") : pref;
  const theme: Theme = useMemo(
    () => ({ scheme, c: scheme === "dark" ? dark : light }),
    [scheme],
  );
  const [waitedLongEnough, setWaitedLongEnough] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaitedLongEnough(true), SPLASH_MAX_MS);
    return () => clearTimeout(t);
  }, []);
  const ready = (fontsLoaded && hydrated) || waitedLongEnough;

  useEffect(() => {
    if (!ready) return;
    const hide = () => SplashScreen.hideAsync().catch(() => undefined);
    hide();
    // Android 12-13 can leave the system splash up when the activity was stopped (screen lock) during launch:
    // ask again whenever the app comes back to the foreground
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") hide();
    });
    return () => sub.remove();
  }, [ready]);

  const navTheme = useMemo(() => {
    const base = scheme === "dark" ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: theme.c.paper,
        card: theme.c.paper,
        text: theme.c.ink,
        border: theme.c.rule,
        primary: theme.c.royal,
      },
    };
  }, [scheme, theme]);

  if (!ready)
    return <View style={{ flex: 1, backgroundColor: theme.c.paper }} />;

  return (
    <GestureHandlerRootView
      style={{
        flex: 1,
        backgroundColor:
          Platform.OS === "web" ? theme.c.sheetAlt : theme.c.paper,
      }}
    >
      <ThemeContext value={theme}>
        <PhoneColumn color={theme.c.paper}>
          <ThemeProvider value={navTheme}>
            <StatusBar style={scheme === "dark" ? "light" : "dark"} />
            {update.required ? (
              <UpdateRequired verdict={update} />
            ) : (
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: theme.c.paper },
                  animation:
                    Platform.OS === "android" ? "fade_from_bottom" : "default",
                }}
              >
                <Stack.Screen name="(tabs)" />
                <Stack.Screen
                  name="onboarding"
                  options={{ animation: "fade", gestureEnabled: false }}
                />
                <Stack.Screen
                  name="drill/[category]"
                  options={{
                    presentation: "fullScreenModal",
                    animation: "slide_from_bottom",
                  }}
                />
                <Stack.Screen
                  name="review"
                  options={{
                    presentation: "fullScreenModal",
                    animation: "slide_from_bottom",
                  }}
                />
                <Stack.Screen name="scene/[key]" />
                <Stack.Screen name="grammar/new" />
                <Stack.Screen name="grammar/[key]" />
                <Stack.Screen name="write/new" />
                <Stack.Screen name="write/[id]" />
                <Stack.Screen name="words" />
                <Stack.Screen name="path/index" />
                <Stack.Screen name="path/[unit]" />
                <Stack.Screen name="read" />
                <Stack.Screen
                  name="speak"
                  options={{
                    presentation: "fullScreenModal",
                    animation: "slide_from_bottom",
                  }}
                />
                <Stack.Screen
                  name="listen"
                  options={{
                    presentation: "fullScreenModal",
                    animation: "slide_from_bottom",
                  }}
                />
                <Stack.Screen
                  name="placement"
                  options={{
                    presentation: "fullScreenModal",
                    animation: "slide_from_bottom",
                  }}
                />
                <Stack.Screen
                  name="mistakes"
                  options={{
                    presentation: "fullScreenModal",
                    animation: "slide_from_bottom",
                  }}
                />
                <Stack.Screen name="texts/index" />
                <Stack.Screen name="texts/[id]" />
                <Stack.Screen
                  name="path/check/[unit]"
                  options={{
                    presentation: "fullScreenModal",
                    animation: "slide_from_bottom",
                  }}
                />
                <Stack.Screen name="together/index" />
                {["together/talk", "together/duel", "together/taboo", "together/story", "together/scrabble", "together/wordle"].map((name) => (
                  <Stack.Screen
                    key={name}
                    name={name}
                    options={{
                      presentation: "fullScreenModal",
                      animation: "slide_from_bottom",
                    }}
                  />
                ))}
                <Stack.Screen
                  name="word/[lemma]"
                  options={{
                    presentation: "formSheet",
                    sheetAllowedDetents: [0.62, 1],
                    sheetGrabberVisible: true,
                    sheetCornerRadius: 24,
                    contentStyle: { backgroundColor: theme.c.sheet },
                  }}
                />
                <Stack.Screen
                  name="model"
                  options={{
                    presentation: "formSheet",
                    sheetAllowedDetents: [0.75, 1],
                    sheetGrabberVisible: true,
                    sheetCornerRadius: 24,
                    contentStyle: { backgroundColor: theme.c.sheet },
                  }}
                />
                <Stack.Screen
                  name="unlock"
                  options={{
                    presentation: "formSheet",
                    sheetAllowedDetents: [0.75, 1],
                    sheetGrabberVisible: true,
                    sheetCornerRadius: 24,
                    contentStyle: { backgroundColor: theme.c.sheet },
                  }}
                />
              </Stack>
            )}
            {update.required ? null : <UpdateCard verdict={update} />}
          </ThemeProvider>
        </PhoneColumn>
      </ThemeContext>
    </GestureHandlerRootView>
  );
}
