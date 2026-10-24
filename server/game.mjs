import {directPoints} from './play-score.mjs';
import { transaction } from './db.mjs';

export const ACTIONS = Object.freeze(['gather', 'scout', 'repair', 'build']);
export const ROLES = Object.freeze(['builder', 'explorer', 'merchant']);
export const AVATARS = Object.freeze(['ember', 'shadow', 'maker', 'trader', 'cz', 'heyi', 'sbf', 'musk', 'jensen', 'vitalik', 'trump','afeng']);
export const AURAS = Object.freeze(['gold', 'violet', 'blue', 'rose']);
const EVENT_TYPES = [
  { kind: 'blackout', title: '能源告急', description: '电站正在降温。运送材料或修理设施，守住城市供电。', favored: 'repair' },
  { kind: 'shortage', title: '物资短缺', description: '仓库库存下降。居民需要尽快寻找新物资。', favored: 'gather' },
  { kind: 'signal', title: '信号风暴', description: '城外出现异常信号。探索居民可以协助定位。', favored: 'scout' },
];

export function createResident(db, { wallet, handle, role = 'builder', isDemo = false, verifiedAi = false }, now = Date.now()) {
  if (!ROLES.includes(role)) throw new Error('invalid_role');
  const row = db.prepare('SELECT * FROM residents WHERE wallet = ?').get(wallet);
  if (row) {
    if (verifiedAi && !row.verified_ai) db.prepare('UPDATE residents SET handle=?,verified_ai=1 WHERE wallet=?').run(handle, wallet);
    return db.prepare('SELECT * FROM residents WHERE wallet = ?').get(wallet);
  }
  db.prepare(`INSERT INTO residents(wallet,handle,role,material,stamina,score,last_regen_at,last_action_at,is_demo,verified_ai,joined_at)
    VALUES(?,?,?,2,5,0,?,0,?,?,?)`).run(wallet, handle, role, now, isDemo ? 1 : 0, verifiedAi ? 1 : 0, now);
  return db.prepare('SELECT * FROM residents WHERE wallet = ?').get(wallet);
}

export function setRole(db, wallet, role) {
  if (!ROLES.includes(role)) throw new Error('invalid_role');
  return transaction(db, () => {
    const resident = db.prepare('SELECT role,last_action_at FROM residents WHERE wallet=?').get(wallet);
    if (!resident) throw new Error('resident_not_found');
    if (resident.last_action_at > 0) throw new Error('role_locked');
    db.prepare('UPDATE residents SET role=? WHERE wallet=?').run(role, wallet);
    return role;
  });
}

export function setAvatar(db, wallet, avatarId, aura) {
  if (!AVATARS.includes(avatarId) || !AURAS.includes(aura)) throw new Error('invalid_avatar');
  const changed = db.prepare('UPDATE residents SET avatar_id=?,aura=?,avatar_set=1 WHERE wallet=?').run(avatarId, aura, wallet);
  if (!changed.changes) throw new Error('resident_not_found');
  return { avatarId, aura };
}

function currentEvent(db, city) {
  return city.active_event_id ? db.prepare('SELECT * FROM events WHERE id = ?').get(city.active_event_id) : null;
}

function startEvent(db, city, next, now, roundMs) {
  const residents = db.prepare('SELECT count(*) AS n FROM residents WHERE is_demo = 0').get().n;
  const target = Math.max(4, Math.min(25, residents * 2));
  const result = db.prepare('INSERT INTO events(kind,title,description,starts_at,ends_at,target,progress,status) VALUES(?,?,?,?,?,?,0,\'active\')')
    .run(next.kind, next.title, next.description, now, now + roundMs * 5, target);
  db.prepare('UPDATE city SET active_event_id = ? WHERE id = 1').run(Number(result.lastInsertRowid));
  db.prepare("INSERT INTO actions(wallet,handle,kind,source,message,score_delta,created_at) VALUES('city','城市系统','event','system',?,0,?)")
    .run(`公共事件「${next.title}」出现，目标 ${target} 点。`, now);
}

export function advanceWorld(db, now = Date.now(), roundMs = 120_000) {
  if (!Number.isSafeInteger(roundMs) || roundMs < 5_000) throw new Error('invalid_round_ms');
  return transaction(db, () => {
    let city = db.prepare('SELECT * FROM city WHERE id = 1').get();
    if (!city.active_event_id && !db.prepare('SELECT 1 FROM events LIMIT 1').get()) {
      startEvent(db, city, EVENT_TYPES[0], now, roundMs);
      city = db.prepare('SELECT * FROM city WHERE id = 1').get();
    }
    let count = 0;
    while (now >= city.next_round_at && count < 180) {
      count++;
      const round = city.round + 1;
      const event = currentEvent(db, city);
      if (event?.status === 'active' && city.next_round_at >= event.ends_at) {
        db.prepare("UPDATE events SET status = 'failed' WHERE id = ? AND status = 'active'").run(event.id);
        const participated = db.prepare(`SELECT 1 FROM actions a JOIN residents r ON r.wallet=a.wallet
          WHERE r.is_demo=0 AND a.created_at>=? AND a.created_at<? LIMIT 1`).get(event.starts_at, event.ends_at);
        db.prepare(`UPDATE city SET stability = ${participated ? 'max(0, stability - 6)' : 'stability'}, active_event_id = NULL WHERE id = 1`).run();
        db.prepare("INSERT INTO actions(wallet,handle,kind,source,message,score_delta,created_at) VALUES('city','城市系统','event','system',?,0,?)")
          .run(participated ? `「${event.title}」未解决，城市稳定度下降。` : `「${event.title}」在无人参与时结束。`, city.next_round_at);
      }
      db.prepare('UPDATE city SET round = ?, next_round_at = ? WHERE id = 1').run(round, city.next_round_at + roundMs);
      city = db.prepare('SELECT * FROM city WHERE id = 1').get();
      if (!city.active_event_id && round % 5 === 0) {
        const next = EVENT_TYPES[Math.floor(round / 5) % EVENT_TYPES.length];
        startEvent(db, city, next, city.next_round_at - roundMs, roundMs);
      }
      city = db.prepare('SELECT * FROM city WHERE id = 1').get();
    }
    if (count === 180 && now >= city.next_round_at) {
      db.prepare('UPDATE city SET next_round_at = ? WHERE id = 1').run(now + roundMs);
    }
    if (!db.prepare('SELECT 1 FROM residents WHERE is_demo=0 LIMIT 1').get() && city.stability < 70) {
      db.prepare('UPDATE city SET stability=70 WHERE id=1').run();
      city = db.prepare('SELECT * FROM city WHERE id=1').get();
    }
    return city;
  });
}

