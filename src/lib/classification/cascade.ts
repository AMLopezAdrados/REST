import Anthropic from '@anthropic-ai/sdk';
import type { RawEmail } from '@/types/email';
import type { Classification, MainCategory, IntentData } from '@/types/classification';
import { runLocalPatterns } from './local_patterns';
import {
  MAIN_CATEGORY_SYSTEM,
  SUB_PROMPTS,
  EXTRACTION_PROMPTS,
  INTENT_SYSTEM,
  buildEmailPreview,
} from './prompts';

const HAIKU_MODEL = 'claude-haiku-4-5';
const SONNET_MODEL = 'claude-sonnet-4-6';
const CLASSIFIER_VERSION = 'cascade-v1';

let cachedClient: Anthropic | null = null;
function client(): Anthropic {
  if (!cachedClient) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
    cachedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return cachedClient;
}

// Basic rate limiter — min interval between calls
let nextAvailableAt = 0;
const MIN_INTERVAL_MS = 120;
async function throttle() {
  const now = Date.now();
  if (now < nextAvailableAt) {
    await new Promise((r) => setTimeout(r, nextAvailableAt - now));
  }
  nextAvailableAt = Math.max(Date.now(), nextAvailableAt) + MIN_INTERVAL_MS;
}

function extractText(resp: Anthropic.Message): string {
  const block = resp.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') return '';
  return block.text.trim();
}

function parseJsonLoose(raw: string): any | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const direct = tryParse(trimmed);
  if (direct) return direct;
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match) return tryParse(match[0]);
  return null;
}

function tryParse(s: string): any | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function logCost(step: string, usage: Anthropic.Usage, model: string) {
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  // Rough pricing estimate (USD per 1M tokens)
  const pricing: Record<string, { in: number; out: number }> = {
    [HAIKU_MODEL]: { in: 0.8, out: 4 },
    [SONNET_MODEL]: { in: 3, out: 15 },
  };
  const p = pricing[model] ?? { in: 1, out: 5 };
  const cost = (input * p.in + output * p.out) / 1_000_000;
  console.log(`[classify] ${step} model=${model} in=${input} out=${output} ~$${cost.toFixed(5)}`);
}

async function classifyMainCategory(email: RawEmail): Promise<MainCategory> {
  await throttle();
  const resp = await client().messages.create({
    model: HAIKU_MODEL,
    max_tokens: 16,
    system: MAIN_CATEGORY_SYSTEM,
    messages: [{ role: 'user', content: buildEmailPreview(email) }],
  });
  logCost('main', resp.usage, HAIKU_MODEL);
  const raw = extractText(resp).toLowerCase().replace(/[^a-z]/g, '');
  const valid: MainCategory[] = ['work', 'personal', 'reservation', 'order', 'admin', 'marketing', 'unknown'];
  const match = valid.find((v) => raw.startsWith(v));
  return match ?? 'unknown';
}

async function classifySubcategory(email: RawEmail, main: MainCategory): Promise<string | null> {
  const sub = SUB_PROMPTS[main];
  if (!sub) return null;
  await throttle();
  const resp = await client().messages.create({
    model: HAIKU_MODEL,
    max_tokens: 16,
    system: sub.system,
    messages: [{ role: 'user', content: buildEmailPreview(email) }],
  });
  logCost('sub', resp.usage, HAIKU_MODEL);
  const raw = extractText(resp).toLowerCase().replace(/[^a-z_]/g, '');
  return sub.options.find((o) => raw.startsWith(o)) ?? null;
}

async function extractData(email: RawEmail, main: MainCategory): Promise<Record<string, unknown> | null> {
  const prompt = EXTRACTION_PROMPTS[main];
  if (!prompt) return null;
  await throttle();
  const resp = await client().messages.create({
    model: main === 'work' ? HAIKU_MODEL : SONNET_MODEL,
    max_tokens: 400,
    system: prompt,
    messages: [{ role: 'user', content: buildEmailPreview(email) }],
  });
  logCost('extract', resp.usage, main === 'work' ? HAIKU_MODEL : SONNET_MODEL);
  const text = extractText(resp);
  return parseJsonLoose(text);
}

async function detectIntent(email: RawEmail): Promise<IntentData | null> {
  await throttle();
  const resp = await client().messages.create({
    model: HAIKU_MODEL,
    max_tokens: 200,
    system: INTENT_SYSTEM,
    messages: [{ role: 'user', content: buildEmailPreview(email) }],
  });
  logCost('intent', resp.usage, HAIKU_MODEL);
  const text = extractText(resp);
  const parsed = parseJsonLoose(text);
  if (!parsed) return null;
  return {
    has_question: !!parsed.has_question,
    has_action: !!parsed.has_action,
    has_deadline: !!parsed.has_deadline,
    deadline: parsed.deadline ?? null,
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
  };
}

export async function classifyEmail(email: RawEmail): Promise<Classification> {
  const now = Date.now();

  const local = runLocalPatterns(email);
  if (local && local.confidence > 0.95) {
    console.log(`[classify] local match ${email.id} -> ${local.category}/${local.subcategory} (${local.source})`);

    let intent: IntentData | null = null;
    if (local.category !== 'marketing') {
      try {
        intent = await detectIntent(email);
      } catch (err) {
        console.error('[classify] intent failed', err);
      }
    }

    return {
      email_id: email.id,
      main_category: local.category,
      subcategory: local.subcategory,
      extracted_data: null,
      intent_data: intent,
      confidence: local.confidence,
      classified_at: now,
      classifier_version: CLASSIFIER_VERSION,
      user_corrected: false,
    };
  }

  let main: MainCategory = 'unknown';
  let subcategory: string | null = null;
  let extractedData: Record<string, unknown> | null = null;
  let intent: IntentData | null = null;
  let confidence = 0.6;

  try {
    main = await classifyMainCategory(email);
    confidence = 0.75;
  } catch (err) {
    console.error('[classify] main failed', err);
  }

  try {
    subcategory = await classifySubcategory(email, main);
  } catch (err) {
    console.error('[classify] sub failed', err);
  }

  try {
    extractedData = await extractData(email, main);
  } catch (err) {
    console.error('[classify] extract failed', err);
  }

  if (main !== 'marketing') {
    try {
      intent = await detectIntent(email);
    } catch (err) {
      console.error('[classify] intent failed', err);
    }
  }

  return {
    email_id: email.id,
    main_category: main,
    subcategory,
    extracted_data: extractedData,
    intent_data: intent,
    confidence,
    classified_at: now,
    classifier_version: CLASSIFIER_VERSION,
    user_corrected: false,
  };
}
