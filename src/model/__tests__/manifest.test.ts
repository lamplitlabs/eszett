import { describe, expect, it } from 'vitest';

import modelInfo from '../../data/model.json';
import { renderChatPrompt, sameTemplate } from '../../harness/template';
import {
  CHAT_TEMPLATE,
  DEFAULT_EDITION,
  describeBytes,
  EDITIONS,
  editionFits,
  editionInfo,
  editionOfName,
  estimatedBytes,
  isEdition,
  isGgufName,
  isOurModel,
  isRetiredModelName,
  LEXICON_FALLBACK_URL,
  LEXICON_URL,
  MODEL_BASE,
  MODEL_NAME,
  MODEL_STUDENT,
  modelUrl,
  REVISION,
  studentOfName,
  SYSTEM_PROMPT,
} from '../manifest';

const Q5_K_M_FILE = 'light-german-tutor-phone-v27-Q5_K_M.gguf';
const Q8_0_FILE = 'light-german-tutor-phone-v27-Q8_0.gguf';

describe('model manifest', () => {
  it('pins the release', () => {
    expect(REVISION).toBe('v16');
    expect(MODEL_STUDENT).toBe('light-german-tutor-phone-v27');
    expect(modelInfo.student).toBe(MODEL_STUDENT);
    expect(MODEL_NAME).toBe('Light German Tutor Phone v27');
    expect(MODEL_BASE).toBe('https://lichtgwcst001.blob.core.windows.net/models/light-german-tutor-phone-v27/gguf');
    // the lexicon comes from our storage too (the Hub file byte for byte); the Hub stays the fallback
    expect(LEXICON_URL).toBe('https://lichtgwcst001.blob.core.windows.net/models/data/v16/lexicon.json');
    expect(LEXICON_FALLBACK_URL).toBe('https://huggingface.co/lamplitlabs/licht-german-tutor/resolve/v16/lexicon.json');
    expect(SYSTEM_PROMPT).toBe(modelInfo.system_prompt);
    expect(SYSTEM_PROMPT.startsWith('You are a patient, precise German tutor')).toBe(true);
    // v23 to v27 were trained to keep gender and plural out of sentences and role-play lines (the v13 prompt said "always mark")
    expect(SYSTEM_PROMPT).toContain('mark gender and plural for nouns once, in a vocabulary line, never inside a sentence or a role-play line');
    expect(SYSTEM_PROMPT).not.toContain('always mark gender');
    expect(SYSTEM_PROMPT.endsWith('never mention being an AI model.')).toBe(true);
    expect(DEFAULT_EDITION).toBe('Q5_K_M');
    // the grounding pack is the one v27 was trained with (published next to its export), not the v16 data release's
    expect(modelInfo.grounding_source).toBe('light-german-tutor-phone-v27/grounding.json');
    // the prompt is the one v24 was trained with, byte for byte: the C2 battery was gated with it, so the harness keeps it
    expect(SYSTEM_PROMPT).toContain('learners from A1 to C1');
  });

  it('lists the phone edition first, then full precision, with sizes and checksums from the export', () => {
    expect(EDITIONS.map((e) => e.edition)).toEqual(['Q5_K_M', 'Q8_0']);
    expect(EDITIONS.map((e) => e.file)).toEqual([Q5_K_M_FILE, Q8_0_FILE]);
    expect(EDITIONS.map((e) => e.minRamGb)).toEqual([6, 8]);
    expect(EDITIONS.map((e) => e.bytes)).toEqual([2213756736, 3275575104]);
    expect(EDITIONS.map((e) => e.sha256)).toEqual([
      'ea8da7d954c1e238051e45a3006ea520763f28024bbca4c205ed4efbeebfc8c9',
      '5b9acc844a0feb69e8a483b6eea1cf01fa1152bb76708f120b688d4c4b9ce937',
    ]);
    for (const e of EDITIONS) {
      expect(editionInfo(e.edition)).toBe(e);
      expect(e.sha256).toMatch(/^[0-9a-f]{64}$/);
      // the export gate: at least 95 % top-1 agreement with the full model, or the quant is not shipped
      expect(e.top1).not.toBeNull();
      expect(e.top1 ?? 0).toBeGreaterThanOrEqual(95);
    }
  });

  it('summarises each edition for the chooser', () => {
    expect(editionInfo('Q5_K_M').summary).toBe('Phone edition · about 2.2 GB · phones with 6 GB of memory');
    expect(editionInfo('Q8_0').summary).toBe('Full precision · about 3.3 GB · phones with 8 GB or more');
  });

  it('knows which edition a phone can run', () => {
    expect(editionFits('Q5_K_M', null)).toBe(true);
    expect(editionFits('Q5_K_M', 0)).toBe(true);
    expect(editionFits('Q5_K_M', 3.8e9)).toBe(true);
    expect(editionFits('Q8_0', null)).toBe(false);
    expect(editionFits('Q8_0', 5.9e9)).toBe(false);
    expect(editionFits('Q8_0', 7.49e9)).toBe(false);
    expect(editionFits('Q8_0', 7.5e9)).toBe(true);
    expect(editionFits('Q8_0', 11.8e9)).toBe(true);
  });

  it('knows the download sizes', () => {
    expect(estimatedBytes('Q5_K_M')).toBe(2213756736);
    expect(estimatedBytes('Q8_0')).toBe(3275575104);
    expect(estimatedBytes('Q8_0')).toBeGreaterThan(estimatedBytes('Q5_K_M'));
  });

  it('builds the download URL from our storage or a custom source', () => {
    expect(modelUrl('Q5_K_M', '')).toBe(`${MODEL_BASE}/${Q5_K_M_FILE}`);
    expect(modelUrl('Q8_0', '   ')).toBe(`${MODEL_BASE}/${Q8_0_FILE}`);
    expect(modelUrl('Q5_K_M', 'http://192.168.1.20:8080')).toBe(`http://192.168.1.20:8080/${Q5_K_M_FILE}`);
    expect(modelUrl('Q5_K_M', 'http://192.168.1.20:8080/')).toBe(`http://192.168.1.20:8080/${Q5_K_M_FILE}`);
    expect(modelUrl('Q5_K_M', 'https://mirror.example.org/licht///')).toBe(`https://mirror.example.org/licht/${Q5_K_M_FILE}`);
    expect(modelUrl('Q8_0', '  https://mirror.example.org/licht \n')).toBe(`https://mirror.example.org/licht/${Q8_0_FILE}`);
  });

  it('describes sizes in the decimal units phones show', () => {
    expect(describeBytes(2213756736)).toBe('2.2 GB');
    expect(describeBytes(3275575104)).toBe('3.3 GB');
    expect(describeBytes(1e9)).toBe('1.0 GB');
    expect(describeBytes(999_999_999)).toBe('1000 MB');
    expect(describeBytes(700e6)).toBe('700 MB');
    expect(describeBytes(734003200)).toBe('734 MB');
    expect(describeBytes(1e6)).toBe('1 MB');
    expect(describeBytes(12_345)).toBe('12 KB');
    expect(describeBytes(1500)).toBe('2 KB');
    expect(describeBytes(999)).toBe('999 B');
    expect(describeBytes(0)).toBe('0 B');
    expect(describeBytes(-5)).toBe('0 B');
    expect(describeBytes(Number.NaN)).toBe('0 B');
  });

  it('recognises GGUF files and the edition in their names', () => {
    expect(isGgufName(Q5_K_M_FILE)).toBe(true);
    expect(isGgufName('MODEL.GGUF')).toBe(true);
    expect(isGgufName(`${Q5_K_M_FILE}.part`)).toBe(false);
    expect(isGgufName('model.bin')).toBe(false);
    expect(isGgufName('gguf')).toBe(false);
    expect(editionOfName(Q5_K_M_FILE)).toBe('Q5_K_M');
    expect(editionOfName(Q8_0_FILE)).toBe('Q8_0');
    expect(editionOfName('licht_q5_k_m.gguf')).toBe('Q5_K_M');
    expect(editionOfName('Q8_0.GGUF')).toBe('Q8_0');
    expect(editionOfName('light-german-tutor-v13-Q5_K_M.gguf')).toBe('Q5_K_M');
    expect(editionOfName('light-german-tutor-phone-v25-Q4_K_M.gguf')).toBeNull();
    expect(editionOfName('light-german-tutor-v13-Q6_K.gguf')).toBeNull();
    expect(editionOfName('light-german-tutor-phone-v25-bf16.gguf')).toBeNull();
    expect(editionOfName('notes.txt')).toBeNull();
    expect(editionOfName('')).toBeNull();
  });

  it('validates stored edition names', () => {
    expect(isEdition('Q5_K_M')).toBe(true);
    expect(isEdition('Q8_0')).toBe(true);
    expect(isEdition('Q6_K')).toBe(false);
    expect(isEdition('')).toBe(false);
    expect(isEdition(null)).toBe(false);
  });

  it('names the student behind one of our export files', () => {
    expect(studentOfName(Q5_K_M_FILE)).toBe('light-german-tutor-phone-v27');
    expect(studentOfName(`${Q8_0_FILE}.part`)).toBe('light-german-tutor-phone-v27');
    expect(studentOfName('light-german-tutor-v13-Q5_K_M.gguf')).toBe('light-german-tutor-v13');
    expect(studentOfName('Light-German-Tutor-V13-Q8_0.GGUF')).toBe('light-german-tutor-v13');
    expect(studentOfName('light-german-tutor-pro-v22-Q4_K_M.gguf')).toBe('light-german-tutor-pro-v22');
    expect(studentOfName('light-german-tutor-phone-v23-bf16.gguf')).toBe('light-german-tutor-phone-v23');
    expect(studentOfName('light-german-tutor-phone-v25.gguf')).toBeNull();
    expect(studentOfName('german-tutor-v25-Q5_K_M.gguf')).toBeNull();
    expect(studentOfName('SmolLM3-3B-Q5_K_M.gguf')).toBeNull();
    expect(studentOfName('lexicon-v16.json')).toBeNull();
    expect(studentOfName('')).toBeNull();
  });

  it('retires the files of other students, not the current one or anything else', () => {
    expect(isRetiredModelName('light-german-tutor-v13-Q5_K_M.gguf')).toBe(true);
    expect(isRetiredModelName('light-german-tutor-v13-Q8_0.gguf.part')).toBe(true);
    expect(isRetiredModelName('light-german-tutor-pro-v22-Q5_K_M.gguf')).toBe(true);
    // the previous phone students go when this build first starts (paused downloads too)
    expect(isRetiredModelName('light-german-tutor-phone-v23-Q5_K_M.gguf')).toBe(true);
    expect(isRetiredModelName('light-german-tutor-phone-v24-Q5_K_M.gguf')).toBe(true);
    expect(isRetiredModelName('light-german-tutor-phone-v24-Q8_0.gguf.part')).toBe(true);
    expect(isRetiredModelName('light-german-tutor-phone-v25-Q5_K_M.gguf')).toBe(true);
    expect(isRetiredModelName('light-german-tutor-phone-v25-Q8_0.gguf.part')).toBe(true);
    expect(isRetiredModelName('light-german-tutor-phone-v26-Q5_K_M.gguf')).toBe(true);
    expect(isRetiredModelName(Q5_K_M_FILE)).toBe(false);
    expect(isRetiredModelName(`${Q5_K_M_FILE}.part`)).toBe(false);
    expect(isRetiredModelName(Q8_0_FILE)).toBe(false);
    // another quantisation of the current student (a tester's import) is not retired
    expect(isRetiredModelName('light-german-tutor-phone-v27-Q4_K_M.gguf')).toBe(false);
    // files that are not our exports are never touched
    expect(isRetiredModelName('SmolLM3-3B-Q5_K_M.gguf')).toBe(false);
    expect(isRetiredModelName('my-tutor.gguf')).toBe(false);
    expect(isRetiredModelName('lexicon-v15.json')).toBe(false);
  });

  it('recognises our model by the GGUF header name', () => {
    expect(isOurModel('Light German Tutor Phone v27')).toBe(true);
    expect(isOurModel('light german tutor phone v27')).toBe(true);
    expect(isOurModel('Light German Tutor Phone v25')).toBe(true);
    expect(isOurModel('Light German Tutor v13')).toBe(true);
    expect(isOurModel('Light German Tutor v17')).toBe(true);
    expect(isOurModel('Licht German Tutor Lite')).toBe(true);
    expect(isOurModel('SmolLM3 3B')).toBe(false);
    expect(isOurModel('Llama 3.2 3B Instruct')).toBe(false);
    expect(isOurModel('')).toBe(false);
    expect(isOurModel(null)).toBe(false);
    expect(isOurModel(undefined)).toBe(false);
  });
});

