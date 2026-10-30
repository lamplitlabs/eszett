// What the app knows about the model release: the GGUF editions (phone files), where they live in our storage,
// the chat template they embed and the trained system prompt. Pure TypeScript over src/data/model.json
// (built by scripts/build-data.mjs), so it is testable in node and safe to import anywhere.
import modelInfo from '../data/model.json';

export type Edition = 'Q5_K_M' | 'Q8_0';

export interface EditionInfo {
  edition: Edition;
  file: string;
  bytes: number | null;
  sha256: string | null;
  minRamGb: number;
  /** Top-1 agreement with the full model on the export's held-out set, in percent; the gate is 95. */
  top1: number | null;
  summary: string;
}

interface ModelJson {
  revision: string;
  system_prompt: string;
  chat_template: string;
  hub: { repo: string };
  gguf: {
    student: string;
    base: string;
    manifest: string;
    editions: Record<Edition, { file: string; bytes: number | null; sha256: string | null; minRamGb: number; top1?: number | null }>;
  };
}

const data = modelInfo as ModelJson;

// File sizes from the export manifest of this student, used if model.json ever lacks them.
const EXPECTED_BYTES: Record<Edition, number> = { Q5_K_M: 2213756704, Q8_0: 3275575072 };

// Q8_0 needs an 8 GB phone; the OS reports a little less than the nominal memory, so accept anything from 7.5 GB.
const Q8_0_MIN_REPORTED_RAM = 7.5e9;

const SUMMARIES: Record<Edition, (size: string, minRamGb: number) => string> = {
  Q5_K_M: (size, minRamGb) => `Phone edition · about ${size} · phones with ${minRamGb} GB of memory`,
  Q8_0: (size, minRamGb) => `Full precision · about ${size} · phones with ${minRamGb} GB or more`,
};

const ORDER: Edition[] = ['Q5_K_M', 'Q8_0'];

export const DEFAULT_EDITION: Edition = 'Q5_K_M';
/** The revision of the data release (lexicon, grounding pack) on the Hub. */
export const REVISION: string = data.revision;
/** The student whose GGUF export the phone runs, e.g. "light-german-tutor-phone-v27". */
export const MODEL_STUDENT: string = data.gguf.student;
/** What the GGUF header calls the model (general.name), e.g. "Light German Tutor Phone v27". */
export const MODEL_NAME: string = data.gguf.student
  .split('-')
  .map((part) => (/^v\d+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
  .join(' ');
export const MODEL_BASE: string = data.gguf.base;
/** @deprecated the GGUF files are served from our storage, not the Hub; kept for the download-source placeholder. */
export const HUB_BASE: string = MODEL_BASE;
/** The storage account's public container, where the model files and the data release live. */
export const STORAGE_BASE = MODEL_BASE.replace(/\/models\/.*$/, '/models');
/**
 * The full lexicon of the data release, served from our storage (models/data/<revision>/lexicon.json, the Hub
 * file byte for byte) so that nothing the app fetches at run time leaves our account; the Hub copy stays the
 * fallback when ours cannot be reached.
 */
export const LEXICON_URL = `${STORAGE_BASE}/data/${REVISION}/lexicon.json`;
export const LEXICON_FALLBACK_URL = `https://huggingface.co/${data.hub.repo}/resolve/${REVISION}/lexicon.json`;
export const CHAT_TEMPLATE: string = data.chat_template;
/** The system prompt the student was trained with (its Modelfile's SYSTEM block). */
export const SYSTEM_PROMPT: string = data.system_prompt;

export const EDITIONS: EditionInfo[] = ORDER.map((edition) => {
  const { file, bytes, sha256, minRamGb, top1 } = data.gguf.editions[edition];
  return { edition, file, bytes, sha256, minRamGb, top1: top1 ?? null, summary: SUMMARIES[edition](describeBytes(bytes ?? EXPECTED_BYTES[edition]), minRamGb) };
});

export function isEdition(value: unknown): value is Edition {
  return ORDER.includes(value as Edition);
}

export function editionInfo(edition: Edition): EditionInfo {
  return EDITIONS.find((e) => e.edition === edition) ?? EDITIONS[0];
}

/** Whether a phone with this much memory (as the OS reports it; null when unknown) should run the edition. */
export function editionFits(edition: Edition, totalRamBytes: number | null): boolean {
  if (edition === 'Q5_K_M') return true;
  return totalRamBytes !== null && totalRamBytes >= Q8_0_MIN_REPORTED_RAM;
}

/** The file size: what the export manifest lists, or the known size of this student's files. */
export function estimatedBytes(edition: Edition): number {
  return editionInfo(edition).bytes ?? EXPECTED_BYTES[edition];
}

/** The download URL of an edition from `source` (a mirror or a computer on the Wi-Fi); blank means our storage. */
export function modelUrl(edition: Edition, source: string): string {
  const base = (source.trim() || MODEL_BASE).replace(/\/+$/, '');
  return `${base}/${editionInfo(edition).file}`;
}

/**
 * Whether a GGUF header describes our model: general.name "Light German Tutor Phone v27", or any name that says
 * german tutor (an older or newer student still answers the way the harness expects).
 */
export function isOurModel(generalName: string | null | undefined): boolean {
  if (!generalName) return false;
  const name = generalName.toLowerCase();
  return name === MODEL_NAME.toLowerCase() || (name.includes('german') && name.includes('tutor'));
}

/** Human file sizes in the decimal units phones show: "2.5 GB", "734 MB", "12 KB", "0 B". */
export function describeBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${Math.round(n / 1e6)} MB`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} KB`;
  return `${Math.round(n)} B`;
}

export function isGgufName(name: string): boolean {
  return /\.gguf$/i.test(name);
}

/** The edition named in a file name, e.g. "light-german-tutor-phone-v25-Q5_K_M.gguf" → 'Q5_K_M'; null when it says neither. */
export function editionOfName(name: string): Edition | null {
  const stem = name.replace(/\.gguf$/i, '').toUpperCase();
  const match = /(?:^|[^A-Z0-9])(Q5_K_M|Q8_0)(?![A-Z0-9])/.exec(stem);
  return match ? (match[1] as Edition) : null;
}

// The file names of our exports: <student>-<quant>.gguf, and the .part the app downloads into.
const EXPORT_FILE = /^(light-german-tutor(?:-[a-z0-9]+)*?-v\d+)-[a-z0-9_]+\.gguf(?:\.part)?$/i;

/** The student named by one of our export files ("light-german-tutor-v13-Q5_K_M.gguf" → "light-german-tutor-v13"); null for any other file. */
export function studentOfName(name: string): string | null {
  const match = EXPORT_FILE.exec(name);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Whether a file is an export of another student than the one this app ships: what an earlier version of the
 * app downloaded (or was downloading). Such files are removed at start, so a model update does not leave a
 * second model's gigabytes on the phone. Other quantisations of the current student and files that are not
 * our exports are left alone.
 */
export function isRetiredModelName(name: string): boolean {
  const student = studentOfName(name);
  return student !== null && student !== MODEL_STUDENT.toLowerCase();
}
