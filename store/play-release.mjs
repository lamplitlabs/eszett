// Uploads an Android App Bundle to a Play track through the Play Developer API
// and sets the release notes from metadata/android/<locale>/release_notes.txt:
// edits -> bundles upload -> tracks.update -> validate -> commit.
//
//   node store/play-release.mjs <file.aab>                         # dry run: checks the bundle and prints the plan; no credentials needed
//   node store/play-release.mjs <file.aab> --apply                 # upload to the internal testing track and commit
//   node store/play-release.mjs <file.aab> --apply --track alpha   # closed testing; also beta, production
//   node store/play-release.mjs <file.aab> --apply --status draft  # keep the release as a draft to roll out in the Console
//   node store/play-release.mjs <file.aab> --apply --symbols android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
//
// --symbols uploads the native debug symbols (the zip Gradle writes next to the bundle) so Play symbolicates native
// crashes and ANRs; without it the Console warns. A ProGuard mapping file (--mapping) is only produced when R8 is on
// (android.enableMinifyInReleaseBuilds), which this app does not do.
//
// The bundle has to be signed with the app's upload key (android/app/build.gradle
// reads ESZETT_UPLOAD_* from ~/.gradle/gradle.properties or the environment;
// store/README.md). Credentials as in lib/play-api.mjs: the service account needs
// "Release to testing tracks" (or "Release to production" for that track).
import { Buffer } from "node:buffer";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { API, createPlayClient, explainError, fail, readPackageName, relative } from "./lib/play-api.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const metadataRoot = path.join(here, "metadata/android");
const TRACKS = ["internal", "alpha", "beta", "production"];
const STATUSES = ["completed", "draft", "inProgress", "halted"];
const NOTES_LIMIT = 500;
const MAX_BUNDLE_BYTES = 200 * 1024 * 1024;

function parseArgs(argv) {
  const args = { file: null, apply: false, track: "internal", status: "completed", help: false, fraction: null, symbols: null, mapping: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") args.apply = true;
    else if (arg === "--dry-run") args.apply = false;
    else if (arg === "--track") args.track = argv[++i];
    else if (arg === "--status") args.status = argv[++i];
    else if (arg === "--fraction") args.fraction = Number(argv[++i]);
    else if (arg === "--symbols") args.symbols = argv[++i];
    else if (arg === "--mapping") args.mapping = argv[++i];
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg.startsWith("--")) fail(`unknown argument ${arg} (see --help)`);
    else if (args.file) fail("one bundle at a time");
    else args.file = arg;
  }
  if (!args.help) {
    if (!args.file) fail("name the .aab to upload (see --help)");
    if (!TRACKS.includes(args.track)) fail(`--track must be one of ${TRACKS.join(", ")}`);
    if (!STATUSES.includes(args.status)) fail(`--status must be one of ${STATUSES.join(", ")}`);
    if (args.status === "inProgress" && !(args.fraction > 0 && args.fraction < 1)) fail("--status inProgress needs --fraction between 0 and 1 (a staged rollout)");
  }
  return args;
}

function usage() {
  console.log(`Usage: node store/play-release.mjs <file.aab> [--apply] [--track internal|alpha|beta|production] [--status completed|draft|inProgress|halted] [--fraction 0.1]
  (no flag)   dry run: check the bundle and the release notes, print the plan; needs no credentials
  --apply     upload the bundle, set the track's release with the notes, validate and commit
  --track     the Play track (default internal, the internal testing track)
  --status    completed (default: rolled out to the track), draft (finish in the Console), inProgress (+ --fraction), halted
  --symbols   native-debug-symbols.zip to attach to the bundle (Play symbolicates native crashes)
  --mapping   ProGuard/R8 mapping.txt to attach (only when minification is on)
Environment: PLAY_SERVICE_ACCOUNT_KEY (key file) or PLAY_SERVICE_ACCOUNT (keyless) or PLAY_ACCESS_TOKEN,
PLAY_PACKAGE_NAME (optional override of android.package in app.json).`);
}

/** Release notes from every metadata locale that has release_notes.txt. */
function loadNotes() {
  const notes = [];
  for (const language of readdirSync(metadataRoot).sort()) {
    const file = path.join(metadataRoot, language, "release_notes.txt");
    if (!existsSync(file) || !statSync(path.join(metadataRoot, language)).isDirectory()) continue;
    const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n").trim();
    if (!text) continue;
    const length = [...text].length;
    if (length > NOTES_LIMIT) fail(`${relative(file)}: ${length} characters, Play allows ${NOTES_LIMIT}`);
    notes.push({ language, text });
  }
  if (!notes.some((note) => note.language === "en-US")) fail(`missing ${relative(path.join(metadataRoot, "en-US/release_notes.txt"))}`);
  return notes;
}

