# The store, from the repository

What Google Play should show and sell lives here and is pushed with three small scripts on the official Play
Developer API - no fastlane, no dependencies beyond Node and Pillow. The pattern (and most of the code) comes from
the Leben in Deutschland app's `src/store/` (ADR-008 there). What the API cannot do - creating the app, inviting
the service account, the content declarations - is the owner's checklist in [`PLAY-CONSOLE.md`](PLAY-CONSOLE.md).

```
store/
  metadata/android/<locale>/   title.txt (30), short_description.txt (80), full_description.txt (4000),
                               release_notes.txt (500), screenshots.txt (one caption per capture, 60 each)
                               for en-US de-DE fr-FR es-ES it-IT pt-BR pl-PL ru-RU uk tr-TR ar zh-CN
  metadata/android/one-time-products.json   the three products: ids, euro prices, listings in twelve languages
  metadata/youtube/<lang>.md   titles, descriptions and tags for the promo videos on YouTube (en, de)
  captures/                    phone screenshots from the device, in display order (adb exec-out screencap -p)
  output/                      rendered by compose.py, not committed: <locale>/phone/NN.png, <locale>/feature.png, icon.png
  compose.py                   renders the Play graphics from the captures and the metadata (Pillow)
  product-icons.py             renders the icons of the three products (the app's Lucide icons via rsvg-convert); uploaded by hand
  video.py                     renders the silent promo video per locale, landscape and portrait (Pillow + ffmpeg); uploaded to YouTube by hand
  play-products.mjs            creates, prices and activates the one-time products
  play-listing.mjs             pushes texts and images of the listing (validate first, then apply)
  play-release.mjs             uploads a signed .aab to a track with the release notes
  lib/play-api.mjs             the API client: credentials, JSON calls, media uploads, readable errors
```

## Credentials

The scripts authenticate as the Google Cloud service account
`play-publisher@eszett-play.iam.gserviceaccount.com` (Eszett's own Cloud project `eszett-play`, owned by the lamplitlabs account, with the Google Play Android
Developer API enabled; Play no longer needs the project linked, only the account invited). The
account has to be invited in Play Console → Users and permissions (PLAY-CONSOLE.md, step 2). First match wins:

| Variable | Meaning |
| --- | --- |
| `PLAY_ACCESS_TOKEN` | a short-lived token minted elsewhere |
| `PLAY_SERVICE_ACCOUNT` (+ `PLAY_WIF_PROVIDER` in GitHub Actions) | keyless: impersonation through your `gcloud auth login` (needs `roles/iam.serviceAccountTokenCreator` on the account) or Workload Identity Federation |
| `PLAY_SERVICE_ACCOUNT_KEY` | path to the JSON key; **the default is `~/.pulse/private/providers/play-service-account.json` when it exists**, which is where the key lives on the laptop (mode 600, never in the repository) |

The same key is the repository secret `PLAY_SERVICE_ACCOUNT_KEY_JSON` for the Play Publish workflow, and it goes into
the download server's `GOOGLE_SERVICE_ACCOUNT_JSON` setting for receipt verification (README, "Business model,
accounts and the server"). `PLAY_PACKAGE_NAME` overrides `expo.android.package` from `app.json`.

## Commands

Every script dry-runs without credentials and prints what it would send; nothing leaves the machine without
`--validate` (a draft edit Google checks and we discard) or `--apply`.

```bash
node store/play-products.mjs                 # validate the definition
node store/play-products.mjs --list          # what Play has
node store/play-products.mjs --apply         # create or update the products, Google's regional prices, activate
python3 store/product-icons.py               # output/products/<id>.png: the product icons, uploaded in the Console by hand

python3 store/compose.py                     # output/: icon, feature graphics, framed screenshots for every locale
node store/play-listing.mjs                  # what would be sent
node store/play-listing.mjs --validate       # upload into a draft edit, let Google validate, discard
node store/play-listing.mjs --apply          # publish the listing (texts and images, twelve languages)
node store/play-listing.mjs --apply --text-only --lang de-DE

node store/play-release.mjs android/app/build/outputs/bundle/release/app-release.aab           # check the bundle
node store/play-release.mjs <file.aab> --apply                                                  # internal testing track
node store/play-release.mjs <file.aab> --apply --track production --status inProgress --fraction 0.1
node store/play-release.mjs <file.aab> --apply --symbols android/app/build/outputs/native-debug-symbols/release/native-debug-symbols.zip
```

