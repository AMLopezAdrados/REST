import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

let cached: Database.Database | null = null;

export function getDb(): Database.Database {
  if (cached) return cached;

  const dbPath = process.env.DATABASE_PATH || './rest.db';
  const absPath = path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);

  const dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(absPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schemaPath = path.join(process.cwd(), 'src/lib/storage/schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
  }

  cached = db;
  return db;
}

export function closeDb() {
  if (cached) {
    cached.close();
    cached = null;
  }
}
