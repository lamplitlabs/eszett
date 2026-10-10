#!/usr/bin/env node
// Fetches the data files behind the model and writes what the app bundles: the grounding pack (rule notes),
// the core of the verified lexicon (A1-B2 nouns with meaning and example, all irregular verbs), and model.json
// with the trained system prompt, the chat template and the GGUF editions the phone downloads. The GGUF files
// live in our Azure storage (the licht export of a student, published to the public `models` container) with
// the export's gguf_manifest.json (sizes, checksums, quantisation metrics), its Modelfile (the SYSTEM prompt the
// student was trained with) and its chat_template.jinja next to them. The lexicon and the grounding pack come
// from the data release on Hugging Face, except that a grounding.json published next to the student's export
// wins: it is the pack the student was trained with when the data release lags behind it (v24's pack has the
// C1/C2 exam blocks). The full lexicon (88k gender entries) is downloaded by the app together with the model.
// Everything fetched is also kept in .model-cache/ (the full lexicon for the tests), and a rerun falls back
// to that copy when the network cannot be reached.
//
//   node scripts/build-data.mjs [revision] [student]      (default: v16 light-german-tutor-phone-v25)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const revision = process.argv[2] ?? 'v16';
const student = process.argv[3] ?? 'light-german-tutor-phone-v25';
const repo = 'lamplitlabs/licht-german-tutor';
const base = `https://huggingface.co/${repo}/resolve/${revision}`;
const studentBase = `https://lichtgwcst001.blob.core.windows.net/models/${student}`;
const ggufBase = `${studentBase}/gguf`;
const out = join(here, '..', 'src', 'data');
const cache = join(here, '..', '.model-cache');
mkdirSync(cache, { recursive: true });

// The phone editions. The export gate (licht ADR-006, MEM-049) is >= 95 % top-1 agreement with the full
// model: for this student Q5_K_M (imatrix) passes it and is the phone edition, Q8_0 is for 8 GB+ phones;
// Q4_K_M fails the gate and the grammar facts and is never offered.
const editions = { Q5_K_M: { minRamGb: 6 }, Q8_0: { minRamGb: 8 } };
const GATE_TOP1 = 95;