describe('chat template in model.json', () => {
  it('is the SmolLM3 template the renderer ports', () => {
    expect(typeof CHAT_TEMPLATE).toBe('string');
    expect(CHAT_TEMPLATE.length).toBeGreaterThan(1000);
    expect(CHAT_TEMPLATE).toBe(modelInfo.chat_template);
    for (const needle of ['## Metadata', 'strftime_now("%d %B %Y")', 'Knowledge Cutoff Date: June 2025', '/system_override', '/no_think', 'add_generation_prompt']) {
      expect(CHAT_TEMPLATE).toContain(needle);
    }
    // The default instructions renderChatPrompt falls back to must be the template's own text, character for character.
    const prompt = renderChatPrompt([{ role: 'user', content: 'Hallo' }]);
    const start = prompt.indexOf('## Custom Instructions\n\n') + '## Custom Instructions\n\n'.length;
    expect(CHAT_TEMPLATE).toContain(prompt.slice(start, prompt.indexOf('\n\n<|im_start|>user')));
    expect(CHAT_TEMPLATE).toContain('"You are a helpful AI assistant named SmolLM, trained by Hugging Face.\\n\\n"');
  });

  it('matches itself under the comparison the engine uses', () => {
    expect(sameTemplate(CHAT_TEMPLATE, CHAT_TEMPLATE)).toBe(true);
    expect(sameTemplate(CHAT_TEMPLATE, `${CHAT_TEMPLATE.replace(/\n/g, '\r\n')}\n`)).toBe(true);
    expect(sameTemplate(CHAT_TEMPLATE, CHAT_TEMPLATE.replace('/no_think', '/nothink'))).toBe(false);
  });
});
