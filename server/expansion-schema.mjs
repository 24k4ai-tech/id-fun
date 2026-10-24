export function initExpansion(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS energy_accounts(wallet TEXT PRIMARY KEY, balance INTEGER NOT NULL DEFAULT 0 CHECK(balance>=0));
    CREATE TABLE IF NOT EXISTS energy_orders(id TEXT PRIMARY KEY,wallet TEXT NOT NULL,token_address TEXT NOT NULL,
      recipient TEXT NOT NULL,raw_amount TEXT NOT NULL,net_amount TEXT NOT NULL,created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',tx_hash TEXT UNIQUE,received TEXT);
    CREATE TABLE IF NOT EXISTS energy_entries(id INTEGER PRIMARY KEY,wallet TEXT NOT NULL,reference TEXT NOT NULL UNIQUE,
      delta INTEGER NOT NULL,created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS economy_domain(id INTEGER PRIMARY KEY CHECK(id=1),token TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS activity_tickets(id TEXT PRIMARY KEY,wallet TEXT NOT NULL,agent_id TEXT NOT NULL,
      mode TEXT NOT NULL,token_address TEXT NOT NULL,token_block TEXT NOT NULL,weight INTEGER NOT NULL,
      energy INTEGER NOT NULL,created_at INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'reserved');
    CREATE UNIQUE INDEX IF NOT EXISTS one_reward_activity ON activity_tickets(wallet) WHERE status='reserved';
    CREATE TABLE IF NOT EXISTS activity_rewards(id INTEGER PRIMARY KEY,source TEXT NOT NULL,source_id TEXT NOT NULL,
      wallet TEXT NOT NULL,agent_id TEXT NOT NULL,token_address TEXT NOT NULL,token_block TEXT NOT NULL,weight INTEGER NOT NULL,
      points INTEGER NOT NULL,opponents TEXT NOT NULL,finished_at INTEGER NOT NULL,UNIQUE(source,source_id,wallet));
    CREATE INDEX IF NOT EXISTS activity_reward_time ON activity_rewards(finished_at,id);
    CREATE TABLE IF NOT EXISTS moba_rooms(id TEXT PRIMARY KEY,host TEXT NOT NULL,ranked INTEGER NOT NULL DEFAULT 0,team_size INTEGER NOT NULL DEFAULT 3,
      status TEXT NOT NULL DEFAULT 'waiting',created_at INTEGER NOT NULL,state_json TEXT,updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS moba_members(room_id TEXT NOT NULL REFERENCES moba_rooms(id),wallet TEXT NOT NULL,
      team INTEGER NOT NULL,hero TEXT NOT NULL,ready INTEGER NOT NULL DEFAULT 0,joined_at INTEGER NOT NULL,
      PRIMARY KEY(room_id,wallet));
    CREATE INDEX IF NOT EXISTS moba_member_wallet ON moba_members(wallet);
    CREATE TABLE IF NOT EXISTS city_visits(wallet TEXT PRIMARY KEY,building TEXT NOT NULL,entered_at INTEGER NOT NULL,
      x REAL NOT NULL DEFAULT 0,z REAL NOT NULL DEFAULT 4,moved_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS city_commissions(id TEXT PRIMARY KEY,wallet TEXT NOT NULL,kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',step INTEGER NOT NULL DEFAULT 0,route TEXT NOT NULL,started_at INTEGER NOT NULL,
      step_at INTEGER NOT NULL,finished_at INTEGER,ticket TEXT,UNIQUE(ticket));
    CREATE UNIQUE INDEX IF NOT EXISTS one_city_commission ON city_commissions(wallet) WHERE status='active';
  `);
}
