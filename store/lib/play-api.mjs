// Minimal Google Play Developer API client on Node built-ins: a service-account
// key file, keyless credentials (impersonation through the owner's gcloud login,
// Workload Identity Federation in GitHub Actions), JSON requests, media uploads
// and readable errors. Shared by play-products.mjs, play-listing.mjs and
// play-release.mjs. Ported from the Leben in Deutschland app (ADR-008 there).
//
// Credentials, first match wins (setup in store/README.md):
// PLAY_ACCESS_TOKEN          a short-lived access token minted elsewhere
// PLAY_SERVICE_ACCOUNT       e-mail of the Play service account to impersonate (keyless)
// PLAY_WIF_PROVIDER          projects/<number>/locations/global/workloadIdentityPools/<pool>/providers/<provider>;
//                            with PLAY_SERVICE_ACCOUNT inside GitHub Actions (permissions: id-token: write)
// PLAY_SERVICE_ACCOUNT_KEY   path to a JSON key (the default is ~/.pulse/private/providers/play-service-account.json when it exists)
//
// PLAY_PACKAGE_NAME          overrides the android.package read from app.json
// PLAY_API_BASE, PLAY_STS_URL, PLAY_IAM_CREDENTIALS_BASE, PLAY_GCLOUD   local mocks (tests only)
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createSign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "../..");
export const API_BASE = (process.env.PLAY_API_BASE ?? "https://androidpublisher.googleapis.com").replace(/\/$/, "");
export const API = `${API_BASE}/androidpublisher/v3`;
const UPLOAD_API = `${API_BASE}/upload/androidpublisher/v3`;
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const CLOUD_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const STS_URL = process.env.PLAY_STS_URL ?? "https://sts.googleapis.com/v1/token";
const IAM_CREDENTIALS_BASE = (process.env.PLAY_IAM_CREDENTIALS_BASE ?? "https://iamcredentials.googleapis.com").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function fail(message) {
  throw new Error(message);
}

export function relative(file) {
  return path.relative(repoRoot, file);
}

/** The Play package name: PLAY_PACKAGE_NAME or android.package in app.json. */
export function readPackageName() {
  if (process.env.PLAY_PACKAGE_NAME) {
    return process.env.PLAY_PACKAGE_NAME;
  }
  const config = JSON.parse(readFileSync(path.join(repoRoot, "app.json"), "utf8"));
  const name = config?.expo?.android?.package;
  if (!name) {
    fail("expo.android.package not found in app.json; set PLAY_PACKAGE_NAME");
  }
  return name;
}

const DEFAULT_KEY = path.join(process.env.HOME ?? "", ".pulse/private/providers/play-service-account.json");

function readKey(keyPath) {
  const resolved = path.resolve(keyPath);
  if (resolved.startsWith(repoRoot + path.sep)) {
    console.warn("  ! the key file lies inside the repository - move it outside and never commit it");
  }
  let text;
  try {
    text = readFileSync(resolved, "utf8");
  } catch (error) {
    fail(`cannot read the service-account key file: ${error.code ?? error.message}`);
  }
  let key;
  try {
    key = JSON.parse(text);
  } catch {
    // The parse error would quote the file content, so it is not repeated here.
    fail("the service-account key file is not valid JSON");
  }
  if (!key.client_email || !key.private_key) {
    fail("the key file has no client_email/private_key; create a JSON key for the service account in Google Cloud -> IAM -> Service accounts");
  }
  return key;
}

