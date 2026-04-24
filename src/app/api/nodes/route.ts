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
import type { TopicNode, Sector, NodeStatus, ActionType, StreamType } from '@/types/node';

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

function extractFirstUrl(email: RawEmail): string | null {
  const haystack = `${email.body_html || ''} ${(email.body_plaintext || '').slice(0, 2000)}`;
  const match = haystack.match(/https?:\/\/[^\s"'<>]+/i);
  return match?.[0] ?? null;
}

function sourceLabel(email: RawEmail) {
  return email.from_name || email.from_email.split('@')[0] || email.from_email;
}

function domainFromEmail(email: string) {
  return email.toLowerCase().split('@')[1] || email.toLowerCase();
}

function friendlyServiceName(email: RawEmail) {
  const domain = domainFromEmail(email.from_email);
  const domainMap: Array<[RegExp, string]> = [
    [/amazon\./, 'Amazon'],
    [/linkedin\./, 'LinkedIn'],
    [/(instagram|facebook|fb)\./, 'Meta'],
    [/google\./, 'Google'],
    [/booking\./, 'Booking'],
    [/airbnb\./, 'Airbnb'],
    [/(dhl|ups|fedex|postnl|gls|dpd)\./, 'Delivery'],
    [/(paypal|stripe)\./, 'Payments'],
    [/(bank|bunq|revolut|wise)\./, 'Banking'],
    [/(github|gitlab|jira|notion|slack)\./, 'Work Tools'],
  ];
  for (const [pattern, label] of domainMap) {
    if (pattern.test(domain)) return label;
  }
  const root = domain.split('.').slice(-2, -1)[0] || domain.split('.')[0] || domain;
  return root.charAt(0).toUpperCase() + root.slice(1);
}

function serviceKey(email: RawEmail) {
  const service = friendlyServiceName(email).toLowerCase().replace(/\s+/g, '-');
  return `svc:${service}`;
}

function inferStreamType(email: RawEmail): StreamType {
  const haystack = `${email.subject || ''} ${email.body_plaintext || ''}`.toLowerCase();
  const sender = email.from_email.toLowerCase();
  if (/(unsubscribe|newsletter|promo|promotion|sale|discount|deals|digest|recommended for you)/.test(haystack)) return 'promotion';
  if (/(new followers|people to follow|likes|views|social|network)/.test(haystack) || /(instagram|facebook|linkedin|tiktok|twitter|x\.com)/.test(sender)) return 'social';
  if (/(tracking|receipt|invoice|ticket|booking|reservation|delivery|payment|refund|order)/.test(haystack)) return 'transactional';
  if (/(security|password|verification|verify|sign-in|login alert|two-factor)/.test(haystack)) return 'security';
  if (/(support|case|ticket|help desk)/.test(haystack)) return 'support';
  if (/(noreply|no-reply|notifications?@|mailer)/.test(sender)) return 'system';
  return 'human';
}

function inferSector(emails: RawEmail[]): Sector {
  const latest = emails[0];
  const haystack = `${latest?.subject || ''} ${latest?.body_plaintext || ''}`.toLowerCase();
  if (/(flight|hotel|booking|reservation|airbnb|train|trip)/.test(haystack)) return 'Travel';
  if (/(order|shipping|tracking|package|delivery|receipt|invoice|payment)/.test(haystack)) return 'Orders';
  if (/(bank|tax|insurance|government|admin|contract|security|verification)/.test(haystack)) return 'Admin';
  if (/(mom|dad|family|friend|party|dinner|home)/.test(haystack)) return 'Personal';
  if (/(job|meeting|project|team|client|work|github|jira|slack)/.test(haystack)) return 'Work';
  return 'Other';
}

function inferAttention(emails: RawEmail[]) {
  const latest = emails[0];
  const subject = normalizeSubject(latest?.subject);
  const haystack = `${latest?.subject || ''} ${latest?.body_plaintext || ''}`.toLowerCase();
  const url = extractFirstUrl(latest);
  const streamType = inferStreamType(latest);

  const lowValue =
    streamType === 'promotion' ||
    streamType === 'social' ||
    /(noreply|no-reply|mailer|notifications?@)/.test(latest?.from_email || '');

  if (lowValue) {
    return {
      status: 'archive' as NodeStatus,
      actionType: 'ignore' as ActionType,
      streamType,
      why: 'Low-value stream that can live in the background',
      effort: 'Skip',
      primaryLabel: 'Hide from focus',
      primaryUrl: url,
      lowValue: true,
      trackingOnly: false,
    };
  }

  if (/(pay now|payment due|invoice due|complete payment|secure your payment|billing issue)/.test(haystack)) {
    return {
      status: 'action' as NodeStatus,
      actionType: 'pay' as ActionType,
      streamType,
      why: 'Money or account access depends on this',
      effort: '2 min',
      primaryLabel: url ? 'Open payment page' : 'Review payment request',
      primaryUrl: url,
      lowValue: false,
      trackingOnly: false,
    };
  }

  if (/(upload|submit|complete form|fill out|verification|verify your|student id|document required)/.test(haystack)) {
    return {
      status: 'action' as NodeStatus,
      actionType: 'upload' as ActionType,
      streamType,
      why: 'A required step is still waiting on you',
      effort: '3 min',
      primaryLabel: url ? 'Open form' : 'Review requirements',
      primaryUrl: url,
      lowValue: false,
      trackingOnly: false,
    };
  }

  if (/(approve|review and approve|please review|needs review|sign in to review|confirm your review)/.test(haystack)) {
    return {
      status: 'action' as NodeStatus,
      actionType: 'review' as ActionType,
      streamType,
      why: 'Someone is waiting for your decision or review',
      effort: '2 min',
      primaryLabel: url ? 'Review now' : 'Open thread',
      primaryUrl: url,
      lowValue: false,
      trackingOnly: false,
    };
  }

  if (/(can you|could you|please reply|let me know|reply requested|question\?|need your answer|respond)/.test(haystack) && streamType === 'human') {
    return {
      status: 'action' as NodeStatus,
      actionType: 'reply' as ActionType,
      streamType,
      why: 'A human reply from you would unblock this',
      effort: '30 sec',
      primaryLabel: 'Draft reply',
      primaryUrl: `mailto:${latest.from_email}?subject=${encodeURIComponent(`Re: ${subject || latest.subject || ''}`)}`,
      lowValue: false,
      trackingOnly: false,
    };
  }

  if (/(choose a time|pick a time|schedule|calendar|availability|meeting)/.test(haystack)) {
    return {
      status: 'action' as NodeStatus,
      actionType: 'schedule' as ActionType,
      streamType,
      why: 'This needs a scheduling decision',
      effort: '1 min',
      primaryLabel: url ? 'Pick a time' : 'Draft reply',
      primaryUrl: url ?? `mailto:${latest.from_email}?subject=${encodeURIComponent(`Re: ${subject || latest.subject || ''}`)}`,
      lowValue: false,
      trackingOnly: false,
    };
  }

  if (/(confirm|rsvp|attendance|verify|accept invitation)/.test(haystack)) {
    return {
      status: 'action' as NodeStatus,
      actionType: 'confirm' as ActionType,
      streamType,
      why: 'A confirmation is still pending',
      effort: '30 sec',
      primaryLabel: url ? 'Confirm now' : 'Draft reply',
      primaryUrl: url ?? `mailto:${latest.from_email}?subject=${encodeURIComponent(`Re: ${subject || latest.subject || ''}`)}`,
      lowValue: false,
      trackingOnly: false,
    };
  }

  if (/(tracking|shipped|out for delivery|delivered|reservation confirmed|booking confirmed|receipt|ticket|order update|refund)/.test(haystack)) {
    return {
      status: 'ongoing' as NodeStatus,
      actionType: 'track' as ActionType,
      streamType,
      why: 'Useful to monitor, but no action is needed right now',
      effort: 'No action',
      primaryLabel: url ? 'Open tracking' : 'Open details',
      primaryUrl: url,
      lowValue: false,
      trackingOnly: true,
    };
  }

  return {
    status: 'saved' as NodeStatus,
    actionType: 'read' as ActionType,
    streamType,
    why: 'Worth keeping as reference, but not urgent',
    effort: '1 min',
    primaryLabel: url ? 'Open source' : 'Open thread',
    primaryUrl: url,
    lowValue: false,
    trackingOnly: false,
  };
}

function serviceSummary(service: string, streamType: StreamType, count: number) {
  if (streamType === 'promotion') return `${count} promotional updates from ${service} bundled into one quiet stream.`;
  if (streamType === 'social') return `${count} social nudges from ${service} grouped together to reduce noise.`;
  if (streamType === 'transactional') return `${count} service updates from ${service} grouped for easier tracking.`;
  if (streamType === 'security') return `${count} security or account alerts from ${service} collected in one place.`;
  return `${count} related messages from ${service} grouped together.`;
}

function buildAggregateNode(userId: string, key: string, emails: RawEmail[], index: number): TopicNode {
  const sorted = [...emails].sort((a, b) => b.received_at - a.received_at);
  const latest = sorted[0];
  const service = friendlyServiceName(latest);
  const attention = inferAttention(sorted);
  const streamType = attention.streamType;
  const radius = 540;
  const angle = (index / 20) * Math.PI * 2;
  const title =
    streamType === 'promotion'
      ? `${service} Promotions`
      : streamType === 'social'
      ? `${service} Social Updates`
      : streamType === 'transactional'
      ? `${service} Service Updates`
      : `${service} Updates`;

  return {
    id: syntheticNodeId(userId, key),
    user_id: userId,
    title,
    summary: serviceSummary(service, streamType, sorted.length),
    category: null,
    sector:
      streamType === 'promotion' || streamType === 'social'
        ? 'Other'
        : inferSector(sorted),
    position_x: Math.cos(angle) * radius,
    position_y: Math.sin(angle) * (radius * 0.65),
    urgency_score: streamType === 'promotion' || streamType === 'social' ? 0.04 : 0.25,
    status: attention.status,
    email_count: sorted.length,
    last_activity: latest.received_at,
    created_at: Date.now(),
    participants: [sourceLabel(latest)],
    aggregate_summary: serviceSummary(service, streamType, sorted.length),
    child_count: sorted.length,
    parent_id: null,
    source_label: service,
    source_email: latest.from_email,
    why_it_matters:
      streamType === 'promotion' || streamType === 'social'
        ? 'This whole stream is safe to keep bundled unless something becomes important.'
        : attention.why,
    action_type: streamType === 'promotion' || streamType === 'social' ? 'ignore' : attention.actionType,
    effort_label: streamType === 'promotion' || streamType === 'social' ? 'Skip' : attention.effort,
    primary_cta_label: streamType === 'promotion' || streamType === 'social' ? 'Hide from focus' : attention.primaryLabel,
    primary_cta_url: attention.primaryUrl,
    secondary_cta_label: attention.status === 'action' ? 'Mark done' : 'Hide',
    low_value: streamType === 'promotion' || streamType === 'social' ? true : attention.lowValue,
    is_tracking_only: attention.trackingOnly,
    service_key: serviceKey(latest),
    stream_type: streamType,
    bundle_kind: streamType === 'promotion' || streamType === 'social' ? 'noise' : 'service',
  };
}

function buildThreadNode(userId: string, key: string, group: RawEmail[], index: number): TopicNode {
  const latest = [...group].sort((a, b) => b.received_at - a.received_at)[0];
  const angle = (index / 120) * Math.PI * 2;
  const jitter = 90 + (index % 5) * 18;
  const title = normalizeSubject(latest.subject) || latest.from_name || latest.from_email || 'Email thread';
  const summary = (latest.body_plaintext || '').replace(/\s+/g, ' ').trim().slice(0, 140) || 'Open to read this thread';
  const attention = inferAttention(group);

  return {
    id: syntheticNodeId(userId, key),
    user_id: userId,
    title,
    summary,
    category: null,
    sector: inferSector(group),
    position_x: Math.cos(angle) * (520 + jitter),
    position_y: Math.sin(angle) * (520 + jitter * 0.7),
    urgency_score: Math.max(0.12, 1 - index / 120),
    status: attention.status,
    email_count: group.length,
    last_activity: latest.received_at,
    created_at: Date.now(),
    participants: [latest.from_name || latest.from_email],
    aggregate_summary: null,
    child_count: 0,
    parent_id: null,
    source_label: sourceLabel(latest),
    source_email: latest.from_email,
    why_it_matters: attention.why,
    action_type: attention.actionType,
    effort_label: attention.effort,
    primary_cta_label: attention.primaryLabel,
    primary_cta_url: attention.primaryUrl,
    secondary_cta_label: attention.status === 'action' ? 'Mark done' : 'Hide',
    low_value: attention.lowValue,
    is_tracking_only: attention.trackingOnly,
    service_key: serviceKey(latest),
    stream_type: attention.streamType,
    bundle_kind: 'thread',
  };
}

function buildFallbackNodes(userId: string, emails: RawEmail[]): TopicNode[] {
  const threadGroups = new Map<string, RawEmail[]>();
  const aggregateGroups = new Map<string, { emails: RawEmail[]; streamType: StreamType }>();

  for (const email of [...emails].sort((a, b) => b.received_at - a.received_at)) {
    const streamType = inferStreamType(email);
    const svcKey = serviceKey(email);
    const key = fallbackKey(email);
    const aggregateKey = `${svcKey}|${streamType}`;

    if (streamType === 'promotion' || streamType === 'social' || streamType === 'transactional') {
      const current = aggregateGroups.get(aggregateKey) ?? { emails: [], streamType };
      current.emails.push(email);
      aggregateGroups.set(aggregateKey, current);
    } else {
      const current = threadGroups.get(key) ?? [];
      current.push(email);
      threadGroups.set(key, current);
    }
  }

  const serviceNodes = [...aggregateGroups.entries()]
    .sort((a, b) => b[1].emails[0].received_at - a[1].emails[0].received_at)
    .map(([key, value], index) => buildAggregateNode(userId, key, value.emails, index));

  const threadNodes = [...threadGroups.entries()]
    .sort((a, b) => b[1][0].received_at - a[1][0].received_at)
    .slice(0, 100)
    .map(([key, group], index) => buildThreadNode(userId, key, group, index + serviceNodes.length));

  return [...serviceNodes, ...threadNodes];
}

function getFallbackEmailsForNode(userId: string, nodeId: string, emails: RawEmail[]) {
  const threadGroups = new Map<string, RawEmail[]>();
  const aggregateGroups = new Map<string, RawEmail[]>();

  for (const email of [...emails].sort((a, b) => b.received_at - a.received_at)) {
    const streamType = inferStreamType(email);
    const key = fallbackKey(email);
    const aggregateKey = `${serviceKey(email)}|${streamType}`;

    if (streamType === 'promotion' || streamType === 'social' || streamType === 'transactional') {
      const current = aggregateGroups.get(aggregateKey) ?? [];
      current.push(email);
      aggregateGroups.set(aggregateKey, current);
    } else {
      const current = threadGroups.get(key) ?? [];
      current.push(email);
      threadGroups.set(key, current);
    }
  }

  for (const [key, group] of threadGroups.entries()) {
    if (syntheticNodeId(userId, key) === nodeId) {
      return group.sort((a, b) => b.received_at - a.received_at);
    }
  }

  for (const [key, group] of aggregateGroups.entries()) {
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
