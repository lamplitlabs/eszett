// A port of the SmolLM3 chat template (chat_template.jinja on the Hub, also embedded in the GGUF) for the
// message shapes the app uses: an optional system message first, then user and assistant turns, no tools.
// Pure TypeScript so the prompt the phone sends can be tested in node against the transformers.js fixtures.
import type { ChatMessage } from './tutor';

type ReasoningMode = '/think' | '/no_think';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// The template's own instructions when the system message is missing or empty, verbatim from the jinja.
const DEFAULT_INSTRUCTIONS_THINK =
  'You are a helpful AI assistant named SmolLM, trained by Hugging Face. Your role as an assistant involves thoroughly exploring questions through a systematic thinking process before providing the final precise and accurate solutions. This requires engaging in a comprehensive cycle of analysis, summarizing, exploration, reassessment, reflection, backtracking, and iteration to develop well-considered thinking process. Please structure your response into two main sections: Thought and Solution using the specified format: <think> Thought section </think> Solution section. In the Thought section, detail your reasoning process in steps. Each step should include detailed considerations such as analysing questions, summarizing relevant findings, brainstorming new ideas, verifying the accuracy of the current steps, refining any errors, and revisiting previous steps. In the Solution section, based on various attempts, explorations, and reflections from the Thought section, systematically present the final solution that you deem correct. The Solution section should be logical, accurate, and concise and detail necessary steps needed to reach the conclusion.';
const DEFAULT_INSTRUCTIONS_NO_THINK = 'You are a helpful AI assistant named SmolLM, trained by Hugging Face.';
const NO_THINK_PREFILL = '<think>\n\n</think>\n';

/** strftime_now("%d %B %Y") in the C locale: zero-padded day, English month, year. */
function todayDate(now: Date): string {
  return `${String(now.getDate()).padStart(2, '0')} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
}

/** Python str.replace: every occurrence. */
function replaceAll(text: string, needle: string, replacement: string): string {
  return text.split(needle).join(replacement);
}

/** Python str.rstrip() with no arguments. */
function rstrip(text: string): string {
  return text.trimEnd();
}

/** Python str.lstrip("\n"): only leading newlines go, other whitespace stays. */
function lstripNewlines(text: string): string {
  let i = 0;
  while (i < text.length && text[i] === '\n') i++;
  return text.slice(i);
}

/**
 * Renders the SmolLM3 chat template byte for byte for the shapes the app uses (no tools), including the
 * generation prompt (add_generation_prompt = true). `opts.now` fixes the "Today Date" line, which the template
 * writes as strftime_now("%d %B %Y"), e.g. "05 October 2026"; the default is the phone's local date.
 */
export function renderChatPrompt(messages: ChatMessage[], opts: { now?: Date } = {}): string {
  const now = opts.now ?? new Date();
  const first = messages[0];
  const systemMessage = first?.role === 'system' ? first.content : undefined;

  // enable_thinking is undefined for us, so the template defaults to /think unless the system message says otherwise.
  let reasoningMode: ReasoningMode = '/think';
  let customInstructions = '';
  if (systemMessage !== undefined) {
    if (systemMessage.includes('/no_think')) reasoningMode = '/no_think';
    else if (systemMessage.includes('/think')) reasoningMode = '/think';
    customInstructions = rstrip(replaceAll(replaceAll(systemMessage, '/no_think', ''), '/think', ''));
  }

  let out = '<|im_start|>system\n';
  if (systemMessage !== undefined && systemMessage.includes('/system_override')) {
    out += rstrip(replaceAll(customInstructions, '/system_override', '')) + '<|im_end|>\n';
  } else {
    // Without tools the template never closes the system block: it ends with the blank line after the instructions.
    out += '## Metadata\n\n';
    out += 'Knowledge Cutoff Date: June 2025\n';
    out += `Today Date: ${todayDate(now)}\n`;
    out += `Reasoning Mode: ${reasoningMode}\n\n`;
    out += '## Custom Instructions\n\n';
    if (customInstructions) out += `${customInstructions}\n\n`;
    else if (reasoningMode === '/think') out += `${DEFAULT_INSTRUCTIONS_THINK}\n\n`;
    else out += `${DEFAULT_INSTRUCTIONS_NO_THINK}\n\n`;
  }

  const prefill = reasoningMode === '/think' ? '' : NO_THINK_PREFILL;
  for (const message of messages) {
    const content = typeof message.content === 'string' ? message.content : '';
    if (message.role === 'user') {
      out += `<|im_start|>user\n${content}<|im_end|>\n`;
    } else if (message.role === 'assistant') {
      out += `<|im_start|>assistant\n${prefill}${lstripNewlines(content)}<|im_end|>\n`;
    }
    // A system message prints nothing in the loop; the first one was handled above, as in the template.
  }

  return `${out}<|im_start|>assistant\n${prefill}`;
}

/**
 * The prompt up to and including the start of the last user message, left open: the text every prompt that
 * begins with these messages shares byte for byte. The engine evaluates it ahead of time so the model's KV
 * cache already holds it when the learner's turn arrives. Pass a last user message with partial content
 * (a rule note, say) to extend the shared part; the message is not closed, so the final prompt can go on.
 */
export function renderChatPrefix(messages: ChatMessage[], opts: { now?: Date } = {}): string {
  const last = messages[messages.length - 1];
  const open = last?.role === 'user' ? messages : [...messages, { role: 'user' as const, content: '' }];
  const full = renderChatPrompt(open, opts);
  const tail = full.lastIndexOf('<|im_end|>\n<|im_start|>assistant\n');
  return tail === -1 ? full : full.slice(0, tail);
}

/** True when two template texts are the same template: surrounding whitespace and CRLF vs LF do not count. */
export function sameTemplate(a: string, b: string): boolean {
  const normalise = (text: string) => text.replace(/\r\n/g, '\n').trim();
  return normalise(a) === normalise(b);
}
