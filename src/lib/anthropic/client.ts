import Anthropic from '@anthropic-ai/sdk';

// ---------------------------------------------------------------------------
// Shared Anthropic client with a GLOBAL pacer + retry-on-429 backoff.
//
// The binding constraint is the organization's requests-per-minute limit. With
// several concurrent workers (classification + node generation) firing in
// parallel, bursts blow past that limit and return 429s. So every Claude call
// in the app goes through this single module, which:
//   1. paces all calls to stay under a target RPM (global, across workers), and
//   2. retries 429/overloaded/5xx with exponential backoff, honoring the
//      `retry-after` header when present.
// ---------------------------------------------------------------------------

let cached: Anthropic | null = null;
function getClient(): Anthropic {
  if (!cached) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
    // We handle retries ourselves so the global pacer stays in control.
    cached = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
  }
  return cached;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Target requests/minute — kept under the org limit (default 50). Override with
// ANTHROPIC_TARGET_RPM if your tier is higher.
const TARGET_RPM = Number(process.env.ANTHROPIC_TARGET_RPM ?? 45);
const MIN_INTERVAL_MS = Math.ceil(60_000 / Math.max(1, TARGET_RPM));

// Serialize scheduling so calls are spaced >= MIN_INTERVAL_MS apart globally,
// regardless of how many workers call concurrently.
let chain: Promise<void> = Promise.resolve();
let lastStart = 0;
function gate(): Promise<void> {
  const next = chain.then(async () => {
    const wait = Math.max(0, lastStart + MIN_INTERVAL_MS - Date.now());
    if (wait) await sleep(wait);
    lastStart = Date.now();
  });
  chain = next.catch(() => {});
  return next;
}

const MAX_ATTEMPTS = 6;
const RETRYABLE = new Set([429, 500, 502, 503, 529]);

export async function createMessage(
  params: Anthropic.Messages.MessageCreateParamsNonStreaming
): Promise<Anthropic.Message> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await gate();
    try {
      return await getClient().messages.create(params);
    } catch (err: any) {
      attempt++;
      const status: number | undefined = err?.status;
      if (!status || !RETRYABLE.has(status) || attempt >= MAX_ATTEMPTS) throw err;

      const retryAfter = Number(err?.headers?.['retry-after']);
      const backoff =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.min(30_000, 1000 * 2 ** (attempt - 1));
      const wait = backoff + Math.random() * 500; // jitter
      console.warn(
        `[anthropic] ${status} — retry ${attempt}/${MAX_ATTEMPTS} in ${Math.round(wait)}ms`
      );
      await sleep(wait);
    }
  }
}
