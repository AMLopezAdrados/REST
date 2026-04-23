import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { RawEmail, NormalizedEmail } from '@/types/email';
import type { Classification } from '@/types/classification';
import type { TopicNode } from '@/types/node';
import type { ContextEntity } from '@/types/context';

// ---------- encryption for refresh tokens ----------

function getKey(): Buffer {
  const raw = process.env.DB_ENCRYPTION_KEY;
  if (!raw) throw new Error('DB_ENCRYPTION_KEY not set');
  return crypto.createHash('sha256').update(raw).digest();
}

export function encrypt(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

// ---------- JSON store ----------

interface UserRow {
  id: string;
  email: string;
  refresh_token: string; // encrypted
  access_token: string | null;
  token_expiry: number | null;
  created_at: number;
  last_sync: number | null;
}

interface SyncProgressRow {
  user_id: string;
  status: 'idle' | 'fetching' | 'classifying' | 'done' | 'error';
  total: number;
  processed: number;
  classified: number;
  started_at: number | null;
  updated_at: number | null;
}

interface NodeEmailEdge {
  node_id: string;
  email_id: string;
}

interface Store {
  users: UserRow[];
  raw_emails: RawEmail[];
  classifications: Classification[];
  nodes: TopicNode[];
  node_emails: NodeEmailEdge[];
  context_entities: ContextEntity[];
  sync_progress: SyncProgressRow[];
}

const EMPTY_STORE: Store = {
  users: [],
  raw_emails: [],
  classifications: [],
  nodes: [],
  node_emails: [],
  context_entities: [],
  sync_progress: [],
};

function getStorePath(): string {
  const configured = process.env.REST_STORE_PATH;
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
  }
  return path.join(process.cwd(), '.data', 'rest-store.json');
}

let cached: Store | null = null;

function loadStore(): Store {
  if (cached) return cached;
  const p = getStorePath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (!fs.existsSync(p)) {
    cached = structuredClone(EMPTY_STORE);
    persist();
    return cached;
  }

  try {
    const raw = fs.readFileSync(p, 'utf-8');
    const parsed = raw.trim() ? (JSON.parse(raw) as Partial<Store>) : {};
    cached = {
      users: parsed.users ?? [],
      raw_emails: parsed.raw_emails ?? [],
      classifications: parsed.classifications ?? [],
      nodes: parsed.nodes ?? [],
      node_emails: parsed.node_emails ?? [],
      context_entities: parsed.context_entities ?? [],
      sync_progress: parsed.sync_progress ?? [],
    };
  } catch (err) {
    console.error('[storage] failed to parse store, starting empty', err);
    cached = structuredClone(EMPTY_STORE);
  }
  return cached;
}

function persist() {
  if (!cached) return;
  const p = getStorePath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cached, null, 2), 'utf-8');
  fs.renameSync(tmp, p);
}

// ---------- users ----------

export function upsertUser(params: {
  id?: string;
  email: string;
  refreshToken: string;
  accessToken?: string | null;
  tokenExpiry?: number | null;
}): string {
  const store = loadStore();
  const encryptedRefresh = encrypt(params.refreshToken);
  const existing = store.users.find((u) => u.email === params.email);

  if (existing) {
    existing.refresh_token = encryptedRefresh;
    existing.access_token = params.accessToken ?? null;
    existing.token_expiry = params.tokenExpiry ?? null;
    persist();
    return existing.id;
  }

  const id = params.id ?? crypto.randomUUID();
  store.users.push({
    id,
    email: params.email,
    refresh_token: encryptedRefresh,
    access_token: params.accessToken ?? null,
    token_expiry: params.tokenExpiry ?? null,
    created_at: Date.now(),
    last_sync: null,
  });
  persist();
  return id;
}

export function getUserByEmail(email: string) {
  const store = loadStore();
  const row = store.users.find((u) => u.email === email);
  if (!row) return null;
  return { ...row, refresh_token: decrypt(row.refresh_token) };
}

export function getUserById(id: string) {
  const store = loadStore();
  const row = store.users.find((u) => u.id === id);
  if (!row) return null;
  return { ...row, refresh_token: decrypt(row.refresh_token) };
}

