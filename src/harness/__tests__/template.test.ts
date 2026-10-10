import { describe, expect, it } from 'vitest';

import { CHAT_TEMPLATE } from '../../model/manifest';
import { renderChatPrompt, sameTemplate } from '../template';
import type { ChatMessage } from '../tutor';
import fixtures from './fixtures/chat-template.json';

// The fixtures were rendered by transformers.js on 2026-10-05, so the "Today Date" line reads 05 October 2026.
const renderedOn = new Date(2026, 9, 5);
const cases = fixtures.cases as unknown as { messages: ChatMessage[]; prompt: string; ids: number }[];
const user = (content: string): ChatMessage => ({ role: 'user', content });
const assistant = (content: string): ChatMessage => ({ role: 'assistant', content });
const system = (content: string): ChatMessage => ({ role: 'system', content });

describe('chat template', () => {
  it('has the four fixture cases', () => {
    expect(fixtures.rendered_on.startsWith('2026-10-05')).toBe(true);
    expect(cases.length).toBe(4);
  });

  for (const [i, c] of cases.entries()) {
    it(`renders fixture case ${i + 1} byte for byte (${c.messages.map((m) => m.role).join(', ')})`, () => {
      expect(renderChatPrompt(c.messages, { now: renderedOn })).toBe(c.prompt);
    });
  }

  it('writes the date like strftime_now("%d %B %Y")', () => {
    const prompt = renderChatPrompt([user('Hallo')], { now: new Date(2026, 0, 1) });
    expect(prompt).toContain('Today Date: 01 January 2026\n');
    expect(renderChatPrompt([user('Hallo')], { now: new Date(2027, 11, 31) })).toContain('Today Date: 31 December 2027\n');
    const today = renderChatPrompt([user('Hallo')]);
    expect(today).toMatch(new RegExp(`Today Date: \\d{2} [A-Z][a-z]+ ${new Date().getFullYear()}\\n`));
  });

  it('falls back to the template defaults for a user-only conversation', () => {
    const prompt = renderChatPrompt([user('Hallo')], { now: renderedOn });
    expect(prompt.startsWith('<|im_start|>system\n## Metadata\n\nKnowledge Cutoff Date: June 2025\nToday Date: 05 October 2026\nReasoning Mode: /think\n\n## Custom Instructions\n\nYou are a helpful AI assistant named SmolLM, trained by Hugging Face. Your role as an assistant')).toBe(true);
    expect(prompt.endsWith('reach the conclusion.\n\n<|im_start|>user\nHallo<|im_end|>\n<|im_start|>assistant\n')).toBe(true);
    expect(prompt).not.toContain('<think>\n\n</think>');
  });

  it('does not close the system block when there are no tools', () => {
    const prompt = renderChatPrompt([system('Be brief.'), user('Hallo')], { now: renderedOn });
    expect(prompt).toBe(
      '<|im_start|>system\n## Metadata\n\nKnowledge Cutoff Date: June 2025\nToday Date: 05 October 2026\nReasoning Mode: /think\n\n## Custom Instructions\n\nBe brief.\n\n<|im_start|>user\nHallo<|im_end|>\n<|im_start|>assistant\n',
    );
  });

  it('switches to /no_think and prefills the empty think block', () => {
    const prompt = renderChatPrompt([system('Be brief. /no_think'), user('Hallo'), assistant('Hallo!'), user('Wie geht es dir?')], { now: renderedOn });
    expect(prompt).toContain('Reasoning Mode: /no_think\n\n## Custom Instructions\n\nBe brief.\n\n<|im_start|>user\nHallo<|im_end|>\n');
    expect(prompt).toContain('<|im_start|>assistant\n<think>\n\n</think>\nHallo!<|im_end|>\n');
    expect(prompt.endsWith('<|im_start|>user\nWie geht es dir?<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n')).toBe(true);
    expect(prompt).not.toContain('/no_think\n\n<|im_start|>user');
  });

  it('uses the short default instructions when the system message is only the /no_think tag', () => {
    const prompt = renderChatPrompt([system('/no_think'), user('Hallo')], { now: renderedOn });
    expect(prompt).toContain('## Custom Instructions\n\nYou are a helpful AI assistant named SmolLM, trained by Hugging Face.\n\n<|im_start|>user\n');
    expect(prompt.endsWith('<|im_start|>assistant\n<think>\n\n</think>\n')).toBe(true);
  });

  it('strips every tag like str.replace and only rstrips, as the template does', () => {
    const prompt = renderChatPrompt([system('/think Be brief. /think\n'), user('Hallo')], { now: renderedOn });
    expect(prompt).toContain('Reasoning Mode: /think\n\n## Custom Instructions\n\n Be brief.\n\n<|im_start|>user\n');
  });

  it('honours /system_override: the raw instructions become the whole system message', () => {
    const prompt = renderChatPrompt([system('Du bist ein Tutor. /system_override'), user('Hallo')], { now: renderedOn });
    expect(prompt).toBe('<|im_start|>system\nDu bist ein Tutor.<|im_end|>\n<|im_start|>user\nHallo<|im_end|>\n<|im_start|>assistant\n');
    const noThink = renderChatPrompt([system('/system_override Du bist ein Tutor. /no_think'), user('Hallo')], { now: renderedOn });
    expect(noThink).toBe('<|im_start|>system\n Du bist ein Tutor.<|im_end|>\n<|im_start|>user\nHallo<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n');
  });

  it('strips leading newlines from assistant turns and keeps everything else', () => {
    const prompt = renderChatPrompt([user('Hallo'), assistant('\n\n  Hallo!\n'), user('Danke')], { now: renderedOn });
    expect(prompt).toContain('<|im_start|>user\nHallo<|im_end|>\n<|im_start|>assistant\n  Hallo!\n<|im_end|>\n<|im_start|>user\nDanke<|im_end|>\n');
    expect(renderChatPrompt([user('  Zwei\nZeilen  ')], { now: renderedOn })).toContain('<|im_start|>user\n  Zwei\nZeilen  <|im_end|>\n');
  });

  it('always ends with the generation prompt', () => {
    const shapes: ChatMessage[][] = [
      [],
      [user('Hallo')],
      [system('Be brief.'), user('Hallo')],
      [system('Be brief.'), user('Hallo'), assistant('Hallo!'), user('Und du?')],
      [user('Hallo'), assistant('Hallo!')],
    ];
    for (const messages of shapes) {
      const prompt = renderChatPrompt(messages, { now: renderedOn });
      expect(prompt.endsWith('<|im_start|>assistant\n')).toBe(true);
      expect(prompt.startsWith('<|im_start|>system\n')).toBe(true);
    }
    expect(renderChatPrompt([system('/no_think'), user('Hallo')], { now: renderedOn }).endsWith('<|im_start|>assistant\n<think>\n\n</think>\n')).toBe(true);
  });

  it('compares templates without caring about surrounding whitespace or line endings', () => {
    const jinja = '{%- if messages[0].role == "system" -%}\n  {{- messages[0].content -}}\n{%- endif -%}';
    expect(sameTemplate(jinja, jinja)).toBe(true);
    expect(sameTemplate(`\n\n${jinja}\n  `, jinja)).toBe(true);
    expect(sameTemplate(jinja.replace(/\n/g, '\r\n'), jinja)).toBe(true);
    expect(sameTemplate(jinja, jinja.replace('system', 'user'))).toBe(false);
    expect(sameTemplate(jinja, '')).toBe(false);
    expect(sameTemplate('', '   ')).toBe(true);
  });

  it('ports the template text the GGUF embeds (defaults and tags appear verbatim)', () => {
    const jinja = CHAT_TEMPLATE;
    const prompt = renderChatPrompt([user('Hallo')], { now: renderedOn });
    const defaults = prompt.slice(prompt.indexOf('## Custom Instructions\n\n') + '## Custom Instructions\n\n'.length, prompt.indexOf('\n\n<|im_start|>user'));
    expect(jinja).toContain(defaults);
    expect(jinja).toContain('strftime_now("%d %B %Y")');
    expect(jinja).toContain('Knowledge Cutoff Date: June 2025');
    for (const tag of ['/think', '/no_think', '/system_override', '<think>\\n\\n</think>\\n']) expect(jinja).toContain(tag);
  });
});
