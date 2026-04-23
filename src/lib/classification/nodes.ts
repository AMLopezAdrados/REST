import Anthropic from '@anthropic-ai/sdk';
import crypto from 'node:crypto';
import type { RawEmail } from '@/types/email';
import type { NodeStatus, Sector, TopicNode } from '@/types/node';
import type { Classification } from '@/types/classification';
import { getClassification, getEmailsForUser, upsertNode, linkEmailToNode, clearNodesForUser } from '@/lib/storage/queries';
import { NODE_TITLE_SYSTEM, NODE_SUMMARY_SYSTEM } from './prompts';
import { categoryToSector } from '@/lib/spatial/sectors';
import { layoutNodes, nodeToLayoutInput } from '@/lib/spatial/layout';

const HAIKU_MODEL = 'claude-haiku-4-5';

let cachedClient: Anthropic | null = null;
function client(): Anthropic {
  if (!cachedClient) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
    cachedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return cachedClient;
}

function extractText(resp: Anthropic.Message): string {
  const block = resp.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') return '';
  return block.text.trim();
}

interface EmailGroup {
  key: string;
  emails: RawEmail[];
  classifications: Classification[];
}

function normalizeSubject(subject: string | null): string {
  if (!subject) return '';
  return subject
    .replace(/^(re|fwd|fw|aw|antw):\s*/gi, '')
    .replace(/^(re|fwd|fw|aw|antw):\s*/gi, '')
    .trim()
    .toLowerCase();
}

function groupEmails(emails: RawEmail[]): EmailGroup[] {
  const groups = new Map<string, EmailGroup>();

  for (const e of emails) {
    const cls = getClassification(e.id);
    if (!cls) continue;

    const threadKey = e.thread_id && e.thread_id.length > 0 ? `t:${e.thread_id}` : null;
    const fallbackKey = `s:${e.from_email.toLowerCase()}|${normalizeSubject(e.subject)}`;
    const key = threadKey ?? fallbackKey;

    const g = groups.get(key) ?? { key, emails: [], classifications: [] };
    g.emails.push(e);
    g.classifications.push(cls);
    groups.set(key, g);
  }

  return [...groups.values()];
}

function fallbackTitle(group: EmailGroup): string {
  const first = group.emails[0];
  const subj = (first.subject || '').replace(/^(re|fwd|fw|aw|antw):\s*/gi, '').trim();
  if (subj) return subj.slice(0, 60);
  return first.from_name || first.from_email;
}

function fallbackSummary(group: EmailGroup): string {
  const latest = group.emails[group.emails.length - 1];
  const body = (latest.body_plaintext || '').replace(/\s+/g, ' ').trim();
  return body.slice(0, 140);
}

