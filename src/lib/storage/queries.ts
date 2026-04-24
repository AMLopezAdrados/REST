import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { RawEmail, NormalizedEmail } from '@/types/email';
import type { Classification, MainCategory, IntentData } from '@/types/classification';
import type { TopicNode, NodeStatus, Sector } from '@/types/node';
import type { ContextEntity, EntityType } from '@/types/context';

// ---------- JSON store ----------

interface Store {
  users: UserRow[];
  raw_emails: RawEmailRow[];
  classifications: ClassificationRow[];
  nodes: NodeRow[];
  node_emails: NodeEmailRow[];
  context_entities: ContextEntityRow[];
  sync_progress: SyncProgressRow[];
}

interface UserRow {
  id: string;
  email: string;
  refresh_token: string;          // encrypted
  access_token: string | null;
  token_expiry: number | null;
  created_at: number;
  last_sync: number | null;
}

interface RawEmailRow {
  id: string;
  user_id: string;
  gmail_id: string;
  thread_id: string | null;
  received_at: number;
  from_email: string;
  from_name: string | null;
  to_emails: string | null;       // JSON string
  subject: string | null;
  body_plaintext: string | null;
  body_html: string | null;
  labels: string | null;          // JSON string
  consumption_state: string;
  consumed_at: number | null;
  consumed_via: string | null;
}

interface ClassificationRow {
  email_id: string;
  main_category: string;
  subcategory: string | null;
  extracted_data: string | null;   // JSON string
  intent_data: string | null;     // JSON string
  confidence: number;
  classified_at: number;
  classifier_version: string;
  user_corrected: number;         // 0 | 1
}

interface NodeRow {
  id: string;
  user_id: string;
  title: string;
  summary: string | null;
  category: string | null;
  sector: string;
  position_x: number;
  position_y: number;
  urgency_score: number;
  status: string;
  email_count: number;
  last_activity: number;
  created_at: number;
  // Hierarchy (added)
  depth?: number;
  parent_id?: string | null;
  aggregate_summary?: string;
  child_count?: number;
}

interface NodeEmailRow {
  node_id: string;
  email_id: string;
}

interface ContextEntityRow {
  id: string;
  user_id: string;
  entity_type: string;
  data: string;                    // JSON string
  confidence: number;
  user_confirmed: number;         // 0 | 1
  created_at: number;
}

interface SyncProgressRow {
  user_id: string;
  status: string;
  total: number;
  processed: number;
  classified: number;
  started_at: number | null;
  updated_at: number | null;
}

const DATA_DIR = path.join(process.cwd(), '.data');
const STORE_PATH = path.join(DATA_DIR, 'rest-store.json');

function emptyStore(): Store {
  return {
    users: [],
    raw_emails: [],
    classifications: [],
    nodes: [],
    node_emails: [],
    context_entities: [],
    sync_progress: [],
  };
}

function readStore(): Store {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    const empty = emptyStore();
    writeStore(empty);
    return empty;
  }
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<Store>;
    // Ensure all keys exist
    const base = emptyStore();
    return {
      users: parsed.users ?? base.users,
      raw_emails: parsed.raw_emails ?? base.raw_emails,
      classifications: parsed.classifications ?? base.classifications,
      nodes: parsed.nodes ?? base.nodes,
      node_emails: parsed.node_emails ?? base.node_emails,
      context_entities: parsed.context_entities ?? base.context_entities,
      sync_progress: parsed.sync_progress ?? base.sync_progress,
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store: Store) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const json = JSON.stringify(store, null, 2);
  // Atomic-ish write: write to temp file in same directory, then rename
  const tmpPath = path.join(DATA_DIR, `rest-store.tmp.${process.pid}.${Date.now()}`);
  fs.writeFileSync(tmpPath, json, 'utf-8');
  fs.renameSync(tmpPath, STORE_PATH);
}

function mutate(fn: (store: Store) => void): void {
  const store = readStore();
  fn(store);
  writeStore(store);
}

function query<T>(fn: (store: Store) => T): T {
  const store = readStore();
  return fn(store);
}

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
  const encryptedRefresh = encrypt(params.refreshToken);
  const now = Date.now();
  let resultId = '';

  mutate((store) => {
    const existing = store.users.find((u) => u.email === params.email);
    if (existing) {
      existing.refresh_token = encryptedRefresh;
      existing.access_token = params.accessToken ?? null;
      existing.token_expiry = params.tokenExpiry ?? null;
      resultId = existing.id;
    } else {
      const id = params.id ?? crypto.randomUUID();
      store.users.push({
        id,
        email: params.email,
        refresh_token: encryptedRefresh,
        access_token: params.accessToken ?? null,
        token_expiry: params.tokenExpiry ?? null,
        created_at: now,
        last_sync: null,
      });
      resultId = id;
    }
  });

  return resultId;
}

