import crypto from 'node:crypto';
import type Anthropic from '@anthropic-ai/sdk';
import type { RawEmail } from '@/types/email';
import type { NodeStatus, Sector, TopicNode } from '@/types/node';
import type { Classification, MainCategory } from '@/types/classification';
import { getClassification, getEmailsForUser, upsertNode, linkEmailToNode, clearNodesForUser } from '@/lib/storage/queries';
import { createMessage } from '@/lib/anthropic/client';
import { NODE_TITLE_SYSTEM, NODE_SUMMARY_SYSTEM } from './prompts';
import { categoryToSector } from '@/lib/spatial/sectors';
import { layoutNodes, nodeToLayoutInput } from '@/lib/spatial/layout';

const HAIKU_MODEL = 'claude-haiku-4-5';

function extractText(resp: Anthropic.Message): string {
  const block = resp.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') return '';
  return block.text.trim();
}

type GroupKind = 'conversation' | 'action' | 'brand' | 'sender' | 'promotions';

interface EmailGroup {
  key: string;
  kind: GroupKind;
  label: string;
  category: MainCategory;
  emails: RawEmail[];
  classifications: Classification[];
}

function senderDomain(email: RawEmail): string {
  const at = (email.from_email.split('@')[1] || email.from_email).toLowerCase();
  // Strip common bulk-mail subdomains so e.g. news.brand.com == mail.brand.com.
  return at.replace(/^(mail|email|e|news|newsletter|info|no-?reply|reply|notifications?)\./, '');
}

function brandLabel(email: RawEmail): string {
  const name = (email.from_name || '').trim();
  if (name) {
    const cleaned = name.split(/[<|·–-]/)[0].trim();
    if (cleaned) return cleaned.slice(0, 40);
  }
  const d = senderDomain(email);
  const parts = d.split('.');
  const core = parts.length >= 2 ? parts[parts.length - 2] : d;
  return core.charAt(0).toUpperCase() + core.slice(1);
}

function isActionable(cls: Classification): boolean {
  const i = cls.intent_data;
  return !!(i && (i.has_action || i.has_deadline || i.has_question));
}

// Aggressive ("maximale rust") bundling: collapse the inbox into a handful of
// meaningful topics. Promotions become a single pile; orders/admin/travel are
// bundled per brand; only real conversations and action items stay as their own
// topics; stray work/personal mail is bundled per sender.
function groupEmails(emails: RawEmail[]): EmailGroup[] {
  // Pre-count thread sizes so we can tell a real conversation from a one-off.
  const threadCount = new Map<string, number>();
  for (const e of emails) {
    if (e.thread_id) threadCount.set(e.thread_id, (threadCount.get(e.thread_id) ?? 0) + 1);
  }

  const groups = new Map<string, EmailGroup>();
  for (const e of emails) {
    const cls = getClassification(e.id);
    if (!cls) continue;
    const cat = cls.main_category;
    const domain = senderDomain(e);

    let key: string;
    let kind: GroupKind;
    let label: string;

    if (cat === 'marketing') {
      key = 'promotions';
      kind = 'promotions';
      label = 'Promoties';
    } else if (isActionable(cls)) {
      key = `act:${e.thread_id || e.id}`;
      kind = 'action';
      label = brandLabel(e);
    } else if (cat === 'order' || cat === 'reservation' || cat === 'admin') {
      key = `brand:${cat}:${domain}`;
      kind = 'brand';
      label = brandLabel(e);
    } else if (e.thread_id && (threadCount.get(e.thread_id) ?? 0) > 1) {
      key = `thr:${e.thread_id}`;
      kind = 'conversation';
      label = brandLabel(e);
    } else {
      key = `snd:${cat}:${domain}`;
      kind = 'sender';
      label = brandLabel(e);
    }

    const g = groups.get(key) ?? { key, kind, label, category: cat, emails: [], classifications: [] };
    g.emails.push(e);
    g.classifications.push(cls);
    groups.set(key, g);
  }

  return [...groups.values()];
}

const CATEGORY_NOUN: Partial<Record<MainCategory, [string, string]>> = {
  order: ['bestelling', 'bestellingen'],
  reservation: ['reservering', 'reserveringen'],
  admin: ['administratief bericht', 'administratieve berichten'],
};

// Deterministic title/summary for bundles — no LLM call needed (faster, cheaper,
// avoids rate limits). Returns null for kinds that should be summarized by the LLM.
function bundleTitleSummary(g: EmailGroup): { title: string; summary: string } | null {
  const n = g.emails.length;
  if (g.kind === 'promotions') {
    return { title: 'Promoties', summary: `${n} nieuwsbrieven en aanbiedingen — opzij gezet` };
  }
  if (g.kind === 'brand') {
    const noun = CATEGORY_NOUN[g.category];
    const word = noun ? (n === 1 ? noun[0] : noun[1]) : n === 1 ? 'bericht' : 'berichten';
    return { title: g.label, summary: `${n} ${word}` };
  }
  if (g.kind === 'sender') {
    return { title: g.label, summary: `${n} bericht${n === 1 ? '' : 'en'}` };
  }
  return null; // conversation / action → use the LLM summarizer
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
      createMessage({
        model: HAIKU_MODEL,
        max_tokens: 30,
        system: NODE_TITLE_SYSTEM,
        messages: [{ role: 'user', content: context }],
      }),
      createMessage({
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
  // The promotions pile is always tucked away and never urgent.
  if (group.kind === 'promotions') return { status: 'archive', urgency: 0 };

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
      const deterministic = bundleTitleSummary(g);
      if (deterministic) {
        results.push({ group: g, ...deterministic });
      } else {
        const { title, summary } = await summarizeGroup(g);
        results.push({ group: g, title, summary });
      }
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