export function updateUserTokens(userId: string, accessToken: string, expiry: number) {
  const store = loadStore();
  const user = store.users.find((u) => u.id === userId);
  if (!user) return;
  user.access_token = accessToken;
  user.token_expiry = expiry;
  persist();
}

export function updateLastSync(userId: string) {
  const store = loadStore();
  const user = store.users.find((u) => u.id === userId);
  if (!user) return;
  user.last_sync = Date.now();
  persist();
}

// ---------- raw emails ----------

export function insertEmail(userId: string, email: NormalizedEmail): string {
  const store = loadStore();
  const existing = store.raw_emails.find((e) => e.user_id === userId && e.gmail_id === email.gmail_id);
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  store.raw_emails.push({
    id,
    user_id: userId,
    gmail_id: email.gmail_id,
    thread_id: email.thread_id,
    received_at: email.received_at,
    from_email: email.from_email,
    from_name: email.from_name,
    to_emails: JSON.stringify(email.to_emails),
    subject: email.subject,
    body_plaintext: email.body_plaintext,
    body_html: email.body_html,
    labels: JSON.stringify(email.labels),
    consumption_state: 'unseen',
    consumed_at: null,
    consumed_via: null,
  });
  persist();
  return id;
}

export function getEmailsForUser(userId: string, limit = 500): RawEmail[] {
  const store = loadStore();
  return store.raw_emails
    .filter((e) => e.user_id === userId)
    .sort((a, b) => b.received_at - a.received_at)
    .slice(0, limit);
}

export function getEmailById(id: string): RawEmail | null {
  const store = loadStore();
  return store.raw_emails.find((e) => e.id === id) ?? null;
}

export function getEmailsByThread(userId: string, threadId: string): RawEmail[] {
  const store = loadStore();
  return store.raw_emails
    .filter((e) => e.user_id === userId && e.thread_id === threadId)
    .sort((a, b) => a.received_at - b.received_at);
}

export function setConsumptionState(emailId: string, state: 'unseen' | 'implicit' | 'confirmed', via?: string) {
  const store = loadStore();
  const row = store.raw_emails.find((e) => e.id === emailId);
  if (!row) return;
  row.consumption_state = state;
  row.consumed_at = state === 'unseen' ? null : Date.now();
  row.consumed_via = via ?? null;
  persist();
}

// ---------- classifications ----------

export function upsertClassification(c: Classification) {
  const store = loadStore();
  const idx = store.classifications.findIndex((x) => x.email_id === c.email_id);
  const value: Classification = {
    email_id: c.email_id,
    main_category: c.main_category,
    subcategory: c.subcategory,
    extracted_data: c.extracted_data ?? null,
    intent_data: c.intent_data ?? null,
    confidence: c.confidence,
    classified_at: c.classified_at,
    classifier_version: c.classifier_version,
    user_corrected: !!c.user_corrected,
  };
  if (idx >= 0) {
    store.classifications[idx] = value;
  } else {
    store.classifications.push(value);
  }
  persist();
}

export function getClassification(emailId: string): Classification | null {
  const store = loadStore();
  return store.classifications.find((c) => c.email_id === emailId) ?? null;
}

export function getUnclassifiedEmails(userId: string, limit = 1000): RawEmail[] {
  const store = loadStore();
  const classified = new Set(store.classifications.map((c) => c.email_id));
  return store.raw_emails
    .filter((e) => e.user_id === userId && !classified.has(e.id))
    .sort((a, b) => b.received_at - a.received_at)
    .slice(0, limit);
}

// ---------- nodes ----------

export function upsertNode(n: Omit<TopicNode, 'created_at'> & { created_at?: number }): string {
  const store = loadStore();
  const idx = store.nodes.findIndex((x) => x.id === n.id);
  if (idx >= 0) {
    const existing = store.nodes[idx];
    store.nodes[idx] = {
      ...existing,
      title: n.title,
      summary: n.summary,
      category: n.category,
      sector: n.sector,
      position_x: n.position_x,
      position_y: n.position_y,
      urgency_score: n.urgency_score,
      status: n.status,
      email_count: n.email_count,
      last_activity: n.last_activity,
    };
  } else {
    store.nodes.push({
      id: n.id,
      user_id: n.user_id,
      title: n.title,
      summary: n.summary,
      category: n.category,
      sector: n.sector,
      position_x: n.position_x,
      position_y: n.position_y,
      urgency_score: n.urgency_score,
      status: n.status,
      email_count: n.email_count,
      last_activity: n.last_activity,
      created_at: n.created_at ?? Date.now(),
    });
  }
  persist();
  return n.id;
}

