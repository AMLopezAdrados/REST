import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth/session';
import {
  getNodesForUser,
  getEmailsForNode,
  getNodesByDepth,
  getNodesByParent,
  getNodeById,
} from '@/lib/storage/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const depthParam = url.searchParams.get('depth');
  const parentParam = url.searchParams.get('parent');
  const idParam = url.searchParams.get('id');

  if (idParam) {
    const node = getNodeById(idParam);
    return NextResponse.json(node);
  }

  if (parentParam !== null) {
    const nodes = getNodesByParent(userId, parentParam === 'null' ? null : parentParam);
    return NextResponse.json(nodes);
  }

  if (depthParam !== null) {
    const depth = parseInt(depthParam, 10);
    const nodes = getNodesByDepth(userId, depth);
    return NextResponse.json(nodes);
  }

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
