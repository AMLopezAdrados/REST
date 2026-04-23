import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/session';
import { classifyEmail } from '@/lib/classification/cascade';
import { generateNodesForUser } from '@/lib/classification/nodes';
import {
  getUnclassifiedEmails,
  upsertClassification,
} from '@/lib/storage/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const pending = getUnclassifiedEmails(userId, 2000);
  let done = 0;
  for (const email of pending) {
    try {
      const cls = await classifyEmail(email);
      upsertClassification(cls);
      done++;
    } catch (err) {
      console.error('[classify] failed', err);
    }
  }
  const nodes = await generateNodesForUser(userId);
  return NextResponse.json({ ok: true, classified: done, nodes: nodes.created });
}
