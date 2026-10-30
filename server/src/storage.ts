// The storage account: the model files (read-only download links signed with a user delegation key, so no account
// key travels with a link) and this server's tables - one row per learner with their entitlement, one per code,
// and a log line per download. In Azure the Function App's managed identity signs in; at home the signed-in
// Azure CLI does, or STORAGE_KEY when set.

import { TableClient, TableServiceClient, AzureNamedKeyCredential, odata, type TableEntity } from '@azure/data-tables';
import type { TokenCredential } from '@azure/core-auth';
import { DefaultAzureCredential } from '@azure/identity';
import { BlobSASPermissions, BlobServiceClient, generateBlobSASQueryParameters, SASProtocol, StorageSharedKeyCredential, type UserDelegationKey } from '@azure/storage-blob';

import { config } from './config';
import { freshEntitlement, type Entitlement, type Source } from './rules';

const account = config.storageAccount;
const blobEndpoint = `https://${account}.blob.core.windows.net`;
const tableEndpoint = `https://${account}.table.core.windows.net`;

const identity = new DefaultAzureCredential();
const sharedKey = config.storageKey ? new StorageSharedKeyCredential(account, config.storageKey) : null;

export const blobs = new BlobServiceClient(blobEndpoint, sharedKey ?? identity);

const namedKey = config.storageKey ? new AzureNamedKeyCredential(account, config.storageKey) : null;
const tables = namedKey ? new TableServiceClient(tableEndpoint, namedKey) : new TableServiceClient(tableEndpoint, identity as TokenCredential);
const table = (name: string) => (namedKey ? new TableClient(tableEndpoint, name, namedKey) : new TableClient(tableEndpoint, name, identity as TokenCredential));

const ENTITLEMENTS = 'eszettEntitlements';
const CODES = 'eszettCodes';
const DOWNLOADS = 'eszettDownloads';
const PURCHASES = 'eszettPurchases';

let tablesReady: Promise<void> | null = null;
/** Creates the tables once per process; a table that exists is fine. */
export function ensureTables(): Promise<void> {
  tablesReady ??= (async () => {
    for (const name of [ENTITLEMENTS, CODES, DOWNLOADS, PURCHASES]) {
      await tables.createTable(name).catch((e: unknown) => {
        if ((e as { statusCode?: number }).statusCode !== 409) throw e;
      });
    }
  })().catch((e: unknown) => {
    tablesReady = null;
    throw e;
  });
  return tablesReady;
}

// ---------------------------------------------------------------------------------------------- entitlements

interface EntitlementRow extends TableEntity {
  plan: string;
  purchasedAt: number;
  updatesUntil: number;
  firstDownloadAt: number;
  downloaded: string;
  source: string;
  gifts: string;
  updatedAt: number;
}

const toRow = (e: Entitlement): EntitlementRow => ({
  partitionKey: 'user',
  rowKey: e.userId,
  plan: e.plan,
  purchasedAt: e.purchasedAt ?? 0,
  updatesUntil: e.updatesUntil ?? 0,
  firstDownloadAt: e.firstDownloadAt ?? 0,
  downloaded: JSON.stringify(e.downloaded),
  source: e.source ?? '',
  gifts: JSON.stringify(e.gifts),
  updatedAt: e.updatedAt,
});

const fromRow = (r: EntitlementRow): Entitlement => ({
  userId: r.rowKey,
  plan: r.plan === 'full' ? 'full' : 'none',
  purchasedAt: r.purchasedAt || null,
  updatesUntil: r.updatesUntil || null,
  firstDownloadAt: r.firstDownloadAt || null,
  downloaded: safeJson<Record<string, number>>(r.downloaded, {}),
  source: (r.source || null) as Source | null,
  gifts: safeJson<string[]>(r.gifts, []),
  updatedAt: r.updatedAt,
});

function safeJson<T>(text: string, fallback: T): T {
  try {
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function readEntitlement(userId: string, now: number): Promise<Entitlement> {
  await ensureTables();
  try {
    const row = await table(ENTITLEMENTS).getEntity<EntitlementRow>('user', userId);
    return fromRow(row);
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 404) return freshEntitlement(userId, now);
    throw e;
  }
}

export async function writeEntitlement(e: Entitlement): Promise<void> {
  await ensureTables();
  await table(ENTITLEMENTS).upsertEntity(toRow(e), 'Replace');
}

// ---------------------------------------------------------------------------------------------- codes

export interface CodeRow extends TableEntity {
  /** 'full' for full access, 'gift' for a pay-it-forward code (full access, taken from the pool). */
  kind: string;
  createdBy: string;
  createdAt: number;
  note: string;
  usedBy: string;
  usedAt: number;
}

export async function readCode(code: string): Promise<CodeRow | null> {
  await ensureTables();
  try {
    return await table(CODES).getEntity<CodeRow>('code', code);
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 404) return null;
    throw e;
  }
}

export async function createCode(code: string, kind: 'full' | 'gift', createdBy: string, note: string, now: number): Promise<void> {
  await ensureTables();
  const row: CodeRow = { partitionKey: 'code', rowKey: code, kind, createdBy, createdAt: now, note, usedBy: '', usedAt: 0 };
  await table(CODES).createEntity(row);
}

/** Marks a code used by `userId`; false when it was used meanwhile (the write is conditional on the row as read). */
export async function useCode(row: CodeRow, userId: string, now: number): Promise<boolean> {
  try {
    await table(CODES).updateEntity({ ...row, usedBy: userId, usedAt: now }, 'Replace', { etag: typeof row.etag === 'string' ? row.etag : '*' });
    return true;
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 412) return false;
    throw e;
  }
}