export function getUserByEmail(email: string) {
  return query((store) => {
    const row = store.users.find((u) => u.email === email);
    if (!row) return null;
    return {
      ...row,
      refresh_token: decrypt(row.refresh_token),
    };
  });
}

export function getUserById(id: string) {
  return query((store) => {
    const row = store.users.find((u) => u.id === id);
    if (!row) return null;
    return {
      ...row,
      refresh_token: decrypt(row.refresh_token),
    };
  });
}

export function updateUserTokens(userId: string, accessToken: string, expiry: number) {
  mutate((store) => {
    const user = store.users.find((u) => u.id === userId);
    if (user) {
      user.access_token = accessToken;
      user.token_expiry = expiry;
    }
  });
}

export function updateLastSync(userId: string) {
  mutate((store) => {
    const user = store.users.find((u) => u.id === userId);
    if (user) {
      user.last_sync = Date.now();
    }
  });
}

// ---------- raw emails ----------

export function insertEmail(userId: string, email: NormalizedEmail): string {
  let resultId = '';

  mutate((store) => {
    // Avoid duplicates by user_id + gmail_id
    const existing = store.raw_emails.find(
      (e) => e.user_id === userId && e.gmail_id === email.gmail_id
    );
    if (existing) {
      resultId = existing.id;
      return;
    }

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
    resultId = id;
  });

  return resultId;
}

export function getEmailsForUser(userId: string, limit = 500): RawEmail[] {
  return query((store) => {
    return store.raw_emails
      .filter((e) => e.user_id === userId)
      .sort((a, b) => b.received_at - a.received_at)
      .slice(0, limit) as unknown as RawEmail[];
  });
}

export function getEmailById(id: string): RawEmail | null {
  return query((store) => {
    return (store.raw_emails.find((e) => e.id === id) as unknown as RawEmail) ?? null;
  });
}

export function getEmailsByThread(userId: string, threadId: string): RawEmail[] {
  return query((store) => {
    return store.raw_emails
      .filter((e) => e.user_id === userId && e.thread_id === threadId)
      .sort((a, b) => a.received_at - b.received_at) as unknown as RawEmail[];
  });
}

export function setConsumptionState(emailId: string, state: 'unseen' | 'implicit' | 'confirmed', via?: string) {
  mutate((store) => {
    const email = store.raw_emails.find((e) => e.id === emailId);
    if (email) {
      email.consumption_state = state;
      email.consumed_at = state === 'unseen' ? null : Date.now();
      email.consumed_via = via ?? null;
    }
  });
}

// ---------- classifications ----------

