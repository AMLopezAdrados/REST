import Anthropic from '@anthropic-ai/sdk';
import crypto from 'node:crypto';
import type { RawEmail } from '@/types/email';
import type { NodeStatus, Sector, TopicNode } from '@/types/node';
import { ZOOM_LEVELS } from '@/types/node';
import { upsertNode } from '@/lib/storage/queries';
import { SECTORS } from '@/lib/spatial/sectors';

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

const DOMAIN_SUMMARY_SYSTEM =
  'Geef een beknopte samenvatting (max 15 woorden, NL) van onderstaande groep gerelateerde email-clusters. Noem de hoofdthema\'s, geen details. Antwoord in één zin zonder leestekens aan het eind.';

// ---------- helpers ----------

function rollupUrgency(children: { urgency_score: number }[]): number {
  if (children.length === 0) return 0;
  return Math.max(...children.map((c) => c.urgency_score));
}

function rollupStatus(children: { status: NodeStatus }[]): NodeStatus {
  if (children.some((c) => c.status === 'action')) return 'action';
  if (children.some((c) => c.status === 'ongoing')) return 'ongoing';
  if (children.some((c) => c.status === 'saved')) return 'saved';
  return 'archive';
}

function rollupEmailCount(children: { email_count: number }[]): number {
  return children.reduce((sum, c) => sum + c.email_count, 0);
}

