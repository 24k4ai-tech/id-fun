import {initCampaign} from './campaign.mjs';
export function initJourney(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS journey_profiles (
    wallet TEXT PRIMARY KEY REFERENCES residents(wallet), x REAL NOT NULL DEFAULT 0,z REAL NOT NULL DEFAULT 7,
    moved_at INTEGER NOT NULL DEFAULT 0,signals INTEGER NOT NULL DEFAULT 0,deliveries INTEGER NOT NULL DEFAULT 0,
    beacon_level INTEGER NOT NULL DEFAULT 0,best_delivery_ms INTEGER);
    CREATE TABLE IF NOT EXISTS journey_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,wallet TEXT NOT NULL REFERENCES residents(wallet),kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',stage INTEGER NOT NULL DEFAULT 0,order_json TEXT NOT NULL,
      started_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,stage_at INTEGER NOT NULL,
      revealed_until INTEGER NOT NULL DEFAULT 0,mistakes INTEGER NOT NULL DEFAULT 0,reveals INTEGER NOT NULL DEFAULT 0,
      last_hit_at INTEGER NOT NULL DEFAULT 0,completed_at INTEGER,rewarded INTEGER NOT NULL DEFAULT 0,rating INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS journey_wallet ON journey_runs(wallet,id DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS journey_active ON journey_runs(wallet) WHERE status='active';`);
  initCampaign(db);
}
