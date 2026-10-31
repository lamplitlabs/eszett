# Google Play Console: the owner's checklist for Eszett

Everything that the Play Developer API cannot do and the order to do it in. Each step is a few minutes in the
Console; after steps 1 and 2 the scripts in this folder take over (`store/README.md`). Values to paste are in
code; the answers for the forms are what the app actually does (see the privacy policy, `web/privacy.html`).

## 1. Create the app

Play Console → **All apps → Create app**.

| Field | Value |
| --- | --- |
| App name | `Eszett` |
| Default language | **English (United States)** – it matches `store/metadata/android/en-US`; the other eleven listings are added by the script |
| App or game | App |
| Free or paid | **Free** (the purchases are in-app products) |
| Declarations | Developer Program Policies ✓, US export laws ✓ |

The package name is fixed by the first bundle upload: `com.lamplitlabs.eszett`.

## 2. Invite the service account

Play Console → **Users and permissions → Invite new users**.

- E-mail: `play-publisher@eszett-play.iam.gserviceaccount.com` (the Google Cloud project
  `eszett-play`, Eszett's own; the key is on the laptop at
  `~/.pulse/private/providers/play-service-account.json` and in the repository secret `PLAY_SERVICE_ACCOUNT_KEY_JSON`).
- App permissions → add **Eszett** (or grant at account level if the same account should also publish Leben in
  Deutschland from its repository), with:
  - View app information and download bulk reports (read-only)
  - **Manage store presence** – listing texts, graphics, one-time products
  - **Release to testing tracks** (Release apps to testing tracks) – the internal/closed/open tracks
  - Release to production, exclude devices, and use Play App Signing – only when releases should go out from the scripts
  - **View financial data, orders, and cancellation survey responses** and **Manage orders and subscriptions** –
    the download server (`server/`) verifies purchases with the same service account (`GOOGLE_SERVICE_ACCOUNT_JSON`)
- Send the invitation. A fresh grant can take up to 24 hours before the API stops answering 401/403.

Then, from the repository: `node store/play-products.mjs --list` must answer (empty list), and
`node store/play-listing.mjs --validate --text-only` must pass.

## 3. Store settings and contact

Play Console → **Store presence → Store settings** (API: only the contact details; the rest here).

| Field | Value |
| --- | --- |
| App category | **Education** |
| Tags | Language learning, German |
| Contact e-mail | `hello@lamplitlabs.com` |
| Website | `https://eszett.lamplitlabs.com` |
| Phone | optional |
| External marketing | on (allowed) |

## 4. App content (Policy → App content)

Fill every declaration; the answers describe what the app does today.

**Privacy policy**: `https://eszett.lamplitlabs.com/privacy`

**Ads**: No, the app does not contain ads.

**App access**: *All functionality is available without special access* is **not** true once the free week is
over, so choose **All or some functionality is restricted** and add one instruction set:

| Field | Value |
| --- | --- |
| Instruction name | Tutor download (account) |
| Username / e-mail | `reviewer+eszett@lamplitlabs.com` |
| Password | the one in `~/.pulse/private/providers/eszett-play-reviewer.json` (the account exists on the Clerk **production** instance; the password strategy is enabled there but **not required**, so learners keep the code-only flow). The account was given full access with `POST /v1/grant {"email": …}` (owner key), so the reviewer downloads without a purchase. |
| Any other information | "The app works for 7 days without an account (course, grammar, drills, scenes, speaking, games). Only the tutor model download (2.2 GB, ~3 min on Wi-Fi) needs sign-in, and this account already has full access - no purchase needed. 1. Open the Me tab (bottom right) and tap the card at the top ('Sign in'). 2. Enter reviewer+eszett@lamplitlabs.com and tap 'Send me a code'. 3. On the code screen tap 'Use a password instead' and enter the password above (regular learners use the one-time e-mail code; this account also has a password so no mailbox is needed). 4. Back on Me, tap 'Your tutor' and then 'Download' if the download has not started by itself; the tutor is ready when the status dot on Home turns green. Purchases are standard Google Play one-time products; use a licence-testing account." |

