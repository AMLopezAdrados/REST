import { getDb } from './db';
import crypto from 'node:crypto';
import type { RawEmail, NormalizedEmail } from '@/types/email';
import type { Classification, MainCategory, IntentData } from '@/types/classification';
import type { TopicNode, NodeStatus, Sector } from '@/types/node';
import type { ContextEntity, EntityType } from '@/types/context';

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
  email: string;
  refreshToken: string;
  accessToken?: string | null;
  tokenExpiry?: number | null;
}): string {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(params.email) as { id: string } | undefined;
  const encryptedRefresh = encrypt(params.refreshToken);
  const now = Date.now();

  if (existing) {
    db.prepare(
      `UPDATE users SET refresh_token = ?, access_token = ?, token_expiry = ? WHERE id = ?`
    ).run(encryptedRefresh, params.accessToken ?? null, params.tokenExpiry ?? null, existing.id);
    return existing.id;
  }

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO users (id, email, refresh_token, access_token, token_expiry, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, params.email, encryptedRefresh, params.accessToken ?? null, params.tokenExpiry ?? null, now);
  return id;
}

export function getUserByEmail(email: string) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
  if (!row) return null;
  return {
    ...row,
    refresh_token: decrypt(row.refresh_token),
  };
}

export function getUserById(id: string) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
  if (!row) return null;
  return {
    ...row,
    refresh_token: decrypt(row.refresh_token),
  };
}

export function updateUserTokens(userId: string, accessToken: string, expiry: number) {
  getDb().prepare('UPDATE users SET access_token = ?, token_expiry = ? WHERE id = ?').run(accessToken, expiry, userId);
}

export function updateLastSync(userId: string) {
  getDb().prepare('UPDATE users SET last_sync = ? WHERE id = ?').run(Date.now(), userId);
}

// ---------- raw emails ----------

export function insertEmail(userId: string, email: NormalizedEmail): string {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM raw_emails WHERE user_id = ? AND gmail_id = ?').get(userId, email.gmail_id) as
    | { id: string }
    | undefined;
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO raw_emails (id, user_id, gmail_id, thread_id, received_at, from_email, from_name, to_emails, subject, body_plaintext, body_html, labels)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    email.gmail_id,
    email.thread_id,
    email.received_at,
    email.from_email,
    email.from_name,
    JSON.stringify(email.to_emails),
    email.subject,
    email.body_plaintext,
    email.body_html,
    JSON.stringify(email.labels)
  );
  return id;
}

export function getEmailsForUser(userId: string, limit = 500): RawEmail[] {
  return getDb()
    .prepare(
      `SELECT * FROM raw_emails WHERE user_id = ? ORDER BY received_at DESC LIMIT ?`
    )
    .all(userId, limit) as RawEmail[];
}

export function getEmailById(id: string): RawEmail | null {
  return (getDb().prepare('SELECT * FROM raw_emails WHERE id = ?').get(id) as RawEmail) ?? null;
}

export function getEmailsByThread(userId: string, threadId: string): RawEmail[] {
  return getDb()
    .prepare(
      'SELECT * FROM raw_emails WHERE user_id = ? AND thread_id = ? ORDER BY received_at ASC'
    )
    .all(userId, threadId) as RawEmail[];
}

export function setConsumptionState(emailId: string, state: 'unseen' | 'implicit' | 'confirmed', via?: string) {
  getDb()
    .prepare('UPDATE raw_emails SET consumption_state = ?, consumed_at = ?, consumed_via = ? WHERE id = ?')
    .run(state, state === 'unseen' ? null : Date.now(), via ?? null, emailId);
}

// ---------- classifications ----------

export function upsertClassification(c: Classification) {
  getDb()
    .prepare(
      `INSERT INTO classifications (email_id, main_category, subcategory, extracted_data, intent_data, confidence, classified_at, classifier_version, user_corrected)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(email_id) DO UPDATE SET
         main_category = excluded.main_category,
         subcategory = excluded.subcategory,
         extracted_data = excluded.extracted_data,
         intent_data = excluded.intent_data,
         confidence = excluded.confidence,
         classified_at = excluded.classified_at,
         classifier_version = excluded.classifier_version`
    )
    .run(
      c.email_id,
      c.main_category,
      c.subcategory,
      c.extracted_data ? JSON.stringify(c.extracted_data) : null,
      c.intent_data ? JSON.stringify(c.intent_data) : null,
      c.confidence,
      c.classified_at,
      c.classifier_version,
      c.user_corrected ? 1 : 0
    );
}

export function getClassification(emailId: string): Classification | null {
  const row = getDb().prepare('SELECT * FROM classifications WHERE email_id = ?').get(emailId) as any;
  if (!row) return null;
  return {
    ...row,
    extracted_data: row.extracted_data ? JSON.parse(row.extracted_data) : null,
    intent_data: row.intent_data ? JSON.parse(row.intent_data) : null,
    user_corrected: !!row.user_corrected,
  };
}

export function getUnclassifiedEmails(userId: string, limit = 1000): RawEmail[] {
  return getDb()
    .prepare(
      `SELECT e.* FROM raw_emails e
       LEFT JOIN classifications c ON c.email_id = e.id
       WHERE e.user_id = ? AND c.email_id IS NULL
       ORDER BY e.received_at DESC
       LIMIT ?`
    )
    .all(userId, limit) as RawEmail[];
}

