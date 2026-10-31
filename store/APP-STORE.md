# App Store: the plan for the iOS release

What has to happen for Eszett to ship on iPhone, in the order it has to happen, with who does each step. The
Android release (store/PLAY-CONSOLE.md, store/README.md) is the template: the listing texts, screenshots, products
and prices are the same, only the plumbing differs. Apple's rules that shape the plan are named where they bite.

## Where we stand

| | State |
| --- | --- |
| Mac | Xcode 27.2, iOS 18 simulators, **Apple Distribution: Manish Tiwari (W7CJ9CQD7Q)** certificate in the keychain (the team that ships Leben in Deutschland), an iPhone 16e paired (`xcrun devicectl list devices`) |
| Project | `expo prebuild --platform ios` generates `ios/` (git-ignored); pods resolve: llama.rn 0.13 (Metal), ExpoIap 6 (StoreKit 2), GoogleMLKit/Translate 9 via the local `modules/eszett-translate` Swift module, expo-speech-recognition (SFSpeechRecognizer on device) |
| App config | `ios.bundleIdentifier` `com.lamplitlabs.eszett`, iOS 16.4+, `supportsTablet`, the increased-memory-limit and extended-virtual-addressing entitlements (the 2.2 GB model needs them), local-networking ATS exception for the dev download source |
| App Store Connect | **No app record yet.** No Paid Apps agreement signed for this team as far as we know (LiD is free). No in-app products. |
| CI | Leben in Deutschland's `ios-release.yml` is the working pattern: ASC API key + distribution cert as secrets, manual signing with a profile `asc-profile.mjs` creates through the ASC API, `xcodebuild archive` → `-exportArchive` with `destination: upload` straight to TestFlight |
| Server | Verifies App Store receipts with the App Store Server API (`APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` settings, not set yet); `APPLE_BUNDLE_ID` is set |

## Phase 0 - does it run? (this week, laptop + iPhone)

The iOS side has compiled before but **never run on an iPhone**. Before any store work:

1. `npx expo prebuild --platform ios && cd ios && pod install`, then `xcodebuild … -sdk iphoneos` (an unsigned
   Release build) to confirm everything compiles with the current dependencies.
2. A development build on the paired iPhone 16e (`npx expo run:ios --device --configuration Release`; needs an
   Apple Development certificate - Xcode creates one with the owner's Apple ID signed in - and the phone in
   Developer Mode).
3. The iOS checklist, each a potential blocker:
   - **Model download**: the background `URLSession` download of 2.2 GB, pause/resume, resume after relaunch, the
     server's SAS link (7 days) and the re-request when it expired.
   - **Memory**: Q5_K_M (2.2 GB) loads only with the increased-memory-limit entitlement and on 6 GB+ iPhones
     (iPhone 16e has 8 GB); the app must refuse Q8_0 on phones with less. Watch for jetsam kills while a scene
     streams. Metal is used for inference; check tokens/s against the Android numbers.
   - **Speech**: `SFSpeechRecognizer` with `requiresOnDeviceRecognition` needs the German on-device model
     (Settings → General → Keyboard → Dictation languages, or iOS downloads it on first use); the one-minute talk
     and the speak step depend on it. Microphone and speech-recognition usage strings are in app.json.
   - **Translation**: ML Kit's frameworks exclude arm64 for the simulator (device only), the pack download and the
     two-direction cache.
   - **Sign-in**: Clerk e-mail code; Google via `startSSOFlow` opens `ASWebAuthenticationSession`; **Apple sign-in
     is mandatory** on iOS when any third-party sign-in is offered (App Store Review 4.8) - it is already in the
     sign-in screen (`oauth_apple`) and needs the production Clerk instance's Apple credentials (Services ID,
     key) plus the "Sign in with Apple" capability in the entitlements.
   - **Layout**: native tabs, safe areas (the Tutor screen's `SafeAreaView edges` guess), the keyboard avoider,
     RTL for Arabic, dark mode, iPad (supportsTablet is on - either make it good or turn it off before review).
   - **Sounds and haptics**, the notification permission flow, the Files-app visibility of `Documents/models`.
   - **IAP**: `expo-iap` with a StoreKit Configuration file in Xcode for the three products, before Connect exists.

Fix what breaks; nothing below starts until the app runs through a lesson, a scene and a minute talk on the phone.

## Phase 1 - Apple accounts and the app record (owner, ~1 hour + Apple's waits)

1. **Paid Apps agreement**: App Store Connect → Business → agreements → Paid Apps; needs the legal entity's bank
   account and tax forms (W-8BEN-E or the German equivalents). Until it is active, `fetchProducts` returns nothing
   and the unlock sheet says the store is not available. **Start this first - banking verification takes days.**
2. **App record**: My Apps → + → New App: iOS, name **Eszett**, primary language English (U.S.), bundle id
   `com.lamplitlabs.eszett` (register it under Certificates, Identifiers & Profiles first, with the capabilities
   In-App Purchase, Sign in with Apple, Increased Memory Limit, Extended Virtual Addressing), SKU `eszett`.
3. **App Store Connect API key** (Users and Access → Integrations → App Store Connect API): role App Manager; the
   `.p8` is downloadable once. Store it at `~/.pulse/private/providers/asc-key.p8` (600) with its key id and issuer
   id in `asc-key.json`; GitHub secrets `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_API_KEY_BASE64`, `APPLE_TEAM_ID`
   (`W7CJ9CQD7Q`). The same key serves the server's receipt verification (`APPLE_ISSUER_ID`, `APPLE_KEY_ID`,
   `APPLE_PRIVATE_KEY` on the function app) - or create a separate key with the In-App Purchase role for that.
