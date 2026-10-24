export function initStudio(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS studio_profiles (
    wallet TEXT PRIMARY KEY REFERENCES residents(wallet), appearance TEXT NOT NULL DEFAULT '{}',
    portrait_id TEXT, character_id TEXT, place_id TEXT, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS studio_uploads (
      id TEXT PRIMARY KEY, wallet TEXT NOT NULL REFERENCES residents(wallet), created_at INTEGER NOT NULL, bytes INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS studio_jobs (
      id TEXT PRIMARY KEY, wallet TEXT NOT NULL REFERENCES residents(wallet), kind TEXT NOT NULL, prompt TEXT NOT NULL,
      reference_id TEXT, base_avatar TEXT NOT NULL, state TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL, token_address TEXT NOT NULL, recipient TEXT NOT NULL, raw_amount TEXT NOT NULL,
      payment_hash TEXT UNIQUE, payment_block TEXT, received TEXT, retries INTEGER NOT NULL DEFAULT 0,
      provider_data TEXT NOT NULL DEFAULT '{}', asset_data TEXT, error_code TEXT, budget_day TEXT,
      reserved_usd REAL NOT NULL DEFAULT 0, next_check_at INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS studio_spend(id INTEGER PRIMARY KEY,job_id TEXT NOT NULL,day TEXT NOT NULL,amount REAL NOT NULL);
    CREATE INDEX IF NOT EXISTS studio_jobs_owner ON studio_jobs(wallet,created_at DESC);
    CREATE INDEX IF NOT EXISTS studio_jobs_queue ON studio_jobs(state,next_check_at);`);
  const columns=new Set(db.prepare('PRAGMA table_info(studio_jobs)').all().map(c=>c.name));
  for(const name of ['refund_hash','refund_received'])if(!columns.has(name))db.exec(`ALTER TABLE studio_jobs ADD COLUMN ${name} TEXT`);
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS studio_refund_hash ON studio_jobs(refund_hash)');
}