// ---------- nodes ----------

export function upsertNode(n: Omit<TopicNode, 'created_at'> & { created_at?: number }): string {
  const db = getDb();
  const now = Date.now();
  const existing = db.prepare('SELECT id FROM nodes WHERE id = ?').get(n.id);
  if (existing) {
    db.prepare(
      `UPDATE nodes SET title = ?, summary = ?, category = ?, sector = ?, position_x = ?, position_y = ?, urgency_score = ?, status = ?, email_count = ?, last_activity = ? WHERE id = ?`
    ).run(
      n.title,
      n.summary,
      n.category,
      n.sector,
      n.position_x,
      n.position_y,
      n.urgency_score,
      n.status,
      n.email_count,
      n.last_activity,
      n.id
    );
    return n.id;
  }
  db.prepare(
    `INSERT INTO nodes (id, user_id, title, summary, category, sector, position_x, position_y, urgency_score, status, email_count, last_activity, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    n.id,
    n.user_id,
    n.title,
    n.summary,
    n.category,
    n.sector,
    n.position_x,
    n.position_y,
    n.urgency_score,
    n.status,
    n.email_count,
    n.last_activity,
    n.created_at ?? now
  );
  return n.id;
}

export function getNodesForUser(userId: string): TopicNode[] {
  return getDb()
    .prepare('SELECT * FROM nodes WHERE user_id = ? ORDER BY urgency_score DESC')
    .all(userId) as TopicNode[];
}

export function getNodeById(id: string): TopicNode | null {
  return (getDb().prepare('SELECT * FROM nodes WHERE id = ?').get(id) as TopicNode) ?? null;
}

export function linkEmailToNode(nodeId: string, emailId: string) {
  getDb()
    .prepare('INSERT OR IGNORE INTO node_emails (node_id, email_id) VALUES (?, ?)')
    .run(nodeId, emailId);
}

export function getEmailsForNode(nodeId: string): RawEmail[] {
  return getDb()
    .prepare(
      `SELECT e.* FROM raw_emails e
       JOIN node_emails ne ON ne.email_id = e.id
       WHERE ne.node_id = ?
       ORDER BY e.received_at DESC`
    )
    .all(nodeId) as RawEmail[];
}

export function getNodeForEmail(emailId: string): TopicNode | null {
  return (
    (getDb()
      .prepare(
        `SELECT n.* FROM nodes n JOIN node_emails ne ON ne.node_id = n.id WHERE ne.email_id = ? LIMIT 1`
      )
      .get(emailId) as TopicNode) ?? null
  );
}

export function clearNodesForUser(userId: string) {
  const db = getDb();
  db.prepare('DELETE FROM node_emails WHERE node_id IN (SELECT id FROM nodes WHERE user_id = ?)').run(userId);
  db.prepare('DELETE FROM nodes WHERE user_id = ?').run(userId);
}

// ---------- context entities ----------

export function insertContextEntity(userId: string, entity: Omit<ContextEntity, 'id' | 'user_id' | 'created_at'>): string {
  const id = crypto.randomUUID();
  getDb()
    .prepare(
      `INSERT INTO context_entities (id, user_id, entity_type, data, confidence, user_confirmed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      userId,
      entity.entity_type,
      JSON.stringify(entity.data),
      entity.confidence,
      entity.user_confirmed ? 1 : 0,
      Date.now()
    );
  return id;
}

export function getContextEntities(userId: string): ContextEntity[] {
  const rows = getDb().prepare('SELECT * FROM context_entities WHERE user_id = ?').all(userId) as any[];
  return rows.map((r) => ({ ...r, data: JSON.parse(r.data), user_confirmed: !!r.user_confirmed }));
}

export function confirmContextEntity(id: string) {
  getDb().prepare('UPDATE context_entities SET user_confirmed = 1 WHERE id = ?').run(id);
}

// ---------- sync progress ----------

export function setSyncProgress(userId: string, progress: {
  status: 'idle' | 'fetching' | 'classifying' | 'done' | 'error';
  total?: number;
  processed?: number;
  classified?: number;
}) {
  const db = getDb();
  const existing = db.prepare('SELECT user_id FROM sync_progress WHERE user_id = ?').get(userId);
  const now = Date.now();
  if (existing) {
    db.prepare(
      `UPDATE sync_progress SET status = ?, total = COALESCE(?, total), processed = COALESCE(?, processed), classified = COALESCE(?, classified), updated_at = ? WHERE user_id = ?`
    ).run(progress.status, progress.total ?? null, progress.processed ?? null, progress.classified ?? null, now, userId);
  } else {
    db.prepare(
      `INSERT INTO sync_progress (user_id, status, total, processed, classified, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(userId, progress.status, progress.total ?? 0, progress.processed ?? 0, progress.classified ?? 0, now, now);
  }
}

export function getSyncProgress(userId: string) {
  return getDb().prepare('SELECT * FROM sync_progress WHERE user_id = ?').get(userId) as any;
}