function rollupLastActivity(children: { last_activity: number }[]): number {
  if (children.length === 0) return Date.now();
  return Math.max(...children.map((c) => c.last_activity));
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

function heuristicRollupSummary(children: { title: string }[]): string {
  const titles = children.slice(0, 3).map((c) => c.title);
  const rest = children.length > 3 ? ` +${children.length - 3} meer` : '';
  return truncate(titles.join(' · ') + rest, 140);
}

function extractDomain(email: string): string {
  const at = email.indexOf('@');
  if (at === -1) return email.toLowerCase();
  return email.slice(at + 1).toLowerCase();
}

function deterministicId(prefix: string, key: string, userId: string): string {
  const hash = crypto.createHash('sha1').update(`${userId}|${prefix}|${key}`).digest('hex').slice(0, 20);
  return `${prefix}_${hash}`;
}

// ---------- cluster key selection per sector ----------

function clusterKeyForConversation(sector: Sector, emails: RawEmail[], category: string | null): string {
  const firstFrom = emails[0]?.from_email ?? '';
  const domain = extractDomain(firstFrom);

  switch (sector) {
    case 'Work':
      // Group by sender domain (Clients/Colleagues/Recruiters naturally separate)
      return domain || 'work';
    case 'Orders':
      // Group by retailer domain
      return domain || 'orders';
    case 'Travel':
      return domain || 'travel';
    case 'Admin':
      return domain || 'admin';
    case 'Personal':
      return domain || 'personal';
    case 'Other':
    default:
      return category || 'other';
  }
}

function clusterLabel(sector: Sector, key: string): string {
  if (key === sector.toLowerCase() || !key.includes('.')) {
    return `${sector} — ${key}`;
  }
  // Domain-style key: humanize "client.com" -> "Client.com"
  const base = key.split('.')[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

// ---------- spatial layout for sub-levels ----------

const CHILD_RADIUS = 420;

function radialLayout(count: number, startAngle = 0): { x: number; y: number }[] {
  if (count === 0) return [];
  if (count === 1) return [{ x: 0, y: -CHILD_RADIUS }];
  return Array.from({ length: count }, (_, i) => {
    const angle = startAngle + (i / count) * Math.PI * 2;
    return {
      x: Math.cos(angle) * CHILD_RADIUS,
      y: Math.sin(angle) * CHILD_RADIUS,
    };
  });
}

// ---------- main builder ----------

export interface BuildResult {
  topics: number;
  clusters: number;
  domains: number;
}

/**
 * Build TOPIC/CLUSTER/DOMAIN/UNIVERSE layers above the conversation-level nodes.
 * Mutates the conversation nodes' parent_id via upsertNode.
 */
export async function buildHierarchyAbove(
  userId: string,
  conversations: TopicNode[],
  conversationEmails: RawEmail[][],
): Promise<BuildResult> {
  if (conversations.length === 0) {
    // Still create empty universe for consistency
    upsertNode(universeNodeFor(userId, [], []));
    return { topics: 0, clusters: 0, domains: 0 };
  }

  // Pair each conversation with its emails by index (same order as built in nodes.ts)
  const convoByIndex = conversations.map((node, i) => ({
    node,
    emails: conversationEmails[i] ?? [],
  }));

  // ============= LEVEL 2: CLUSTER =============
  // Group conversations by (sector, clusterKey)
  const clusterMap = new Map<
    string, // "${sector}::${key}"
    { sector: Sector; key: string; convos: { node: TopicNode; emails: RawEmail[] }[] }
  >();

  for (const { node, emails } of convoByIndex) {
    const key = clusterKeyForConversation(node.sector, emails, node.category);
    const mapKey = `${node.sector}::${key}`;
    const bucket = clusterMap.get(mapKey) ?? { sector: node.sector, key, convos: [] };
    bucket.convos.push({ node, emails });
    clusterMap.set(mapKey, bucket);
  }

  const clusterNodes: TopicNode[] = [];
  // We'll collect per-cluster {cluster, convosWithAssignedParent}
  const clusterBuckets: Array<{
    cluster: TopicNode;
    convos: { node: TopicNode; emails: RawEmail[] }[];
  }> = [];

  for (const [mapKey, bucket] of clusterMap.entries()) {
    const clusterId = deterministicId('cluster', mapKey, userId);
    const children = bucket.convos.map((c) => c.node);

    const cluster: TopicNode = {
      id: clusterId,
      user_id: userId,
      title: clusterLabel(bucket.sector, bucket.key),
      summary: heuristicRollupSummary(children),
      category: bucket.sector.toLowerCase(),
      sector: bucket.sector,
      position_x: 0,
      position_y: 0,
      urgency_score: rollupUrgency(children),
      status: rollupStatus(children),
      email_count: rollupEmailCount(children),
      last_activity: rollupLastActivity(children),
      created_at: Date.now(),
      depth: ZOOM_LEVELS.CLUSTER,
      parent_id: null, // filled by Domain pass
      aggregate_summary: heuristicRollupSummary(children),
      child_count: children.length, // will be adjusted after TOPIC pass
    };

    clusterNodes.push(cluster);
    clusterBuckets.push({ cluster, convos: bucket.convos });
  }

  // ============= LEVEL 3: TOPIC (optional per cluster) =============
  // Within each cluster, group convos by from_email. If 2+ share sender → TOPIC.
  const topicNodes: TopicNode[] = [];

  for (const bucket of clusterBuckets) {
    const bySender = new Map<string, { node: TopicNode; emails: RawEmail[] }[]>();
    for (const c of bucket.convos) {
      const sender = (c.emails[0]?.from_email || 'unknown').toLowerCase();
      const arr = bySender.get(sender) ?? [];
      arr.push(c);
      bySender.set(sender, arr);
    }

    let topicCount = 0;
    let directConvoCount = 0;

    for (const [sender, group] of bySender.entries()) {
      if (group.length < 2) {
        // Skip TOPIC layer: convo attaches directly to cluster
        for (const c of group) {
          c.node.parent_id = bucket.cluster.id;
          c.node.depth = ZOOM_LEVELS.CONVERSATION;
          upsertNode(c.node);
          directConvoCount++;
        }
      } else {
        // Create TOPIC node
        const topicId = deterministicId('topic', `${bucket.cluster.id}:${sender}`, userId);
        const firstName = group[0].emails[0]?.from_name || sender.split('@')[0];
        const children = group.map((g) => g.node);

        const topic: TopicNode = {
          id: topicId,
          user_id: userId,
          title: firstName,
          summary: heuristicRollupSummary(children),
          category: bucket.cluster.category,
          sector: bucket.cluster.sector,
          position_x: 0,
          position_y: 0,
          urgency_score: rollupUrgency(children),
          status: rollupStatus(children),
          email_count: rollupEmailCount(children),
          last_activity: rollupLastActivity(children),
          created_at: Date.now(),
          depth: ZOOM_LEVELS.TOPIC,
          parent_id: bucket.cluster.id,
          aggregate_summary: heuristicRollupSummary(children),
          child_count: children.length,
        };

        // Link convos under topic
        for (const c of group) {
          c.node.parent_id = topic.id;
          c.node.depth = ZOOM_LEVELS.CONVERSATION;
          upsertNode(c.node);
        }

        topicNodes.push(topic);
        topicCount++;
      }
    }

    // Adjust cluster.child_count (topics + direct convos)
    bucket.cluster.child_count = topicCount + directConvoCount;
  }

  // ============= LEVEL 1: DOMAIN =============
  const domainMap = new Map<Sector, TopicNode[]>();
  for (const cluster of clusterNodes) {
    const list = domainMap.get(cluster.sector) ?? [];
    list.push(cluster);
    domainMap.set(cluster.sector, list);
  }

  const domainNodes: TopicNode[] = [];

  // Build each domain with Haiku summary (concurrency cap)
  const domainEntries = Array.from(domainMap.entries());
  const DOMAIN_CONCURRENCY = 3;
  let di = 0;

  async function domainWorker() {
    while (true) {
      const i = di++;
      if (i >= domainEntries.length) return;
      const [sector, clusters] = domainEntries[i];
      const domainId = deterministicId('domain', sector, userId);

      let aggregateSummary = heuristicRollupSummary(clusters);
      try {
        const context = clusters
          .map((c) => `- ${c.title}: ${c.summary ?? ''}`)
          .slice(0, 8)
          .join('\n');
        const resp = await client().messages.create({
          model: HAIKU_MODEL,
          max_tokens: 60,
          system: DOMAIN_SUMMARY_SYSTEM,
          messages: [{ role: 'user', content: context }],
        });
        const t = extractText(resp).replace(/^["'\s]+|["'\s]+$/g, '');
        if (t) aggregateSummary = truncate(t, 140);
      } catch (err) {
        console.error(`[hierarchy] domain summary failed for ${sector}`, err);
      }

      const domain: TopicNode = {
        id: domainId,
        user_id: userId,
        title: sector,
        summary: aggregateSummary,
        category: sector.toLowerCase(),
        sector,
        position_x: 0,
        position_y: 0,
        urgency_score: rollupUrgency(clusters),
        status: rollupStatus(clusters),
        email_count: rollupEmailCount(clusters),
        last_activity: rollupLastActivity(clusters),
        created_at: Date.now(),
        depth: ZOOM_LEVELS.DOMAIN,
        parent_id: `universe_${userId}`,
        aggregate_summary: aggregateSummary,
        child_count: clusters.length,
      };

      // Link clusters to this domain
      for (const cluster of clusters) {
        cluster.parent_id = domain.id;
      }

      domainNodes.push(domain);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(DOMAIN_CONCURRENCY, domainEntries.length) }, () => domainWorker()),
  );

  // ============= LAYOUT + PERSIST =============
  // Layout domains around universe: existing sector angles aren't used at this depth;
  // just place each domain at a fixed angle based on its sector index.
  const orderedSectors = SECTORS.filter((s) => domainNodes.some((d) => d.sector === s));
  const domainPositions = radialLayout(orderedSectors.length, -Math.PI / 2);
  orderedSectors.forEach((sector, i) => {
    const d = domainNodes.find((dn) => dn.sector === sector);
    if (!d) return;
    d.position_x = domainPositions[i].x;
    d.position_y = domainPositions[i].y;
    upsertNode(d);
  });

  // Layout clusters around each domain
  for (const domain of domainNodes) {
    const siblings = clusterNodes.filter((c) => c.parent_id === domain.id);
    const positions = radialLayout(siblings.length, -Math.PI / 2);
    siblings.forEach((c, i) => {
      c.position_x = positions[i].x;
      c.position_y = positions[i].y;
      upsertNode(c);
    });
  }

  // Layout topics + direct convos around each cluster
  for (const cluster of clusterNodes) {
    const topicsUnder = topicNodes.filter((t) => t.parent_id === cluster.id);
    const directConvos = conversations.filter((c) => c.parent_id === cluster.id);
    const total = topicsUnder.length + directConvos.length;
    const positions = radialLayout(total, -Math.PI / 2);
    let pi = 0;
    for (const t of topicsUnder) {
      t.position_x = positions[pi].x;
      t.position_y = positions[pi].y;
      pi++;
      upsertNode(t);
    }
    for (const c of directConvos) {
      c.position_x = positions[pi].x;
      c.position_y = positions[pi].y;
      pi++;
      upsertNode(c);
    }
  }

  // Layout convos under topics
  for (const topic of topicNodes) {
    const childConvos = conversations.filter((c) => c.parent_id === topic.id);
    const positions = radialLayout(childConvos.length, -Math.PI / 2);
    childConvos.forEach((c, i) => {
      c.position_x = positions[i].x;
      c.position_y = positions[i].y;
      upsertNode(c);
    });
  }

  // ============= LEVEL 0: UNIVERSE =============
  const universe = universeNodeFor(userId, domainNodes, conversations);
  upsertNode(universe);

  return {
    topics: topicNodes.length,
    clusters: clusterNodes.length,
    domains: domainNodes.length,
  };
}

function universeNodeFor(userId: string, domains: TopicNode[], allConvos: TopicNode[]): TopicNode {
  return {
    id: `universe_${userId}`,
    user_id: userId,
    title: 'REST',
    summary: 'Your Universe',
    category: null,
    sector: 'Other',
    position_x: 0,
    position_y: 0,
    urgency_score: rollupUrgency(domains),
    status: rollupStatus(domains),
    email_count: rollupEmailCount(allConvos),
    last_activity: rollupLastActivity(domains.length > 0 ? domains : allConvos),
    created_at: Date.now(),
    depth: ZOOM_LEVELS.UNIVERSE,
    parent_id: null,
    aggregate_summary: heuristicRollupSummary(domains),
    child_count: domains.length,
  };
}
