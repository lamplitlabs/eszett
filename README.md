# Eszett app

The Expo app of Eszett, the German tutor built around `lamplitlabs/licht-german-tutor`. The 3B model runs on the
phone through [llama.rn](https://github.com/mybigday/llama.rn) (llama.cpp) from a GGUF file; the only server is the small one that hands out download links to signed-in learners (see "Business model, accounts and the server").
See the sections below for what the app does and how the model editions were chosen.

## Prerequisites

- Node 20+.
- **iOS:** a Mac with Xcode, and a real iPhone or iPad. Metal (the GPU) is not available in the iOS simulator;
  the simulator falls back to the CPU and is slow.
- **Android:** Android Studio and a JDK; an arm64-v8a phone. The x86_64 emulator works, on the CPU, slowly.
- **The phone:** 6 GB of RAM or more and about 3 GB of free space for the default Q5_K_M edition (a 2.2 GB
  file); 8 GB or more for Q8_0 (3.3 GB). iOS lets one process use roughly half of RAM, hence the margins.
- **Expo Go cannot run the app.** llama.rn is a native module, so you need a development build (below).

## Install and build

```bash
npm install          # llama.rn downloads its prebuilt native libraries (iOS xcframework + Android JNI, about 320 MB) in postinstall
```

If `npm install` ran with `--ignore-scripts`, fetch them by hand: `node ./node_modules/llama.rn/install/download-native-artifacts.js`.

Build and install the development build on a device (this also generates `ios/` and `android/`, which are
gitignored and must not be edited by hand; native behaviour is configured in `app.json`):

```bash
npx expo run:ios --device     # pick the connected iPhone from the list
npx expo run:android          # a connected phone or a running emulator
```

Or in the cloud with EAS (`npx eas-cli@latest build:configure` creates an `eas.json` with a `development`
profile if the project has none):

```bash
npx eas-cli@latest build --profile development --platform ios
npx eas-cli@latest build --profile development --platform android
```

After the native app is on the phone, JavaScript-only changes need no rebuild: `npx expo start --dev-client`.
Rebuild after adding a library with native code or changing `app.json`.

`npx expo start --web` runs the same app in a browser at phone width without the model: drills, grammar cards
and the lexicon work, the tutor itself reports "Not available here".

### A fast release build for one phone

llama.rn ships its arm64 engine in seven variants, one per CPU feature set (`rnllama`, `rnllama_v8`,
`rnllama_v8_2`, `rnllama_v8_2_dotprod`, `rnllama_v8_2_i8mm`, `rnllama_v8_2_dotprod_i8mm`,
`rnllama_v8_2_dotprod_i8mm_hexagon_opencl`; `CMakeLists.txt` in `node_modules/llama.rn/android/src/main`), and
its loader picks the best one the phone's CPU supports (a Galaxy S20 FE loads `rnllama_jni_v8_2_dotprod`). The
engines themselves come prebuilt; what a build compiles is the JNI wrapper of each variant, which is most of the
build time. A release APK for one known phone compiles only the variants it needs:

```bash
cd android && export JAVA_HOME=$(/usr/libexec/java_home -v 17) && ./gradlew :app:assembleRelease --console=plain -q -PrnllamaVariants=rnllama_v8_2_dotprod,rnllama
adb install -r app/build/outputs/apk/release/app-release.apk
```

About two minutes when the native caches are warm; the APK is about 80 MB. The loader tries the variants from
the most specific down and ends at the generic `rnllama_jni` (the `rnllama` entry in the flag), so on another
phone such a build runs the engine without that phone's CPU extensions. A build meant for other phones must
drop `-PrnllamaVariants` so every variant is compiled. `reactNativeArchitectures=arm64-v8a` in
`android/gradle.properties` keeps x86 out of the build; the file is generated, so `npx expo prebuild --clean`
resets it (the same can be passed as `-PreactNativeArchitectures=arm64-v8a`). `EXPO_PUBLIC_*` variables are
compiled into the bundle, so what is in `.env.local` at build time ends up in the APK.

Disk: the ninja object caches in `node_modules/llama.rn/android/.cxx` and `android/app/.cxx` are what makes the
build incremental; deleting them means rebuilding every variant from scratch, which needs several gigabytes
free. When space is short, delete `android/app/build/intermediates/{merged_native_libs,stripped_native_libs,native_symbol_tables,cxx}`
and `node_modules/llama.rn/android/build/intermediates/*` instead; they are regenerated from the caches.

Testing on the phone: if its screen is off when the app is started from `adb`, Android stops the activity at
once and Samsung freezes the process. Wake it first (`adb shell input keyevent KEYCODE_WAKEUP`,
`adb shell wm dismiss-keyguard`, `adb shell svc power stayon usb` for a longer session, `svc power stayon false`
afterwards). On Android 12-13 the system splash can stay up when the activity was stopped during launch;
`src/app/_layout.tsx` shows the app after 2.5 s even if fonts or stores are still loading and asks the splash to
hide again whenever the app returns to the foreground. On a Samsung with Secure Folder set up, `adb shell pm
list packages` and `pm uninstall` without a user fail with `Shell does not have permission to access user 150`;
pass `--user 0`.

## Getting a model onto the phone

The app wants one GGUF of the **light-german-tutor-phone-v27** export, `light-german-tutor-phone-v27-Q5_K_M.gguf`
(default) or `-Q8_0.gguf`. The GGUFs live in the **private** `models-private` container of our Azure storage
account `lichtgwcst001` (resource group `licht`, germanywestcentral); the app gets a short-lived read link for
one file from our server (see "Business model, accounts and the server"), nothing is reachable by URL alone. The
small files next to them - the export manifest, `Modelfile`, chat template, grounding pack, `release.json` and
the lexicon - stay in the public `models` container (anonymous read by URL, no listing). The private `students`
container holds every export and is never referenced by the app.

| Edition | Size | Top-1 agreement with the full model | Phone | |
| --- | --- | --- | --- | --- |
| **Q5_K_M** | 2.2 GB | 96.2 % | 6 GB of RAM | The default: the phone edition. |
| **Q8_0** | 3.3 GB | 98.8 % | 8 GB of RAM | Offered on phones that report 8 GB. |
| Q4_K_M | 1.9 GB | 93.7 % | | Fails the 95 % gate; not shipped. |
| bf16 | 6.2 GB | | | The reference the quants are measured against; not for phones. |

v27 (exported 29 October 2026) keeps v25's base (SmolLM3-3B), chat template, byte-identical system prompt and
24-note grounding pack, so the harness, the prompts and the readers carry over unchanged; its Q5_K_M edition
agrees with the full model on 96.2 % of top-1 tokens (KL 0.015), Q8_0 on 98.8 %. The app retires the v25 files on
the phone at first start and downloads v27 (see "Updating the model on a phone"). v25 was the v24 recipe (same
base, template, system prompt, lexicon and grounding pack) trained on a 10,215-row set that first carried **C2** material, with v24's validation split
held fixed; it is the first student the app offers at C2. On the toolkit's 498-scenario gate set (level,
light-verb, Redemittel, register and Stilbruch batteries, 97 of them C2) it is ahead of v24 on every battery:
shape passes its gate for the first time (0.84 against 0.80; v24 0.74), facts 0.77 against 0.76 (the 0.85
threshold still parks the release, so the harness keeps checking every fact it can), no-loop 0.998, lexicon
0.99, and the C2 battery goes from 0.30 to 0.43 all-ok (facts 0.61 → 0.67, shape 0.59 → 0.69), C1 from 0.34 to
0.42. The system prompt still says "learners from A1 to C1": the C2 battery was gated with that prompt, a changed
prompt would change the model everywhere, and the harness states the level in the first user turn ("I'm at C2
level."), as the gate suite does. v24 was the v23 recipe trained on 10,217 rows (a repeated exam-prep drill) and
on the grounding pack that grew from 18 to 24 notes: Goethe C1 and C2, telc C1 Hochschule, TestDaF, DSH and ÖSD,
with five of the old notes corrected (the Perfekt note no longer says "bekommen → bekommen"). v23 was the same
base trained on a larger rule and lexicon seed set with inline glosses stripped from the answers and a changed
system prompt: gender and plural go "once, in a vocabulary line, never inside a sentence or a role-play line"
where v13 was told to "always mark" them. The C1 probes of v24 still showed explanations that are wrong in a
detail, glosses inside example sentences and one answer that repeats a quoted block until the token limit; the
engine's loop guard (`src/model/repetition.ts`) ends such a generation at the first copy.

**Updating the model on a phone.** At start the app deletes from its `models/` folder every export of another
student (complete or `.part`, see `isRetiredModelName`) and lexicons of other revisions, forgets a chosen file
that went with them and a paused download of another file, and then downloads the current edition as on first
open. So an update from the v13 build leaves no 2.2 GB behind. Other quantisations of the current student and
files that are not our exports are left alone; a file the learner dropped into the Documents root is never
touched.

**On first open the app downloads the phone edition by itself** (Wi-Fi recommended; 2.2 GB). **Me › Your tutor**
(the `/model` sheet) shows the progress and lets the learner pause or cancel; a download interrupted by killing
the app resumes on the next launch, a failed one (no network) is tried again on the next launch, and a
**cancelled** or **removed** model is not downloaded again by itself: tapping **Download** there starts it, and
turns the automatic download back on. The sheet also shows the file in use, the GGUF files found on the phone
and the three ways to get one:

1. **Download from our storage.** The app asks the server for a link to
   `light-german-tutor-phone-v27/gguf/<file>` (`POST /v1/download-url`; the learner signs in first, and the
   account's entitlement decides) and downloads it to its Documents folder (the file names and sizes come from
   `src/data/model.json`, built by the data pipeline below). The download runs as an
   iOS background session, can be paused, and resumes on relaunch (a paused download asks for a fresh link when
   the old one has expired); it refuses to start when free space is below
   the file size plus 500 MB. When it finishes the app compares the file's size with the export manifest; a
   file that is short or long (a captive portal's page, a connection that ended early, a different file at a
   custom source) is deleted and reported as "The download is incomplete". A build without
   `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and `EXPO_PUBLIC_API_BASE` has no account and therefore no link: it can
   only download from a source of its own (way 3).
2. **Sideload a file.** Any `*.gguf` dropped into the app's Documents folder is picked up: on iOS through the
   Files app (On My iPhone › Eszett) or Finder file sharing when the phone is plugged in; the app rescans when it
   returns to the foreground without a model. Or tap **Choose a file…** in **Me › Your tutor** to pick a GGUF with
   the system picker; it is moved into the app's `models/` folder. Before loading a chosen file the app reads
   its GGUF header: a file whose `general.name` is another model is refused ("This file isn't the Eszett tutor
   model"); a file without a readable name is given the benefit of the doubt.
3. **A computer on the Wi-Fi as download source.** In the folder that contains the `.gguf` files run
   `python3 -m http.server 8000`, then set the **Download source** in **Me › Your tutor › Advanced** to
   `http://<laptop-ip>:8000` and download as in 1. The app requests `<source>/<file>` and checks the finished
   size against the export manifest, so serve the v27 files themselves under the names above.
   (`NSAllowsLocalNetworking` on iOS and `usesCleartextTraffic` on Android exist for this.)

Where the file lives: `Documents/models/<file>` (a `.part` file while downloading; sideloaded files in the
Documents root are used in place). Documents survives cache purges and, on iOS, is included in the iCloud backup,
so **Remove** in **Me › Your tutor** when the model should go. The app remembers the chosen file in its settings.

The bundled data (`src/data`) comes from two places: the lexicon from Hub revision v16 of the data release
(byte-identical to the one in the v27 export), and from the export itself the grounding notes
(`grounding.json`, the pack the student was trained with — the Hub's v16 pack is the fallback for an export
that does not publish one; `model.json.grounding_source` says which was used), the system prompt from the
`Modelfile` (the SYSTEM block the student was trained with) and the chat template from `chat_template.jinja`,
all published next to the GGUFs. At load the app compares the GGUF's embedded chat
template with the bundled one; when they match, prompts are rendered by `src/harness/template.ts`, otherwise by
llama.rn's Jinja renderer from the file's own template. After the model is ready the app downloads the full
lexicon (`lexicon.json`, about 4.5 MB, 88k nouns) from our storage (`models/data/v16/lexicon.json`, a copy of
the Hub's file at that revision; the Hub itself is the fallback) into `models/`; until then
answers are checked against the bundled core.

## How a generation runs

`src/model/engine.ts` loads the file with `initLlama` (context 4,096 tokens, batch 512, all layers on the GPU,
`mmap`, no `mlock`), reads the GGUF metadata (name, version, chat template), and, in place of a warm-up, primes
the cache with the system prompt (below; a two-token completion when the file's template is not the bundled
one). Generation is greedy (`temperature 0`, `top_k 1`, no repetition penalty), stops at `<|im_end|>` or at the
harness's `stopWhen` (translations after one line, word lists after six items, free text at a sentence end once
most of the budget is used, …) or when the model starts looping (`src/model/repetition.ts`: the same block of
one to six lines, or the same sentence, three times in a row — the answer is cut back to the first copy; greedy
decoding never leaves such a loop by itself, and v24 fell into one on a C1 Passiversatz question), and streams
the text to the screen. One generation runs at a time; a foreground
request aborts a running background one (the lesson plan, a cache prime) and goes first. Three watchdogs stop a
hung model (120 s to the first token, 30 s between tokens, 180 s for a prime); they are `watchdog` in
`src/model/watchdog.ts`, which re-arms a timer that fires more than 5 s late instead of calling it a stall —
Android (Samsung after about a minute) freezes an app left in the background, and on return every pending timer
fires at once although the model never had its window. The harness interface is
`Generate` in `src/harness/tutor.ts`; the engine implements it, the tests pass a stub.

### Priming the cache

llama.rn keeps the KV cache of the last prompt and, on the next one, reuses the longest common token prefix
(`find_common_prefix_length` in its `rn-completion.cpp`), so only the tokens after it are evaluated. The engine
uses this to do prompt work before the prompt exists:

- `engine.prime(prompt)` evaluates a prefix into the cache. It is a completion with `n_predict: 1`: the one
  sampled token makes llama.cpp book the prompt timings (it does so only when logits are read, so a zero-token
  prime reported nothing and the next request was charged with the prime's evaluation on top of its own), and
  llama.rn trims that token from its token list again, so the cache holds exactly the prompt. Primes are
  background work: a foreground request interrupts a running prime and still inherits what it had evaluated, a
  new prime drops the primes still queued and interrupts a running one it does not extend. Nothing is primed
  when the file's chat template is not the bundled one (the prompt text is then rendered by llama.rn, not by the
  app, so the app cannot know what it begins with).
- `engine.setHomePrefix(() => tutor.prefixText())` registers the beginning every ordinary prompt shares: the
  system prompt in the chat template up to the open user turn (`renderChatPrefix` in `src/harness/template.ts`,
  about 150 tokens). It is primed right after the model loads and, once the queue is empty, re-primed whenever a
  job with a different beginning (the lesson planner has its own system prompt) has pushed it out of the cache.
- `Tutor.prepare(text, ctx, intent)` primes what the prompt for the text being typed will begin with: the system
  prompt and, in the `'before'` note layout, the rule note the router would attach to the text so far (for a
  correction the note `correctionNote` picks; a translation carries none). `prepare` in `src/features/chat.ts`
  calls it from the Tutor tab 400 ms after the last keystroke (`PREPARE_AFTER_MS` in `src/app/(tabs)/tutor.tsx`),
  never while an answer is being written.

The engine's statistics (`EngineStats`) tell the two kinds of prompt work apart: `primes` counts primes that ran
to the end, `promptTokens` and `promptMs` the prompt work over requests and primes, `lastPromptTokens`,
`lastCachedTokens` and `lastPromptMs` what the last generation's prompt had, how much of it the cache held, and
how long the rest took.

### Where the rule note goes

A grounded prompt carries a rule note from `grounding.json` (350-900 tokens). The model was trained with the note
*after* the question (`NoteLayout` `'after'` in `src/harness/grounding.ts`: question, separator, header, note),
where it can only be evaluated once the question has been sent. `src/model/runtime.ts` sets
`tutor.setLayout('before')`: header (reworded to "answer the question below"), note, separator, question. The
note is then part of the prefix `prepare` primes while the learner types, and the question itself is all that is
left to evaluate when it arrives. Measured on a Galaxy S20 FE (Q5_K_M, CPU, self-test group K, six prompts,
five of them grounded): prompt evaluation runs at 24-25 tokens/s and generation at 6-7; the first word of a
grounded answer came 22-33 s after the send with `'after'` and comes 1.5-1.9 s after it with `'before'`, the
note's 22-34 s of evaluation having happened during typing; the prompt without a note takes 0.2-1.3 s either
way. The answers of the two layouts were roughly on a par on the six prompts (the same model-side errors appear
in both); `'after'` stays available for the comparison.

### Reading and checking the answers

- **Translations** go both ways (`Tutor.translate`): an English line gets the trained "How do I say this in
  German?" prompt, a German line the gloss prompt ("Translate into English, only the translation"); the result
  says which (`to`), and the Tutor tab labels the message accordingly ("Say it in German" / "Say it in English",
  "In German" / "In English"). The direction follows `detectLang` on the text, after the "how do I say" framing
  and quotes are stripped.
- **Word lists** (`parseVocabList` in `src/harness/parse.ts`) are read in both shapes the model writes: numbered
  heads ("1. das Brot (die Brote) – bread", "**1. die Erfahrung, -en** (experience)") with the example sentence
  on a line below, or bulleted heads when there are no numbers. Under a numbered head, bullets are the item's
  example and notes, not further items; the plural may be given in full or as a dictionary suffix (", -en",
  "(¨-er)", ", -" for no change, the umlaut applied to the lemma); a parenthesis without a German noun is the
  meaning; a line about the word ("… is feminine and takes die in the plural") is not taken for an example.
  `vocabListComplete` (the early stop) waits for the n-th item's example line to end. **Phrases**
  (`parsePhrases`) take the gloss inline (parenthesis, " / ", a dash) or on the next line in any of its shapes
  ("(…)", "- …", "→ …", "*…*", a quoted line, "Translation: …", or a bare line that reads as English); a dangling
  dash, colon or slash is trimmed. **Corrections**: a "Fix: 'x' -> 'x'" line that changes nothing is dropped
  from the explanation when the sentence came back unchanged.
- **Agreement** (`agreementFindings` in `src/harness/lexicon.ts`, finding kind `agreement`): `der/die/das` +
  adjective in -e + noun must match the noun's gender; for ein-words (`ein kein mein dein sein unser`; `ihr` is
  left out because it is also a pronoun) a table of determiner ending × adjective ending gives the genders the
  pair can agree with, and a bare ein-word + noun is judged on the endings that are unambiguous (`ein` m/n,
  `eine` f, `einen` m). Only adjectives in `ADJECTIVE_STEMS` (about 250 stems, comparatives and superlatives
  included) are judged, so a relative pronoun followed by an adverb or a verb never looks like a noun phrase;
  plural forms, quoted spans and a wrong form contrasted with the right one are skipped; the noun's gender comes
  from the lexicon directly or through the last part of a compound. The finding names the correct forms.