export function upsertClassification(c: Classification) {
  mutate((store) => {
    const idx = store.classifications.findIndex((cl) => cl.email_id === c.email_id);
    const row: ClassificationRow = {
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
    if (idx >= 0) {
      store.classifications[idx] = row;
    } else {
      store.classifications.push(row);
    }
  });
}

export function getClassification(emailId: string): Classification | null {
  return query((store) => {
    const row = store.classifications.find((c) => c.email_id === emailId);
    if (!row) return null;
    return {
      ...row,
      main_category: row.main_category as MainCategory,
      extracted_data: row.extracted_data ? JSON.parse(row.extracted_data) : null,
      intent_data: row.intent_data ? JSON.parse(row.intent_data) : null,
      user_corrected: !!row.user_corrected,
    } as Classification;
  });
}

export function getUnclassifiedEmails(userId: string, limit = 1000): RawEmail[] {
  return query((store) => {
    const classifiedEmailIds = new Set(store.classifications.map((c) => c.email_id));
    return store.raw_emails
      .filter((e) => e.user_id === userId && !classifiedEmailIds.has(e.id))
      .sort((a, b) => b.received_at - a.received_at)
      .slice(0, limit) as unknown as RawEmail[];
  });
}

// ---------- nodes ----------

function rowToTopicNode(row: NodeRow): TopicNode {
  return {
    ...row,
    sector: row.sector as TopicNode['sector'],
    status: row.status as TopicNode['status'],
    depth: (row.depth ?? 4) as TopicNode['depth'],
    parent_id: row.parent_id ?? null,
    aggregate_summary: row.aggregate_summary ?? '',
    child_count: row.child_count ?? 0,
  } as TopicNode;
}

export function upsertNode(n: Omit<TopicNode, 'created_at'> & { created_at?: number }): string {
  const now = Date.now();

  mutate((store) => {
    const idx = store.nodes.findIndex((node) => node.id === n.id);
    const row: NodeRow = {
      id: n.id,
      user_id: n.user_id,
      title: n.title,
      summary: n.summary ?? null,
      category: n.category ?? null,
      sector: n.sector,
      position_x: n.position_x,
      position_y: n.position_y,
      urgency_score: n.urgency_score,
      status: n.status,
      email_count: n.email_count,
      last_activity: n.last_activity,
      created_at: n.created_at ?? now,
      depth: n.depth,
      parent_id: n.parent_id,
      aggregate_summary: n.aggregate_summary,
      child_count: n.child_count,
    };
    if (idx >= 0) {
      // Preserve original created_at on update
      row.created_at = store.nodes[idx].created_at;
      store.nodes[idx] = row;
    } else {
      store.nodes.push(row);
    }
  });

  return n.id;
}

export function getNodesForUser(userId: string): TopicNode[] {
  return query((store) => {
    return store.nodes
      .filter((n) => n.user_id === userId)
      .sort((a, b) => b.urgency_score - a.urgency_score)
      .map(rowToTopicNode);
  });
}

export function getNodeById(id: string): TopicNode | null {
  return query((store) => {
    const row = store.nodes.find((n) => n.id === id);
    return row ? rowToTopicNode(row) : null;
  });
}

export function getNodesByDepth(userId: string, depth: number): TopicNode[] {
  return query((store) => {
    return store.nodes
      .filter((n) => n.user_id === userId && (n.depth ?? 4) === depth)
      .sort((a, b) => b.urgency_score - a.urgency_score)
      .map(rowToTopicNode);
  });
}

export function getNodesByParent(userId: string, parentId: string | null): TopicNode[] {
  return query((store) => {
    return store.nodes
      .filter((n) => n.user_id === userId && (n.parent_id ?? null) === parentId)
      .sort((a, b) => b.urgency_score - a.urgency_score)
      .map(rowToTopicNode);
  });
}

export function linkEmailToNode(nodeId: string, emailId: string) {
  mutate((store) => {
    // Avoid duplicates by node_id + email_id
    const exists = store.node_emails.some(
      (ne) => ne.node_id === nodeId && ne.email_id === emailId
    );
    if (!exists) {
      store.node_emails.push({ node_id: nodeId, email_id: emailId });
    }
  });
}

export function getEmailsForNode(nodeId: string): RawEmail[] {
  return query((store) => {
    const emailIds = new Set(
      store.node_emails.filter((ne) => ne.node_id === nodeId).map((ne) => ne.email_id)
    );
    return store.raw_emails
      .filter((e) => emailIds.has(e.id))
      .sort((a, b) => b.received_at - a.received_at) as unknown as RawEmail[];
  });
}

export function getNodeForEmail(emailId: string): TopicNode | null {
  return query((store) => {
    const link = store.node_emails.find((ne) => ne.email_id === emailId);
    if (!link) return null;
    return (store.nodes.find((n) => n.id === link.node_id) as unknown as TopicNode) ?? null;
  });
}

export function clearNodesForUser(userId: string) {
  mutate((store) => {
    const userNodeIds = new Set(
      store.nodes.filter((n) => n.user_id === userId).map((n) => n.id)
    );
    store.node_emails = store.node_emails.filter((ne) => !userNodeIds.has(ne.node_id));
    store.nodes = store.nodes.filter((n) => n.user_id !== userId);
  });
}

// ---------- context entities ----------

export function insertContextEntity(userId: string, entity: Omit<ContextEntity, 'id' | 'user_id' | 'created_at'>): string {
  const id = crypto.randomUUID();

  mutate((store) => {
    store.context_entities.push({
      id,
      user_id: userId,
      entity_type: entity.entity_type,
      data: JSON.stringify(entity.data),
      confidence: entity.confidence,
      user_confirmed: entity.user_confirmed ? 1 : 0,
      created_at: Date.now(),
    });
  });

  return id;
}

export function getContextEntities(userId: string): ContextEntity[] {
  return query((store) => {
    return store.context_entities
      .filter((ce) => ce.user_id === userId)
      .map((r) => ({
        ...r,
        entity_type: r.entity_type as EntityType,
        data: JSON.parse(r.data),
        user_confirmed: !!r.user_confirmed,
      })) as ContextEntity[];
  });
}

export function confirmContextEntity(id: string) {
  mutate((store) => {
    const entity = store.context_entities.find((ce) => ce.id === id);
    if (entity) {
      entity.user_confirmed = 1;
    }
  });
}

// ---------- sync progress ----------

export function setSyncProgress(userId: string, progress: {
  status: 'idle' | 'fetching' | 'classifying' | 'done' | 'error';
  total?: number;
  processed?: number;
  classified?: number;
}) {
  const now = Date.now();

  mutate((store) => {
    const idx = store.sync_progress.findIndex((sp) => sp.user_id === userId);
    if (idx >= 0) {
      const existing = store.sync_progress[idx];
      store.sync_progress[idx] = {
        ...existing,
        status: progress.status,
        total: progress.total ?? existing.total,
        processed: progress.processed ?? existing.processed,
        classified: progress.classified ?? existing.classified,
        updated_at: now,
      };
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
  });
}

export function getSyncProgress(userId: string) {
  return query((store) => {
    return store.sync_progress.find((sp) => sp.user_id === userId) ?? null;
  });
}
