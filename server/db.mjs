import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { initStudio } from './studio-schema.mjs';
import { initJourney } from './journey-schema.mjs';
import {initPlayScore} from './play-score.mjs';
import {initGameControl} from './game-control.mjs';
import {initExpansion} from './expansion-schema.mjs';

export function openDatabase(file, roundMs = 120_000) {
  const path = file === ':memory:' ? file : resolve(file);
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS city (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      round INTEGER NOT NULL,
      next_round_at INTEGER NOT NULL,
      stability INTEGER NOT NULL,
      district_level INTEGER NOT NULL,
      active_event_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS residents (
      wallet TEXT PRIMARY KEY,
      handle TEXT NOT NULL,
      role TEXT NOT NULL,
      material INTEGER NOT NULL DEFAULT 0,
      stamina INTEGER NOT NULL DEFAULT 5,
      score INTEGER NOT NULL DEFAULT 0,
      last_regen_at INTEGER NOT NULL,
      last_action_at INTEGER NOT NULL DEFAULT 0,
      is_demo INTEGER NOT NULL DEFAULT 0,
      verified_ai INTEGER NOT NULL DEFAULT 0,
      avatar_id TEXT NOT NULL DEFAULT 'ember',
      aura TEXT NOT NULL DEFAULT 'gold',
      avatar_set INTEGER NOT NULL DEFAULT 0,
      joined_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      starts_at INTEGER NOT NULL,
      ends_at INTEGER NOT NULL,
      target INTEGER NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active'
    );
    CREATE TABLE IF NOT EXISTS actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT NOT NULL,
      handle TEXT NOT NULL,
      kind TEXT NOT NULL,
      source TEXT NOT NULL,
      message TEXT NOT NULL,
      score_delta INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS actions_recent ON actions(created_at DESC);
    CREATE TABLE IF NOT EXISTS nonces (
      nonce TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      message TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent_keys (
      key_hash TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS agent_keys_wallet ON agent_keys(wallet);
    CREATE TABLE IF NOT EXISTS viewer_codes (
      code_hash TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent_pairs (
      code_hash TEXT PRIMARY KEY,
      wallet TEXT,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stories (
      wallet TEXT PRIMARY KEY,
      action_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      mode TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_usage (
      day TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_wallet_calls (
      wallet TEXT PRIMARY KEY,
      last_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS battles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT NOT NULL,
      opponent_id TEXT NOT NULL,
      player_avatar_id TEXT NOT NULL DEFAULT 'ember',
      player_hp INTEGER NOT NULL,
      enemy_hp INTEGER NOT NULL,
      energy INTEGER NOT NULL DEFAULT 0,
      combo INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      started_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      last_command_at INTEGER NOT NULL DEFAULT 0,
      last_special_at INTEGER NOT NULL DEFAULT 0,
      last_dodge_at INTEGER NOT NULL DEFAULT 0,
      heal_used INTEGER NOT NULL DEFAULT 0,
      charge_started_at INTEGER NOT NULL DEFAULT 0,
      last_enemy_at INTEGER NOT NULL,
      enemy_attack_count INTEGER NOT NULL DEFAULT 0,
      last_enemy_kind TEXT NOT NULL DEFAULT '',
      last_enemy_hit INTEGER NOT NULL DEFAULT 0,
      last_step_at INTEGER NOT NULL DEFAULT 0,
      last_move_at INTEGER NOT NULL DEFAULT 0,
      player_x REAL NOT NULL DEFAULT -1.6,
      player_z REAL NOT NULL DEFAULT 0,
      enemy_x REAL NOT NULL DEFAULT 1.6,
      enemy_z REAL NOT NULL DEFAULT 0,
      dodge_until INTEGER NOT NULL DEFAULT 0,
      rewarded INTEGER NOT NULL DEFAULT 0,
      ended_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS battles_wallet ON battles(wallet,id DESC);
    CREATE TABLE IF NOT EXISTS pvp_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      challenger TEXT NOT NULL,
      target TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      match_id INTEGER,
      received_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS pvp_challenges_target ON pvp_challenges(target,status,created_at DESC);
    CREATE TABLE IF NOT EXISTS pvp_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      a_wallet TEXT NOT NULL,
      b_wallet TEXT NOT NULL,
      a_avatar_id TEXT NOT NULL DEFAULT 'ember',
      b_avatar_id TEXT NOT NULL DEFAULT 'ember',
      a_agent_id TEXT,
      b_agent_id TEXT,
      token_address TEXT,
      token_check_block TEXT,
      a_holder_weight_bps INTEGER NOT NULL DEFAULT 0,
      b_holder_weight_bps INTEGER NOT NULL DEFAULT 0,
      a_hp INTEGER NOT NULL DEFAULT 100,
      b_hp INTEGER NOT NULL DEFAULT 100,
      a_energy INTEGER NOT NULL DEFAULT 0,
      b_energy INTEGER NOT NULL DEFAULT 0,
      a_x REAL NOT NULL DEFAULT -1.7,
      a_z REAL NOT NULL DEFAULT 0,
      b_x REAL NOT NULL DEFAULT 1.7,
      b_z REAL NOT NULL DEFAULT 0,
      a_dodge_until INTEGER NOT NULL DEFAULT 0,
      b_dodge_until INTEGER NOT NULL DEFAULT 0,
      a_last_move INTEGER NOT NULL DEFAULT 0,
      b_last_move INTEGER NOT NULL DEFAULT 0,
      a_last_command INTEGER NOT NULL DEFAULT 0,
      b_last_command INTEGER NOT NULL DEFAULT 0,
      a_last_special INTEGER NOT NULL DEFAULT 0,
      b_last_special INTEGER NOT NULL DEFAULT 0,
      a_combo INTEGER NOT NULL DEFAULT 0,
      b_combo INTEGER NOT NULL DEFAULT 0,
      a_heal_used INTEGER NOT NULL DEFAULT 0,
      b_heal_used INTEGER NOT NULL DEFAULT 0,
      a_charge_started INTEGER NOT NULL DEFAULT 0,
      b_charge_started INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      winner_wallet TEXT,
      a_points INTEGER NOT NULL DEFAULT 0,
      b_points INTEGER NOT NULL DEFAULT 0,
      a_damage INTEGER NOT NULL DEFAULT 0,
      b_damage INTEGER NOT NULL DEFAULT 0,
      a_last_attack_kind TEXT NOT NULL DEFAULT '',
      b_last_attack_kind TEXT NOT NULL DEFAULT '',
      a_last_attack_at INTEGER NOT NULL DEFAULT 0,
      b_last_attack_at INTEGER NOT NULL DEFAULT 0,
      finished_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS pvp_matches_a ON pvp_matches(a_wallet,id DESC);
    CREATE INDEX IF NOT EXISTS pvp_matches_b ON pvp_matches(b_wallet,id DESC);
    CREATE TABLE IF NOT EXISTS pvp_scores (
      epoch_start INTEGER NOT NULL,
      wallet TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      matches INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(epoch_start,wallet)
    );
    CREATE TABLE IF NOT EXISTS arena_signals (
      wallet TEXT NOT NULL,
      round_id INTEGER NOT NULL,
      choice TEXT NOT NULL,
      correct INTEGER NOT NULL,
      source TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(wallet,round_id)
    );
    CREATE INDEX IF NOT EXISTS arena_signals_recent ON arena_signals(round_id DESC,correct);
  `);
  const residentColumns = db.prepare('PRAGMA table_info(residents)').all().map(row => row.name);
  if (!residentColumns.includes('verified_ai')) db.exec('ALTER TABLE residents ADD COLUMN verified_ai INTEGER NOT NULL DEFAULT 0');
  if (!residentColumns.includes('avatar_id')) db.exec("ALTER TABLE residents ADD COLUMN avatar_id TEXT NOT NULL DEFAULT 'ember'");
  if (!residentColumns.includes('aura')) db.exec("ALTER TABLE residents ADD COLUMN aura TEXT NOT NULL DEFAULT 'gold'");
  if (!residentColumns.includes('avatar_set')) db.exec('ALTER TABLE residents ADD COLUMN avatar_set INTEGER NOT NULL DEFAULT 0');
  const battleColumns = db.prepare('PRAGMA table_info(battles)').all().map(row => row.name);
  for (const [name, definition] of Object.entries({
    player_avatar_id: "TEXT NOT NULL DEFAULT 'ember'",
    player_command: "TEXT NOT NULL DEFAULT ''",player_command_at:'INTEGER NOT NULL DEFAULT 0',
    last_step_at: 'INTEGER NOT NULL DEFAULT 0', last_move_at: 'INTEGER NOT NULL DEFAULT 0',
    player_x: 'REAL NOT NULL DEFAULT -1.6', player_z: 'REAL NOT NULL DEFAULT 0',
    enemy_x: 'REAL NOT NULL DEFAULT 1.6', enemy_z: 'REAL NOT NULL DEFAULT 0',
    heal_used: 'INTEGER NOT NULL DEFAULT 0',
    charge_started_at: 'INTEGER NOT NULL DEFAULT 0',
    enemy_attack_count: 'INTEGER NOT NULL DEFAULT 0',
    last_enemy_kind: "TEXT NOT NULL DEFAULT ''",
    last_enemy_hit: 'INTEGER NOT NULL DEFAULT 0',
    enemy_attack: 'TEXT', enemy_effect: 'TEXT',
  })) if (!battleColumns.includes(name)) db.exec(`ALTER TABLE battles ADD COLUMN ${name} ${definition}`);
  const invitationColumns = db.prepare('PRAGMA table_info(pvp_challenges)').all().map(row => row.name);
  if (!invitationColumns.includes('received_at')) db.exec('ALTER TABLE pvp_challenges ADD COLUMN received_at INTEGER');
  const pvpColumns = db.prepare('PRAGMA table_info(pvp_matches)').all().map(row => row.name);
  for (const name of ['a_avatar_id', 'b_avatar_id']) {
    if (!pvpColumns.includes(name)) db.exec(`ALTER TABLE pvp_matches ADD COLUMN ${name} TEXT NOT NULL DEFAULT 'ember'`);
  }
  for (const name of ['a_last_special', 'b_last_special', 'a_combo', 'b_combo', 'a_heal_used', 'b_heal_used', 'a_charge_started', 'b_charge_started', 'a_damage', 'b_damage']) {
    if (!pvpColumns.includes(name)) db.exec(`ALTER TABLE pvp_matches ADD COLUMN ${name} INTEGER NOT NULL DEFAULT 0`);
  }
  for (const name of ['a_agent_id', 'b_agent_id']) {
    if (!pvpColumns.includes(name)) db.exec(`ALTER TABLE pvp_matches ADD COLUMN ${name} TEXT`);
  }
  for (const name of ['token_address', 'token_check_block']) {
    if (!pvpColumns.includes(name)) db.exec(`ALTER TABLE pvp_matches ADD COLUMN ${name} TEXT`);
  }
  for (const name of ['a_holder_weight_bps', 'b_holder_weight_bps']) {
    if (!pvpColumns.includes(name)) db.exec(`ALTER TABLE pvp_matches ADD COLUMN ${name} INTEGER NOT NULL DEFAULT 0`);
  }
  for (const side of ['a', 'b']) {
    for (const field of ['attack', 'effect']) {
      if (!pvpColumns.includes(`${side}_${field}`)) db.exec(`ALTER TABLE pvp_matches ADD COLUMN ${side}_${field} TEXT`);
    }
    if (!pvpColumns.includes(`${side}_last_attack_kind`)) db.exec(`ALTER TABLE pvp_matches ADD COLUMN ${side}_last_attack_kind TEXT NOT NULL DEFAULT ''`);
    if (!pvpColumns.includes(`${side}_last_attack_at`)) db.exec(`ALTER TABLE pvp_matches ADD COLUMN ${side}_last_attack_at INTEGER NOT NULL DEFAULT 0`);
  }
  if (!db.prepare('SELECT 1 FROM city WHERE id = 1').get()) {
    db.prepare('INSERT INTO city(id,round,next_round_at,stability,district_level,active_event_id) VALUES(1,0,?,70,1,NULL)').run(Date.now() + roundMs);
  }
  initStudio(db);
  initJourney(db);
  initExpansion(db);
  if(!pvpColumns.includes('energy_required'))db.exec('ALTER TABLE pvp_matches ADD COLUMN energy_required INTEGER NOT NULL DEFAULT 0');
  if(!db.prepare('PRAGMA table_info(arena_signals)').all().some(c=>c.name==='points'))db.exec('ALTER TABLE arena_signals ADD COLUMN points INTEGER NOT NULL DEFAULT 2');
  initGameControl(db);
  initPlayScore(db);
  return db;
}

export function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
