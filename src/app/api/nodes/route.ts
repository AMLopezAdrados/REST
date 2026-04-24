import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { requireSession } from '@/lib/auth/session';
import {
  getNodesForUser,
  getEmailsForNode,
  getEmailsForUser,
  upsertUser,
} from '@/lib/storage/queries';
import { syncRecentEmails } from '@/lib/gmail/sync';
import type { RawEmail } from '@/types/email';
import type { TopicNode, Sector, NodeStatus } from '@/types/node';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeSubject(subject: string | null | undefined) {
  return (subject || '')
    .replace(/^(re|fwd|fw|aw|antw):\s*/gi, '')
    .trim();
}

function fallbackKey(email: RawEmail) {
  return email.thread_id && email.thread_id.length > 0
    ? `t:${email.thread_id}`
    : `s:${email.from_email.toLowerCase()}|${normalizeSubject(email.subject).toLowerCase()}`;
}

function syntheticNodeId(userId: string, key: string) {
  return `fallback-${createHash('sha1').update(`${userId}|${key}`).digest('hex').slice(0, 24)}`;
}

function inferStatus(emails: RawEmail[]): NodeStatus {
  const latest = emails[0];
  const haystack = `${latest?.subject || ''} ${latest?.body_plaintext || ''}`.toLowerCase();
  if (/(please|can you|could you|action|required|review|approve|confirm|deadline|asap|urgent|question\?)/.test(haystack)) {
    return 'action';
  }
  if (/(receipt|invoice|order|booking|reservation|ticket|tracking)/.test(haystack)) {
    return 'ongoing';
  }
  return 'saved';
}

function inferSector(emails: RawEmail[]): Sector {
  const latest = emails[0];
  const haystack = `${latest?.subject || ''} ${latest?.body_plaintext || ''}`.toLowerCase();
  if (/(flight|hotel|booking|reservation|airbnb|train|trip)/.test(haystack)) return 'Travel';
  if (/(order|shipping|tracking|package|delivery|receipt|invoice|payment)/.test(haystack)) return 'Orders';
  if (/(bank|tax|insurance|government|admin|contract)/.test(haystack)) return 'Admin';
  if (/(mom|dad|family|friend|party|dinner|home)/.test(haystack)) return 'Personal';
  if (/(job|meeting|project|team|client|work)/.test(haystack)) return 'Work';
  return 'Other';
}

function buildFallbackNodes(userId: string, emails: RawEmail[]): TopicNode[] {
  const groups = new Map<string, RawEmail[]>();

  for (const email of [...emails].sort((a, b) => b.received_at - a.received_at)) {
    const key = fallbackKey(email);
    const current = groups.get(key) ?? [];
    current.push(email);
    groups.set(key, current);
  }

  const grouped = [...groups.entries()].slice(0, 120);
  const radius = 520;

  return grouped.map(([key, group], index) => {
    const latest = [...group].sort((a, b) => b.received_at - a.received_at)[0];
    const angle = (index / Math.max(grouped.length, 1)) * Math.PI * 2;
    const jitter = 90 + (index % 5) * 18;
    const title = normalizeSubject(latest.subject) || latest.from_name || latest.from_email || 'Email thread';
    const summary = (latest.body_plaintext || '').replace(/\s+/g, ' ').trim().slice(0, 140) || 'Open to read this thread';

    return {
      id: syntheticNodeId(userId, key),
      user_id: userId,
      title,
      summary,
      category: null,
      sector: inferSector(group),
      position_x: Math.cos(angle) * (radius + jitter),
      position_y: Math.sin(angle) * (radius + jitter * 0.7),
      urgency_score: Math.max(0.15, 1 - index / Math.max(grouped.length, 1)),
      status: inferStatus(group),
      email_count: group.length,
      last_activity: latest.received_at,
      created_at: Date.now(),
      participants: [latest.from_name || latest.from_email],
      aggregate_summary: null,
      child_count: 0,
      parent_id: null,
    };
  });
}

function getFallbackEmailsForNode(userId: string, nodeId: string, emails: RawEmail[]) {
  const groups = new Map<string, RawEmail[]>();
  for (const email of [...emails].sort((a, b) => b.received_at - a.received_at)) {
    const key = fallbackKey(email);
    const current = groups.get(key) ?? [];
    current.push(email);
    groups.set(key, current);
  }

  for (const [key, group] of groups.entries()) {
    if (syntheticNodeId(userId, key) === nodeId) {
      return group.sort((a, b) => b.received_at - a.received_at);
    }
  }

  return [];
}

async function ensureUserAndMaybeSync() {
  const session = await requireSession();
  if (!session?.userId) return { session: null, emails: [], nodes: [] as TopicNode[] };

  if (session.email && session.refreshToken) {
    upsertUser({
      id: session.userId,
      email: session.email,
      refreshToken: session.refreshToken,
      accessToken: session.accessToken ?? null,
      tokenExpiry: session.tokenExpiry ?? null,
    });
  }

  let nodes = getNodesForUser(session.userId);
  let emails = getEmailsForUser(session.userId, 500);

  if (emails.length === 0 && session.refreshToken) {
    try {
      await syncRecentEmails(session.userId, { days: 90, max: 200 });
    } catch (err) {
      console.error('[nodes route] syncRecentEmails failed', err);
    }
    emails = getEmailsForUser(session.userId, 500);
    nodes = getNodesForUser(session.userId);
  }

  return { session, emails, nodes };
}

export async function GET() {
  const { session, emails, nodes } = await ensureUserAndMaybeSync();
  if (!session?.userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (nodes.length > 0) {
    return NextResponse.json(nodes);
  }

  return NextResponse.json(buildFallbackNodes(session.userId, emails));
}

export async function POST(req: Request) {
  const { session, emails } = await ensureUserAndMaybeSync();
  if (!session?.userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { nodeId } = await req.json();
  const realEmails = getEmailsForNode(nodeId);
  if (realEmails.length > 0) {
    return NextResponse.json(realEmails);
  }

  return NextResponse.json(getFallbackEmailsForNode(session.userId, nodeId, emails));
}
