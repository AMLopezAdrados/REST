import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { syncRecentEmails } from '@/lib/gmail/sync';
import { classifyEmail } from '@/lib/classification/cascade';
import { generateNodesForUser } from '@/lib/classification/nodes';
import {
  upsertUser,
  getUnclassifiedEmails,
  upsertClassification,
  setSyncProgress,
  getSyncProgress,
} from '@/lib/storage/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function runClassification(userId: string) {
  const pending = getUnclassifiedEmails(userId, 2000);
  setSyncProgress(userId, { status: 'classifying', total: pending.length, processed: 0, classified: 0 });

  const CONCURRENCY = 5;
  let idx = 0;
  let done = 0;

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= pending.length) return;
      const email = pending[i];
      try {
        const cls = await classifyEmail(email);
        upsertClassification(cls);
      } catch (err) {
        console.error(`[classify] failed for ${email.id}`, err);
        upsertClassification({
          email_id: email.id,
          main_category: 'unknown',
          subcategory: null,
          extracted_data: null,
          intent_data: null,
          confidence: 0,
          classified_at: Date.now(),
          classifier_version: 'cascade-v1',
          user_corrected: false,
        });
      } finally {
        done++;
        if (done % 3 === 0 || done === pending.length) {
          setSyncProgress(userId, { status: 'classifying', processed: done, classified: done });
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, () => worker()));
  setSyncProgress(userId, { status: 'classifying', processed: pending.length, classified: pending.length });
  return pending.length;
}

export async function POST(req: Request) {
  const sess = await requireSession();
  if (!sess) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { userId, email, refreshToken, accessToken, tokenExpiry } = sess;

  // Ensure user exists in DB with latest tokens before any Gmail/DB operations.
  if (refreshToken) {
    upsertUser({ id: userId, email, refreshToken, accessToken, tokenExpiry });
  }

  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get('days') ?? '90', 10);
  const max = parseInt(url.searchParams.get('max') ?? '300', 10);

  try {
    console.log(`[sync] starting for ${userId} (days=${days}, max=${max})`);
    const fetchResult = await syncRecentEmails(userId, { days, max });
    const classified = await runClassification(userId);
    const nodes = await generateNodesForUser(userId);
    setSyncProgress(userId, { status: 'done' });
    return NextResponse.json({
      ok: true,
      fetched: fetchResult.fetched,
      inserted: fetchResult.inserted,
      classified,
      nodes: nodes.created,
    });
  } catch (err: any) {
    console.error('[sync] fatal', err);
    setSyncProgress(userId, { status: 'error' });
    return NextResponse.json({ error: err?.message ?? 'sync failed' }, { status: 500 });
  }
}

export async function GET() {
  const userId = (await requireSession())?.userId;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const progress = getSyncProgress(userId);
  return NextResponse.json(progress ?? { status: 'idle', total: 0, processed: 0 });
}