4. **Distribution certificate**: the existing Apple Distribution certificate works for every app of the team;
   export it as `.p12` → GitHub secrets `IOS_DIST_CERT_P12_BASE64`, `IOS_DIST_CERT_PASSWORD` (LiD's CI already
   holds the same; reuse the values).
5. **Sign in with Apple** for Clerk production: Certificates, Identifiers & Profiles → Services ID
   `com.lamplitlabs.eszett.signin` with return URL `https://clerk.eszett.lamplitlabs.com/v1/oauth_callback`, a Sign
   in with Apple key; paste Services ID, team id, key id and key into Clerk → SSO connections → Apple.

## Phase 2 - products, listing, build pipeline (from the repository)

1. **In-app purchases** in App Store Connect → the app → Monetization → In-App Purchases:
   `eszett_full_access` **Non-Consumable**; `eszett_fresh_tutor` and `eszett_gift` **Consumable**. Reference names
   and the twelve localized display names/descriptions come from `store/metadata/android/one-time-products.json`
   (the texts are identical). Prices: pick the Apple price tier closest to 29.99 / 12.99 / 29.99 € in Germany
   (Apple sets the other storefronts). Each product needs a review screenshot of the unlock sheet and review notes
   ("Full access unlocks the tutor model download; the free week precedes it"). The ASC API can create them
   (`inAppPurchasesV2`, `inAppPurchaseLocalizations`, `inAppPurchasePriceSchedules`): `store/asc-products.mjs`
   is the port of `play-products.mjs` to write.