- **Scene lines** (`readCounterpartLine` in `src/harness/roleplay.ts`) get two more tells: `regreet` (the line
  opens with a greeting although the counterpart has spoken before; the greeting is stripped from the line and
  its gloss, not blocking) and `repeat` (the line, greeting aside, equals or contains/is contained in an earlier
  line of the counterpart, 30 characters or more; blocking, so `sceneTurn` retries with another frame).
  `invented_figure` allows a fact price times a quantity the dialogue mentions (2-12, digits or words), besides
  the figures in the facts and the dialogue and small counts up to 12.
  `learnerSideOnly` filters a model-written suggestion (`suggestReplies`): no greeting once the learner has
  spoken, no sentence the counterpart already said or that states one of the card's facts, at most two
  sentences; the English gloss is kept only when the line was kept whole, and `[]` is returned when nothing is
  left.

### What the model writes

Four things the app used to ship only in bundled form are also written by the model on request
(`src/harness/authoring.ts`, prompts in `src/harness/prompts.ts` under "authoring", methods on `Tutor`):

| | Asked as | Read back by | Checked | Kept in |
| --- | --- | --- | --- | --- |
| **Scene card** (Scenes › Your own scene) | labelled lines: situation, place, roles, register, `Facts:` bullets `label (German) \| label (English) \| value`, opening line and gloss | `parseSceneDraft` | role gets its article from the lexicon (`roleWithArticle`); *der/die/das* + noun in the facts and the opening held against the lexicon (`germanFindings`); register defaults to *Sie*, the learner's role to *der Kunde*, each noted | `useAuthored().scenes`, with `notes` and `warnings`; `beats: []`, so reply suggestions come from the model |
| **Writing task** (Practice › A task from your tutor; `/write/new`) | title, task in both languages, `Content points:` bullets `point (English) \| key words` | `parseWriteTaskDraft` | key words lose articles and dictionary notes and are normalised like the precheck normalises the learner's text (`normalise`), 3-30 characters, the longest content word of a phrase counting on its own; two points at least; the word range comes from the level; an explicit *du-Form*/*Sie-Form* in the task text sets the register | `useAuthored().tasks` |
| **Grammar card** (Practice › A card on any topic; `/grammar/new`) | title and rule in both languages, `Examples:` bullets `German \| English`, `Pitfall:` bullets `wrong \| right \| why` | `parseGrammarCardDraft` | an example the lexicon disagrees with is dropped (`dropped`, shown on the card); two clean examples needed; a pitfall whose right side has a finding, or is a translation rather than a correction, is dropped; the router attaches a rule note when the topic matches one (`grounded`) | `useAuthored().cards` |
| **Vocabulary topics** (New words › More topics from your tutor) | a numbered list, stopped once n usable topics stand on finished lines | `parseTopics` | short English names without the German noun the model glosses them with; a word list instead of topics is rejected; a topic sharing a content word with the current list ("at the doctor's" next to "health and the doctor") counts as a repeat | `useAuthored().topics[level]` |

A draft the parser cannot read is retried once with a reworded prompt (greedy decoding would otherwise repeat
the same draft), then surfaces as `DraftError` with the draft attached; the box shows why and can unfold what
the model wrote. Field names are matched exactly first and loosely second, and a loose match never crosses
languages ("Opening (English)" is not the German opening line, "Rule (German)" is not the English rule).

The prompts and the reader were tuned against the students themselves (v13, then v23; v24 to v27 share v23’s system
prompt, template and lexicon, so the tuning carries over), on the phone and then
in a local loop (the same Q5_K_M GGUF under `llama-completion` with the app's rendered prompt and greedy
sampling, 3-12 s a draft against ~150 s on the phone). What that showed, and what the code does about it: the
model ignores "exactly these lines" unless the prompt names the labels *and* what not to add (no vocabulary
list, no phrases, no tips, no model text), so every authoring prompt does both; it dresses labels in Markdown (`# Situation:`, `**Their
role** (German):`, `**Title** – value`), puts a value on the line after its label, glosses a line in brackets
underneath, appends the register to a role (*der Kunde / die Kundin, Sie*), adds dictionary notes to its German
(*die Jacke, -n*; *pl. die Heizungen*; *nur Singular*) and sometimes a `~~wrong~~`; for a writing task it
prefers the exam's German *Aufgabe* (title, instruction paragraph, "Schreibe etwas zu diesen Punkten:" with
`point | key words` lines, sometimes a *Translation* block), for a grammar card its own card (`German — English`
examples, a one-line *Wrong – … Right – …* pitfall), and for topics a numbered list with a German noun in
brackets. `fieldLines`, `bulletsAfter`, `bulletRuns`, `stripMd`, `stripDictNotes`, `cleanRole`, `cleanPlace`,
`quotedOpening` and `readContentPoints` read all of these; a task in German only is kept with the English side
showing the German. What stays with the model is noted in the wishlist: invented words, a misread description,
role confusion in an opening line, and grammar rules that are simply wrong (adjective endings after *ein*) -
the lexicon can check the gender in an example, not the rule above it.

