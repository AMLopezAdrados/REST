import { getStore, saveStore } from './db';
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

// ---------- users ----------

export function upsertUser(params: {
  id?: string;
  email: string;
  refreshToken: string;
  accessToken?: string | null;
  tokenExpiry?: number | null;
}): string {
  const store = getStore();
  const encryptedRefresh = encrypt(params.refreshToken);
  const existing = store.users.find((u) => u.email === params.email);

  if (existing) {
    existing.refresh_token = encryptedRefresh;
    existing.access_token = params.accessToken ?? null;
    existing.token_expiry = params.tokenExpiry ?? null;
    saveStore();
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
  saveStore();
  return id;
}

export function getUserByEmail(email: string) {
  const row = getStore().users.find((u) => u.email === email);
  if (!row) return null;
  return { ...row, refresh_token: decrypt(row.refresh_token) };
}

export function getUserById(id: string) {
  const row = getStore().users.find((u) => u.id === id);
  if (!row) return null;
  return { ...row, refresh_token: decrypt(row.refresh_token) };
}

export function updateUserTokens(userId: string, accessToken: string, expiry: number) {
  const user = getStore().users.find((u) => u.id === userId);
  if (user) {
    user.access_token = accessToken;
    user.token_expiry = expiry;
    saveStore();
  }
}

export function updateLastSync(userId: string) {
  const user = getStore().users.find((u) => u.id === userId);
  if (user) {
    user.last_sync = Date.now();
    saveStore();
  }
}

// ---------- raw emails ----------

export function insertEmail(userId: string, email: NormalizedEmail): string {
  const store = getStore();
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
  saveStore();
  return id;
}

export function getEmailsForUser(userId: string, limit = 500): RawEmail[] {
  return getStore()
    .raw_emails.filter((e) => e.user_id === userId)
    .sort((a, b) => b.received_at - a.received_at)
    .slice(0, limit) as RawEmail[];
}

export function getEmailById(id: string): RawEmail | null {
  return (getStore().raw_emails.find((e) => e.id === id) as RawEmail) ?? null;
}

export function getEmailsByThread(userId: string, threadId: string): RawEmail[] {
  return getStore()
    .raw_emails.filter((e) => e.user_id === userId && e.thread_id === threadId)
    .sort((a, b) => a.received_at - b.received_at) as RawEmail[];
}

export function setConsumptionState(
  emailId: string,
  state: 'unseen' | 'implicit' | 'confirmed',
  via?: string
) {
  const email = getStore().raw_emails.find((e) => e.id === emailId);
  if (email) {
    email.consumption_state = state;
    email.consumed_at = state === 'unseen' ? null : Date.now();
    email.consumed_via = via ?? null;
    saveStore();
  }
}

// ---------- classifications ----------

export function upsertClassification(c: Classification) {
  const store = getStore();
  const row = {
    email_id: c.email_id,
    main_category: c.main_category,
    subcategory: c.subcategory,
    extracted_data: c.extracted_data ? JSON.stringify(c.extracted_data) : null,
    intent_data: c.intent_data ? JSON.stringify(c.intent_data) : null,
    confidence: c.confidence,
    classified_at: c.classified_at,
    classifier_version: c.classifier_version,
    user_corrected: c.user_corrected ? 1 : 0,
  };
  const existing = store.classifications.find((x) => x.email_id === c.email_id);
  if (existing) {
    Object.assign(existing, row);
  } else {
    store.classifications.push(row);
  }
  saveStore();
}

export function getClassification(emailId: string): Classification | null {
  const row = getStore().classifications.find((c) => c.email_id === emailId);
  if (!row) return null;
  return {
    ...row,
    extracted_data: row.extracted_data ? JSON.parse(row.extracted_data) : null,
    intent_data: row.intent_data ? JSON.parse(row.intent_data) : null,
    user_corrected: !!row.user_corrected,
  } as Classification;
}

export function getUnclassifiedEmails(userId: string, limit = 1000): RawEmail[] {
  const store = getStore();
  const classified = new Set(store.classifications.map((c) => c.email_id));
  return store.raw_emails
    .filter((e) => e.user_id === userId && !classified.has(e.id))
    .sort((a, b) => b.received_at - a.received_at)
    .slice(0, limit) as RawEmail[];
}

// ---------- nodes ----------

export function upsertNode(n: Omit<TopicNode, 'created_at'> & { created_at?: number }): string {
  const store = getStore();
  const existing = store.nodes.find((x) => x.id === n.id);
  if (existing) {
    existing.title = n.title;
    existing.summary = n.summary;
    existing.category = n.category;
    existing.sector = n.sector;
    existing.position_x = n.position_x;
    existing.position_y = n.position_y;
    existing.urgency_score = n.urgency_score;
    existing.status = n.status;
    existing.email_count = n.email_count;
    existing.last_activity = n.last_activity;
    saveStore();
    return n.id;
  }
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
  saveStore();
  return n.id;
}

export function getNodesForUser(userId: string): TopicNode[] {
  return getStore()
    .nodes.filter((n) => n.user_id === userId)
    .sort((a, b) => b.urgency_score - a.urgency_score) as TopicNode[];
}

export function getNodeById(id: string): TopicNode | null {
  return (getStore().nodes.find((n) => n.id === id) as TopicNode) ?? null;
}

export function linkEmailToNode(nodeId: string, emailId: string) {
  const store = getStore();
  const exists = store.node_emails.some((ne) => ne.node_id === nodeId && ne.email_id === emailId);
  if (!exists) {
    store.node_emails.push({ node_id: nodeId, email_id: emailId });
    saveStore();
  }
}

export function getEmailsForNode(nodeId: string): RawEmail[] {
  const store = getStore();
  const emailIds = new Set(
    store.node_emails.filter((ne) => ne.node_id === nodeId).map((ne) => ne.email_id)
  );
  return store.raw_emails
    .filter((e) => emailIds.has(e.id))
    .sort((a, b) => b.received_at - a.received_at) as RawEmail[];
}

export function getNodeForEmail(emailId: string): TopicNode | null {
  const store = getStore();
  const link = store.node_emails.find((ne) => ne.email_id === emailId);
  if (!link) return null;
  return (store.nodes.find((n) => n.id === link.node_id) as TopicNode) ?? null;
}

export function clearNodesForUser(userId: string) {
  const store = getStore();
  const nodeIds = new Set(store.nodes.filter((n) => n.user_id === userId).map((n) => n.id));
  store.node_emails = store.node_emails.filter((ne) => !nodeIds.has(ne.node_id));
  store.nodes = store.nodes.filter((n) => n.user_id !== userId);
  saveStore();
}

// ---------- context entities ----------

export function insertContextEntity(
  userId: string,
  entity: Omit<ContextEntity, 'id' | 'user_id' | 'created_at'>
): string {
  const store = getStore();
  const id = crypto.randomUUID();
  store.context_entities.push({
    id,
    user_id: userId,
    entity_type: entity.entity_type,
    data: JSON.stringify(entity.data),
    confidence: entity.confidence,
    user_confirmed: entity.user_confirmed ? 1 : 0,
    created_at: Date.now(),
  });
  saveStore();
  return id;
}

export function getContextEntities(userId: string): ContextEntity[] {
  return getStore()
    .context_entities.filter((e) => e.user_id === userId)
    .map((r) => ({
      ...r,
      data: JSON.parse(r.data),
      user_confirmed: !!r.user_confirmed,
    })) as ContextEntity[];
}

export function confirmContextEntity(id: string) {
  const entity = getStore().context_entities.find((e) => e.id === id);
  if (entity) {
    entity.user_confirmed = 1;
    saveStore();
  }
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
  const store = getStore();
  const now = Date.now();
  const existing = store.sync_progress.find((p) => p.user_id === userId);
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
  saveStore();
}

export function getSyncProgress(userId: string) {
  return getStore().sync_progress.find((p) => p.user_id === userId) ?? null;
}
