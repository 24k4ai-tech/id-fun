// One game controller per identity. This grants no wallet or treasury permissions.
export function initGameControl(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS game_control (
    wallet TEXT PRIMARY KEY, mode TEXT NOT NULL CHECK(mode IN ('human','agent')),
    version INTEGER NOT NULL DEFAULT 1
  )`);
}
export function gameControl(db, wallet) {
  const available = Boolean(db.prepare('SELECT 1 FROM agent_keys WHERE wallet=? AND revoked_at IS NULL AND expires_at>? LIMIT 1').get(wallet, Date.now()));
  const row = db.prepare('SELECT mode,version FROM game_control WHERE wallet=?').get(wallet);
  return { mode: available ? row?.mode || 'agent' : 'human', version: row?.version || 0, agentAvailable: available };
}
export function setGameControl(db, wallet, mode) {
  if (!['human','agent'].includes(mode)) throw new Error('control_invalid');
  if (mode === 'agent' && !gameControl(db,wallet).agentAvailable) throw new Error('control_no_agent');
  db.prepare(`INSERT INTO game_control(wallet,mode,version) VALUES(?,?,1)
    ON CONFLICT(wallet) DO UPDATE SET mode=excluded.mode,version=game_control.version+1`).run(wallet,mode);
  return gameControl(db,wallet);
}
export function assertGameControl(db, wallet, agent, version) {
  if (!wallet) throw new Error('unauthorized');
  const state = gameControl(db,wallet);
  if (state.mode !== (agent ? 'agent' : 'human')) throw new Error('control_paused');
  if (version !== undefined && String(version) !== String(state.version)) throw new Error('control_changed');
  return state;
}