v23 added two habits of its own, and two answers. Told "you play the other person", it starts the role-play
instead of writing the card (an opening line alone, or a whole dialogue), and for a writing task it sets the
German *Aufgabe* as a Markdown page or as one paragraph without labels. So the scene and task drafts are
**prefilled**: `GenerateOptions.prefill` puts the first label (`Situation (German):`, `Title:`) after the
assistant tag, the model continues the card, and the label is part of the text the reader gets (only on the
path where the app renders the prompt itself; the Jinja fallback for a file with another template goes without).
And who speaks first is said twice, in the ask ("their role is the other person, who speaks first") and in the
example's label (`Their first line (German):` instead of `Opening line`), because v23 otherwise writes the
customer's, tenant's or employee's line as the opening and now and then swaps the two roles. With that the
local corpus of 37 drafts (6 grammar cards, 9 scenes, 18 writing tasks, 4 topic lists) parses at **36 of 37**
on v23 (v13: 32), the miss a topics retry that repeats topics the learner already has, which the reader drops
on purpose.
`germanFindings` is stricter than `checkText` on purpose: `checkText` judges citations only, because in running
text the article changes with the case, while a generated sentence is held against the pairs that are wrong in
every case (*die* with a masculine or neuter singular, *das* with a masculine or feminine, *der* with a neuter
singular), skipping an article after a comma, where *die*/*das* may be a relative pronoun. Generated items count
in the lesson plan like bundled ones (`features/lesson.ts`), the detail screens look them up before the bundled
list, and each can be deleted from its screen. Drill answer keys, the bundled scenes' facts and beats, and the
fixed lesson plan stay deterministic: there the lexicon and the engines are right and the model is not always.

### What the next student should learn

What the harness still works around, and what a course with every skill needs from the model, in the order it
would pay off (the app's prompts in `src/harness/prompts.ts` are the training templates; the local corpus and
`DraftError` logs the evidence):

1. **Format fidelity on the app's own prompts** — the labelled-line drafts (scene, task, card, reading, topics)
   exactly as asked, nothing added; today prefill and one retry patch it, and each miss costs a minute on a phone.
2. **Reading texts by level** — the Titel/Text/Frage/Antwort shape at each `READING_WORDS` band, answers that stand in
   the text, plausible distractors, short sentences at A1–A2 (the texts are listened to before they are read).
3. **Structured writing feedback** — `wrong | right | why (rule key)` lines plus a verdict in the Goethe rubric's
   columns (task, coherence, vocabulary, structures) instead of free-form correction, so the app can score a text,
   keep a mistakes notebook and show a trend per skill.
4. **Cite the rule, admit ignorance** — refer to `grounding.json` keys in explanations; "I am not sure" rather than an
   invented word or a rule that is wrong (the wishlist's first item).
5. **Recognizer-shaped input** — correct lower-case, unpunctuated transcripts as the speech recognizer delivers them;
   "simpler" / "more formal" rephrasings on request.
6. **Scene consistency** — keep roles and facts across turns (role swaps still happen).
7. **Speed** — a smaller edition at ≥ 95 % top-1 agreement (about 4 tokens a second on a 2020 phone means a minute per
   reading text), and reliable stop markers so early stopping is safe.

## Data pipeline

```bash
node scripts/build-data.mjs [revision] [student]     # default: v16 light-german-tutor-phone-v27; also: npm run build-data
```

Fetches from the Hub at the pinned revision: `lexicon.json` (→ `src/data/lexicon-core.json`, A1-C1 nouns with
meaning and example plus all irregular verbs — the release has no C2 tier — at C1 only nouns the corpus has seen (`freq >= 1`; the tier was
harvested from course texts and otherwise carries one-off compounds and proper nouns), the same rule `drillable`
in `src/harness/lexicon.ts` applies to the full file; the full file is kept in `.model-cache/` for the tests) and
`grounding.json` (the rule notes, the fallback). From our storage it fetches the student's `gguf/gguf_manifest.json`
(→ `model.json.gguf`: the student, the base URL and, per edition, file name, size, sha256 and top-1 agreement),
`gguf/Modelfile` (its SYSTEM block → `model.json.system_prompt`, the prompt the student was trained with; the
Hub export manifest's `system_prompt` is the fallback for exports without a Modelfile), `chat_template.jinja`
(→ `model.json.chat_template`, the text the renderer and the engine compare against; falls back to the Hub's and
warns when the two differ) and `grounding.json` (→ `src/data/grounding.json`: the pack the student was trained
with wins over the Hub's, with a warning that names the notes the Hub release does not have;
`model.json.grounding_source` records the choice). The router (`src/harness/grounding.ts`) is table-driven, so
new notes and routing rules need no code; `rules.ts` looks four bullets up by their first words (`Always
Akkusativ`, `Wechselpräpositionen`, `sein is used`, `All other verbs`), which the harness tests check. The script enforces the export gate: an edition under 95 % top-1 agreement with the
full model makes it fail rather than ship. Commit the result; the app bundles `src/data`, and
`src/harness/prompts.ts` takes its default system prompt from `model.json`, so the harness cannot drift from the
export.

### Publishing a new student

The GGUFs of every export sit in the private `students` container. A student the app should run is copied,
server-side, into two places: the shipped GGUFs (with the manifest, `SHA256SUMS` and the `Modelfile` the server
reads next to them) into the private `models-private` container, which only the server's links can read; and
the small files the app and the data pipeline fetch by URL - the manifest, the Modelfile, the chat template and
the grounding pack - into the public `models` container:

```bash
S=light-german-tutor-phone-v27
copy() { az storage blob copy start --auth-mode key --account-name lichtgwcst001 \
  --destination-container "$1" --destination-blob $S/$2 --source-container students --source-blob $S/$2; }
for f in gguf/$S-Q5_K_M.gguf gguf/$S-Q8_0.gguf gguf/gguf_manifest.json gguf/SHA256SUMS gguf/Modelfile; do copy models-private $f; done
for f in gguf/gguf_manifest.json gguf/SHA256SUMS gguf/Modelfile chat_template.jinja; do copy models $f; done
# grounding.json lives in the export's -collect folder: copy it as $S/grounding.json (v24 to v27: students/$S-collect/$S/grounding.json)
node scripts/build-data.mjs v16 $S     # the Hub revision of lexicon/grounding, then the student
az functionapp config appsettings set -g eszett -n eszett-gwc-func-001 --settings MODEL_STUDENT=$S   # the server's current student
```

Never put a GGUF into `models`: the public container is listed nowhere, but a URL is a URL.

Then run the tests (`manifest.test.ts` pins the student, the file names, the sizes, the sha256 of the phone
edition, the grounding source and the system prompt: update its expectations) and rebuild the app. Only quantisations with at least 95 % top-1 agreement go into the
container (the script refuses the rest); Q4_K_M never qualifies and bf16 is not a phone file. On the learners'
phones the new build deletes the previous student's files at start and downloads the new edition (see
"Updating the model on a phone" above); a student whose export file names do not follow
`<student>-<quant>.gguf` would escape that rule (`isRetiredModelName` in `src/model/manifest.ts`).

### The word list

```bash
node scripts/build-words.mjs                          # → src/data/words.json, from the content data and model-words.json
llama-server -m /tmp/v25.gguf --port 8080 -ngl 99 -c 16384 --parallel 8 -fa on   # the release GGUF, served locally
PARALLEL=8 node scripts/model-words.mjs               # → src/data/model-words.json (about an hour on an M2 Pro; SMOKE=1 for two topics, VERBOSE=1 lists the rejections)
```

Word tiles and Five letters check words against `src/data/words.json`, which `scripts/build-words.mjs` builds
from what the app already ships (every form in the cards, scenes, stories and questions, the lexicon's nouns
with their curated gender and plurals, the level a noun is first met at, a hand-written list of closed-class
words and the commonest adjectives) plus the words the app's own model names. Scrabble word lists are
licensed, so `scripts/model-words.mjs` asks the release GGUF instead — served on the Mac with llama.cpp (the
header of the script has the download command; the phone cannot be asked at build time), greedy sampling,
fixed seed, the app's system prompt, so a run is reproducible. Per level and topic the model lists everyday
adjectives, verbs, adverbs and nouns with an English meaning; only a word it volunteers this way becomes a
candidate, and the candidate then has to survive independent checks, because the 3B model is a lenient judge
on its own (it will explain almost any string, and waves *schneller* or *versatile* through as dictionary
forms): judged alone under a JSON schema it must give the same dictionary form and part of speech, and a
meaning that agrees with the list's; where the meanings disagree, the app's "What does X mean and how do I
use it?" prompt must use the word in a sentence and give a meaning that agrees with one of them; an
infinitive must end in -en/-ern/-eln; an adjective or adverb that is another kept word plus an ending is
dropped as that word's form. Nouns are kept only when the lexicon's gender table attests them (it stays the
authority on gender, and on meaning where it has one — the model's meaning fills in for the ~1 100 attested
nouns the described tier does not cover, *Kind*, *Tisch*). `build-words.mjs` adds two checks against the
app's own texts: a word spelled exactly like its English meaning (*funky*, *spacious*) counts only if the
German texts use it, and an adjective that is a text word plus an ending (*laute*) is that word's form.
Inflection is by rule (`scripts/lib/verbs.mjs`, shared with `build-words.mjs`): adjective declension,
comparison with umlaut and the irregular comparatives, regular verb paradigms, separable verbs composed
from their known base (*aufstand* from *stand*). The model is asked for principal parts too, but the answer
is trusted only when it is exactly the weak pattern — the 164 lexicon verbs calibrate it (137 reproduced
exactly, one strong verb given weak forms) and for rarer strong verbs it invents (*joggen → gelaufen*,
*anrufen → gecallt*) — so a strong verb nobody knows the parts of gets its present tense only.
`model-words.json` is a reviewable artifact (one line per word with meaning, level and the `regular` mark)
and is not bundled; `words.json` carries `forms` (the texts' lowercase forms), `nouns`, `plurals`, `levels`,
`meanings` (lemma → meaning) and `lemmaOf` (inflected form → lemma), so a laid *schnelle* shows "schnell ·
fast" and *besser* "gut · good". Both scripts and the lists are regenerated, not edited: fix a rule and
re-run (a rerun replays the cached answers in `.model-cache/` and needs no server unless a prompt changed).

## Levels

`src/harness/levels.ts` is the one place that knows the levels: `LEVELS` (`A1 A2 B1 B2 C1 C2`), `TOP_LEVEL`, the
`LEVEL_INFO` cards (name, can-do line, example sentence; `LEVEL_INFO_DE` for German, the overlays for the rest),
`cefrOf` (reads the lexicon's sublevels, `B2.1` → `B2`, and returns null for anything outside the list), the order
helpers `atOrBelow` / `atLeast`, and `levelSentence`, which states the level the way the training prompts do
("I'm at C2 level."). Every per-level table is typed `Record<Level, …>`, so adding a level is a compile error
until each pool has its entry: `SUGGESTIONS` (Tutor), `WORD_TOPICS` and `WORD_TOPIC_KEY` (`src/features/topics.ts`, with a
`topics.*` catalog key each), `VERB_LEVEL_POOL` (drills), `WORDS_FOR_LEVEL` (authoring), `STORY_OPENERS` and the
talking points (`together.json` is checked to hold topics × levels × 5), the `levels.<L>` block of every content
overlay. The authored store's `topics` is keyed by level too; `migrateAuthored` (`src/state/authoredMigration.ts`,
persist version 2: C1 came with version 1, C2 with version 2) gives a store saved before a level existed its slot.

**C1** came with the v23 student and **C2** with v25. The students' own system prompt still says "learners from
A1 to C1" (left as trained, see "Getting a model onto the phone"); the harness states the level in the user turn,
the way the toolkit's C2 battery does, and the Tutor answers at that level. Adding a level takes a student gated
at it, a `LEVELS` entry (every `Record<Level, …>` table then fails to compile until it has its row) and content in
all twelve languages; `mentionsUnsupportedLevel`, which used to turn a C2 request into "not trained for C2",
went with the C2 level. What C1 rests on:

- *Lexicon*: the Hub lexicon's C1 tier was harvested from course texts and carries one-off compounds and proper
  nouns ("Chinabaum", "Geissenpeter"), so `scripts/build-data.mjs` and `drillable` keep only C1 nouns with
  `freq >= 1` (135 of 192 in the v16 release; the A1-B2 tiers are curated lists and go in as they are). A few C1
  meanings in the release are thin ("Stand" → stand, "Messlatte" → bar, "Trumpf" → trump) or crude ("Mist" → shit, at A1) and a few everyday words
  are tagged C1 ("Ding", "Sache", "Form"): a matter for the data release, not for the app.
- *Content*: five grammar cards (`nominalstil-verbalstil`, `partizipialattribut`, `passiversatz`,
  `subjektive-modalverben`, `konjunktiv-i-redewiedergabe`), three formal scenes (`salary_negotiation`,
  `rent_increase`, `town_hall_traffic`), two writing tasks (`c1-letter-to-editor`, `c1-statement-management`; the
  precheck strips the formal *Ihr/Ihnen* before it looks for a stray *du*), 24 talking points, ten taboo cards and
  four story openers, three Tutor suggestions and six word-list topics, all translated into the ten content
  languages and the twelve UI catalogs.
- *Grounding*: the v24 pack adds exam notes for **Goethe C1 and C2, telc C1 Hochschule, TestDaF, DSH and ÖSD**
  to the Goethe A2-B2, telc B1-B2 and DTZ notes, and routes `c1`/`c2` level questions to them; the grammar notes
  still stop at the passive (nothing on Konjunktiv I, Nominalstil or subjective modal verbs), so C1 grammar
  questions reach the model ungrounded until the data release adds those notes.
- *Model*: the v24 student was trained with a C1 battery and probed at C1 (Q5_K_M, 12 prompts): Konjunktiv I,
  Nominalisierung and Funktionsverben are answered correctly, but explanations slip in a detail ("wegen"
  called dative, "geschweige denn" glossed as "never mind", a Partizip-zu rewrite with the wrong participle),
  examples still carry inline glosses ("der Bus, -se"), and one Passiversatz answer repeated its quote block
  until the token limit — the engine's loop guard now ends such an answer at the first copy. On the phone
  (Q5_K_M, 7 tok/s) the same Passiversatz rewrite came back with three correct variants and no loop when asked as
  an English question, but the bare German instruction ("Formuliere ohne Passiv: …") still returned the passive
  sentence unchanged with an invented rule; Konjunktiv I
  reported speech was right and grounded on its rule card, the Goethe C1 / TestDaF-vs-DSH questions were answered
  from the new exam notes (with slips the notes do not cover: TestDaF attributed to the Goethe-Institut, an
  invented Netherlands/Luxembourg rule), "geschweige denn" was again glossed "never mind" with an invented
  etymology, and a C1 correction fixed the `dass` word order but listed a second "error" whose wrong and right
  examples were identical — the model's habit of padding the explanation, not the parser's. The next student
  drops in with `node scripts/build-data.mjs v16 <student>` after the copy in "Publishing a new student" (then
  update `manifest.test.ts` and rebuild).

What **C2** rests on:

- *Lexicon*: the data release has no C2 tier, so the C2 noun pool is the C1 pool (`nounsUpTo(…, 'C2')` adds
  nothing; `drillable` applies the `freq >= 1` rule to C1 and C2 alike) and C2 word lists come from the model
  (`WORD_TOPICS.C2`: philosophy and ethics, finance and markets, medicine and bioethics, language and
  linguistics, history and remembrance, diplomacy and international relations).
- *Content*: five grammar cards (`paronyme-scheinbar-anscheinend`, `funktionsverbgefuege`, `stilebenen-register`,
  `erzaehltempora-erlebte-rede`, `gehobene-praepositionen`), three formal scenes (`press_interview_study`,
  `publishing_contract`, `tax_office_objection`), two long writing tasks (`c2-objection-bank-fees`,
  `c2-expert-statement-council`, 220-320 words), 24 talking points, ten taboo cards (Gratwanderung, Zwickmühle,
  Sündenbock, Vergangenheitsbewältigung, Zeitgeist, Weltanschauung, Elfenbeinturm, Verschlimmbesserung,
  Torschlusspanik, Schlupfloch — none is in the core lexicon, so every overlay glosses them) and four story
  openers, three Tutor suggestions and six word-list topics, all translated into the ten content languages and
  the twelve UI catalogs.
- *Grounding*: the pack is v24's; the Goethe C2 exam note is its only C2 note, so C2 grammar questions reach the
  model ungrounded.
- *Model*: the gate suite's C2 battery (97 scenarios) stands at 0.43 all-ok, facts 0.67, shape 0.69 — the same
  order as C1 (0.42 / 0.70 / 0.88) — so expect the same kind of slips: a detail wrong in an explanation, an
  invented figure in a role-play line (the scene reader drops those), a gloss inside an example sentence.

## The learning path

**Today › Your course** (and the first row of Practice) is a guided course for the learner's level, one week at a
time: `src/data/path.json` holds 56 weeks — ten each for A1, A2, B1 and B2, eight each for C1 and C2 — and
`src/harness/path.ts` reads them. A week is a German title, a can-do goal and seven to eleven steps grouped by skill in
the rhythm a course book keeps (`SKILLS`, `stepsBySkill`): **Wortschatz** (a word list, `/words?topic=`),
**Grammatik** (a card), **Üben** (a drill), **Fragen** (a question for the Tutor tab, `/tutor?q=`, prefilled in the
composer, sent in the tutor's language and shown in the app's), **Lesen & Hören** (a text the tutor writes,
`/read?topic=`, then a dictation of the week's scenes, `/listen?unit=`), **Sprechen** (the week's sentences to say,
`/speak?unit=`, then a scene, or a scene the tutor writes for a given situation, `/scenes?own=`),
**Schreiben** (a writing task — every week has one, 57 in all, each in the shape of a Goethe/telc writing part on the
week's topic: a message, email, letter or forum post whose greeting, sign-off, length and content points the app
checks before the tutor corrects the language) and the **Lerncheck** (`/path/check/<week>`). Each route carries
`path=<week>:<step>`, and the screen marks `path:<week>:<step>` done in the progress store the way it marks the
daily lesson's activities (the drill's last item, the card's exercises, the scene's end, the sent text, the finished
list, the question sent, the sentences said, the scene written, the three questions answered, the check finished). A grammar card, scene
or task finished outside the course counts for its step too (`stepDone`), so nothing is asked twice. Nothing is
locked: the course screen (`src/app/path/index.tsx`) marks the first unfinished week as current, the week screen
(`src/app/path/[unit].tsx`) its first unfinished step, and when every week of a level is done the course offers to
move the level up (C2 ends with a bow). The Today card (`src/features/CourseCard.tsx`) shows the current week and
its next step.

**Today's lesson follows the course.** While a week is in progress, the day's lesson is that week's next slice: up
to four of its unfinished steps, in order (`coursePlan` in `src/features/lesson.ts`, `plannedBy: 'course'`), so
a week is a few days of lessons and the Today list and the course share one progress. "Plan again" hands the rest
of the day to the tutor's own plan; once the level's course is done, the tutor plans every lesson as before.

**Lesen & Hören** (`src/app/read.tsx`, `src/harness/reading.ts`): the tutor writes a short German text on the week's
topic at the level (50–80 words at A1 up to 210–260 at C2, `READING_WORDS`) with three multiple-choice questions, as
a labelled draft read by shape (`parseReadingDraft`; a draft without the shape is asked for once more in other
words, like the other authoring drafts) — the text's nouns are checked against the lexicon like any answer, and the
questions are checked by the app, never by the model. The text stays hidden at first so the learner can listen to it
(the device's German voice) before reading it; every word of the text opens the word sheet; the score goes to the
`reading` area of the progress store (Me › Progress). The text is kept on the phone with its questions
(`src/state/authored.ts` `readings`, by the step that asked for it, the newest sixty), so the step opens again at
once — a minute of writing on a phone is not asked for twice — and "another text" is the learner's choice.

**Sprechen** (`src/app/speak.tsx`, `src/features/dictation.ts`, `src/harness/speaking.ts`): every week's Sprechen
section opens with the sentences to say — the first line of each beat of the week's scenes (what the learner says
in the situation) and the grammar cards' example sentences, up to eight (`speakSentences`). The phone's German
voice reads a sentence, the learner says it, and the phone's own speech recognizer (Apple's SFSpeechRecognizer /
Android's SpeechRecognizer through `expo-speech-recognition`, `de-DE`, **on the device only** — recognition that
would send audio to a server is never requested, so a phone without the offline German pack is told so and, on
Android 13+, offered the download; the missing pack is seen in the recognizer's installed locales where Android
reports them, and otherwise in the `language-not-supported` error of the first turn) writes down what it heard; `compareSpoken` normalises both sides the way the
drills compare answers, spells the recognizer's digits out, aligns the words by longest common subsequence and
shows the sentence with the words that were not heard underlined — four words in five count as clear, and the
score goes to the `speaking` progress area. Without a usable recognizer (the web, no permission, no pack) the step is
listen-and-repeat, marked by hand. The same recognizer is the **microphone in the composer** (`src/ui/Composer.tsx`
`dictation`, `useFieldDictation`): the learner can speak their line in a scene, a sentence to check in the Tutor
tab, and the German in Talk and Story; what is heard replaces what was typed since the mic was pressed, and can be
edited before sending. When only the offline German pack is missing, the microphone stays, dimmed, and pressing it
offers the download rather than hiding the feature. `expo-speech-recognition` is a native module, so like llama.rn it needs a development
build; its config plugin (`app.json`) adds the microphone and speech-recognition permission texts.

**Hören** (`src/app/listen.tsx`, `listenSentences`): a dictation of what the other person says in the week's scenes —
the opening line, then each beat's reply with its gloss, up to six (a week without a scene takes the cards'
examples). The phone's German voice reads a sentence, as often and as slowly as the learner likes ("Slower" reads at
three quarters of the usual rate), the learner writes what they heard, and `compareSpoken` aligns it the way the
Sprechen step aligns speech, with the missed words underlined — but written, the sentence counts only when every
word is there (the recognizer's four-in-five allowance is for speech); the score goes to the `listening` progress area. A
phone whose voice fails (no German language data) is told what to install, with a button to the speech settings
(`onSpeechError`, `openSpeechSettings` in `src/ui/speech.ts`).

**Reading aloud** (`src/app/readaloud.tsx`, `src/harness/readAloud.ts`; "Read it aloud" on a reading step once its
text shows): the text sentence by sentence into the phone's recognizer, each sentence compared with the text the way
Sprechen compares speech (`compareSpoken`, now tolerant of the compounds a recognizer splits or joins — "Samstag
morgen" for Samstagmorgen, "zuhause" for zu Hause) and timed, so the learner sees the words that did not come
through and their pace in words a minute (`paceOf`: under 80 is decoding word by word, 80–165 a reading pace,
above rushing); the text ends with the share of words heard, the clean sentences, the mean pace and the words to
practise. Scored in the `speaking` area.

**Listening as in the exam** (`src/features/ambience.ts`, the "Listen as in the exam" switch on a reading step): the
voice reads at a natural pace over the sound of a place — a station concourse, a café, a street — at three noise
levels, the text locked until the questions are answered, as the Hören parts do it. The beds are short procedural
ambiences bundled in `assets/sounds` (no recordings of people, nothing to license), looped by `expo-audio` under
the `expo-speech` voice and stopped with it.

**Listening situations** (`src/app/situation.tsx`, `src/harness/situations.ts`; Practice › Listening): the pieces
people hear in Germany — a platform announcement, the conductor on the train, a supermarket call, a gate call, a
doctor's answering machine, a voicemail from a friend or an office, the radio's weather, traffic and news, a
dialogue in the street, at the café, on the phone with a receptionist, at the Bürgeramt counter, an interview and
a lecture opening at C1/C2 — sixteen situations placed by level, each a brief the tutor writes from in the reading
draft's shape (`situationPrompt`, an example of the same kind, the facts of the example forbidden) with its own
word band (`SITUATION_WORDS`, 25–45 words at A1 up to 110–160 at C2) and a style line for how the kind is spoken
(loudspeaker, answering machine, presenter, two speakers on labelled lines). Played with a chime or a beep and the
place's bed, text locked until the three questions are answered; a dialogue's speaker labels are read as pauses.
Kept with the readings under `situation:<level>:<key>`; "Another one" asks the tutor again. Scored in `listening`.

**Stories** (`src/data/stories.json`, `src/harness/stories.ts`, `src/app/stories/`; Practice › Stories): a small
pack of real German texts in the public domain, shipped with the app — three short Grimm tales at A2 (*Der süße
Brei*, *Die Sterntaler*, *Der alte Großvater und der Enkel*), four at B1 (*Rotkäppchen*, *Der Wolf und die sieben
jungen Geißlein*, *Die Bremer Stadtmusikanten*, *Rumpelstilzchen*), Hebel's *Seltsamer Spazierritt* and *Der kluge
Richter* and Storm's *Der kleine Häwelmann* at B2, Hebel's *Kannitverstan* and Kafka's *Vor dem Gesetz* and *Eine
kaiserliche Botschaft* at C1, Kafka's *Auf der Galerie* and Kleist's *Das Bettelweib von Locarno* at C2 — fifteen
texts, 44 parts, 135 questions. The texts come from Wikisource (Grimm after the 1857 edition, Hebel after the
*Schatzkästlein* of 1811, Kafka after the first printings of 1915–1919, Kleist after the *Berliner Abendblätter*);
only the spelling was brought up to date (ß/ss, th/t, *Thür/Tür*, *gieng/ging*, *sey/sei*, page-break hyphens
joined), the words are the authors' own, so *Dirne*, *ward*, *sprach*, *Geiß* stay and are explained in each part's
**Old words and forms** list. Every text is cut at sentence boundaries into parts of about 200 words (`storyKey`
`story:<id>:<part>`), each with three hand-written multiple-choice questions checked by code, the right answer
spread evenly over a/b/c. A part opens in the reading step (`/read?story=<id>&part=<n>`), so listening, listening
as in the exam under a bed, tapping a word, and reading aloud work on it as on any text; there is no waiting and
no "another text", but a credit line, the gloss, "Next part", and the part is marked done under its key when the
questions are answered. The library lists the pack by level with the learner's level marked and shows each story's
reading time (`storyMinutes`, 110 words a minute) and parts done; the story page lists the parts and links the
source. `storiesFor(level)` offers the level's stories on the Practice tab, and to an A1 learner the A2 ones. Data
and tests: `src/harness/__tests__/stories.test.ts` checks the shape, the answer spread and that no old spelling
survived. The pack was built from Wikisource with a rule-based modernisation and a manual review; all texts are
pre-1930 publications by authors dead for more than 70 years, so they are free of copyright everywhere.

**Mock oral exam** (`src/harness/exam.ts`, `src/app/exam.tsx`, `src/state/exams.ts`; Practice › Exam): the
speaking part of the level's Goethe exam, run as it is held, with the tutor as examiner. The parts, their timing
and their criteria follow the published formats (`EXAMS`): A1 *sich vorstellen* (then spell a word or say a
number), *um Informationen bitten* with word cards, *Bitten formulieren*; A2 *Fragen zur Person* with four cards,
*von sich erzählen* on a topic with four points, *gemeinsam etwas planen*; B1 *planen*, the five-slide
*Präsentation* (three minutes), *über das Thema sprechen*; B2 to C2 a *Vortrag* with guiding points and a
*Diskussion* on a thesis — telc B1 and the DTZ have B1's shape. For each part the tutor writes the task sheet in
German (`examSheetPrompt`, a same-kind layout example, its facts forbidden; read by shape, `parseExamSheet`: a
*Thema/Situation/These* heading and two to six points, cards, pictures or slides), the voice reads the examiner's
opening line, a preparation clock runs (20 s at A1 up to 3 min at C1/C2), the learner speaks against the part's
clock with the recognizer in **continuous mode** (`useDictation({ continuous: true })`: Android 13+ settles one
segment at a time, the hook joins them, a turn twice the exam's length is stopped), the examiner asks back in
role (`examFollowupPrompt`: partner in the planning, opponent in the discussion, a question on the talk), and the
tutor rates the transcript on the exam's grid in the learner's language — *Erfüllung, Kohärenz, Wortschatz,
Strukturen*, 0–4 each, a comment, one tip, one sentence said better (`exam.ratingPrompt` in the catalogs, German
labels kept so `parseExamRating` reads the lines in any language, or by position without them). The app counts
**fluency** itself (`fluencyScore`: words a minute against the level's bands, capped when far too little was
said) and says so; nothing judges the accent, because a transcript cannot. A part is the five scores out of 20,
the exam the mean of its parts out of 100, 60 passes (`PASS_PERCENT`); attempts are kept in `useExams` (newest
twenty) and the last result shows on the Practice tab. Tests: `src/harness/__tests__/exam.test.ts`.

**Sounds to check** (`src/harness/pronunciation.ts`, `src/ui/PronunciationTips.tsx`): under a speaking result that
was not clear, and in the read-aloud summary, the words the recognizer did not catch are read for the German
sounds most learners get wrong — ü, ö, ä, the two ch sounds, the final -ig, z as ts, w as v, v as f, ei and ie,
eu/äu, sch, st/sp, the voiced s, devoiced final b/d/g, the lengthening h, the throat r, ß, pf, qu, j, ng, -tion,
and a long compound — and up to three tips say how the sound is made, with the learner's own words as examples
(`pronunciationTips`: each word adds its first two sounds in a rarity order, a long word its tip on top, tips
shared by several words first). The catalog carries the tips per app language so the comparisons are to sounds
of the learner's language, not English; the note under them says the recognizer mishears too — the tips are what
to check, not a verdict (false negatives were the trust-killer in every review the research read). Tests:
`src/harness/__tests__/pronunciation.test.ts`.

**Living in Germany** (`src/harness/alltag.ts`, `src/app/alltag.tsx`; Practice › Living in Germany): nineteen
situations of everyday life in Germany in seven domains — Anmeldung at the Bürgeramt, the Ausländerbehörde
appointment, the Rundfunkbeitrag, post from the Finanzamt; the rental contract and deposit, the
Nebenkostenabrechnung, a notice in the stairwell, a rent increase; the doctor's appointment, the sick note, the
medicine leaflet; the job interview invitation, the employment contract; the bank account, a Mahnung, liability
insurance; the Elternbrief; the Deutschlandticket, converting a driving licence — each placed by level, each with
a brief for the typical **letter or notice** the tutor writes to read (`letterPrompt`: the letter itself with
subject, greeting, body, closing and sender in the formal register, then three questions about what to act on;
read by `parseReadingDraft` with a looser band, kept with the readings under `alltag:<level>:<key>`, opened in
the reading step with `/read?alltag=<key>` so listening, word lookup and reading aloud work on it), and linked to
the app's own role-play scene and writing task where they exist (`scene`, `write`; checked by the tests). The
track answers the research's "I want to manage my own appointments and paperwork without relying on my partner".
Tests: `src/harness/__tests__/alltag.test.ts`.

**Speaking** (Practice › Speaking; the Home card). The learner research's first complaint is "I can read and
understand but I can't speak", and its standard remedy is a tandem partner. Three pieces answer it, and the
output they produce is counted on its own, apart from the comprehension drills:

- **Eine Minute Deutsch** (`src/harness/minute.ts`, `src/app/minute.tsx`, `src/features/MinuteCard.tsx`): one
  minute of free speech on the prompt of the day — sixty prompts, ten a level, each with three cue points
  (`MINUTE_PROMPTS`; *Erzähl von deinem Tag* with *Wann du aufstehst / Was du morgens und mittags machst / Was du
  am Abend machst* at A1, *Ist Ungleichheit der Preis für Wohlstand?* at C1), rotated by day and skipping the ones
  done (`promptOfDay`; the gloss is the catalog's `minute.prompt.<id>`). The phone's recognizer writes along in
  continuous mode (`useDictation`), the clock stops the turn at sixty seconds, and the time counts to the last
  word heard. The app measures what it can itself (`minuteStats`: words without fillers, different words, *ähs
  and ähms*, words a minute) and the tutor rates the talk through the exam grid (`minutePart` builds an
  `ExamPart` of kind *monologue* with the level's `MIN_WORDS`, `minuteSheet` turns the prompt into the task sheet,
  `tutor.examRating` scores Erfüllung, Kohärenz, Wortschatz, Strukturen with a comment, a tip and one improved
  sentence; fluency comes from the pace bands by code). A model that stops after the four scores is run again
  with its scores as the beginning of the answer up to `Kommentar:` (`ratingPrefill`, through the engine's
  `prefill`), so the free lines arrive. Every talk is kept in `src/state/speaking.ts` (`MinuteTalk`), the Home card
  shows today's prompt and, once done, the pace and the streak of days, and the ready screen lists the last
  talks. Tests: `src/harness/__tests__/minute.test.ts`.
- **Plaudern** (`src/harness/talk.ts`, `src/app/talk.tsx`): a free conversation with a tandem partner, built on
  the role-play frame the model was trained on (`counterpartPrompt`, `readCounterpartLine`, `tutor.sceneTurn`):
  `talkCard` makes a scene card on the fly with one of three partners (`PARTNERS`: Lena, Jonas, Aylin, rotated
  weekly by `partnerFor`, each with a life of her own in five facts), the topic (`TALK_TOPICS`, thirty from *Dein
  Tag* to *Eine Streitfrage*, the level's own first, or one the learner types), the *du* register and the
  partner's opener as the opening line, greeting the learner by first name. What makes it a conversation with
  *this* learner is **memory**: the profile (`src/state/profile.ts`, Me › About you: name, where they live and
  come from, work, hobbies, why German — all optional, all on the phone) and what they said last time
  (`memoryOf` in `src/state/speaking.ts`: the last topics and the longest thing they told, `thingTold`) go to the
  partner as facts. Ownership is spelled out in the labels — the partner's facts are *Dein Alter*, *Dein Plan für
  Sonntag*, the learner's *Manishs Wohnort*, *Manishs Hobbys* — because a 3B model given *Jonas, this week: a
  flea-market stand* happily asked the learner how his stand went. `keepTalking` drops a farewell the partner
  slips into mid-chat and appends a follow-up question when her line forgot to ask (`FOLLOW_UPS`, varied by
  turn). Nothing is corrected while the two talk; **End the talk** opens the recap, where the tutor goes through
  the learner's lines one by one with the red pen (`tutor.correct`), and the chat is saved (`Chat`: lines, words,
  what was told) so the partner "remembers this next time". Tests: `src/harness/__tests__/talk.test.ts` (the
  card passes the scene reader; a line that corrects, greets again or invents a figure is caught).
- **Speaking on the Me tab** (`summarise`, `wordsByDay` in `src/state/speaking.ts`): talks, conversations and
  words said, the pace over the last five talks against the five before, the best, a fourteen-day bar chart of
  words spoken, and a button into the minute. Practice › Speaking lists the minute, the chat and the week's
  sentences to say (`/speak`); the mock exam stays under Exam.

**Wortschatz and the deck**: the course's words step is done once three words of its list are saved to My words
(`SAVE_TO_FINISH` in `src/app/words.tsx`), not when the list is written — the week's vocabulary then comes back in
the deck's spaced review. Outside the course the words screen behaves as before.

**Lerncheck** (`src/app/path/check/[unit].tsx`): the week's grammar cards' typical mistakes, up to eight in a fixed
shuffle, to fix one by one — a fix that matches the card's answer counts at once, a different sentence goes to the
tutor as on the grammar card; a week without a card of its own (C1's and C2's last) reviews cards of its level
(`cards` on the step).

**Tables on the rule cards** (`src/harness/paradigm.ts`, `src/ui/ParadigmTable.tsx`): a rule that writes a paradigm
out in a line — "sein – ich bin, du bist, er ist, …", "ich → mein, du → dein, …", "Nominativ: ich, du, …; Akkusativ:
mich, dich, …" — shows it as a table in the rule section instead (`ruleSegments` splits the text into plain parts and
tables; pronoun runs must climb through the persons, so "ich war, er hatte, sie konnte" stays an example list;
adjacent labelled runs become columns, sein | haben), and the same table comes back under the examples as **Fill in
the table**, about half of its forms blanked by a seed, checked by code (`sameForm`: case, stem hyphens, umlaut
spellings aside), with "Practise again" dealing another pattern. The German inside a translated rule is the same, so
the reader works on every overlay; where a translation shaped a paradigm in a way the reader does not know, the rule
shows whole and the German card's tables follow it. Nine bundled cards carry tables today (`paradigm.test.ts` pins them).

**The mistakes notebook** (`src/app/mistakes.tsx`, `src/state/mistakes.ts`; Practice › Your mistakes, Me › Progress):
a Lerncheck sentence that was not fixed, and a Sprechen or Hören sentence that was not said or written as it
stands, are kept and met again — the most recently missed first — a fix checked against the pitfall's right
sentence, a sentence heard again and written down word for word; checked by code, so the notebook works without
the tutor, and the card behind a sentence is a tap away. Two right answers in a row and the item leaves (the
`review` progress area counts them). Missed nouns from the drills keep going to the deck instead.

**The portfolio** (`src/app/texts/`, `src/state/texts.ts`; Practice › Writing › Your texts, Me › Progress): every text
sent to the tutor from a writing task is kept with its date, length, the content points the precheck found and
the tutor's corrections (shown with the red pen and the explanation), newest first with the share of content
points over the last five — the trend a teacher's folder shows; a text opens its task again.

**The placement test** (`src/app/placement.tsx`, `src/harness/placement.ts`; from onboarding's "Not sure?" and
Me › Settings › Your level): four of the app's own drills per level — two meanings, an article and a verb form from that level's
words and verb band — from A1 upwards; a round passes with three right, the first round that fails ends the test, and
the level before it is suggested (every round passed suggests C1; the lexicon has no C2 tier, so C2 stays the
learner's own choice). The learner takes the suggestion or chooses; nothing is written to the progress store.

The sequence is the one the published syllabi and course books share, written for this app rather than copied
from any of them: the topic areas and task types of the Goethe-Institut exam descriptions (Prüfungsziele /
Testbeschreibung for Start Deutsch 1, A2, B2, C1 and C2, and the A1–B1 Wortlisten), the Handlungsfelder of the
BAMF Rahmencurriculum für Integrationskurse (A1–B1), the CEFR global scale, DW's Nicos Weg (A1–B1), and the chapter
progressions of Netzwerk neu, Menschen, Schritte international Neu and Studio [21] (A1–B1), Aspekte neu, Sicher! and
Weitblick (B1+–C1) and Erkundungen (B2–C2). The openly licensed first-year courses (COERLL's Deutsch im Blick and
Grimm Grammar, Open Education Alberta's Willkommen: Deutsch für alle, Grenzenlos Deutsch) were checked for the A1–A2
order; there is no open course book above A2. The result was then cross-checked, chapter by chapter, against the
chapter map of an online school's A1.1–C1.4 course (its chapter titles, can-do goals, lesson types and
grammar-lesson sequence only; none of its texts or word lists are used): its chapters run through vocabulary,
grammar, communication, reading and writing lessons and end in a check, which is where the week's skill rhythm,
the reading step and the Lerncheck come from; the gaps that showed — spelling, *welcher/dieser* and *war/hatte*
at A1, recipes and media talk at A2, biographies and keeping a conversation going at B1, presentations, comma
rules, *dessen/deren*, adjectives with fixed prepositions and the inseparable verb prefixes at B2, regret and
criticism, verbs with the genitive and migration policy at C1 — became extra steps, and every level from A2 up
ends with a question about its Goethe exam (C1 also the TestDaF), which the grounding pack's exam notes answer.
Every week's steps point at bundled content, which `src/harness/__tests__/path.test.ts` checks (every card, scene,
task and topic exists, every scene and task is used, no card is repeated within a level, a card sits within one
level of its week, every week runs in the skill order with one text and a check, every week is translated).

What the course added to the content: 28 grammar cards that the syllabi expect and the pools did not have — at A1
the basics (sein/haben and the present endings, W-questions, der/die/das in nominative and accusative, the
possessive articles, the plural patterns, um/am/im and in/nach/zu/bei), at A2 the pronouns in accusative and dative,
the Präteritum of sein/haben/modals, polite Könnten Sie/hätte gern, the dative verbs and prepositions, at B1
indirect questions, verbs with prepositions and da(r)-/wo(r)- words, the two-part connectors and the passive in
present and Präteritum, at B2 (which had two cards) the past Konjunktiv II, als ob, the passive with modals,
participles as adjectives, the genitive prepositions, relative clauses with prepositions/wo/was, the modal particles,
indem/sodass/ohne dass, Futur I/II as assumption and the inseparable prefixes be-/ver-/er-/ent-/zer-, at C1 text
connectors and participle clauses, at C2 es as placeholder and correlate and Nachfeld/extraposition
(`levels.test.ts` pins the C1 and C2 sets); 43 writing tasks in the Goethe/telc shapes, so that every week of the
course has one (an A1 postcard, an A2 note to the landlord, a B1 complaint about an order, a B2 forum post, a C1
report on figures, a C2 open letter, and then one for each week that had none: from a first forum post at A1 and
an email to the library at A2 to a rent-increase objection, a wind-farm statement, a tax-office objection and an
ethics-council briefing at C1/C2); and 33
word-list topics (`src/features/topics.ts`, where the topic tables now live). All of it is in the ten content
overlays and the twelve UI catalogs (the `path` section of `en.source.json`: a week's title, goal and, per step, the
question or situation it carries).

## Moments

The research warned against gamification that nags (streak anxiety, "logging in so they don't lose"); what it
asked for was warmth. The motion kit in `src/ui/motion/` makes the good moments felt and leaves the rest quiet:

- **`Celebration.tsx`** - one full-screen moment, mounted once in the root layout and fired from anywhere with
  `celebrate({ kind, cheer, title, detail, streak })`: a badge springs in with a halo, confetti falls, a German
  cheer (`CHEERS`: *Geschafft!*, *Klasse!*, *Weiter so!* …), one line about what was achieved and the streak as a
  flame; a tap or three and a half seconds later it is gone. Kinds: `lesson`, `week`, `exam`, `streak`,
  `speaking`, `level`, `done`.
- **`Confetti.tsx`** - the burst alone, for result screens; pure Reanimated, deterministic per `shot`, honours
  reduced motion (nothing is drawn). On the drill results (80 % and up), the exam summary when passed, the
  one-minute talk when the level's word count is reached, Taboo and Who am I? at the end.
- **`StreakFlame.tsx`** - the Home streak pill's flame breathes while the streak is alive, faster and taller the
  longer it is (filled from 7 days, red from 30), and flares up with a glow the moment the number rises.
- **`Numbers.tsx`** - `CountUp` (a score that counts up with an ease-out) and `ProgressRing` (an SVG ring that
  fills itself): the drill result, the one-minute pace, the small ring next to "Today's lesson".

What fires when (`src/features/moments.ts`, pure rules and a persisted store so each moment fires once): the
day's lesson once a day (`lesson`, with the streak), a streak milestone (`STREAK_MILESTONES`: 3, 7, 14, 30, 60,
100, 365) the day it is reached, a finished week of the course (`week`). **Welcome back**
(`src/features/WelcomeBackCard.tsx`) greets a learner after three or more days away - *Schön, dass du wieder da
bist!*, where they left off, one button to continue - with no word about the lost streak; once a day until they
practise. All of it respects the system's reduce-motion setting.

## Reminders

Local notifications only (`expo-notifications`; `src/features/notify.ts`, `notifyRules.ts`, `notifyStore.ts`,
`wordOfDay.ts`, `ReminderCard.tsx`): the app schedules them itself, no push service, nothing leaves the phone.
Everything is off until the learner turns it on — the home-screen card asks once, after the first practice (**Turn
on** / **Not now**), and Me › Settings › Reminders holds the switches: a **nudge on days without practice** at 9, 12, 18 or
21 (`REMINDER_HOURS`), the **word of the day** every morning at 9 on a quiet channel, and **Send one**, a sample
delivered at once so the learner sees what a reminder looks like on this phone (it asks for the permission if
needed; on Android 13+ the channels are created first, as the system prompt needs them).

`planNotifications` (`notifyRules.ts`, pure, tested without the module) decides what to schedule from the stores:
for today and the coming days (0, 1, 2, 3 and 5 days out) a reminder at the chosen hour on days not yet practised — a nudge in three wordings,
the streak count when one is alive, a milestone wording at 3/7/14/30/50/100, "a fresh start" the first day after a
streak ends, the words due for review when there are any (then the tap opens the review) — plus a late **rescue**
at 21 when a streak would end at midnight, and the word of the day for the coming week (`wordOfDay`: the level's word for the date,
looked up at local noon) on its own or as the first line of a reminder at the same hour. `syncNotifications`
cancels everything pending and schedules the current plan; it runs after the stores hydrate, debounced after
practice, deck, level or language changes, and when the app goes to the background or comes back, so the plan
always matches the day. Android alarms are inexact (`window=+1h`, the OS batches them) — that is fine for a
reminder and avoids the exact-alarm permission. Taps route through `notificationRoute` (only `/`, `/review`,
`/word/<lemma>`), waiting for hydration, the onboarding and the navigator. The foreground handler shows nothing
while the app is open — the screen is the reminder — except the sample. The texts live in the catalogs
(`notify.*`), so the lock screen speaks the learner's language. Config: `expo-notifications` plugin in `app.json`
(icon, brand colour, default channel); `src/features/notify.web.ts` answers for the web build.

## Languages

The UI and the bundled content exist in twelve languages (`src/i18n/languages.ts`: en de fr es it pt pl ru uk tr ar
zh). The pieces:

- `src/i18n/index.ts` — `t(key, vars)`, `tIn(lang, key, vars)`, `useI18n()`; flat catalogs, `{placeholders}`, plural
  objects picked by `vars.count` with the CLDR rules in `plural.ts` (pl/ru/uk have one/few/many, ar six forms, zh one).
  Missing keys fall back to English, then to the key (one warning per key in `__DEV__`). Pure TypeScript, tested in Node.
- `src/i18n/locales/<lang>.json` — the UI catalogs; `en.json` is the reference.
  `node scripts/i18n-ui-check.mjs <lang>` checks keys, placeholders and plural categories.
- `src/data/i18n/<lang>.json` — the content overlays: grammar cards, scenes, rule sentences and titles, the core
  lexicon's meanings plus the bundled Taboo cards' (so the guesser's gloss reads in the app's language), level
  descriptions, writing tasks, keyed by card key / scene key / rule kind / lemma / task id.
  `node scripts/i18n-content-source.mjs` regenerates `en.source.json` from the data files;
  `node scripts/i18n-content-check.mjs <lang>` checks an overlay against it. `src/i18n/content.ts`
  (`localizeGrammar`, `localizeScene`, `ruleSentence`, `wordMeaning`, `localizeLevel`, `localizeWriting`) returns
  copies for display; **the objects handed to the model keep their English fields** — the student was trained on
  English labels and its answers are parsed by them. German has no overlay: the German fields ship with the content.
- `src/i18n/bind.ts` — the only file that touches Expo: reads the device locale (`expo-localization`), applies the
  `language` setting ('auto' or a code), flips `I18nManager` for Arabic (a restart is needed, the Me screen says so),
  and derives `explainIn` from the app language (`explainLangFor` in `languages.ts`: the app language when the model
  speaks it, English otherwise). **The app language is the one setting**: UI, content and the tutor follow it. The
  learner picks it in the onboarding and in **Me › Language and appearance** (pills, always visible, right after the
  level card, with "Explanations in" and the theme). "Explanations in" is an override under it: its first pill,
  "Same as the app", is selected by default; choosing another language pins it (`explainInPinned`) until the app
  language changes, which clears the pin. It lists all twelve languages in the same order as the app language; the
  ones the model cannot speak are greyed out (`Pill disabled`) with a note naming them (`me.explainUnavailable`),
  and when the app language is itself one of them the note says so and names the fallback (`me.explainFallback`:
  "The tutor model cannot explain in Polski yet … explains in English"); the Tutor's empty screen repeats it
  (`tutor.answersIn`) and shows its suggestion chips in the app language while sending them in `explainIn`.
- What stays English on purpose: with the app in German, word meanings (lexicon, drills, review, word of the day),
  scene glosses and translate mode use English as the bridge language (`translationTarget('de')` = en; the Me row
  says "translated into English", `me.glossesDetail`), rather than inventing German definitions. Everything else in
  German comes from the content itself: level names and can-do lines have their own German table (`LEVEL_INFO_DE`
  in `harness/levels.ts`, applied by `localizeLevel`), and the lexicon attribution is a catalog key
  (`me.attribution`), not a data field.
- Module-level strings must not call `t()` at load time (the language is bound after settings hydrate): tables hold
  keys and resolve when a screen asks (`features/modelStatus.ts`, `WORD_TOPIC_KEY` in `features/lesson.ts`, …).
  Persisted text (lesson plans, deck sources, notes on authored scenes) stores keys where it can and otherwise the
  text in the language active when it was saved: a saved word carries `sourceKey` (+ `sourceVars`), resolved by
  `sourceLabel` when the review shows it, and only words saved before that keep a `source` text.

What the model does in each language (`src/harness/route.ts`): `TUTOR_LANGUAGES` = en de fr es it pt ru zh are the
languages the v23 student answers in — it follows the language of the learner's turn, not an instruction — so
`detectLang(text, fallback)` votes on word lists for the Latin-script ones, the CJK range for Chinese, and returns
the fallback (`explainIn`) for Arabic, Polish/Turkish letters and other scripts, which the model does not handle.
Cyrillic goes to Russian (`isRussian`) when the learner explains in Russian or the letters are Russian's and not
Ukrainian's (ы э ъ ё, no і ї є ґ); a Ukrainian question from a learner who explains in English stays in English
rather than being answered in Russian. Russian needs the ask spelt out in the user turn ("Ответь по-русски", in
`promptTexts.ts`): the probe's correction prompt drifted to German without it. Single-line German→X glosses are only
reliable for `GLOSS_LANGUAGES` = en fr es it (probed: pt and zh returned wrong words or flipped to English; on the
phone, Russian negated "Ich gehe morgen … ins Kino" and copied the German for another line), so the gloss toggle and
"say it in …" use the learner's language only there and English otherwise. In scenes the counterpart prompt only
knows English parentheticals, so for fr/es/it the scene screen asks for a German-only line and glosses it afterwards
with `tutor.gloss(german, { lang })` (which hands `ctx.lang` to `glossPrompt`; the model's English gloss, if it
wrote one anyway, is the fallback when that call fails). The translate chip on the Tutor's empty screen is
direction-aware: a German sentence reads "Say it in English: …" (`tutor.suggestTranslateTo`), one in the learner's
language "Say it in German: …". `Tutor.translate` also guards the other
direction: a German line whose words the lists do not know ("Kinder spielen gern draußen") would be sent to be
translated *into* German; when the model hands it back (`handedBack`: four words in five kept, so „Die Kinder spielen
gern draußen" for „Kinder spielen gern draussen" counts) the line is glossed instead. Check and translate
cues (`CHECK_CUE`, `TRANSLATE_CUE`, and `CHECK_CUE_RU`/`TRANSLATE_CUE_RU`, spelt without `\b`, which does not see
Cyrillic) and the correction parser's labels (`CORRECTED_LABEL`, `EXPLANATION_START` in `parse.ts`) cover the eight
model languages; a short bold line ending in a colon counts as a label in any wording (the phone's Russian check
opened with "**Корректное предложение:**"), so the sentence under it is read, not the label. A German line of four
words or more with no question mark and no cue is taken as a sentence to check — unless an instruction opens it
(`TASK_CUE`: "Formuliere ohne Passiv: Der Antrag muss …", "Ergänze: …", "Rewrite in indirect speech: …"), which
stays an ask; the phone's v24 C1 probe had the Passiversatz rewrite answered with "The sentence is correct" before
this cue existed. The rule engine's number reader (`answerFactual`) skips digits glued to letters, so a question
about the Goethe C1 exam no longer earns a "1 → eins" card next to the grounded answer. To add a language once a model speaks it: add the code to `TUTOR_LANGUAGES`, write its
`PROMPT_TEXTS` block, add its cues and labels, and probe the four shapes (ask, correct, word, examples) on the phone. The planner prompt and the
authoring prompts stay English (`tutor.plan(goal, MENU, { lang: 'en' })`); Today shows the planner's English reasons
only to English readers and the activity's translated description to everyone else. What the model writes for the
learner (scenes, tasks, cards, topics) comes out in the language of the request.

### Translate on this phone

For the app languages the model cannot explain in (Polish, Ukrainian, Turkish, Arabic) and the ones whose glosses
it gets wrong (Portuguese, Russian, Chinese), **Me › Language and appearance** offers a toggle, "Translate on this
phone": Google ML Kit's on-device translator renders the tutor's English in the app language. It is opt-in and
per phone, it downloads one language pack (~30 MB, the app language's, with English) when turned on and deletes
every pack when turned off or when the app language changes, and nothing the learner writes leaves the phone. The
model, its prompts and its parsers are untouched: the tutor still writes English, the phone translates afterwards.

- `modules/eszett-translate/` — a local Expo module with the same five functions on both platforms
  (`downloadedModels`, `downloadModel(tag, allowCellular)`, `deleteModel`, `translate(text, from, to)`):
  Kotlin over `com.google.mlkit:translate:17.0.3` (verified on the phone) and Swift over `GoogleMLKit/Translate`
  9.0.0 (`ios/EszettTranslate.podspec`, iOS 16.4 like `ExpoModulesCore`, `static_framework`). The iOS side
  compiles (the whole app, `xcodebuild -sdk iphoneos` with Xcode 27 after `expo prebuild`: the pod graph resolves
  with MLKitTranslate 8.0.0, MLKitNaturalLanguage 10, MLKitCommon 14, and the Swift module builds for arm64
  iOS 16.4) but has not run on an iPhone yet. Two iOS caveats: ML Kit's frameworks carry
  `EXCLUDED_ARCHS[sdk=iphonesimulator*] = arm64`, so the simulator needs a Rosetta destination (a device is fine),
  and the `SafeAreaView edges={{ bottom: Platform.OS === 'ios' }}` on the Tutor screen (Android's tab bar already
  ends the screen; iOS lays content under it) is reasoned, not seen on an iPhone. A translator kept alive holds
  30-150 MB, so the module caches at most two directions. Without the module (web, or a build without it) the store
  reports `unavailable` and the Me row says so (`me.translateUnavailable`).
- `src/mt/` — pure TypeScript except `native.ts` and `bind.ts`, tested in Node with a fake translator
  (`__tests__/mt.test.ts`). `store.ts`: the pack state machine (`off | downloading | ready | error | unavailable`,
  `sync(lang, on)` keeps exactly one pack, the app language's), `translating(lang)`, a session cache of
  translations by text, `translateAnswer`. `bind.ts` runs `sync` whenever the `language` or `translate` settings
  change. `languages.ts`: `MT_LANGUAGES`, `readLangFor` (what the learner reads in: the app language when the
  translator is ready and the tutor would write English), `needsQuestionTranslation` (foreign script → yes;
  Polish/Turkish own-word lists `ownVotes` ≥ 2 → yes; a German sentence → no; otherwise own words against English
  votes). `useTranslated.ts`: the hook behind every tutor answer; while the answer streams it translates the finished
  lines and shows the last one as it arrives, and it only translates what `readsEnglish` says is English (the model
  sometimes answers a nonsense word in German; a German answer must not be mangled as if it were English).
- `markdown.ts` is the heart of it: an ML Kit model would translate the German examples too, so each line is
  taken apart first. Leading Markdown markers (hashes, bullets, numbering, quotes) never go to the translator;
  German spans — bold/italic/code/quoted/bracketed German, grammar terms (`TERM`), the German half of a
  "German – gloss" line or of a "German sentence. (English gloss)" bullet, `(der Hund, -e)` lexicon tags — become
  `[1]`, `[2]`… placeholders (`placeholder`; of five
  styles probed on the phone in pl/tr/uk/ar, `[n]`, `<n>` and `⟦n⟧` came through intact everywhere, `{n}` was
  duplicated in Turkish and `#n#` padded with spaces); formatted *English* spans (a bold label such
  as "**Position:**", a whole-line sentence-case heading such as "**Key differences**") are translated on their own
  and put back inside their markers, keeping a trailing colon, so the translator never sees `**` (it had produced
  `** Pozycja: **` with stray spaces). A whole-line bold span counts as an English heading only in sentence case
  with ≥ 2 words and no inner capital ("**Guten Morgen**" and single bold words stay German). Standalone grammar
  terms — table cells, labels, one-word lines — come from `glossary.ts` first ("Case" became "Walizka", the
  suitcase, on the phone). A quote that runs across formatting (`"die Reform … **umgesetzt** wird"`) is protected
  whole, markup included (the pieces had gone to the translator and come back as "umgesetzt krzyża"), and a short
  quote without umlauts counts as German when one word of four letters or more reads as German and no English
  function word is in it (`"umgesetzt werden"`). When a placeholder goes missing the line is translated unmasked
  and checked for its German spans; when that fails too the English line stays.
- `question.ts` does the other direction. A question typed in Polish/Ukrainian/Turkish/Arabic is translated into
  English before it goes to the model (`chat.ts`, only in ask/translate mode, never for "check my German"), and
  ML Kit mangles German it does not know inside a Polish sentence ("Co to znaczy trotzdem?" came back as "What does
  TROTZZZTE mean?"), so `maskQuestion` protects the German: words in `GERMAN_WORDS`, ä/ß, ö/ü (for Turkish only
  listed words, since Turkish has those letters too), quoted German, a capitalised word right after a German word
  ("der Hund", "zur Arbeit", so Polish and Turkish proper nouns are spared), and for non-Latin app languages every
  Latin word. `NOT_GERMAN_IN` keeps Polish "nie"/"mit" and Turkish "bin"/"an" out of it. The learner's bubble shows
  what they typed (or the chip label in their language); the model receives the English.
- On the screens: the Tutor shows translated answers with a caption, "Translated from English on this phone ·
  Show the original" (`tutor.translatedFrom`, a per-message toggle); the empty screen's note changes to "Your
  tutor answers in English; this phone translates…" (`tutor.answersTranslated`); the scene screen translates the
  model's English gloss under a line into the app language when the pack is ready; the Me row reports the pack
  (`me.translateDownloading` / `me.translateReady` / `me.translateError` with "Try again").
- Debugging on Android: `adb logcat -d -v time | grep "Full translation"` prints every string ML Kit translated,
  which is how the `**`, "Case" and "TROTZZZTE" cases were found. The translator's German-ness rules are
  deliberately conservative: an English line with no English function words ("Yes.") stays untranslated, and a
  German word the lists do not know and that has no umlaut can still be mangled in a Polish question.

One trap: the app builds with the React Compiler (`experiments.reactCompiler` in `app.json`), which memoises a call
made during render on its visible arguments. A helper that read the current language from module state would keep
returning the old wording after a switch, so helpers that run during render (`statusLabel`, `tutorLine`,
`notReadyNote`, `describeChecks`, `localize*`, `wordTopicLabel`, …) take `lang` from `useI18n()` explicitly; the
module-level `t()` is for code outside render (the harness, event handlers).

## Update and review prompts

`src/features/release.ts` fetches `https://lichtgwcst001.blob.core.windows.net/models/eszett/release.json` at most
once a day (8 s timeout, silent on failure) and `releaseRules.ts` compares it with the installed version
(`expo-constants`). The file is `release.json` at the root of this folder, one entry per platform:

```json
{ "android": { "version": "1.0.3", "minimum": "1.0.0",
               "storeUrl": "https://play.google.com/store/apps/details?id=com.lamplitlabs.eszett",
               "notes": { "en": "…", "de": "…" } } }
```

`version` above the installed one shows the dismissible card at the bottom of the screen (`src/ui/UpdateCard.tsx`);
an installed version below `minimum` shows a full-screen page instead of the app. **Me › About › Check for updates**
runs the check at once (`checkForUpdate({ force: true })`), forgets a card the learner put off with "Later", and says
what it found: the installed version is the latest, a newer one is in the store (the card appears), or the server
could not be reached (`CheckOutcome`; tested in `src/features/__tests__/releaseCheck.test.ts` with an in-memory
AsyncStorage). A forced check sends `cache-control: no-cache`, because the blob is served with `max-age=300` and
the phone's HTTP cache would otherwise answer a manual check with the file from up to five minutes ago. `notes` is a
string or one per language code (English is the fallback). Publish a new file with
`az storage blob upload --account-name lichtgwcst001 -c models -n eszett/release.json -f release.json --content-type "application/json; charset=utf-8" --content-cache-control "max-age=300" --overwrite --auth-mode key`
(bump `version` only once the store has the build; verified end to end on 7 Oct 2026 with a throw-away 1.0.2 file —
the note and the card appeared on the phone and went away again once the real file was restored and re-checked). Versions live in `app.json` (`version`) and
`android/app/build.gradle` (`versionCode`, `versionName`); keep them in step.

`src/features/review.ts` asks for a store review through `expo-store-review` (Play's in-app dialog, which only
appears for builds installed from the Play Store) after `REVIEW_RULES` in `reviewRules.ts`: three active days and
five finished activities, at most three asks, 120 days apart. The Me screen's "Rate Eszett" row opens the store
page directly.

## Google Play, from the repository

`store/` holds what Play shows and sells and pushes it with three scripts on the Play Developer API - the listing
in twelve languages (texts, screenshots, feature graphic), the three one-time products with Google's regional
prices, the signed bundle to a track - plus the renderers for the graphics and the owner's checklist for the
steps only the Console can do (creating the app, inviting the service account, the content declarations):
[`store/README.md`](store/README.md) and [`store/PLAY-CONSOLE.md`](store/PLAY-CONSOLE.md); the iOS release
plan - phases, Apple's rules that shape it, the owner's steps - is [`store/APP-STORE.md`](store/APP-STORE.md). The bundle is
signed with the upload key through `ESZETT_UPLOAD_*` (Gradle properties or environment; the debug key stays the
fallback), `ESZETT_VERSION_CODE` counts the builds, and `.github/workflows/android-release.yml` builds and signs
on every push while `play-publish.yml` pushes products, texts or the bundle on demand.

## Business model, accounts and the server

Eszett is sold the way its learners asked for in the research behind it (billing dark patterns were the
third-most-common complaint about language apps; "simple, transparent, no auto-renewal" the ask): **nothing
renews by itself, nothing is taken away, and the people who can pay help the people who cannot.**

| | What you get | Price |
| --- | --- | --- |
| **Free week** | Everything, for seven days from the first start, with one tutor model download. The drills, rule cards, word lookups and the pass-and-play games stay free for good; only the model needs the purchase afterwards. | — |
| **Eszett for good** (`eszett_full_access`) | The app for good, every tutor model released in the next **twelve months**, and the last of them for good. One purchase. | the store's price |
| **Fresh tutor** (`eszett_fresh_tutor`) | Twelve more months of new tutor models, for someone whose year is over. One payment, never required: the app and the last model keep working. | smaller |
| **Pay it forward** (`eszett_gift`) | Full access for someone who cannot afford it: a code to hand to a person you know, or into the pool, where the next learner who asks for one gets it. | same as full access |
| **Codes** | Schools, Integrationskurs providers and employers get codes in bulk (`POST /v1/codes`, owner only); one code, one account. | by agreement |

Why this shape: the costs are the training of new models and the 2.2 GB a download moves, not the running of
the app (the model runs on the phone). A one-time purchase with a year of updates pays for the models that year;
a learner who stops is not charged for what they do not use; a learner who returns after two years still has
their tutor and can buy a fresh one. The pool turns the audience's own goodwill (the research is full of "pay it
forward" stories among migrants learning German) into access for those who need it most, without the app giving
anything away that someone else did not choose to give. Regional pricing is the stores' business (price tiers per
country), not the app's.

**The pieces.**

- **Accounts (Clerk).** An account is needed for one thing only: downloading the tutor model. Sign-in is an
  e-mail address and a six-digit code, no password, or Google (and Apple on iOS) through Clerk's SSO flow in a
  browser tab that returns on the `eszett://sso` link (`src/app/signin.tsx`, `@clerk/clerk-expo`, the session in
  `expo-secure-store`). The account's photo and first name, when the provider gave them (`hasImage` tells Clerk's
  own placeholder from a real photo: `src/features/avatar.ts`), show in the Home greeting and in Me › Account
  (`src/ui/Avatar.tsx`, an initial when there is none); the greeting uses the name from "About you" first. A build without `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` has no account at all, and so no way
  to download from our storage (a download source of its own still works); `src/features/account.tsx` mirrors
  Clerk's state into a store so no screen depends on Clerk directly (`AccountProvider`, `AccountBridge`), and
  **Me › Account › Delete account** deletes the account on the server and at Clerk (`DELETE /v1/me`), then signs
  out. The Clerk application is set up through pulse's
  Clerk MCP (task `TASK-042`); the publishable key goes into `.env` (git-ignored), the secret key only into the
  Function App's settings. Clerk's dev instance accepts `<anything>+clerk_test@example.com` with the code
  `424242`, so sign-in can be tested without an inbox.
- **The server** (`server/`, Azure Functions v4 on Node 22, Consumption plan, resource group `eszett`, function
  app `eszett-gwc-func-001`, reusing the `lichtgwcst001` storage account for its tables and the shared Application
  Insights). It verifies the Clerk session token and answers:
  `GET /v1/health` · `GET /v1/me` (the entitlement) · `DELETE /v1/me` (the account, everywhere) ·
  `POST /v1/download-url {file}` (a read-only link to one
  blob, signed with the function's managed identity - a user-delegation SAS, seven days at most, no account key
  anywhere) · `POST /v1/purchase {platform, productId, token}` (asks Google Play / the App Store, records the
  entitlement; a gift answers with a code) · `POST /v1/redeem {code | fromPool}` · `POST /v1/codes` (owner, with
  `x-admin-key`) · `POST /v1/grant {email, note}` (owner: full access for one existing account without a code - the
  store reviewers' account, a lost code). The rules are pure and tested (`server/src/rules.ts`, `rules.test.ts`): **first download free
  for every account; a model once downloaded can always be downloaded again (a new phone); with full access every
  model released before `updatesUntil`; otherwise 402 with `needs-full` or `needs-fresh`**. The storage account's
  roles for the identity: Storage Blob Data Reader, Storage Blob Delegator, Storage Table Data Contributor.
  Settings: `STORAGE_ACCOUNT`, `MODELS_CONTAINER` (`models-private`), `MODEL_STUDENT`, `EDITIONS`, `LINK_HOURS`,
  `UPDATES_MONTHS`, `CLERK_SECRET_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON` (a Play service account with "View
  financial data"), `APPLE_ISSUER_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` (App Store Server API), `ADMIN_KEY`;
  `TRUST_UNVERIFIED_PURCHASES=true` is for development only. Deploy: `cd server && npm run deploy`. Until
  `CLERK_SECRET_KEY` is set the server answers 503 to everything but `/v1/health`, and the app shows that message
  instead of a download (there is no public URL to fall back to). The owner's key for `/v1/codes` is kept outside
  the repository (`~/.pulse/private/providers/eszett-admin-key.json`); a batch of codes for a school:
  `curl -X POST "$API/v1/codes" -H "x-admin-key: $ADMIN_KEY" -H "content-type: application/json" -d '{"count":30,"note":"VHS Köln B1 autumn"}'`.
- **The app's side** (`src/features/api.ts`, pure and tested): `requestDownloadLink` turns the server's answers
  into what the app does - a link, "sign in" (401), "full access" (402, the unlock screen with the reason), or
  "unavailable" with the server's message when it is not set up or not reachable (the learner tries again later;
  a model already on the phone keeps working).
  `src/model/runtime.ts` asks for the link in `download()` and parks the reason in `gate`; the Your-tutor sheet and
  the Home card show it. Purchases are reported to the server after the store confirms them
  (`src/features/purchases.ts` `report`); a fresh tutor and a gift are consumables that live on the account, so
  the store is told only after the server has them.
- **A new tutor model** (`src/model/update.ts`, `src/features/ModelUpdateCard.tsx`): a new build no longer deletes
  the previous student's model and downloads the next one unasked. The old model keeps working (`outdated` in the
  runtime), a card says "A new tutor is ready" - download with full access, the unlock screen in the free week,
  "Later" puts it away for this student - and the old files go only after the new one is loaded (or first, when
  the phone has room for one model: `mustRetireFirst`). Rules tested in `src/model/__tests__/update.test.ts`.

The local pieces from before remain:

- `src/features/accessRules.ts` (pure, tested) holds the rules: `TRIAL_DAYS = 7`, `PRODUCT_ID =
  'eszett_full_access'`, `evaluateAccess(record, now)` → `paid` / `trial` (with `daysLeft`) / `ended`. The clock
  used is `max(now, lastSeenAt)`, so a phone set back in time does not get its week again.
- `src/features/access.ts` is the persisted store (`eszett.access`): when the app was first opened, the latest
  clock reading, the purchase once there is one. `useAccessView()` is the hook screens read.
- `src/features/accessBind.ts` runs in the root layout **before** the model boot: it notes the time at every start
  and return to the front, sets a timer for the minute the week ends, and calls `useModel.setLocked(…)`.
- `src/model/runtime.ts` has the status `locked`: the GGUF stays on the phone but is unloaded from memory, `load()`
  parks the file until `setLocked(false)` lets it in, `isReady()` is false, so every prompt path (chat, drills,
  lesson planner, authoring) shows its not-ready note (`model.noteLocked`). A download that is running carries on.
- `src/features/purchases.ts` talks to the store through `expo-iap` (StoreKit 2 / Google Play Billing): connect,
  fetch the price, buy, restore, finish every transaction (Android refunds unacknowledged purchases after three
  days; iOS replays unfinished ones at launch). At every launch `getAvailablePurchases()` quietly restores a
  purchase made on another phone or before a reinstall. `purchases.web.ts` answers "not available".
- `src/app/unlock.tsx` is the **Me › Full access** sheet (also reached from the Tutor tab and the model sheet when
  locked): days left / ended / paid, the pitch, "Unlock for {price}" with the store's own price string, Restore,
  the legal line. In a dev build a row of pills ends the week, resets it, marks paid, clears the purchase.
- The welcome screen's third point (`onboarding.freeWeek`) says, before the week starts, how long it lasts, what
  stops working afterwards and what the purchase costs (the store's price once it has been fetched). App Store
  guideline 3.1.1 asks for exactly that from a non-subscription trial.

**Store setup (once, by hand).** The price is read from the store; nothing in the app changes for a price change.
`expo-iap` is a native module, so the first build with it must be a fresh native build (`npx expo run:android` /
`run:ios`, or EAS); its config plugin is already in `app.json`.

- **App Store.** In App Store Connect sign the Paid Apps agreement (Agreements, Tax, and Banking — until it is
  active `fetchProducts` returns nothing and the button says the store is not available), then under the app's
  In-App Purchases add a **Non-Consumable** with product id `eszett_full_access` (and two **Consumables**, `eszett_fresh_tutor` and `eszett_gift`, for the fresh tutor and pay-it-forward purchases), a price, the display name and
  description in the app's languages, and a screenshot of the unlock sheet for review. The first in-app purchase
  has to be submitted together with an app version (pick it on the version page). No capability or entitlement is
  needed: In-App Purchase is on for every App ID, and `expo-iap` uses StoreKit 2 (iOS 15+; the app is iOS 16.4+).
  Apple's review wants a visible Restore button (it is there) and the disclosure above. Apple's own recipe for a
  trial is a free non-consumable named "7-day Trial" that the learner "buys" first; Eszett starts the week on the
  first launch instead so it also works offline — if a reviewer insists on the recipe, that is the fallback.
  "Ask to Buy" purchases arrive as `pending`; the sheet says so and the unlock comes through the purchase listener
  when the parent approves, even on a later launch. Test on a device signed in with a Sandbox Apple Account
  (Settings › Developer › Sandbox Apple Account); App Store Connect › Users and Access › Sandbox › Clear Purchase
  History lets a tester buy again. In the simulator use a StoreKit Configuration file (Xcode: File › New › StoreKit
  Configuration File, add the non-consumable `eszett_full_access`, pick it in Product › Scheme › Edit Scheme › Run
  › Options); `ios/` is generated, so redo that after a `prebuild --clean`. Or just use the dev pills.
- **Google Play.** Play Console › Monetize › Products › In-app products: `eszett_full_access` (one-time), `eszett_fresh_tutor` and `eszett_gift` (consumable), all
  active; for the server's receipt check, a service account with "View financial data" (Play Console › Users and
  permissions), its JSON in the Function App setting `GOOGLE_SERVICE_ACCOUNT_JSON`. Purchases only work for builds signed with the upload/app signing key that Play knows (an internal
  testing track is enough) and for accounts listed as licence testers.

**Limitations, on purpose:** the device's own StoreKit / Play Billing state still unlocks the app on the phone
(the week, the lock, the local purchase record); the server is the authority for downloads and for what the
account owns, and the two meet when a purchase is reported. A reinstall starts a new week on the phone (the trial
record lives in AsyncStorage) but not a new free download: the account remembers. Learners who update from a
version without the gate get seven days from the first start of the new version.

## Website

`web/` is the static site for **eszett.lamplitlabs.com**: the landing page (`index.html`), the pages the
stores and Clerk ask for - `privacy` (Datenschutzerklärung, German and English on one page, `#de` / `#en`),
`terms` (Nutzungsbedingungen: the free week, the one-time purchases, codes and the pool, model updates, no
warranty on what a language model says), `imprint` (§ 5 DDG), `delete-account` (Google Play's account-deletion
URL: the in-app path and the e-mail fallback, what is deleted and what never left the phone), `support` - and
the **learning pages**, generated from the app's own data in the app's twelve languages.

**The learning pages** (`node web/build.mjs`, about 1,300 files, committed so Vercel needs no build step) are
what a learner finds on a search engine before they know the app exists, and the material the tutor teaches
from, free to read: the course by level (`/learn`, `/learn/a1` … `/learn/c2`: what the level means in Germany,
how long it takes, every week with its grammar, words, drills, scenes and the questions to ask the tutor), one
page per grammar card (`/grammar/<key>`: the rule in the reader's language and in German, the examples, the
pitfalls, the weeks it comes up in), one per exam (`/exams/<key>`: the fact sheets of the grounding pack -
parts, points, pass marks, timing - plus a comparison, the level guidance and the strategy notes on `/exams`),
one per story (`/stories/<id>`: the public-domain text with the glossary and the questions, answers behind a
toggle), and the scenes (`/scenes`). English lives at the root, the other languages under their code
(`/fr/grammar/adjektivendungen`); every page lists all twelve as `hreflang` alternates with English as
`x-default`, carries canonical, Open Graph and Twitter tags, JSON-LD (`BreadcrumbList` everywhere, `Article`
for cards, exams and stories, `Course` for the levels; the landing page has `Organization`, `WebSite`,
`MobileApplication` and `FAQPage`), and a language switcher. Arabic pages are `dir="rtl"` with the German
examples kept left-to-right.

Where the words come from: the cards, scenes, course units and stories are `src/data/*.json`, their translations
`src/data/i18n/<lang>.json` - the same overlays the app shows (German uses the native `_de` fields); the word-list
topics come from the UI catalogs (`topics.*`). The page strings and the exam sheets have their own tables,
`web/i18n/strings.<lang>.json` and `web/i18n/exams.<lang>.json`, English being the source; a missing language
falls back to English (the exam pages then say so). Translating them follows the UI pattern: an agent writes the
language file, `node scripts/web-i18n-check.mjs strings|exams <lang>` checks keys, placeholders, link keys and - for the exam sheets -
that every number survived, then the file is copied into `web/i18n/`. Run the build again after any of these
change; its output is deterministic, so a rebuild only changes what changed.

Plain HTML and one stylesheet (`styles.css`, the app's colours and fonts, dark mode by `prefers-color-scheme`),
no build step, one small script (`site.js`: the footer year and the language toggle of the legal pages), no
analytics, no cookies, **no third-party requests** - the fonts are self-hosted (`assets/fonts/`, subsetted WOFF2
built by `python3 scripts/web-fonts.py` from the app's `@expo-google-fonts` packages, which also writes the
`@font-face` block into `styles.css`; loading them from Google
would send every visitor's IP address to Google, which German courts have treated as a GDPR violation since 2022).
The privacy page says all this and the site has to keep it true. `vercel.json` sets clean URLs (`/privacy`, not
`/privacy.html`), German aliases (`/datenschutz`, `/impressum`, `/nutzungsbedingungen`, `/konto-loeschen`,
`/grammatik`, `/pruefungen`, `/deutsch-lernen`), `/<lang>` → `/<lang>/learn`, the security headers and a CSP that
allows this origin only (no inline scripts). `sitemap.xml` is written by the build (all pages, all languages); `robots.txt`
points at it; `assets/og.png` is the 1200×630 share image.

Hosting: the Vercel project `eszett` of the team `lamplitlabs`, framework "Other", no build command, linked
from `web/` (`web/.vercel/`, git-ignored); `cd web && npx vercel deploy --prod` publishes. The domain
`eszett.lamplitlabs.com` is a CNAME at Hostinger (the DNS of lamplitlabs.com) to the project; production
deployments are public, preview deployments stay behind Vercel's authentication. Preview locally with `node scripts/web-preview.mjs` (clean URLs like Vercel, port 8788). The provider is named the way
the other Lamplit Labs sites name it (Lamplit Labs, Germany, `hello@lamplitlabs.com` for everything: support,
privacy requests, account deletion by e-mail); the privacy and terms pages point to the Impressum for the
address; the Impressum names the owner and the postal address (Lamplit Labs, Manish Tiwari, Ratingen), which
§ 5 DDG and the Digital Services Act's trader rules require for a paid app and which Google Play and the App
Store show publicly anyway. A VAT id, if one exists, belongs there too. The same URLs go into the
store listings (privacy policy, account deletion) and into Clerk's production instance (legal links in the
sign-in flow); the app links to them from **Me › About**.

## Practising together

The card at the top of **Scenes** opens `/together`: two people share one phone and practise German with each
other, the app facilitating. Everything is built on the pieces that already exist (the lexicon, the drills, the
correction prompt, the device's German voice); the two new model tasks are additive, so the tutor's other
prompts, parsers and tests are untouched.

- **Hub** (`src/app/together/index.tsx`): the two names (kept in `useTogether`, `eszett.together`), a level, a
  topic, and **Your own topic** (`tutor.talkPoints` writes five questions through an `AuthorBox`; fewer than
  three usable ones is a `DraftError`). The games sit underneath.
- **Names** (`src/features/PlayerNames.tsx`): the "Who's playing?" fields are one component, shown on the hub
  and on the Duel and Taboo set-up screens; Talking points (next to the swap button) and Story chain (in the
  top bar) have a pencil that unfolds the same fields, so a name can be changed from inside any activity. Each
  field carries a pencil and lights its border while focused. `setName` keeps a space typed between two
  names (the field is controlled, so trimming on every keystroke would swallow it) and `playerName` trims on
  display, falling back to "Player 1"/"Player 2" (`together.playerN`).
- **Talking points** (`talk.tsx`): `src/data/together.json` holds 240 German questions, eight topics × six levels
  × five, each with its English, French, Spanish and Italian gloss and up to three key words. The screen shows
  who asks and who answers (alternating; the swap button exists), the question with its voice button, the gloss
  in the app's language (bundled for fr/es/it; English, translated on the phone when the ML Kit pack is there,
  for the others; nothing for German), the key words with article and meaning from the lexicon (resolved at
  render against `tutor.lexicon ?? coreLexicon`; a compound the lexicon does not list as a whole takes article
  and plural from its last part through `LexiconIndex.compoundHead` — *die Vier-Tage-Woche*, *die
  Debattenkultur* — and the word sheet says so in an amber note; a bare lemma otherwise), and a composer to
  have a sentence checked with the normal correction prompt. A level's own five questions come first, lower
  levels fill in. Questions the model wrote for a custom topic reach the screen through the store's
  non-persisted `custom` field, not through route params.
- **Duel** (`duel.tsx`): `newDuel` builds `2 × rounds` drills of one category (`DUEL_CATEGORIES` leaves out the
  slow ordinal and sentence drills) with the drill engine; players alternate, one attempt each (typed digits in a
  number drill only ask for the word), the answer and hint after every turn, then "pass the phone". `ArticleButtons`, `Choices`
  and `AnswerField` moved from the drill screen into `src/ui/DrillAnswer.tsx` so both use the same controls.
- **Taboo** (`taboo.tsx`): `tabooCards` deals 84 hand-written cards (word, article, meaning, forbidden words; fourteen
  a level) at or below the level first, then lexicon nouns without forbidden words; for those, `tutor.tabooWords` asks the
  model for three or four words (`tabooPrompt`, 40 tokens, `priority: 'background'`) for the current and the
  next card while the players talk, and the card fills in when the answer arrives; it is playable without. Sixty
  seconds a turn (`TABOO_SECONDS`), then the roles swap; two turns make a game.
- **Who am I?** (`whoami.tsx`, `src/harness/whoami.ts`): one player keeps a secret card — a person, an animal, a
  thing, a place, a food or a job, with its article (`WHOAMI_CARDS`, 70 cards, ten or more a level, from *der Hund*
  to *die Gewaltenteilung*) — and the other asks yes/no questions in German, twenty at most
  (`WHOAMI_QUESTIONS`), then guesses. Before the phone changes hands the guesser sees five question frames
  (`WHOAMI_STARTERS`: *Bist du ein Tier?*, *Kann man dich essen?* …) with voice buttons. The keeper taps Ja / Nein /
  Jein for every answer (the counter), may read out up to three hints written from vague to telling (each costs
  a point, `WHOAMI_HINT_COST`), sees the lexicon's gloss for the word where it has one and the other forms that
  count (*Ärztin* for *der Arzt*), and ends the round with "Got it" or "Give up and reveal". A right guess earns
  the questions left plus five (`whoAmIScore`, never below one) for the guesser; one round each makes a game.
  Cards of the chosen level come first, lower levels fill in (`whoAmICards`). Tests:
  `src/harness/__tests__/whoami.test.ts` (ten cards a level, three distinct hints that do not contain the answer,
  unique answers, scoring).
- **Story chain** (`story.tsx`): six openers per level (`STORY_OPENERS`, one drawn at random), one sentence each, every sentence checked
  with `tutor.correct` when the model is ready: the red pen inline with the rule lines (`RuleLines`) or the first
  sentence of the explanation under it, "Correct German" with a tick when nothing changed. A sentence written
  while the model is still loading is kept as `check.status: 'off'` ("Not checked yet") and checked, one at a
  time, as soon as the model store reports the model ready (the screen subscribes to `useModel`; after every
  finished check it looks for the next waiting line). The whole story is read aloud at the end with the
  corrected lines, under a recap of what the tutor changed and why.
- **Word tiles** (`scrabble.tsx`, `src/harness/scrabble.ts`): a Scrabble-like game on an 11 × 11 board (bonus
  squares in `BONUS`, the centre doubles the first word), seven tiles each from a 62-tile German bag with the
  official German letter values (`VALUES`; no blanks and no ß tile — a word is looked up with its *ss* read as
  ß too). The judge (`judgeMove`) wants the new tiles in one line, joined to what is already on the board, and
  returns every word formed with its score (letter and word bonuses count only under tiles placed this turn,
  fifty extra for playing all seven). Words are checked offline against the tutor's lexicon and
  `src/data/words.json` (`scripts/build-words.mjs`: the forms, nouns with gender and the level they are first
  met at, and plurals from the content data, plus the adjectives, verbs, adverbs and nouns the app's own model
  named and inflected by rule — see "The word list" under the data pipeline), so each word shows its article
  or lemma and meaning; a word nobody knows is shown to the
  other player, who accepts or rejects it. Swap needs seven tiles in the bag, four scoreless turns in a row end
  the game, as does one player playing out (the other's remaining tiles change hands in points). The board is
  hidden behind a curtain between turns, and an unfinished game is kept in the store (`useTogether.scrabble`,
  persisted) so it can be resumed from the hub. Tests: `src/harness/__tests__/scrabble.test.ts`.
- **Five letters** (`wordle.tsx`, `src/harness/wordle.ts`): a Wordle-style game the two players share. One
  five-letter German noun, one board of six rows, the players guessing in turn (the opening guess alternates
  with the round, so over a match of `ROUNDS` = 4 words both open twice); whoever hits the word wins it, six
  misses give it to nobody, and more words won wins the match. `markGuess` is the usual two-pass marking (a
  letter counts as "present" only as often as the answer has it), `keyboardMarks` colours the on-screen
  QWERTZ keyboard (with Ä, Ö, Ü) by the best mark seen; marked tiles and keys also carry a shape (a dot for
  the right place, a ring for a letter elsewhere) for players who cannot tell green from amber. The answers
  (`ANSWERS`) are the five-letter nouns of `words.json` — curated gender, no ß, so the keyboard can spell them
  — drawn up to the level chosen in the hub (`answersFor(level)`; `words.json` carries each noun's `levels`
  entry, the lexicon's level where it has one, else the lowest card, scene or question whose German uses it,
  so an A1 pair gets ~60 words and a C2 pair all ~210); a guess may be any form the lexicon or `words.json`
  knows (`guessProblem` reuses `wordVerdict`). When a word will not come, the board helps: after
  `HINT_AFTER` = 3 guesses it tells the article, for the last guess the meaning (or the first letter where the
  lexicon has none) — `hintFor` — and from the same moment the players may give the word up (`giveUp`, after a
  confirm; nobody scores it). After each word the article, lemma and meaning are shown and read aloud. Nothing
  is hidden, so there is no curtain; the match is kept in the store (`useTogether.wordle`, persisted) and can
  be resumed from the hub. Tiles shrink to fit a short screen. Tests: `src/harness/__tests__/wordle.test.ts`.

The harness side (`src/harness/together.ts`; `talkPrompt`/`tabooPrompt` re-exported from `prompts.ts`,
`BUDGET.talk`/`BUDGET.taboo`) is pure and the session state (`DuelState`, `StoryLine[]`, `TabooCard[]`) is
plain serialisable data (`ScrabbleState` and `WordleState` too), so a two-phone mode could later ship it over
a link without touching the screens' logic.
Together sessions do **not** record into the owner's progress areas (two people share one phone; the owner's
statistics stay honest); `useTogether.finished(game)` only counts sessions. Strings live under `together.*` in
the twelve catalogs. Tests: `src/harness/__tests__/together.test.ts`.

## Tests

```bash
sh scripts/verify.sh            # typecheck + tests + i18n check: the entry point the scheduled check runs; exits 0 when all pass
sh scripts/audit.sh             # dependency audit: fails on a high or critical vulnerability
npx vitest run                  # npm test — harness tests, the chat-template renderer, the model manifest, i18n, the on-phone translator's masking, release and review rules, practising together (Node, no React Native)
npx tsc --noEmit                # npm run typecheck
npx expo lint                   # npm run lint
npm run i18n-check              # the UI catalogs against en.json and the content overlays against en.source.json
node scripts/i18n-ui-check.mjs de fr es it pt pl ru uk tr ar zh        # the UI catalogs on their own
node scripts/i18n-content-check.mjs fr es it pt pl ru uk tr ar zh      # the content overlays on their own
```

- `src/harness/__tests__/fixtures/chat-template.json` holds prompts rendered with transformers.js from the Hub's
  `chat_template.jinja` on 2026-10-05; the renderer must match them byte for byte (the date line is fixed by
  passing `now`).
- `src/model/__tests__/manifest.test.ts` pins the release (student, storage URL, editions, sizes, system prompt,
  the 95 % gate) and the rule that retires other students' files;
  `src/harness/__tests__/levels.test.ts` covers the C1 and C2 levels end to end (the level table, the C1/C2 noun rule
  and drill pool, the cards, scenes, writing tasks, talking points, taboo cards and their translations) and
  `src/state/__tests__/authored.test.ts` the authored store's migration (a C1 and a C2 topic slot for stores saved
  before the level existed);
  `src/state/__tests__/settings.test.ts` checks that settings saved by older builds migrate (a stored `Q6_K`
  becomes `Q5_K_M`, the automatic download is turned on).
- The lexicon tests use the full `lexicon.json` when `.model-cache/` holds it (run the data pipeline once).
- Running the model itself can only be checked on a device: **Me › Your tutor** has a stream test that asks one
  question and reports the pieces streamed, the time to the first piece and the total time, next to the engine's
  own statistics (requests, tokens, tokens per second).
- A full German battery (60 cases in groups A-J: questions, corrections, translations in both directions, word
  lists, drills, grammar cards, role-play turns, a writing task, a lesson plan; plus the bench K and the authoring
  run L below) lives in `src/features/selfTest.ts`.
  The screen that runs it (`src/app/selftest.tsx`) does nothing unless `EXPO_PUBLIC_SELFTEST=1` was set at build
  time (for example in a `.env.local`, which is not committed; the value is compiled into the bundle, so the file
  must be gone before a build meant for learners). Open it with
  `adb shell am start -a android.intent.action.VIEW -d "eszett://selftest" com.lamplitlabs.eszett` and read the
  results with `adb logcat -s ReactNativeJS | grep SELFTEST`: a `SELFTEST BEGIN {…}` line (device, platform,
  edition, note layout, whether the full lexicon was loaded, number of cases), one `SELFTEST {json}` line per
  case (longer than 3,000 characters it goes out in chunks as `SELFTEST# <case> <k>/<n> <chunk>`; texts are
  clipped at 1,200 characters), then `SELFTEST END {…}` with the counts. `?only=` runs a subset, comma-separated
  case ids, id prefixes or group letters (`-d "eszett://selftest?only=chat-35,G"`). Every record carries
  `stream.firstMs` (the first streamed piece, measured from the start of the case) and `stats` from the engine:
  `promptTokens` (the last prompt's length), `cached` (how many of its tokens the cache already held),
  `evaluated` (tokens evaluated during the case, primes included), `promptMs`, `primes`, `tokS`. On a Galaxy S20
  FE (CPU only) the battery takes about 45 minutes.
- Group K is the latency bench (`?only=K`, 12 cases): six prompts (a time question, a correction, four grammar
  questions; five of them draw a rule note), each run in both note layouts after the prime a typing learner
  would have caused (`tutor.prepare`, awaited), so the cache hit of the `'before'` layout and its effect on the
  answer can be read side by side. Its records add `layout`, `primeMs` (the prime) and `firstMs` (from the send,
  after the prime, to the first piece).
- Group L is the authoring run (`?only=L`, 5 cases): the model writes a scene card ("returning a jacket at a
  clothes shop, the zip is broken"), the tutor then plays a turn of that scene and suggests replies, writes an
  informal A2 task ("a weekend trip with a friend"), a grammar card ("adjective endings after ein") and names
  vocabulary topics beyond the app's A2 list. Every record carries the parsed result (the card, the notes and
  warnings, the dropped examples, the rule notes the prompt carried) and the model's raw draft (`text`), so a
  draft the parser rejected can be read as the model shaped it; a rejected draft is a failed case with the
  draft kept. `src/harness/__tests__/authoring.test.ts` covers the parsers on fixtures (the lexicon-dependent
  cases need the full `lexicon.json`).

## Layout

```
src/app/                 screens (Expo Router)
  _layout.tsx            fonts, theme, the boot hook (loads the model once settings are hydrated, rescans on foreground), the splash timeout
  (tabs)/                Today (index), Tutor, Practice, Scenes, Me (one screen: who you are, the week, and the doors below)
  progress.tsx, settings.tsx, account.tsx, about.tsx   Me › Progress (areas, speaking, the notebooks), Settings (level, languages, appearance, how the tutor works, reminders), Account (sign out, delete), About (licences, website, updates, rating)
  model.tsx              Me › Your tutor: edition, download / pause / resume, files on the phone, download source, stream test
  unlock.tsx             Me › Full access: the free week, the one-time purchase, restore (see "Free week and full access")
  onboarding.tsx, review.tsx, words.tsx, drill/, grammar/ ([key] and new), scene/, word/, write/ ([id] and new)
  path/                  the course: index (the level's weeks), [unit] (a week's steps by skill), check/[unit] (the week's Lerncheck); see "The learning path"
  read.tsx               Lesen & Hören: the text the tutor writes on a topic, listen first, three questions checked by the app
  speak.tsx              Sprechen: the week's sentences to listen to and say, checked word by word against what the phone's recognizer heard
  together/              practising together: index (hub), talk, duel, taboo, whoami, story, scrabble, wordle (see "Practising together")
src/model/
  manifest.ts            editions (Q5_K_M, Q8_0), sizes, the storage URLs, "does this edition fit this phone", "is this our model" (pure TS, tested)
  files.ts               Documents/models, download tasks (pause state persisted), sideload scan, picker, lexicon file
  engine.ts              llama.rn: load, metadata, cache primes (home prefix, typing-time prepare), greedy streaming generation, the queue; engine.web.ts stub
  runtime.ts             zustand store: status machine, boot (auto-download), download (size check), useLocal (header check), remove; the Tutor instance
src/harness/             prompts, grounding, parsers, lexicon, engines, rules, role-play, writing, authoring (model-written scenes, tasks, cards, topics), together (talking points, Taboo, story chain, duel), whoami (the Who am I? cards and scoring), template renderer, path (the course's weeks, skills, progress and routes; pure, tested), reading (the reading draft read by shape), speaking (what was heard against the sentence to say)
src/features/            lesson planning (the course's slice first, the tutor's plan after), topics (the word-list topics per level), path + CourseCard (the course's labels, routes, today's slice, the check's and the speaking step's sentences and the Today card), dictation (the phone's German speech recognizer, on the device, for the composer's microphone and the speaking step), chat, scene icons, AuthorBox (the "your tutor writes it" box), modelStatus (status wording), access + accessRules + accessBind + purchases (the free week and the one-time purchase), release + releaseRules (the update check), review + reviewRules (the store-review ask), together (the two names, sessions played), the self-test battery
src/i18n/                t()/tIn()/useI18n, languages, plural rules, catalogs, bind (device locale, RTL, explainIn), content (localised cards, scenes, rules, lexicon, levels, writing tasks), locales/<lang>.json
src/mt/                  translation on this phone (ML Kit): store (one language pack, session cache), bind, languages (who it is for, when a question is translated), markdown (German-protecting line translation), question (German-protecting question translation), glossary, useTranslated
modules/eszett-translate/  the local Expo module over ML Kit Translate: Kotlin (android/), Swift + podspec (ios/), index.ts
src/state/               settings (edition, download source, chosen file, automatic download, language, explainIn; migrations in settingsMigration.ts), progress, saved words, authored (content the model wrote on this phone)
src/ui/                  theme, type, red pen, check footers, Markdown, Mark (the ß), the lamp glow (model status), DrillAnswer (article buttons, choices, answer field shared by the drills and the duel), Composer (the writing field with the dictation microphone), KeyboardAvoider (keeps composers above the keyboard; Android is edge-to-edge, so adjustResize alone does nothing)
src/data/                grounding.json, lexicon-core.json, model.json (prompt, template, GGUF editions), scenes, grammar, rules, path.json (the course's weeks), together.json (talking points); i18n/<lang>.json content overlays (+ en.source.json, generated)
assets/images, assets/brand   the icons and the mark's SVG source
scripts/build-data.mjs   rebuilds src/data from the Hub and the export manifest in our storage
scripts/build-words.mjs  rebuilds src/data/words.json from the content data and model-words.json (see "The word list")
scripts/model-words.mjs  asks the release GGUF for the game words: writes src/data/model-words.json (see "The word list")
scripts/make-icons.py    rebuilds assets/images from the mark (fonttools, pillow, rsvg-convert)
scripts/i18n-*.mjs       i18n-content-source (en.source.json from the data files), i18n-content-check <lang>, i18n-ui-check <lang…>
scripts/verify.sh        typecheck + tests + i18n check; the entry point the scheduled check runs (see "Tests")
scripts/audit.sh         dependency audit: exits non-zero on a high or critical vulnerability
release.json             the published store-version file (see "Update and review prompts")
```

The review screen (`src/app/review.tsx`, reached from Practice › My words, Me › My words and Today's due card)
drills the saved words and lists them under **All words**; the list header's share button ("Share list (CSV)")
sends the deck to the phone's share sheet as CSV — one row per word, columns `word,translation,box` (the card
front, its meaning in the learner's language and the box number the screen prints), RFC 4180-quoted by
`formatDeckWordsCsv` (`src/features/reviewRules.ts`). When the deck is empty the CSV is the header row only.
The header's paste button ("Import words (CSV)") goes the other way: it reads the clipboard, parses it with
`parseDeckWordsCsv` and merges it with `mergeDeckWords` (same file) — words already saved keep the Leitner box
the learner reviewed them into, new words start in box 1 (`src/state/deck.ts` `importWords`). That is how a
list moves to a new phone or comes back after a reinstall.

### Name and mark

The app is **Eszett**, after the ß, the one letter only German has (the model and the toolkit it came from keep
their own names: `lamplitlabs/licht-german-tutor`, the `lichtgwcst001` storage account). The mark is the ß of
Vollkorn Bold, the app's German typeface, in white on a Königsblau square (`#2442C6`, the palette's `royal`, the
fountain-pen ink German pupils write with). `scripts/make-icons.py` reads the glyph from the bundled TTF and
writes every icon: `icon.png` full-bleed for iOS and the stores, the adaptive-icon foreground and monochrome
layers with the letter at 75 % so it clears Android's 66 % safe zone, the splash mark and the favicon; `src/ui/Mark.tsx`
carries the same outline for the app's own screens. After changing the mark or anything native in `app.json`,
`npx expo prebuild --platform android` regenerates the launcher resources (it clears `android/`, so the next
Gradle build compiles llama.cpp again). Ids: scheme `eszett`, package and bundle id `com.lamplitlabs.eszett`, storage
keys `eszett.*`; a phone with the old `com.lamplitlabs.licht` build keeps it as a second app until it is uninstalled.

`app.json` carries the native configuration: the `llama.rn` and `expo-file-system` config plugins (file sharing
and opening documents in place, so Documents shows up in the Files app), the iOS increased-memory-limit and
extended-virtual-addressing entitlements, and the local-network permissions used by download source 3.

## Troubleshooting

| | |
| --- | --- |
| "Not enough memory to load the model" | Close other apps, or choose Q5_K_M instead of Q8_0. Q8_0 is only for phones with 8 GB. |
| "Not enough free space" | The download wants the file size plus 500 MB; delete something or sideload a file. |
| Download paused or interrupted | A paused download is saved and resumes when the app is relaunched; on iOS it runs in a background session, so leaving the app does not stop it. **Cancel** deletes the partial file and switches the automatic download off; **Download** switches it back on. |
| The download does not start by itself | It was cancelled, or the model was removed, on this phone before. Tap **Download** in **Me › Your tutor**. |
| "The download is incomplete" | The finished file was not the size the export manifest lists: a Wi-Fi login page instead of the file, a connection that ended early, or a custom download source serving another file. The file was deleted; try again (on a network without a captive portal, or with the source field empty). |
| Download fails | The files are public blobs: `curl -I https://lichtgwcst001.blob.core.windows.net/models/light-german-tutor-phone-v27/gguf/light-german-tutor-phone-v27-Q5_K_M.gguf` should answer 200. Check the **Download source** in **Me › Your tutor › Advanced** is empty, or points at a computer that serves the same files. |
| "This file isn't the Eszett tutor model" | The chosen GGUF's header names another model. Only the tutor is loaded; download it, or pick the right file. |
| The simulator is very slow | Metal is not available in the iOS simulator; it runs on the CPU. Use a device. |
| Expo Go shows a native-module error | Expo Go cannot load llama.rn; build a development build (above). |
| Android emulator | x86_64 images run the model on the CPU, slowly; fine for UI work. 32-bit ABIs are not supported by llama.rn. |
| A sideloaded file is not listed | Only `*.gguf` files in the Documents root or `models/` are listed; `.part` files are ignored. Bring the app back to the foreground to rescan. |
| The web build says "Not available here" | By design: the model runs only on a phone. |

Earlier versions of this app talked to a model host on a laptop (`../server`); it has been removed. Everything
runs on the phone now.
