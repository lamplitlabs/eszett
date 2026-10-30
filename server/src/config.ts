// Settings from the environment (Function App settings in Azure, local.settings.json at home). Everything the
// server needs to know is here; a missing secret fails closed where it is used.

const env = (name: string, fallback = ''): string => (process.env[name] ?? fallback).trim();

export const config = {
  /** The storage account with the model files and this server's tables. */
  storageAccount: env('STORAGE_ACCOUNT', 'lichtgwcst001'),
  /** The account key, for local runs without a signed-in identity; in Azure the managed identity is used instead. */
  storageKey: env('STORAGE_KEY'),
  modelsContainer: env('MODELS_CONTAINER', 'models'),
  /** The student whose model the app downloads; the file names allowed are this student's phone editions. */
  modelStudent: env('MODEL_STUDENT', 'light-german-tutor-phone-v27'),
  editions: env('EDITIONS', 'Q5_K_M,Q8_0')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  /** How long a download link stays valid; a user-delegation SAS allows seven days at most. */
  linkHours: Math.min(168, Math.max(1, Number(env('LINK_HOURS', '168')) || 168)),
  /** Months of tutor models a purchase brings. */
  updatesMonths: Math.max(1, Number(env('UPDATES_MONTHS', '12')) || 12),
  clerkSecretKey: env('CLERK_SECRET_KEY'),
  /** The app's origins Clerk tokens may be issued for (azp claim); empty accepts any party. */
  clerkAuthorizedParties: env('CLERK_AUTHORIZED_PARTIES')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  /** Google Play: the service account JSON (as one string) with "View financial data" on the Play Console. */
  googleServiceAccountJson: env('GOOGLE_SERVICE_ACCOUNT_JSON'),
  androidPackage: env('ANDROID_PACKAGE', 'com.lamplitlabs.eszett'),
  /** App Store Server API credentials. */
  appleIssuerId: env('APPLE_ISSUER_ID'),
  appleKeyId: env('APPLE_KEY_ID'),
  applePrivateKey: env('APPLE_PRIVATE_KEY').replace(/\\n/g, '\n'),
  appleBundleId: env('APPLE_BUNDLE_ID', 'com.lamplitlabs.eszett'),
  appleSandbox: env('APPLE_SANDBOX', 'false') === 'true',
  /** Development only: record a purchase the stores could not be asked about. Never set this in production. */
  trustUnverifiedPurchases: env('TRUST_UNVERIFIED_PURCHASES', 'false') === 'true',
  /** Codes the owner hands out by hand are created with this shared secret (POST /v1/codes). */
  adminKey: env('ADMIN_KEY'),
};

export type Config = typeof config;