/** One unused gift code from the pool, oldest first; null when the pool is empty. */
export async function takeFromPool(): Promise<CodeRow | null> {
  await ensureTables();
  const query = table(CODES).listEntities<CodeRow>({ queryOptions: { filter: odata`PartitionKey eq 'code' and kind eq 'gift' and usedBy eq ''` } });
  let oldest: CodeRow | null = null;
  for await (const row of query) if (!oldest || row.createdAt < oldest.createdAt) oldest = row;
  return oldest;
}

// ---------------------------------------------------------------------------------------------- logs

export async function logDownload(userId: string, file: string, reason: string, now: number): Promise<void> {
  await ensureTables();
  await table(DOWNLOADS).createEntity({ partitionKey: userId, rowKey: `${String(now).padStart(15, '0')}-${Math.random().toString(36).slice(2, 7)}`, file, reason, at: now });
}

/** Records a store purchase once; false when the same transaction was recorded before (a replayed receipt). */
export async function recordPurchase(platform: string, transactionId: string, userId: string, productId: string, now: number): Promise<boolean> {
  await ensureTables();
  try {
    await table(PURCHASES).createEntity({ partitionKey: platform, rowKey: transactionId, userId, productId, at: now });
    return true;
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 409) return false;
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------- download links

let delegation: { key: UserDelegationKey; expiresOn: Date } | null = null;

/** A user delegation key good for the link's lifetime, renewed when half of it has passed. */
async function delegationKey(hours: number): Promise<UserDelegationKey> {
  const now = new Date();
  if (delegation && delegation.expiresOn.getTime() - now.getTime() > (hours * 3_600_000) / 2) return delegation.key;
  const startsOn = new Date(now.getTime() - 5 * 60_000);
  const expiresOn = new Date(now.getTime() + Math.min(hours, 168) * 3_600_000);
  const key = await blobs.getUserDelegationKey(startsOn, expiresOn);
  delegation = { key, expiresOn };
  return key;
}

export interface Link {
  url: string;
  expiresAt: number;
}

/** A read-only link to one blob, valid for `hours`; signed with the account key when one is configured, else the identity's delegation key. */
export async function downloadLink(blobName: string, hours: number): Promise<Link> {
  const startsOn = new Date(Date.now() - 5 * 60_000);
  const expiresOn = new Date(Date.now() + hours * 3_600_000);
  const options = { containerName: config.modelsContainer, blobName, permissions: BlobSASPermissions.parse('r'), startsOn, expiresOn, protocol: SASProtocol.Https };
  const sas = sharedKey ? generateBlobSASQueryParameters(options, sharedKey) : generateBlobSASQueryParameters(options, await delegationKey(hours), account);
  const path = blobName.split("/").map(encodeURIComponent).join("/");
  const url = `${blobEndpoint}/${config.modelsContainer}/${path}?${sas.toString()}`;
  return { url, expiresAt: expiresOn.getTime() };
}

// ---------------------------------------------------------------------------------------------- the published model

export interface PublishedFile {
  file: string;
  bytes: number;
  sha256: string;
}
export interface PublishedModel {
  student: string;
  releasedAt: number;
  files: PublishedFile[];
}

let published: { model: PublishedModel; readAt: number } | null = null;

/** The student's export manifest (models/<student>/gguf/gguf_manifest.json), read once an hour. */
export async function publishedModel(): Promise<PublishedModel> {
  if (published && Date.now() - published.readAt < 3_600_000) return published.model;
  const blob = blobs.getContainerClient(config.modelsContainer).getBlobClient(`${config.modelStudent}/gguf/gguf_manifest.json`);
  const text = (await blob.downloadToBuffer()).toString('utf8');
  const manifest = JSON.parse(text) as { student?: string; created_at?: string; files?: { file: string; bytes: number; sha256: string; quant?: string }[] };
  const releasedAt = manifest.created_at ? Date.parse(manifest.created_at) : 0;
  const files = (manifest.files ?? []).filter((f) => config.editions.some((q) => f.file === `${config.modelStudent}-${q}.gguf`)).map(({ file, bytes, sha256 }) => ({ file, bytes, sha256 }));
  const model: PublishedModel = { student: manifest.student ?? config.modelStudent, releasedAt: Number.isFinite(releasedAt) ? releasedAt : 0, files };
  published = { model, readAt: Date.now() };
  return model;
}

// ---------------------------------------------------------------------------------------------- deletion

/** Removes everything this server holds about a learner: the entitlement, the download log, the purchase rows. Codes they bought stay valid for whoever holds them. */
export async function deleteLearner(userId: string): Promise<{ entitlement: boolean; downloads: number; purchases: number }> {
  await ensureTables();
  let entitlement = false;
  try {
    await table(ENTITLEMENTS).deleteEntity('user', userId);
    entitlement = true;
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode !== 404) throw e;
  }
  let downloads = 0;
  for await (const row of table(DOWNLOADS).listEntities<TableEntity>({ queryOptions: { filter: odata`PartitionKey eq ${userId}` } })) {
    await table(DOWNLOADS).deleteEntity(row.partitionKey, row.rowKey);
    downloads += 1;
  }
  let purchases = 0;
  for await (const row of table(PURCHASES).listEntities<TableEntity & { userId?: string }>({ queryOptions: { filter: odata`userId eq ${userId}` } })) {
    await table(PURCHASES).deleteEntity(row.partitionKey, row.rowKey);
    purchases += 1;
  }
  return { entitlement, downloads, purchases };
}