function checkBundle(file) {
  const resolved = path.resolve(file);
  if (!existsSync(resolved)) fail(`no such file: ${file}`);
  if (!/\.aab$/i.test(resolved)) fail("Play accepts Android App Bundles (.aab) only; build one with `cd android && ./gradlew :app:bundleRelease`");
  const bytes = readFileSync(resolved);
  // an .aab is a zip: PK\x03\x04
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) fail(`${file} is not a zip archive`);
  if (bytes.length > MAX_BUNDLE_BYTES) fail(`${file} is ${bytes.length} bytes; Play's limit for a bundle is ${MAX_BUNDLE_BYTES}`);
  if (!bytes.includes(Buffer.from("META-INF/"))) console.warn("  ! the bundle seems unsigned; Play needs it signed with the upload key");
  return { resolved, bytes };
}

async function release(client, packageName, bundle, notes, args) {
  const edit = await client.request("POST", `/applications/${packageName}/edits`, { body: {} });
  const editPath = `/applications/${packageName}/edits/${edit.id}`;
  console.log(`edit ${edit.id} opened`);
  try {
    const uploaded = await client.upload(`${editPath}/bundles`, { contentType: "application/octet-stream", bytes: bundle.bytes });
    console.log(`bundle uploaded: versionCode ${uploaded.versionCode}, sha256 ${uploaded.sha256?.slice(0, 16)}…`);
    for (const [file, type] of [[args.symbols, "nativeCode"], [args.mapping, "proguard"]]) {
      if (!file) continue;
      const bytes = readFileSync(path.resolve(file));
      await client.upload(`${editPath}/apks/${uploaded.versionCode}/deobfuscationFiles/${type}`, { contentType: "application/octet-stream", bytes });
      console.log(`${type === "nativeCode" ? "native debug symbols" : "mapping file"} attached (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`);
    }
    const releaseBody = {
      status: args.status,
      versionCodes: [String(uploaded.versionCode)],
      releaseNotes: notes.map((note) => ({ language: note.language, text: note.text })),
      ...(args.status === "inProgress" ? { userFraction: args.fraction } : {}),
    };
    await client.request("PUT", `${editPath}/tracks/${args.track}`, { body: { track: args.track, releases: [releaseBody] } });
    console.log(`track ${args.track}: release ${args.status} with notes in ${notes.length} language(s)`);
    await client.request("POST", `${editPath}:validate`);
    console.log("validated by Google");
    try {
      await client.request("POST", `${editPath}:commit`);
      console.log(`committed; versionCode ${uploaded.versionCode} is on the ${args.track} track`);
    } catch (error) {
      if (error.status !== 400 || !/review/i.test(error.message)) throw error;
      await client.request("POST", `${editPath}:commit`, { query: { changesNotSentForReview: "true" } });
      console.log("committed but not sent for review: open Play Console -> Publishing overview and send the changes for review");
    }
  } catch (error) {
    await client.request("DELETE", editPath).catch(() => {});
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  const packageName = readPackageName();
  const bundle = checkBundle(args.file);
  const notes = loadNotes();
  console.log(`${relative(bundle.resolved)}: ${(bundle.bytes.length / 1024 / 1024).toFixed(1)} MB; release notes in ${notes.map((note) => note.language).join(", ")}`);
  for (const file of [args.symbols, args.mapping]) if (file && !existsSync(path.resolve(file))) fail(`no such file: ${file}`);
  if (!args.apply) {
    console.log(`\ndry run for ${packageName} - nothing is sent`);
    console.log(`POST ${API}/applications/${packageName}/edits`);
    console.log(`POST .../edits/<id>/bundles  (upload ${relative(bundle.resolved)})`);
    console.log(`PUT  .../edits/<id>/tracks/${args.track}  (status ${args.status}${args.fraction ? `, fraction ${args.fraction}` : ""})`);
    console.log("POST .../edits/<id>:validate, then :commit with --apply");
    return;
  }
  const client = await createPlayClient();
  await release(client, packageName, bundle, notes, args);
}

main().catch((error) => {
  explainError(error);
  process.exit(1);
});
