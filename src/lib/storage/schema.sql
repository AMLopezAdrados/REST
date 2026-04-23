-- REST MVP schema
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  token_expiry INTEGER,
  created_at INTEGER NOT NULL,
  last_sync INTEGER
);

CREATE TABLE IF NOT EXISTS raw_emails (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  gmail_id TEXT NOT NULL,
  thread_id TEXT,
  received_at INTEGER NOT NULL,
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_emails TEXT,
  subject TEXT,
  body_plaintext TEXT,
  body_html TEXT,
  labels TEXT,
  consumption_state TEXT DEFAULT 'unseen',
  consumed_at INTEGER,
  consumed_via TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_emails_user_received ON raw_emails(user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_thread ON raw_emails(thread_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_user_gmail ON raw_emails(user_id, gmail_id);

CREATE TABLE IF NOT EXISTS classifications (
  email_id TEXT PRIMARY KEY,
  main_category TEXT NOT NULL,
  subcategory TEXT,
  extracted_data TEXT,
  intent_data TEXT,
  confidence REAL,
  classified_at INTEGER NOT NULL,
  classifier_version TEXT,
  user_corrected INTEGER DEFAULT 0,
  FOREIGN KEY (email_id) REFERENCES raw_emails(id)
);

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  category TEXT,
  sector TEXT NOT NULL,
  position_x REAL,
  position_y REAL,
  urgency_score REAL DEFAULT 0,
  status TEXT DEFAULT 'ongoing',
  email_count INTEGER DEFAULT 0,
  last_activity INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_nodes_user ON nodes(user_id);

CREATE TABLE IF NOT EXISTS node_emails (
  node_id TEXT NOT NULL,
  email_id TEXT NOT NULL,
  PRIMARY KEY (node_id, email_id),
  FOREIGN KEY (node_id) REFERENCES nodes(id),
  FOREIGN KEY (email_id) REFERENCES raw_emails(id)
);

CREATE INDEX IF NOT EXISTS idx_node_emails_email ON node_emails(email_id);

CREATE TABLE IF NOT EXISTS context_entities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  data TEXT NOT NULL,
  confidence REAL DEFAULT 0.5,
  user_confirmed INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sync_progress (
  user_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  total INTEGER DEFAULT 0,
  processed INTEGER DEFAULT 0,
  classified INTEGER DEFAULT 0,
  started_at INTEGER,
  updated_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