async function fetchToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const tokenUrl = key.token_uri ?? TOKEN_URL;
  const input = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iss: key.client_email,
    scope: SCOPE,
    aud: tokenUrl,
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(input).sign(key.private_key).toString("base64url");
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${input}.${signature}` }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    const reason = body.error_description ?? (typeof body.error === "object" ? body.error?.message : body.error) ?? "no access token";
    fail(`token request failed (${response.status}): ${reason}`);
  }
  return body.access_token;
}

/** POSTs or GETs a token endpoint and fails with its reason (never with the request body). */
async function tokenCall(what, url, init, hint) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = body.error_description ?? (typeof body.error === "object" ? body.error?.message : body.error) ?? response.statusText;
    fail(`${what} failed (${response.status}): ${reason}${hint ? `\n  ${hint}` : ""}`);
  }
  return body;
}

/** GitHub Actions OIDC token for the given audience (needs `permissions: id-token: write`). */
async function gitHubOidcToken(audience) {
  const body = await tokenCall(
    "GitHub OIDC token request",
    withQuery(process.env.ACTIONS_ID_TOKEN_REQUEST_URL, { audience }),
    { headers: { authorization: `bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`, accept: "application/json" } },
    "the job needs `permissions: id-token: write`",
  );
  if (!body.value) {
    fail("GitHub returned no OIDC token; the job needs `permissions: id-token: write`");
  }
  return body.value;
}

/** Exchanges an external OIDC token for a Google federated access token (Workload Identity Federation). */
async function federatedToken(provider, subjectToken) {
  const body = await tokenCall(
    "Workload Identity Federation token exchange",
    STS_URL,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        audience: `//iam.googleapis.com/${provider}`,
        grantType: "urn:ietf:params:oauth:grant-type:token-exchange",
        requestedTokenType: "urn:ietf:params:oauth:token-type:access_token",
        scope: CLOUD_SCOPE,
        subjectTokenType: "urn:ietf:params:oauth:token-type:jwt",
        subjectToken,
      }),
    },
    "check that PLAY_WIF_PROVIDER names the right project number, pool and provider, and that the provider's attribute condition allows this repository",
  );
  if (!body.access_token) {
    fail("the token exchange returned no access token");
  }
  return body.access_token;
}

/**
 * Mints a Play-scoped token for the service account from a caller token that
 * may impersonate it. Messages name the variable, never its value: Actions
 * logs of this public repository are public.
 */
async function impersonate(serviceAccount, callerToken) {
  const body = await tokenCall(
    "impersonation of PLAY_SERVICE_ACCOUNT",
    `${IAM_CREDENTIALS_BASE}/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccount)}:generateAccessToken`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${callerToken}`, "content-type": "application/json" },
      body: JSON.stringify({ scope: [SCOPE], lifetime: "3600s" }),
    },
    "the caller needs roles/iam.serviceAccountTokenCreator (your gcloud login) or roles/iam.workloadIdentityUser (GitHub Actions) on this service account, and the IAM Service Account Credentials API must be enabled in its project",
  );
  if (!body.accessToken) {
    fail("impersonation returned no access token");
  }
  return body.accessToken;
}

/** The owner's own short-lived token from the Google Cloud CLI; nothing is stored. */
function gcloudUserToken() {
  const gcloud = process.env.PLAY_GCLOUD ?? "gcloud";
  const result = spawnSync(gcloud, ["auth", "print-access-token"], { encoding: "utf8" });
  if (result.error?.code === "ENOENT") {
    fail("gcloud is not installed; install the Google Cloud CLI and run `gcloud auth login`, or mint a token elsewhere and set PLAY_ACCESS_TOKEN");
  }
  if (result.status !== 0 || !result.stdout.trim()) {
    const last = (result.stderr ?? "").trim().split("\n").filter(Boolean).pop();
    fail(`gcloud auth print-access-token failed: ${last ?? "run `gcloud auth login` first"}`);
  }
  return result.stdout.trim();
}

/**
 * Picks the first configured credential mode and returns `{ mode, token }`.
 * `mode` is a constant description that names the variable in use; the
 * variable values (service-account e-mail, provider) are never logged.
 */
async function resolveCredentials() {
  const env = process.env;
  if (env.PLAY_ACCESS_TOKEN) {
    return { mode: "PLAY_ACCESS_TOKEN", token: env.PLAY_ACCESS_TOKEN };
  }
  const serviceAccount = env.PLAY_SERVICE_ACCOUNT;
  if (serviceAccount && env.PLAY_WIF_PROVIDER) {
    if (!env.ACTIONS_ID_TOKEN_REQUEST_URL || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
      fail("PLAY_WIF_PROVIDER works inside GitHub Actions jobs with `permissions: id-token: write`; on a laptop unset it and use PLAY_SERVICE_ACCOUNT with your gcloud login");
    }
    const provider = env.PLAY_WIF_PROVIDER.replace(/^(?:https:)?\/\/iam\.googleapis\.com\//, "");
    const federated = await federatedToken(provider, await gitHubOidcToken(`https://iam.googleapis.com/${provider}`));
    return { mode: "Workload Identity Federation for PLAY_SERVICE_ACCOUNT, no key", token: await impersonate(serviceAccount, federated) };
  }
  if (serviceAccount) {
    return { mode: "impersonation of PLAY_SERVICE_ACCOUNT through your gcloud login, no key", token: await impersonate(serviceAccount, gcloudUserToken()) };
  }
  const keyPath = env.PLAY_SERVICE_ACCOUNT_KEY ?? (existsSync(DEFAULT_KEY) ? DEFAULT_KEY : undefined);
  if (keyPath) {
    const key = readKey(keyPath);
    return { mode: "a service-account key file", token: await fetchToken(key) };
  }
  fail("no Play credentials: set PLAY_SERVICE_ACCOUNT_KEY (a key file), PLAY_SERVICE_ACCOUNT (keyless: your gcloud login, or Workload Identity Federation in GitHub Actions) or PLAY_ACCESS_TOKEN; setup in store/README.md");
}