For a build still on the **development** instance (`pk_test`), use `reviewer+clerk_test@example.com` with the code
`424242` instead (Clerk's test addresses; production has none).

**Content rating** (IARC questionnaire): category **Utility, Productivity, Communication, or Other** →
Educational/Reference; no violence, no sexual content, no profanity, no controlled substances, no gambling; **does
the app allow users to interact or exchange content?** No (the pass-and-play games happen on one phone; there is no
network between users); **does the app share the user's location?** No; **does the app allow purchases of digital
goods?** Yes. Result: Everyone / PEGI 3.

**Target audience and content**: target age **18 and over** (the terms require 16+; choosing 18+ keeps the app out of
the Families programme and its extra requirements; learners of 16–17 can still install it). "Appeals to children"
→ No.

**News app**: No. **COVID-19 contact tracing**: No. **Government app**: No. **Financial features**: No.
**Health**: No.

**Data safety** – what the app collects and shares (matches `web/privacy.html`):

| Question | Answer |
| --- | --- |
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | Yes |
| Do you provide a way for users to request that their data is deleted? | Yes – in the app (Me › Account › Delete account) and `https://eszett.lamplitlabs.com/delete-account` |
| Data types collected | **Personal info → Email address**: collected, not shared, **required** (Play's test: the feature it serves – the model download – cannot work without it); purposes *App functionality*, *Account management*. **Personal info → Name** and **Photos → Photos**: the first name and photo of a Google/Apple account are read from the sign-in provider and displayed; declare **Name** as collected, optional, not shared, purpose *App functionality*; the photo is only displayed from the provider's URL and never stored by us – not collected. **Financial info → Purchase history**: collected, not shared, required; purposes *App functionality* (the entitlement), *Account management*. **App activity**, **Messages**, **Audio**, **Device or other IDs**, **Location**: **not collected** – speech, text and progress stay on the device. |
| Data sharing | None. The sign-in provider (Clerk) and the host (Microsoft Azure) are processors, not third parties the data is *shared* with under Play's definition. |
| Crash logs, diagnostics | Not collected – the app sends none; the server's request logs (90 days, no IP addresses) are not user data in Play's sense. |
| Security practices | Encrypted in transit ✓; data deletion ✓; no independent security review. |

**Advertising ID**: No, the app does not use the advertising ID.

## 5. Monetisation

- **Setup → Monetisation setup → Payments profile**: the existing Lamplit Labs merchant account (the one the
  Leben in Deutschland tip jar uses) is reused automatically.
- **Monetise → Products → In-app products**: nothing to click – `node store/play-products.mjs --apply` creates and
  activates `eszett_full_access` (29.99 €), `eszett_fresh_tutor` (12.99 €) and `eszett_gift` (29.99 €) with
  listings in twelve languages and Google's regional prices. Change the prices in
  `store/metadata/android/one-time-products.json` first if those are not the ones you want.
- **Product icons** (the API has no field for them): `python3 store/product-icons.py` renders
  `store/output/products/<productId>.png` (1024×1024: the key, the sparkle, the gift on the brand blue); upload each
  under Monetise → Products → One-time products → the product → **Icon**.
- **Setup → License testing**: add your own Google account(s) so purchases on the internal track are free test
  purchases. Set "License response" to RESPOND_NORMALLY.

## 6. The first release

- `node store/play-release.mjs android/app/build/outputs/bundle/release/app-release.aab --apply` (or the Play
  Publish workflow, task `release-internal`) uploads the signed bundle to the **internal testing** track. On the
  first upload Play asks about **Play App Signing**: keep the default (Google manages the app signing key; our
  keystore is the upload key, SHA-1 `EB:61:FB:65:0B:E0:3D:89:2A:AB:65:FF:4C:BC:D5:90:1A:46:17:AB`).
- **Testing → Internal testing → Testers**: create an e-mail list with the testers' Google accounts and share the
  opt-in link. Install from Play (not the APK) to test purchases.
- Then `node store/play-listing.mjs --apply` for the full listing with screenshots (render them first with
  `python3 store/compose.py` from the captures in `store/captures/`).
- **Publishing overview**: the first version goes to review together with the app content declarations; expect a
  few days. Production needs 20 testers on closed testing for 14 days first (Play's rule for personal accounts
  created after November 2023; an organisation account skips this).

## 7. After the first review

- Put the production Clerk instance and `pk_live` into the repository variable `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
  and the sign-in credentials for reviewers into **App access**.
- `release.json` in our storage drives the in-app update prompt (README "Update and review prompts"); set
  `android.storeUrl` to `https://play.google.com/store/apps/details?id=com.lamplitlabs.eszett` once the listing is
  public.
