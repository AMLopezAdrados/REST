import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Pure-JS JSON-file store.
//
// Replaces better-sqlite3 (a native addon that crashes the Node process on some
// environments, e.g. ChromeOS/Crostini). The dataset is tiny (a few hundred
// emails), so a whole-file read/write per mutation is perfectly adequate and,
// crucially, has zero native dependencies and cannot segfault.
//
// Row shapes intentionally mirror the old SQLite columns 1:1 so that every
// consumer in queries.ts (and downstream) keeps working unchanged.
// ---------------------------------------------------------------------------

export interface UserRow {
  id: string;
  email: string;
  refresh_token: string; // encrypted
  access_token: string | null;
  token_expiry: number | null;
  created_at: number;
  last_sync: number | null;
}

export interface EmailRow {
  id: string;
  user_id: string;
  gmail_id: string;
  thread_id: string | null;
  received_at: number;
  from_email: string;
  from_name: string | null;
  to_emails: string | null; // JSON string
  subject: string | null;
  body_plaintext: string | null;
  body_html: string | null;
  labels: string | null; // JSON string
  consumption_state: 'unseen' | 'implicit' | 'confirmed';
  consumed_at: number | null;
  consumed_via: string | null;
}

export interface ClassificationRow {
  email_id: string;
  main_category: string;
  subcategory: string | null;
  extracted_data: string | null; // JSON string
  intent_data: string | null; // JSON string
  confidence: number;
  classified_at: number;
  classifier_version: string;
  user_corrected: number; // 0 | 1
}

export interface NodeRow {
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
}

export interface NodeEmailRow {
  node_id: string;
  email_id: string;
}

export interface ContextEntityRow {
  id: string;
  user_id: string;
  entity_type: string;
  data: string; // JSON string
  confidence: number;
  user_confirmed: number; // 0 | 1
  created_at: number;
}

export interface SyncProgressRow {
  user_id: string;
  status: string;
  total: number;
  processed: number;
  classified: number;
  started_at: number | null;
  updated_at: number | null;
}

export interface Store {
  users: UserRow[];
  raw_emails: EmailRow[];
  classifications: ClassificationRow[];
  nodes: NodeRow[];
  node_emails: NodeEmailRow[];
  context_entities: ContextEntityRow[];
  sync_progress: SyncProgressRow[];
}

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

let cached: Store | null = null;

function storePath(): string {
  const dbPath = process.env.DATABASE_PATH || './rest.json';
  return path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);
}

export function getStore(): Store {
  if (cached) return cached;

  const absPath = storePath();
  try {
    if (fs.existsSync(absPath)) {
      const raw = fs.readFileSync(absPath, 'utf-8');
      const parsed = raw.trim() ? (JSON.parse(raw) as Partial<Store>) : {};
      cached = { ...emptyStore(), ...parsed };
    } else {
      cached = emptyStore();
    }
  } catch (err) {
    console.error('[storage] failed to read store, starting fresh:', err);
    cached = emptyStore();
  }
  return cached;
}

export function saveStore(): void {
  if (!cached) return;
  const absPath = storePath();
  const dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(absPath, JSON.stringify(cached), 'utf-8');
}

// Test/maintenance helper — drops the in-memory cache so the next access reloads.
export function resetStoreCache(): void {
  cached = null;
}