/** Downloads url and keeps a copy in .model-cache/<name>; the copy is used when the network cannot be reached. */
async function fetchCached(url, name) {
  const file = join(cache, name);
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    if (existsSync(file)) {
      console.warn(`${name}: ${e.message}; using the copy in .model-cache/`);
      return readFileSync(file, 'utf8');
    }
    throw e;
  }
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} (${url})`);
  const text = await res.text();
  writeFileSync(file, text);
  return text;
}

function get(name) {
  return fetchCached(`${base}/${name}`, name);
}

/** A file of the student's release in our storage, cached as <student>-<name>; null when it is not published. */
async function getStudentFile(path, name) {
  try {
    return await fetchCached(`${studentBase}/${path}`, `${student}-${name}`);
  } catch (e) {
    if (!/HTTP 404/.test(e.message)) throw e;
    return null;
  }
}

/** The SYSTEM """...""" block of an Ollama Modelfile; null when there is none. */
function modelfileSystem(text) {
  const match = /^SYSTEM\s+"""([\s\S]*?)"""/m.exec(text ?? '');
  return match ? match[1].trim() : null;
}

const [lexiconText, hubGrounding, manifestText, hubChatTemplate, ggufManifestText, modelfile, studentChatTemplate, studentGrounding] = await Promise.all([
  get('lexicon.json'),
  get('grounding.json'),
  get('export_manifest.json'),
  get('chat_template.jinja'),
  fetchCached(`${ggufBase}/gguf_manifest.json`, `${student}-gguf_manifest.json`),
  getStudentFile('gguf/Modelfile', 'Modelfile'),
  getStudentFile('chat_template.jinja', 'chat_template.jinja'),
  getStudentFile('grounding.json', 'grounding.json'),
]);
const lexicon = JSON.parse(lexiconText);
const manifest = JSON.parse(manifestText);
const ggufManifest = JSON.parse(ggufManifestText);
// The drill pool: the curated A1-B2 lists as they are; from the C1 tier (harvested from course texts, with
// one-off compounds and proper nouns; a C2 tier, once a release has one, the same) only words seen in the corpus at least once. Same rule as `drillable`
// in src/harness/lexicon.ts, which the full lexicon goes through on the phone.
const keep = /^(A1|A2|B1|B2|C1|C2)/;
const nouns = lexicon.nouns
  .filter((n) => n.level && keep.test(n.level) && n.meaning && (!/^C[12]/.test(n.level) || (n.freq ?? 0) >= 1))
  .map(({ lemma, genus, plural, meaning, example, level }) => ({ lemma, genus, plural, meaning, example, level }));

// The system prompt the student was trained with is the one in its Modelfile; the data release's export
// manifest has the prompt of the student exported there, which an older student may share.
const systemPrompt = modelfileSystem(modelfile) ?? manifest.system_prompt;
if (!systemPrompt) throw new Error(`no system prompt: ${student} has no Modelfile SYSTEM and the ${revision} export manifest has none`);
const promptSource = modelfileSystem(modelfile) ? `${student}/gguf/Modelfile` : `${revision} export manifest`;
// The GGUF embeds its chat template; the copy next to it is what the app's renderer is checked against.
const chatTemplate = studentChatTemplate ?? hubChatTemplate;
if (studentChatTemplate && studentChatTemplate !== hubChatTemplate) console.warn(`${student}: chat_template.jinja differs from the ${revision} data release; using the student's`);
// The grounding pack the student was trained with, when published next to its export; else the data release's.
const grounding = studentGrounding ?? hubGrounding;
const groundingSource = studentGrounding ? `${student}/grounding.json` : `${revision} data release`;
if (studentGrounding && studentGrounding !== hubGrounding) {
  const blocks = (text) => Object.keys(JSON.parse(text).blocks);
  const added = blocks(studentGrounding).filter((k) => !blocks(hubGrounding).includes(k));
  console.warn(`${student}: grounding.json differs from the ${revision} data release; using the student's${added.length ? ` (new blocks: ${added.join(', ')})` : ''}`);
}

if (ggufManifest.student !== student) throw new Error(`gguf_manifest.json is for ${ggufManifest.student}, not ${student}`);
const gguf = { student, base: ggufBase, manifest: `${ggufBase}/gguf_manifest.json`, editions: {} };
for (const [edition, { minRamGb }] of Object.entries(editions)) {
  const item = ggufManifest.files.find((f) => f.quant === edition);
  if (!item) throw new Error(`gguf_manifest.json lists no ${edition} file for ${student}`);
  const top1 = item.metrics?.top1_agreement_pct ?? null;
  if (top1 !== null && top1 < GATE_TOP1) throw new Error(`${item.file}: top-1 agreement ${top1} % is under the ${GATE_TOP1} % gate; do not ship it`);
  gguf.editions[edition] = { file: item.file, bytes: item.bytes, sha256: item.sha256, minRamGb, top1 };
}

writeFileSync(join(out, 'lexicon-core.json'), JSON.stringify({ source: lexicon.source, licence: lexicon.licence, attribution: lexicon.attribution, nouns, verbs: lexicon.verbs }));
writeFileSync(join(out, 'grounding.json'), grounding);
writeFileSync(
  join(out, 'model.json'),
  JSON.stringify({ student, revision, system_prompt: systemPrompt, hub: { repo }, grounding_source: groundingSource, chat_template: chatTemplate, gguf }, null, 1),
);
console.log(
  `${revision}: lexicon-core.json (${nouns.length} nouns, ${lexicon.verbs.length} verbs), grounding.json (${Object.keys(JSON.parse(grounding).blocks).length} blocks, from ${groundingSource}), model.json (system prompt from ${promptSource}; chat template; GGUF ${student}: ${Object.values(gguf.editions)
    .map((e) => `${e.file} ${(e.bytes / 1e9).toFixed(2)} GB${e.top1 !== null ? ` ${e.top1} %` : ''}`)
    .join(', ')}); full lexicon in .model-cache/`,
);
