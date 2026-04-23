import { getGmailForUser } from './client';
import { normalizeMessage } from './normalize';
import {
  insertEmail,
  setSyncProgress,
  updateLastSync,
} from '@/lib/storage/queries';

const CONCURRENCY = 5;

async function pool<T>(items: T[], worker: (item: T, idx: number) => Promise<void>, size: number) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        await worker(items[i], i);
      } catch (err) {
        console.error('[sync] worker error', err);
      }
    }
  });
  await Promise.all(runners);
}

export async function syncRecentEmails(
  userId: string,
  options: { days?: number; max?: number } = {}
): Promise<{ fetched: number; inserted: number }> {
  const { days = 90, max = 500 } = options;
  const { gmail } = await getGmailForUser(userId);

  setSyncProgress(userId, { status: 'fetching', total: 0, processed: 0 });

  const ids: string[] = [];
  let pageToken: string | undefined = undefined;

  do {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await gmail.users.messages.list({
      userId: 'me',
      q: `newer_than:${days}d`,
      pageToken,
      maxResults: 100,
    });
    const msgs = res.data.messages ?? [];
    for (const m of msgs) if (m.id) ids.push(m.id);
    pageToken = res.data.nextPageToken ?? undefined;
    if (ids.length >= max) break;
  } while (pageToken);

  const cappedIds = ids.slice(0, max);
  setSyncProgress(userId, { status: 'fetching', total: cappedIds.length, processed: 0 });

  let inserted = 0;
  let processed = 0;

  await pool(
    cappedIds,
    async (id) => {
      try {
        const res = await gmail.users.messages.get({
          userId: 'me',
          id,
          format: 'full',
        });
        const normalized = normalizeMessage(res.data);
        if (normalized) {
          insertEmail(userId, normalized);
          inserted++;
        }
      } catch (err) {
        console.error(`[sync] failed to fetch ${id}`, err);
      } finally {
        processed++;
        if (processed % 5 === 0 || processed === cappedIds.length) {
          setSyncProgress(userId, { status: 'fetching', total: cappedIds.length, processed });
        }
      }
    },
    CONCURRENCY
  );

  updateLastSync(userId);
  setSyncProgress(userId, { status: 'done', total: cappedIds.length, processed });

  return { fetched: cappedIds.length, inserted };
}
