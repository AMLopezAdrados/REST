import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/session';
import { getNodesForUser, getEmailsForNode } from '@/lib/storage/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const nodes = getNodesForUser(userId);
  return NextResponse.json(nodes);
}

export async function POST(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { nodeId } = await req.json();
  const emails = getEmailsForNode(nodeId);
  return NextResponse.json(emails);
}