`--symbols` attaches the native debug symbols Gradle writes next to the bundle (CI keeps them in the artifact as
`eszett-v…-symbols.zip`), so Play symbolicates native crashes and ANRs and stops warning about missing
deobfuscation files. There is no ProGuard mapping to upload: the app does not minify (`enableMinifyInReleaseBuilds`
is off; R8 and the llama.rn/ML Kit JNI would need rules and testing first).

Rules the scripts keep: unchanged texts and byte-identical image sets are skipped; the euro price in the definition
is what euro countries see, other regions come from `pricing:convertRegionPrices` (the price is passed
tax-exclusive, Play adds local tax); the single purchase option stays `legacyCompatible` because `expo-iap`'s
`fetchProducts` reads `OneTimePurchaseOfferDetails`; a commit that Play wants reviewed is committed with
`changesNotSentForReview` and said so - send it from Publishing overview.

## Screenshots

`captures/` holds the real screens from the phone (1080×2400). `compose.py` puts each on a 1080×1920 frame
(Play's 9:16; a raw 2400-pixel capture is taller than Play's 2:1 limit) with the caption from
`screenshots.txt`, alternating royal and paper backdrops, and renders the 1024×500 feature graphic from the
title and short description. Captures to take (Home with a greeting and the course card, the course's week, a
tutor answer with the red pen, a scene mid-dialogue, the one-minute result, the mock exam) - the captions in
every locale are written for exactly these six, in this order.

## The promo video

`python3 store/video.py` renders `output/video/promo-<locale>-<orientation>.mp4` from the same captures and captions as
the screenshots: an intro card, one scene per capture with a slow push-in, cross-fades, an outro card; 1920×1080
and 1080×1920, 30 fps, about 23 seconds, no audio (nothing to license). Play's listing takes a **YouTube URL**:
upload the landscape file to the Lamplit Labs channel (unlisted is fine, ads off, no end screens), put the link
into `metadata/android/<locale>/video.txt` and run `node store/play-listing.mjs --apply --text-only`; a locale
without the file keeps whatever video the listing has. The portrait file is for Shorts and social posts.

## The bundle and its signature

Play needs an Android App Bundle signed with the **upload key**. The keystore lives outside the repository
(`~/.pulse/private/providers/eszett-upload.keystore`, passwords in `eszett-upload-keystore.json` next to it, a
copy belongs in 1Password). `android/` is generated and not committed, so the Gradle side is an Expo config
plugin, `plugins/withUploadSigning.js` (in `app.json`): at `expo prebuild` it makes `android/app/build.gradle`
read `ESZETT_UPLOAD_STORE_FILE`, `ESZETT_UPLOAD_STORE_PASSWORD`, `ESZETT_UPLOAD_KEY_ALIAS`,
`ESZETT_UPLOAD_KEY_PASSWORD` from `~/.gradle/gradle.properties` or the environment and fall back to the debug key
without them, so the phone on the desk keeps getting its quick builds; `ESZETT_VERSION_CODE` overrides
`app.json`'s `android.versionCode` (CI uses the run number so every build counts up). An `android/` folder
generated before the plugin existed needs `npx expo prebuild --platform android` once (or the plugin's
`applyToBuildGradle` by hand).

```bash
cd android && ./gradlew :app:bundleRelease --console=plain -q     # all seven llama.rn variants: the store build
keytool -printcert -jarfile app/build/outputs/bundle/release/app-release.aab | grep SHA1
# EB:61:FB:65:0B:E0:3D:89:2A:AB:65:FF:4C:BC:D5:90:1A:46:17:AB  (the upload certificate)
```

`.github/workflows/android-release.yml` builds and signs the bundle on every push to `main` (secrets
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`; variables
`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_API_BASE`, `ANDROID_UPLOAD_SHA1`), verifies the certificate,
keeps the `.aab` as an artifact for 30 days and attaches it to a GitHub release on `v*` tags.
`.github/workflows/play-publish.yml` (manual) runs the products, the listing texts, or uploads the latest bundle
to the internal track - the tasks are in its menu.

Play App Signing: on the first upload keep Google's default (Google holds the app signing key, we hold the upload
key). If the upload key is ever lost, Play Console → Setup → App signing → "Request upload key reset".