async function summarizeGroup(group: EmailGroup): Promise<{ title: string; summary: string }> {
  const latest = [...group.emails].sort((a, b) => b.received_at - a.received_at).slice(0, 3);
  const context = latest
    .map(
      (e) =>
        `Van: ${e.from_name ?? ''} <${e.from_email}>
Datum: ${new Date(e.received_at).toISOString()}
Onderwerp: ${e.subject ?? ''}
Body: ${(e.body_plaintext || '').slice(0, 500)}`
    )
    .join('\n---\n');

  let title = fallbackTitle(group);
  let summary = fallbackSummary(group);

  try {
    const [titleResp, summaryResp] = await Promise.all([
      client().messages.create({
        model: HAIKU_MODEL,
        max_tokens: 30,
        system: NODE_TITLE_SYSTEM,
        messages: [{ role: 'user', content: context }],
      }),
      client().messages.create({
        model: HAIKU_MODEL,
        max_tokens: 120,
        system: NODE_SUMMARY_SYSTEM,
        messages: [{ role: 'user', content: context }],
      }),
    ]);

    const t = extractText(titleResp).replace(/^["'\s]+|["'\s]+$/g, '');
    if (t) title = t.split('\n')[0].slice(0, 80);

    const s = extractText(summaryResp).replace(/^["'\s]+|["'\s]+$/g, '');
    if (s) summary = s.slice(0, 240);
  } catch (err) {
    console.error('[nodes] summarize failed', err);
  }

  return { title, summary };
}

function deriveStatus(group: EmailGroup): { status: NodeStatus; urgency: number } {
  let hasAction = false;
  let hasDeadline = false;
  let hasQuestion = false;
  let anyReservation = false;
  let anyOrder = false;
  let anyMarketing = false;

  for (const c of group.classifications) {
    if (c.main_category === 'marketing') anyMarketing = true;
    if (c.main_category === 'reservation') anyReservation = true;
    if (c.main_category === 'order') anyOrder = true;
    const intent = c.intent_data;
    if (intent?.has_action) hasAction = true;
    if (intent?.has_deadline) hasDeadline = true;
    if (intent?.has_question) hasQuestion = true;
  }

  const latest = Math.max(...group.emails.map((e) => e.received_at));
  const daysSince = (Date.now() - latest) / (1000 * 60 * 60 * 24);

  let urgency = 0;
  if (hasDeadline) urgency += 0.5;
  if (hasAction) urgency += 0.3;
  if (hasQuestion) urgency += 0.2;
  urgency += Math.max(0, 1 - daysSince / 14) * 0.2;
  urgency = Math.min(1, urgency);

  let status: NodeStatus = 'ongoing';
  if (hasAction || hasDeadline || hasQuestion) status = 'action';
  else if (anyMarketing && !anyReservation && !anyOrder) status = 'archive';
  else if (anyReservation || anyOrder) status = 'ongoing';
  else if (daysSince > 30) status = 'saved';

  return { status, urgency };
}

function deterministicId(key: string, userId: string): string {
  return crypto.createHash('sha1').update(`${userId}|${key}`).digest('hex').slice(0, 24);
}

export async function generateNodesForUser(userId: string): Promise<{ created: number }> {
  console.log(`[nodes] generating nodes for ${userId}`);
  const emails = getEmailsForUser(userId, 2000);
  const groups = groupEmails(emails);
  console.log(`[nodes] ${emails.length} emails -> ${groups.length} groups`);

  clearNodesForUser(userId);

  const nodeDrafts: Array<{
    group: EmailGroup;
    node: TopicNode;
  }> = [];

  // Concurrency cap for summarization
  const CONCURRENCY = 4;
  let idx = 0;
  const results: Array<{ group: EmailGroup; title: string; summary: string }> = [];

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= groups.length) return;
      const g = groups[i];
      const { title, summary } = await summarizeGroup(g);
      results.push({ group: g, title, summary });
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, groups.length) }, () => worker()));

  for (const { group, title, summary } of results) {
    const { status, urgency } = deriveStatus(group);
    const topClass = group.classifications[0];
    const sector: Sector = categoryToSector(topClass.main_category, topClass.subcategory);
    const id = deterministicId(group.key, userId);
    const last = Math.max(...group.emails.map((e) => e.received_at));

    const node: TopicNode = {
      id,
      user_id: userId,
      title,
      summary,
      category: topClass.main_category,
      sector,
      position_x: 0,
      position_y: 0,
      urgency_score: urgency,
      status,
      email_count: group.emails.length,
      last_activity: last,
      created_at: Date.now(),
    };
    nodeDrafts.push({ group, node });
  }

  const positions = layoutNodes(nodeDrafts.map(({ node }) => nodeToLayoutInput(node)));
  const byId = new Map(positions.map((p) => [p.id, p]));

  for (const { group, node } of nodeDrafts) {
    const pos = byId.get(node.id);
    if (pos) {
      node.position_x = pos.x;
      node.position_y = pos.y;
    }
    upsertNode(node);
    for (const email of group.emails) {
      linkEmailToNode(node.id, email.id);
    }
  }

  console.log(`[nodes] created ${nodeDrafts.length} nodes`);
  return { created: nodeDrafts.length };
}
