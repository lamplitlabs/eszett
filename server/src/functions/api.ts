// The HTTP functions. Every handler answers JSON; errors are { error, message } with a status the app can act on:
// 401 sign in, 402 the entitlement is missing (the app opens full access), 404 unknown file or code, 409 a code
// already used, 503 the server is not configured yet.

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';

import { AuthError, requireCaller } from '../auth';
import { config } from '../config';
import { decideDownload, extendUpdates, grantFull, isCodeShape, isProductId, makeCode, normalizeCode, PRODUCTS, recordDownload, summarize } from '../rules';
import { createCode, downloadLink, logDownload, publishedModel, readCode, readEntitlement, recordPurchase, takeFromPool, useCode, writeEntitlement } from '../storage';
import { verifyPurchase, type StorePurchase } from '../stores';

const json = (status: number, body: unknown): HttpResponseInit => ({ status, jsonBody: body, headers: { 'cache-control': 'no-store' } });
const fail = (status: number, error: string, message: string, extra: Record<string, unknown> = {}) => json(status, { error, message, ...extra });

async function body<T>(req: HttpRequest): Promise<Partial<T>> {
  try {
    return ((await req.json()) ?? {}) as Partial<T>;
  } catch {
    return {};
  }
}

/** Runs a handler with the signed-in caller; turns AuthError and the rest into JSON. */
function withCaller(handler: (req: HttpRequest, userId: string, now: number, ctx: InvocationContext) => Promise<HttpResponseInit>) {
  return async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const caller = await requireCaller(req);
      return await handler(req, caller.userId, Date.now(), ctx);
    } catch (e) {
      if (e instanceof AuthError) return fail(e.status, e.status === 503 ? 'not-configured' : 'unauthorized', e.message);
      ctx.error('request failed', e);
      return fail(500, 'server', 'something went wrong on our side; try again in a moment');
    }
  };
}

// ---------------------------------------------------------------------------------------------- GET /v1/health

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'v1/health',
  handler: async () => json(200, { ok: true, student: config.modelStudent, editions: config.editions, signIn: Boolean(config.clerkSecretKey) }),
});

// ---------------------------------------------------------------------------------------------- GET /v1/me

app.http('me', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'v1/me',
  handler: withCaller(async (_req, userId, now) => {
    const [ent, model] = await Promise.all([readEntitlement(userId, now), publishedModel()]);
    return json(200, { ...summarize(ent, model.student, model.releasedAt, now), files: model.files.map((f) => f.file) });
  }),
});

// ---------------------------------------------------------------------------------------------- POST /v1/download-url

app.http('downloadUrl', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'v1/download-url',
  handler: withCaller(async (req, userId, now) => {
    const { file } = await body<{ file: string }>(req);
    const model = await publishedModel();
    const found = model.files.find((f) => f.file === file);
    if (!found) return fail(404, 'unknown-file', 'that is not a file of the current tutor model', { files: model.files.map((f) => f.file) });
    const ent = await readEntitlement(userId, now);
    const verdict = decideDownload(ent, model.student, model.releasedAt);
    if (!verdict.allowed) {
      return fail(402, verdict.reason, verdict.reason === 'needs-full' ? 'the new tutor comes with full access' : 'this tutor was released after your year of updates; a fresh tutor brings it', summarize(ent, model.student, model.releasedAt, now));
    }
    const link = await downloadLink(`${model.student}/gguf/${found.file}`, config.linkHours);
    await writeEntitlement(recordDownload(ent, model.student, now));
    await logDownload(userId, found.file, verdict.reason, now);
    return json(200, { url: link.url, expiresAt: link.expiresAt, file: found.file, bytes: found.bytes, sha256: found.sha256, reason: verdict.reason });
  }),
});

// ---------------------------------------------------------------------------------------------- POST /v1/purchase

app.http('purchase', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'v1/purchase',
  handler: withCaller(async (req, userId, now, ctx) => {
    const p = await body<StorePurchase>(req);
    if ((p.platform !== 'android' && p.platform !== 'ios') || typeof p.productId !== 'string' || typeof p.token !== 'string' || !p.token) {
      return fail(400, 'bad-request', 'platform, productId and token are required');
    }
    if (!isProductId(p.productId)) return fail(400, 'unknown-product', `unknown product ${p.productId}`);
    const verified = await verifyPurchase(p as StorePurchase);
    if (!verified.ok) {
      ctx.warn('purchase not verified', p.platform, p.productId, verified.reason, verified.detail ?? '');
      if (verified.reason === 'not-configured') return fail(503, 'not-configured', 'purchases cannot be verified on this server yet');
      if (verified.reason === 'store-error') return fail(502, 'store-error', 'the store did not answer; try again in a moment');
      return fail(400, verified.reason, 'the store does not know this purchase');
    }
    const fresh = await recordPurchase(p.platform, verified.transactionId, userId, p.productId, now);
    let ent = await readEntitlement(userId, now);
    const effect = PRODUCTS[p.productId];
    let gift: string | null = null;
    if (fresh) {
      if (effect === 'full') ent = grantFull(ent, now, 'store', config.updatesMonths);
      else if (effect === 'fresh') ent = extendUpdates(ent, now, config.updatesMonths);
      else {
        // pay it forward: a code into the pool, remembered on the buyer's row
        gift = makeCode();
        await createCode(gift, 'gift', userId, `bought ${verified.transactionId}`, now);
        ent = { ...ent, gifts: [...ent.gifts, gift], updatedAt: now };
      }
      await writeEntitlement(ent);
    }
    const model = await publishedModel();
    return json(200, { ...summarize(ent, model.student, model.releasedAt, now), recorded: fresh, gift });
  }),
});

// ---------------------------------------------------------------------------------------------- POST /v1/redeem

app.http('redeem', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'v1/redeem',
  handler: withCaller(async (req, userId, now) => {
    const { code: raw, fromPool } = await body<{ code: string; fromPool: boolean }>(req);
    let ent = await readEntitlement(userId, now);
    if (ent.plan === 'full') return fail(409, 'already-full', 'this account already has full access');
    const row = fromPool ? await takeFromPool() : typeof raw === 'string' && isCodeShape(normalizeCode(raw)) ? await readCode(normalizeCode(raw)) : null;
    if (!row) return fail(404, fromPool ? 'pool-empty' : 'unknown-code', fromPool ? 'no one has paid a tutor forward right now; try again another day' : 'that code is not one of ours');
    if (row.usedBy) return fail(409, 'code-used', 'that code was used already');
    if (!(await useCode(row, userId, now))) return fail(409, 'code-used', 'that code was used a moment ago');
    ent = grantFull(ent, now, row.kind === 'gift' ? 'gift' : 'code', config.updatesMonths);
    await writeEntitlement(ent);
    const model = await publishedModel();
    return json(200, { ...summarize(ent, model.student, model.releasedAt, now), code: row.rowKey });
  }),
});

// ---------------------------------------------------------------------------------------------- POST /v1/codes (owner)

app.http('codes', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'v1/codes',
  handler: async (req) => {
    if (!config.adminKey || req.headers.get('x-admin-key') !== config.adminKey) return fail(401, 'unauthorized', 'owner only');
    const { count = 1, kind = 'full', note = '' } = await body<{ count: number; kind: 'full' | 'gift'; note: string }>(req);
    const n = Math.min(500, Math.max(1, Number(count) || 1));
    const now = Date.now();
    const codes: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const code = makeCode();
      await createCode(code, kind === 'gift' ? 'gift' : 'full', 'owner', String(note), now);
      codes.push(code);
    }
    return json(200, { codes, kind, note });
  },
});