export function getNodesForUser(userId: string): TopicNode[] {
  const store = loadStore();
  return store.nodes
    .filter((n) => n.user_id === userId)
    .sort((a, b) => b.urgency_score - a.urgency_score);
}

export function getNodeById(id: string): TopicNode | null {
  const store = loadStore();
  return store.nodes.find((n) => n.id === id) ?? null;
}

export function linkEmailToNode(nodeId: string, emailId: string) {
  const store = loadStore();
  const exists = store.node_emails.some((e) => e.node_id === nodeId && e.email_id === emailId);
  if (exists) return;
  store.node_emails.push({ node_id: nodeId, email_id: emailId });
  persist();
}

export function getEmailsForNode(nodeId: string): RawEmail[] {
  const store = loadStore();
  const emailIds = new Set(
    store.node_emails.filter((e) => e.node_id === nodeId).map((e) => e.email_id)
  );
  return store.raw_emails
    .filter((e) => emailIds.has(e.id))
    .sort((a, b) => b.received_at - a.received_at);
}

export function getNodeForEmail(emailId: string): TopicNode | null {
  const store = loadStore();
  const edge = store.node_emails.find((e) => e.email_id === emailId);
  if (!edge) return null;
  return store.nodes.find((n) => n.id === edge.node_id) ?? null;
}

export function clearNodesForUser(userId: string) {
  const store = loadStore();
  const nodeIds = new Set(store.nodes.filter((n) => n.user_id === userId).map((n) => n.id));
  store.node_emails = store.node_emails.filter((e) => !nodeIds.has(e.node_id));
  store.nodes = store.nodes.filter((n) => n.user_id !== userId);
  persist();
}

// ---------- context entities ----------

export function insertContextEntity(
  userId: string,
  entity: Omit<ContextEntity, 'id' | 'user_id' | 'created_at'>
): string {
  const store = loadStore();
  const id = crypto.randomUUID();
  store.context_entities.push({
    id,
    user_id: userId,
    entity_type: entity.entity_type,
    data: entity.data,
    confidence: entity.confidence,
    user_confirmed: !!entity.user_confirmed,
    created_at: Date.now(),
  });
  persist();
  return id;
}

export function getContextEntities(userId: string): ContextEntity[] {
  const store = loadStore();
  return store.context_entities.filter((c) => c.user_id === userId);
}

export function confirmContextEntity(id: string) {
  const store = loadStore();
  const row = store.context_entities.find((c) => c.id === id);
  if (!row) return;
  row.user_confirmed = true;
  persist();
}

// ---------- sync progress ----------

export function setSyncProgress(
  userId: string,
  progress: {
    status: 'idle' | 'fetching' | 'classifying' | 'done' | 'error';
    total?: number;
    processed?: number;
    classified?: number;
  }
) {
  const store = loadStore();
  const now = Date.now();
  const existing = store.sync_progress.find((s) => s.user_id === userId);
  if (existing) {
    existing.status = progress.status;
    if (progress.total !== undefined) existing.total = progress.total;
    if (progress.processed !== undefined) existing.processed = progress.processed;
    if (progress.classified !== undefined) existing.classified = progress.classified;
    existing.updated_at = now;
  } else {
    store.sync_progress.push({
      user_id: userId,
      status: progress.status,
      total: progress.total ?? 0,
      processed: progress.processed ?? 0,
      classified: progress.classified ?? 0,
      started_at: now,
      updated_at: now,
    });
  }
  persist();
}

export function getSyncProgress(userId: string) {
  const store = loadStore();
  return store.sync_progress.find((s) => s.user_id === userId) ?? null;
}