2. **Listing** in the twelve languages the app ships (`store/metadata/android/<locale>/` texts fit Apple's limits
   with small edits: name 30, subtitle 30, promotional text 170, description 4000, keywords 100): `asc-listing.mjs`
   writes `appInfoLocalizations` (name, subtitle, privacy policy URL) and `appStoreVersionLocalizations`
   (description, keywords, what's new, support URL `https://eszett.lamplitlabs.com/support`, marketing URL) and
   uploads screenshots. Apple screenshot sizes: 6.9" (1320×2868) and 6.5" (1284×2778) required for iPhone, 13"
   iPad (2064×2752) if supportsTablet stays on - `store/compose.py` gets an `--store apple` mode that frames the
   captures at those sizes with the same captions. No feature graphic; the 1024×1024 icon has no alpha.
3. **App privacy** (Apple's nutrition label, dashboard only): Contact Info → Email Address (linked to the user, used
   for App Functionality); Identifiers → User ID; Purchases → Purchase History; Name (optional, from Google/Apple
   sign-in). No tracking → the ATT prompt is not needed. Age rating questionnaire → 4+ (same answers as Play).
4. **CI** `.github/workflows/ios-release.yml` from LiD's: macOS runner, `npm install`, `expo prebuild --platform
   ios`, `pod install`, import the `.p12` into a temporary keychain, `node store/asc-profile.mjs --serial …` (the
   App Store profile for the certificate, created through the API), `xcodebuild archive` with
   `MARKETING_VERSION` from app.json and `CURRENT_PROJECT_VERSION=$GITHUB_RUN_NUMBER`, verify bundle id and
   version, `-exportArchive` with `ExportOptions.plist` (`destination: upload`, `uploadSymbols: true`) → the
   build appears in TestFlight after processing. `store/ExportOptions.plist` with the bundle id and profile name.
   Expo's generated project uses automatic signing; the archive step overrides with `CODE_SIGN_STYLE=Manual`,
   `PROVISIONING_PROFILE_SPECIFIER="Eszett App Store"`, `DEVELOPMENT_TEAM`.
5. **Build-time config**: `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` (pk_live) and `EXPO_PUBLIC_API_BASE` from the same
   GitHub variables as Android; `expo-build-properties` for `ios.deploymentTarget` 16.4 and
   `useFrameworks: static` if ML Kit demands it (the pod graph says `static_framework`).

## Phase 3 - TestFlight and review (2-3 weeks)

1. First CI upload → TestFlight internal testing (up to 100 testers of the team, no review) on the iPhone 16e and
   borrowed iPhones (a 6 GB model - iPhone 13/14 - to see the memory floor; an older one to confirm the refusal).
2. **StoreKit sandbox**: a Sandbox Apple Account (Users and Access → Sandbox); buy each product, restore on a second
   phone, "Ask to Buy" pending flow; the server's `/v1/purchase` with the App Store Server API (`APPLE_*` settings)
   - test with the sandbox environment flag.
3. External TestFlight (public link, up to 10,000) is optional and needs a Beta App Review (a light review); it
   gives Apple's reviewers a first look at the 2.2 GB download on a phone, which is the one thing a reviewer may
   object to: **disclose the download size and the Wi-Fi recommendation in the description and in the app before
   it starts** (the app does), and keep the free week working without the download (it does: drills, cards, games).
4. **Submission**: version 1.0.5 with the IAPs attached (the first IAP must be submitted with a version), the
   review notes with the reviewer account (`reviewer+eszett@lamplitlabs.com` + password; works on production Clerk,
   has full access on the server), the demo video of the one-minute talk if speech recognition confuses the
   reviewer, export compliance "uses encryption: only HTTPS" (`ITSAppUsesNonExemptEncryption = false` in
   app.json so the question is pre-answered), content rights for the public-domain stories.
5. Review guideline risks and the answers: 2.1 (the app must work for the reviewer → the reviewer account and the
   free week), 3.1.1 (digital goods only through IAP → yes; the pay-it-forward code is redeemed in-app, bought via
   IAP; codes from institutions are "unlocked by a code the organisation bought" - allowed as it is not a payment
   in the app), 4.8 (Sign in with Apple → present), 5.1.1 (account only for the download → say so in review notes
   and keep the app usable without one), 2.3 (metadata must match: screenshots from a real iPhone build).
6. **Phased release** on for the first version (7-day ramp), then `release.json`'s `ios.storeUrl` with the App
   Store link so the in-app update prompt works.

## Phase 4 - after launch

- Apple's "pricing and availability" per storefront; VAT handled by Apple (Apple is merchant of record, unlike
  Play where we are).
- Age-rating and privacy label updates whenever the data collected changes (the production Clerk adds nothing).
- Keep the Android and iOS listings in sync from the same metadata folder; one `store/README.md` section per store.

## What can be done now, without Apple access

- [ ] Phase 0 build check and the on-device run (needs the owner's Apple ID in Xcode once for a development cert).
- [ ] `ITSAppUsesNonExemptEncryption: false` and the Sign in with Apple entitlement in app.json; `expo-build-properties`
      deployment target.
- [ ] `store/compose.py --store apple` (the iPhone 6.9"/6.5" and iPad frames), `store/asc-*.mjs` ports of the Play
      scripts on an `asc-api.mjs` client (JWT ES256 from the .p8), `ExportOptions.plist`, `ios-release.yml`.
- [ ] A StoreKit configuration file with the three products for the simulator/device IAP test.
- [ ] Metadata limits: Apple keywords (100 chars, comma-separated) per locale; subtitle (30) from the short
      description's first clause.

## Owner-only steps, in order

1. Paid Apps agreement + banking (start now; days).
2. Register the bundle id with capabilities; create the app record; Apple price tiers for the three products.
3. App Store Connect API key (.p8) → laptop + GitHub secrets; export the distribution certificate .p12.
4. Sign in with Apple Services ID + key → Clerk production.
5. Sign in to Xcode with the Apple ID once (development certificate for the device build).
6. Later: App privacy and age-rating questionnaires, phased release switch, the review submission button.