export function action(db, wallet, kind, source = 'human', now = Date.now()) {
  if (!ACTIONS.includes(kind)) throw new Error('invalid_action');
  return transaction(db, () => {
    const player = db.prepare('SELECT * FROM residents WHERE wallet = ?').get(wallet);
    if (!player) throw new Error('resident_not_found');
    if (now - player.last_action_at < 20_000) throw new Error('action_cooldown');
    const regen = Math.max(0, Math.floor((now - player.last_regen_at) / 30_000));
    const stamina = Math.min(5, player.stamina + regen);
    if (stamina < 1) throw new Error('no_stamina');
    const regenAt = regen > 0 ? player.last_regen_at + regen * 30_000 : player.last_regen_at;
    let material = player.material;
    let score = 0;
    let message;
    let stability = 0;
    if (kind === 'gather') { const amount = player.role === 'merchant' ? 3 : 2; material += amount; score = 1; message = `${player.handle} 收集了 ${amount} 份材料。`; }
    if (kind === 'scout') { const amount = player.role === 'explorer' ? 2 : 1; material += amount; score = 2; message = `${player.handle} 探索城外，带回 ${amount} 份材料和情报。`; }
    if (kind === 'repair') {
      if (material < 2) throw new Error('not_enough_material');
      material -= 2; score = 3; stability = 3; message = `${player.handle} 修复了城市设施。`;
    }
    if (kind === 'build') {
      const cost = player.role === 'builder' ? 4 : 5;
      if (material < cost) throw new Error('not_enough_material');
      material -= cost; score = 5; stability = 2; message = `${player.handle} 建成了一处公共设施。`;
      db.prepare('UPDATE city SET district_level = district_level + 1 WHERE id = 1').run();
    }
    const city = db.prepare('SELECT * FROM city WHERE id = 1').get();
    const event = currentEvent(db, city);
    if (event?.status === 'active' && now < event.ends_at) {
      const favored = EVENT_TYPES.find(e => e.kind === event.kind)?.favored;
      if (kind === favored) {
        score += 2;
        const progress = event.progress + (kind === 'repair' ? 2 : 1);
        db.prepare('UPDATE events SET progress = ? WHERE id = ?').run(progress, event.id);
        message += ` 为「${event.title}」贡献了力量。`;
        if (progress >= event.target) {
          db.prepare("UPDATE events SET status = 'completed' WHERE id = ?").run(event.id);
          db.prepare('UPDATE city SET stability = min(100, stability + 7), active_event_id = NULL WHERE id = 1').run();
          message += ` 城市完成了「${event.title}」！`;
        }
      }
    }
    score=directPoints(score,source);
    db.prepare('UPDATE city SET stability = min(100, stability + ?) WHERE id = 1').run(stability);
    db.prepare('UPDATE residents SET material=?, stamina=?, score=score+?, last_regen_at=?, last_action_at=? WHERE wallet=?')
      .run(material, stamina - 1, score, regenAt, now, wallet);
    db.prepare('INSERT INTO actions(wallet,handle,kind,source,message,score_delta,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(wallet, player.handle, kind, source, message, score, now);
    return { message, score, material, stamina: stamina - 1 };
  });
}

export function state(db, wallet = null, now = Date.now()) {
  const city = db.prepare('SELECT * FROM city WHERE id = 1').get();
  const event = currentEvent(db, city);
  const leaders = db.prepare('SELECT handle,role,score,material,avatar_id,aura FROM residents WHERE is_demo=0 ORDER BY score DESC, joined_at ASC LIMIT 10').all();
  const logs = db.prepare('SELECT handle,kind,source,message,score_delta,created_at FROM actions ORDER BY id DESC LIMIT 30').all();
  let me = wallet ? db.prepare('SELECT wallet,handle,role,material,stamina,score,last_regen_at,last_action_at,is_demo,verified_ai,avatar_id,aura,avatar_set FROM residents WHERE wallet=?').get(wallet) : null;
  if (me) me = { ...me, stamina: Math.min(5, me.stamina + Math.floor(Math.max(0, now - me.last_regen_at) / 30_000)) };
  return { city, event, leaders, logs, me, now };
}
