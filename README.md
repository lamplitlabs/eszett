# Eszett app

The Expo app of Eszett, the German tutor built around `lamplitlabs/licht-german-tutor`. The 3B model runs on the
phone through [llama.rn](https://github.com/mybigday/llama.rn) (llama.cpp) from a GGUF file; there is no server.
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

The app wants one GGUF of the **light-german-tutor-phone-v25** export, `light-german-tutor-phone-v25-Q5_K_M.gguf`
(default) or `-Q8_0.gguf`. The files are public blobs in the `models` container of our Azure storage account
`lichtgwcst001` (resource group `licht`, germanywestcentral): anonymous read by URL, no listing. The private
`students` container holds every export and is never referenced by the app.

| Edition | Size | Top-1 agreement with the full model | Phone | |
| --- | --- | --- | --- | --- |
| **Q5_K_M** | 2.2 GB | 96.2 % | 6 GB of RAM | The default: the phone edition. |
| **Q8_0** | 3.3 GB | 98.8 % | 8 GB of RAM | Offered on phones that report 8 GB. |
| Q4_K_M | 1.9 GB | 93.3 % | | Fails the 95 % gate; not shipped. |
| bf16 | 6.2 GB | | | The reference the quants are measured against; not for phones. |

v25 is the v24 recipe (same 3B base, SmolLM3-3B, same chat template, byte-identical system prompt, lexicon and
24-note grounding pack) trained on a 10,215-row set that now carries **C2** material, with v24's validation split
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

1. **Download from our storage.** The app downloads
   `https://lichtgwcst001.blob.core.windows.net/models/light-german-tutor-phone-v25/gguf/<file>` to its Documents
   folder (the URL comes from `src/data/model.json`, built by the data pipeline below). The download runs as an
   iOS background session, can be paused, and resumes on relaunch; it refuses to start when free space is below
   the file size plus 500 MB. When it finishes the app compares the file's size with the export manifest; a
   file that is short or long (a captive portal's page, a connection that ended early, a different file at a
   custom source) is deleted and reported as "The download is incomplete".
2. **Sideload a file.** Any `*.gguf` dropped into the app's Documents folder is picked up: on iOS through the
   Files app (On My iPhone › Eszett) or Finder file sharing when the phone is plugged in; the app rescans when it
   returns to the foreground without a model. Or tap **Choose a file…** in **Me › Your tutor** to pick a GGUF with
   the system picker; it is moved into the app's `models/` folder. Before loading a chosen file the app reads
   its GGUF header: a file whose `general.name` is another model is refused ("This file isn't the Eszett tutor
   model"); a file without a readable name is given the benefit of the doubt.
3. **A computer on the Wi-Fi as download source.** In the folder that contains the `.gguf` files run
   `python3 -m http.server 8000`, then set the **Download source** in **Me › Your tutor › Advanced** to
   `http://<laptop-ip>:8000` and download as in 1. The app requests `<source>/<file>` and checks the finished
   size against the export manifest, so serve the v25 files themselves under the names above.
   (`NSAllowsLocalNetworking` on iOS and `usesCleartextTraffic` on Android exist for this.)

Where the file lives: `Documents/models/<file>` (a `.part` file while downloading; sideloaded files in the
Documents root are used in place). Documents survives cache purges and, on iOS, is included in the iCloud backup,
so **Remove** in **Me › Your tutor** when the model should go. The app remembers the chosen file in its settings.

The bundled data (`src/data`) comes from two places: the lexicon from Hub revision v16 of the data release
(byte-identical to the one in the v25 export), and from the export itself the grounding notes
(`grounding.json`, the pack the student was trained with — the Hub's v16 pack is the fallback for an export
that does not publish one; `model.json.grounding_source` says which was used), the system prompt from the
`Modelfile` (the SYSTEM block the student was trained with) and the chat template from `chat_template.jinja`,
all published next to the GGUFs. At load the app compares the GGUF's embedded chat
template with the bundled one; when they match, prompts are rendered by `src/harness/template.ts`, otherwise by
llama.rn's Jinja renderer from the file's own template. After the model is ready the app downloads the full
lexicon (`lexicon.json`, about 4.5 MB, 88k nouns) from the Hub at that revision into `models/`; until then
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

The prompts and the reader were tuned against the students themselves (v13, then v23; v24 and v25 share v23's system
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

## Data pipeline

```bash
node scripts/build-data.mjs [revision] [student]     # default: v16 light-german-tutor-phone-v25; also: npm run build-data
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

The GGUFs of every export sit in the private `students` container; a student the app should run is copied,
server-side, into the public `models` container (only the shipped GGUFs, the manifest, the Modelfile, the chat
template and the grounding pack become public):

```bash
S=light-german-tutor-phone-v25
for f in gguf/$S-Q5_K_M.gguf gguf/$S-Q8_0.gguf gguf/gguf_manifest.json gguf/SHA256SUMS gguf/Modelfile chat_template.jinja; do
  # grounding.json lives in the export's -collect folder: copy it as $S/grounding.json (v24, v25: students/$S-collect/$S/grounding.json)
  az storage blob copy start --auth-mode key --account-name lichtgwcst001 \
    --destination-container models --destination-blob $S/$f \
    --source-container students --source-blob $S/$f
done
node scripts/build-data.mjs v16 $S     # the Hub revision of lexicon/grounding, then the student
```

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
until each pool has its entry: `SUGGESTIONS` (Tutor), `WORD_TOPICS` and `WORD_TOPIC_KEY` (lesson, with a
`topics.*` catalog key each), `VERB_LEVEL_POOL` (drills), `WORDS_FOR_LEVEL` (authoring), `STORY_OPENERS` and the
talking points (`together.json` is checked to hold topics × levels × 3), the `levels.<L>` block of every content
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
  meanings in the release are thin ("Stand" → stand, "Messlatte" → bar, "Trumpf" → trump) and a few everyday words
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

## Languages

The UI and the bundled content exist in twelve languages (`src/i18n/languages.ts`: en de fr es it pt pl ru uk tr ar
zh). The pieces:

- `src/i18n/index.ts` — `t(key, vars)`, `tIn(lang, key, vars)`, `useI18n()`; flat catalogs, `{placeholders}`, plural
  objects picked by `vars.count` with the CLDR rules in `plural.ts` (pl/ru/uk have one/few/many, ar six forms, zh one).
  Missing keys fall back to English, then to the key (one warning per key in `__DEV__`). Pure TypeScript, tested in Node.
- `src/i18n/locales/<lang>.json` — the UI catalogs (907 keys; `en.json` is the reference).
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

## Free week and full access

Everything is open for seven days from the first start; after that the tutor model needs a one-time purchase (no
subscription). The drills, rule cards, word lookups and the pass-and-play games stay free for good — the gate is
only on the model.

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
  In-App Purchases add a **Non-Consumable** with product id `eszett_full_access`, a price, the display name and
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
- **Google Play.** Play Console › Monetize › Products › In-app products: product id `eszett_full_access`, one-time,
  active. Purchases only work for builds signed with the upload/app signing key that Play knows (an internal
  testing track is enough) and for accounts listed as licence testers.

**Limitations, on purpose:** there is no server and no receipt verification — the device's own StoreKit / Play
Billing state is trusted, the same way the rest of the app trusts the phone. A reinstall starts a new week (the
trial record lives in AsyncStorage); a rooted phone can edit it. The purchase itself is tied to the store account
and comes back through Restore on any phone. Learners who update from a version without the gate get seven days
from the first start of the new version.

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
- **Talking points** (`talk.tsx`): `src/data/together.json` holds 120 German questions, eight topics × five levels
  × three, each with its English, French, Spanish and Italian gloss and up to three key words. The screen shows
  who asks and who answers (alternating; the swap button exists), the question with its voice button, the gloss
  in the app's language (bundled for fr/es/it; English, translated on the phone when the ML Kit pack is there,
  for the others; nothing for German), the key words with article and meaning from the lexicon (resolved at
  render against `tutor.lexicon ?? coreLexicon`; a compound the lexicon does not list as a whole takes article
  and plural from its last part through `LexiconIndex.compoundHead` — *die Vier-Tage-Woche*, *die
  Debattenkultur* — and the word sheet says so in an amber note; a bare lemma otherwise), and a composer to
  have a sentence checked with the normal correction prompt. A level's own three questions come first, lower
  levels fill in. Questions the model wrote for a custom topic reach the screen through the store's
  non-persisted `custom` field, not through route params.
- **Duel** (`duel.tsx`): `newDuel` builds `2 × rounds` drills of one category (`DUEL_CATEGORIES` leaves out the
  slow ordinal and sentence drills) with the drill engine; players alternate, one attempt each (typed digits in a
  number drill only ask for the word), the answer and hint after every turn, then "pass the phone". `ArticleButtons`, `Choices`
  and `AnswerField` moved from the drill screen into `src/ui/DrillAnswer.tsx` so both use the same controls.
- **Taboo** (`taboo.tsx`): `tabooCards` deals 40 hand-written cards (word, article, meaning, forbidden words) at
  or below the level first, then lexicon nouns without forbidden words; for those, `tutor.tabooWords` asks the
  model for three or four words (`tabooPrompt`, 40 tokens, `priority: 'background'`) for the current and the
  next card while the players talk, and the card fills in when the answer arrives; it is playable without. Sixty
  seconds a turn (`TABOO_SECONDS`), then the roles swap; two turns make a game.
- **Story chain** (`story.tsx`): an opener per level (`STORY_OPENERS`), one sentence each, every sentence checked
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
  (tabs)/                Today (index), Tutor, Practice, Scenes, Me
  model.tsx              Me › Your tutor: edition, download / pause / resume, files on the phone, download source, stream test
  unlock.tsx             Me › Full access: the free week, the one-time purchase, restore (see "Free week and full access")
  onboarding.tsx, review.tsx, words.tsx, drill/, grammar/ ([key] and new), scene/, word/, write/ ([id] and new)
  together/              practising together: index (hub), talk, duel, taboo, story, scrabble, wordle (see "Practising together")
src/model/
  manifest.ts            editions (Q5_K_M, Q8_0), sizes, the storage URLs, "does this edition fit this phone", "is this our model" (pure TS, tested)
  files.ts               Documents/models, download tasks (pause state persisted), sideload scan, picker, lexicon file
  engine.ts              llama.rn: load, metadata, cache primes (home prefix, typing-time prepare), greedy streaming generation, the queue; engine.web.ts stub
  runtime.ts             zustand store: status machine, boot (auto-download), download (size check), useLocal (header check), remove; the Tutor instance
src/harness/             prompts, grounding, parsers, lexicon, engines, rules, role-play, writing, authoring (model-written scenes, tasks, cards, topics), together (talking points, Taboo, story chain, duel), template renderer
src/features/            lesson planning, chat, scene icons, AuthorBox (the "your tutor writes it" box), modelStatus (status wording), access + accessRules + accessBind + purchases (the free week and the one-time purchase), release + releaseRules (the update check), review + reviewRules (the store-review ask), together (the two names, sessions played), the self-test battery
src/i18n/                t()/tIn()/useI18n, languages, plural rules, catalogs, bind (device locale, RTL, explainIn), content (localised cards, scenes, rules, lexicon, levels, writing tasks), locales/<lang>.json
src/mt/                  translation on this phone (ML Kit): store (one language pack, session cache), bind, languages (who it is for, when a question is translated), markdown (German-protecting line translation), question (German-protecting question translation), glossary, useTranslated
modules/eszett-translate/  the local Expo module over ML Kit Translate: Kotlin (android/), Swift + podspec (ios/), index.ts
src/state/               settings (edition, download source, chosen file, automatic download, language, explainIn; migrations in settingsMigration.ts), progress, saved words, authored (content the model wrote on this phone)
src/ui/                  theme, type, red pen, check footers, Markdown, Mark (the ß), the lamp glow (model status), DrillAnswer (article buttons, choices, answer field shared by the drills and the duel), KeyboardAvoider (keeps composers above the keyboard; Android is edge-to-edge, so adjustResize alone does nothing)
src/data/                grounding.json, lexicon-core.json, model.json (prompt, template, GGUF editions), scenes, grammar, rules, together.json (talking points); i18n/<lang>.json content overlays (+ en.source.json, generated)
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
| Download fails | The files are public blobs: `curl -I https://lichtgwcst001.blob.core.windows.net/models/light-german-tutor-phone-v25/gguf/light-german-tutor-phone-v25-Q5_K_M.gguf` should answer 200. Check the **Download source** in **Me › Your tutor › Advanced** is empty, or points at a computer that serves the same files. |
| "This file isn't the Eszett tutor model" | The chosen GGUF's header names another model. Only the tutor is loaded; download it, or pick the right file. |
| The simulator is very slow | Metal is not available in the iOS simulator; it runs on the CPU. Use a device. |
| Expo Go shows a native-module error | Expo Go cannot load llama.rn; build a development build (above). |
| Android emulator | x86_64 images run the model on the CPU, slowly; fine for UI work. 32-bit ABIs are not supported by llama.rn. |
| A sideloaded file is not listed | Only `*.gguf` files in the Documents root or `models/` are listed; `.part` files are ignored. Bring the app back to the foreground to rescan. |
| The web build says "Not available here" | By design: the model runs only on a phone. |

Earlier versions of this app talked to a model host on a laptop (`../server`); it has been removed. Everything
runs on the phone now.