function withQuery(base, query) {
  const url = new URL(base);
  for (const [name, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(name, value);
    }
  }
  return url;
}

async function call(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  if (!response.ok) {
    throw new ApiError(response.status, json.error?.message ?? (text ? text.slice(0, 300) : response.statusText), json.error?.status);
  }
  return json;
}

/**
 * Authenticates once and returns `{ mode, request, upload }`. `request` sends
 * JSON to the v3 API, `upload` sends raw media to the upload endpoint. Paths
 * start after `/androidpublisher/v3`, e.g. `/applications/<pkg>/edits`.
 */
export async function createPlayClient() {
  const { mode, token } = await resolveCredentials();
  console.log(`authenticating with ${mode}`);
  const auth = { authorization: `Bearer ${token}` };
  return {
    mode,
    request(method, apiPath, { query, body } = {}) {
      return call(withQuery(`${API}${apiPath}`, query), {
        method,
        headers: { ...auth, ...(body ? { "content-type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    },
    upload(apiPath, { query, contentType, bytes }) {
      return call(withQuery(`${UPLOAD_API}${apiPath}`, { uploadType: "media", ...query }), {
        method: "POST",
        headers: { ...auth, "content-type": contentType },
        body: bytes,
      });
    },
  };
}

/** Prints an error with the usual Play API causes; safe to call for any error. */
export function explainError(error) {
  if (!(error instanceof ApiError)) {
    console.error(`✗ ${error.message}`);
    return;
  }
  console.error(`✗ Play API ${error.status}${error.code ? ` ${error.code}` : ""}: ${error.message}`);
  if (error.status === 401 || error.status === 403) {
    console.error(
      "  The service account needs the permission for this app (Play Console -> Users and permissions: 'Manage store presence' for listing and products, 'Release to testing tracks' for uploads, 'View financial data' and 'Manage orders' for the server's receipt checks); new permissions can take up to 24 h to reach the API.",
    );
  }
  if (error.status === 404) {
    console.error("  Check the package name and that the app exists in the Play Console account that invited the service account.");
  }
  if (/region/i.test(error.message) && /version/i.test(error.message)) {
    console.error("  Set PLAY_REGIONS_VERSION to the version Google names in this message and retry.");
  }
}
