import {beginPlayScore,recordPlayInput,earnedPoints,playScoreBps} from './play-score.mjs';
import { transaction } from './db.mjs';
import { RANGED, clampArena, meleeApproach } from './combat-rules.mjs';
import { weaponFor } from '../public/weapon-config.js';
import { createAttack, attackHits, readAttack } from './attack-rules.mjs';

export const OPPONENTS = Object.freeze({
  cz: { name: 'CZ · 链上掌舵人', hp: 380, damage: 6, tempo: 2100 },
  heyi: { name: '何一 · 紫电指挥官', hp: 420, damage: 7, tempo: 2050 },
  sbf: { name: 'SBF · 失控交易员', hp: 410, damage: 7, tempo: 2050 },
  musk: { name: '马斯克 · 火星机甲', hp: 460, damage: 8, tempo: 1950 },
  jensen: { name: '黄仁勋 · 芯片统帅', hp: 430, damage: 7, tempo: 2000 },
  vitalik: { name: 'V神 · 以太术师', hp: 400, damage: 7, tempo: 2050 },
  trump: { name: '特朗普 · 黄金挑战者', hp: 450, damage: 8, tempo: 1950 },
  afeng: { name:'阿峰 · 烈焰斗士',hp:440,damage:7,tempo:2000 },
});
const MATCH_MS = 120_000;
const COMMANDS = Object.freeze(['strike', 'charge', 'heavy', 'spell', 'arc', 'meteor', 'special', 'skill1', 'skill2', 'ultimate', 'heal', 'dodge', 'move']);
const distance = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const enemyKind = (count, gap) => count % 5 === 0 ? 'arc' : gap > 12 || count % 4 !== 0 ? 'spell' : 'strike';

function latest(db, wallet) {
  return db.prepare('SELECT * FROM battles WHERE wallet=? ORDER BY id DESC LIMIT 1').get(wallet);
}

function publicBattle(db,row, now, event = null) {
  if (!row) return null;
  return {
    id: row.id, opponentId: row.opponent_id, opponentName: OPPONENTS[row.opponent_id].name,
    playerAvatarId: row.player_avatar_id,
    playerCommand:{kind:row.player_command,at:row.player_command_at},chargeStartedAt:row.charge_started_at,
    playerHp: row.player_hp, enemyHp: row.enemy_hp, enemyMaxHp: OPPONENTS[row.opponent_id].hp,
    energy: row.energy, combo: row.combo, healAvailable: !row.heal_used,
    nextSpellAt: row.last_special_at + 1800,
    status: row.status, rewarded: Boolean(row.rewarded),
    contribution:row.rewarded?earnedPoints(db,'battle:'+row.id,row.wallet,8):0,
    playerX: row.player_x, playerZ: row.player_z, enemyX: row.enemy_x, enemyZ: row.enemy_z,
    startedAt: row.started_at, expiresAt: row.expires_at,
    nextEnemyAt: row.last_enemy_at + OPPONENTS[row.opponent_id].tempo,
    nextEnemyKind: enemyKind(row.enemy_attack_count + 1,
      distance(row.player_x, row.player_z, row.enemy_x, row.enemy_z)),
    enemyCast: row.status === 'active' ? readAttack(row.enemy_attack) : null,
    enemyAction: readAttack(row.enemy_effect),
    serverNow: now, event,
  };
}

function finish(db, row, status, source, now) {
  const player = db.prepare('SELECT handle,is_demo FROM residents WHERE wallet=?').get(row.wallet);
  let rewarded = 0;
  const points=earnedPoints(db,'battle:'+row.id,row.wallet,8);
  if (status === 'won') {
    const previous = db.prepare("SELECT ended_at FROM battles WHERE wallet=? AND status='won' AND rewarded=1 ORDER BY id DESC LIMIT 1").get(row.wallet);
    const today = new Date(now).toISOString().slice(0, 10);
    const daily = db.prepare("SELECT count(*) AS n FROM battles WHERE wallet=? AND status='won' AND rewarded=1 AND ended_at>=?").get(row.wallet, Date.parse(`${today}T00:00:00Z`)).n;
    rewarded = (!previous || now - previous.ended_at >= 60_000) && daily < 12 ? 1 : 0;
    if (rewarded) {
      db.prepare('UPDATE residents SET score=score+?,material=material+2 WHERE wallet=?').run(points,row.wallet);
      db.prepare('UPDATE city SET stability=min(100,stability+1) WHERE id=1').run();
      const city = db.prepare('SELECT active_event_id FROM city WHERE id=1').get();
      if (city.active_event_id) {
        const active = db.prepare("SELECT * FROM events WHERE id=? AND status='active'").get(city.active_event_id);
        if (active && now < active.ends_at) {
          const progress = active.progress + 1;
          db.prepare('UPDATE events SET progress=? WHERE id=?').run(progress, active.id);
          if (progress >= active.target) {
            db.prepare("UPDATE events SET status='completed' WHERE id=?").run(active.id);
            db.prepare('UPDATE city SET stability=min(100,stability+7),active_event_id=NULL WHERE id=1').run();
          }
        }
      }
    }
  }
  db.prepare('UPDATE battles SET status=?,rewarded=?,ended_at=? WHERE id=?').run(status, rewarded, now, row.id);
  db.prepare('INSERT INTO actions(wallet,handle,kind,source,message,score_delta,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(row.wallet, player.handle, 'battle', source,
      status === 'won' ? `${player.handle} 在 3D 竞技场击败了${OPPONENTS[row.opponent_id].name}${rewarded ? `，为城市赢得 ${points} 贡献和 2 材料。` : '。'}` : `${player.handle} 在竞技场败给了${OPPONENTS[row.opponent_id].name}。`,
      rewarded ? points : 0, now);
  return db.prepare('SELECT * FROM battles WHERE id=?').get(row.id);
}

function settle(db, row, source, now) {
  if (!row || row.status !== 'active') return row;
  if (now >= row.expires_at) return finish(db, row, 'lost', source, now);
  const rival = OPPONENTS[row.opponent_id];
  let pending = readAttack(row.enemy_attack);
  let effect = readAttack(row.enemy_effect);
  let hp = row.player_hp, lastEnemy = row.last_enemy_at, attackCount = row.enemy_attack_count;
  let lastKind = row.last_enemy_kind, lastHit = row.last_enemy_hit;
  // Settle before accepting a new movement/dodge command: a late command cannot
  // retroactively escape an impact. A cast keeps its original world position.
  const wasCasting = Boolean(pending);
  if (pending && now >= pending.impactAt) {
    lastHit = Number(attackHits(pending, row.player_x, row.player_z, row.dodge_until));
    if (lastHit) hp = Math.max(0, hp - pending.damage);
    lastEnemy = pending.impactAt;
    lastKind = pending.kind;
    effect = { ...pending, at: pending.impactAt, hit: Boolean(lastHit) };
    pending = null;
  }
  const elapsed = Math.min(2, Math.max(0, now - Math.max(row.last_step_at, row.started_at)) / 1000);
  const gap = distance(row.player_x, row.player_z, row.enemy_x, row.enemy_z);
  let enemyX = row.enemy_x, enemyZ = row.enemy_z;
  const spellNext = enemyKind(row.enemy_attack_count + 1, gap) !== 'strike';
  const desiredGap = row.enemy_attack_count === 0 ? 2.1
    : spellNext ? 8.5 : Math.max(1.35, weaponFor(row.opponent_id).reach - .5);
  if (!wasCasting && elapsed && gap > .01) {
    const delta = Math.max(-elapsed * 2, Math.min(elapsed * 2, gap - desiredGap));
    const strafe = Math.sin(now / 1100 + row.enemy_attack_count * 1.4) * elapsed * (gap > 10 ? .6 : gap < 3.2 ? .4 : 1.1);
    const next = clampArena(enemyX + (row.player_x - enemyX) / gap * delta - (row.player_z - enemyZ) / gap * strafe,
      enemyZ + (row.player_z - enemyZ) / gap * delta + (row.player_x - enemyX) / gap * strafe);
    enemyX = next.x; enemyZ = next.z;
  }
  if (!pending && hp && now >= lastEnemy + rival.tempo - 900) {
    const kind = enemyKind(attackCount + 1, gap);
    pending = createAttack(kind, { x: enemyX, z: enemyZ }, { x: row.player_x, z: row.player_z },
      now, rival.damage + (kind === 'arc' ? 5 : kind === 'spell' ? 2 : 0), weaponFor(row.opponent_id).reach + .3);
    attackCount++;
  }
  db.prepare('UPDATE battles SET player_hp=?,last_enemy_at=?,enemy_x=?,enemy_z=?,last_step_at=?,enemy_attack_count=?,last_enemy_kind=?,last_enemy_hit=?,enemy_attack=?,enemy_effect=? WHERE id=?')
    .run(hp, lastEnemy, enemyX, enemyZ, now, attackCount, lastKind, lastHit, pending ? JSON.stringify(pending) : null,
      effect ? JSON.stringify(effect) : null, row.id);
  row = db.prepare('SELECT * FROM battles WHERE id=?').get(row.id);
  if (!hp) return finish(db, row, 'lost', source, now);
  return row;
}

export function startBattle(db, wallet, opponentId = 'cz', now = Date.now()) {
  if (!Object.hasOwn(OPPONENTS, opponentId)) throw new Error('invalid_opponent');
  return transaction(db, () => {
    if (!db.prepare('SELECT 1 FROM residents WHERE wallet=?').get(wallet)) throw new Error('resident_not_found');
    const prior = settle(db, latest(db, wallet), 'system', now);
    if (prior?.status === 'active') throw new Error('battle_in_progress');
    const rival = OPPONENTS[opponentId];
    const avatar = db.prepare('SELECT avatar_id FROM residents WHERE wallet=?').get(wallet).avatar_id;
    const result = db.prepare(`INSERT INTO battles(wallet,opponent_id,player_avatar_id,player_hp,enemy_hp,started_at,expires_at,last_enemy_at,last_step_at,player_x,enemy_x)
      VALUES(?,?,?,100,?,?,?,?,?,-1.1,1.1)`).run(wallet, opponentId, avatar, rival.hp, now, now + MATCH_MS, now + 1500, now);
    beginPlayScore(db,'battle:'+Number(result.lastInsertRowid),wallet);
    return publicBattle(db,db.prepare('SELECT * FROM battles WHERE id=?').get(Number(result.lastInsertRowid)), now, 'start');
  });
}

export function battleState(db, wallet, now = Date.now()) {
  if (!wallet) return null;
  return transaction(db, () => publicBattle(db,settle(db, latest(db, wallet), 'system', now), now));
}

export function battleCommand(db, wallet, command, source = 'human', now = Date.now(), input = {}) {
  if (!COMMANDS.includes(command)) throw new Error('invalid_battle_command');
  return transaction(db, () => {
    let row = settle(db, latest(db, wallet), source, now);
    if (!row || row.status !== 'active') throw new Error('no_active_battle');
    recordPlayInput(db,'battle:'+row.id,wallet,source,now);
    if (command === 'move') {
      const dx = Number(input.dx), dz = Number(input.dz);
      if (!Number.isFinite(dx) || !Number.isFinite(dz) || Math.hypot(dx, dz) > 1.01 || Math.hypot(dx, dz) < .1) throw new Error('invalid_move');
      const seconds = Math.min(.22, Math.max(0, (now - (row.last_move_at || row.started_at)) / 1000));
      if (seconds < .045) throw new Error('battle_move_cooldown');
      const speed = input.sprint === true ? 7.2 : 5;
      const next = clampArena(row.player_x + dx * seconds * speed, row.player_z + dz * seconds * speed);
      db.prepare('UPDATE battles SET player_x=?,player_z=?,last_move_at=? WHERE id=?').run(next.x, next.z, now, row.id);
      return publicBattle(db,db.prepare('SELECT * FROM battles WHERE id=?').get(row.id), now, 'move');
    }
    db.prepare('UPDATE battles SET player_command=?,player_command_at=? WHERE id=?').run(command,now,row.id);
    if (command === 'charge') {
      db.prepare('UPDATE battles SET charge_started_at=? WHERE id=?').run(now, row.id);
      return publicBattle(db,db.prepare('SELECT * FROM battles WHERE id=?').get(row.id), now, 'charge');
    }
    if (now - row.last_command_at < (command === 'heavy' ? 620 : 350)) throw new Error('battle_command_cooldown');
    const weapon = weaponFor(row.player_avatar_id);
    if (command === 'strike' || command === 'heavy') {
      const step=meleeApproach({x:row.player_x,z:row.player_z},{x:row.enemy_x,z:row.enemy_z},weapon.reach,input.assist===true);
      row.player_x=step.x;row.player_z=step.z;
      db.prepare('UPDATE battles SET player_x=?,player_z=? WHERE id=?').run(step.x,step.z,row.id);
    }
    const reach = RANGED[command]?.range ?? (command === 'skill1' || command === 'special' ? 5 : command === 'skill2' || command === 'ultimate' ? 8 : weapon.reach);
    if (!['dodge', 'heal'].includes(command) && distance(row.player_x, row.player_z, row.enemy_x, row.enemy_z) > reach) throw new Error('battle_out_of_range');
    let event = command;
    if (['spell', 'arc', 'meteor', 'special', 'skill1', 'skill2', 'ultimate'].includes(command)) {
      const cost = RANGED[command]?.cost ?? (command === 'ultimate' ? 70 : command === 'skill2' ? 35 : 30);
      if (row.energy < cost) throw new Error('battle_not_enough_energy');
      if (now - row.last_special_at < 1800) throw new Error('battle_special_cooldown');
      const damage = RANGED[command]?.damage ?? (command === 'ultimate' ? 38 : command === 'skill2' ? 24 : 18);
      db.prepare('UPDATE battles SET enemy_hp=max(0,enemy_hp-?),energy=energy-?,combo=combo+1,last_command_at=?,last_special_at=? WHERE id=?')
        .run(damage, cost, now, now, row.id);
      event = `${command}:${damage}`;
    } else if (command === 'heal') {
      if (row.heal_used) throw new Error('battle_heal_used');
      db.prepare('UPDATE battles SET player_hp=min(100,player_hp+25),heal_used=1,last_command_at=? WHERE id=?').run(now, row.id);
    } else if (command === 'dodge') {
      if (now - row.last_dodge_at < 1100) throw new Error('battle_dodge_cooldown');
      const ax = Number(input.dx), az = Number(input.dz);
      const awayX = row.player_x - row.enemy_x, awayZ = row.player_z - row.enemy_z;
      const away = Math.hypot(awayX, awayZ) || 1;
      const vector = Number.isFinite(ax) && Number.isFinite(az) && Math.hypot(ax, az) > .1 && Math.hypot(ax, az) <= 1.01
        ? [ax, az] : [awayX / away, awayZ / away];
      const next = clampArena(row.player_x + vector[0] * 1.05, row.player_z + vector[1] * 1.05);
      db.prepare('UPDATE battles SET dodge_until=?,player_x=?,player_z=?,energy=min(100,energy+5),last_command_at=?,last_dodge_at=? WHERE id=?')
        .run(now + 620, next.x, next.z, now, now, row.id);
    } else if (command === 'heavy') {
      if (row.energy < 15) throw new Error('battle_not_enough_energy');
      const charge = row.charge_started_at ? Math.min(1200, Math.max(0, now - row.charge_started_at)) : 0;
      const damage = weapon.heavy + Math.min(4, row.combo) + Math.floor(charge / 240);
      db.prepare('UPDATE battles SET enemy_hp=max(0,enemy_hp-?),energy=energy-15,combo=combo+1,last_command_at=?,charge_started_at=0 WHERE id=?')
        .run(damage, now, row.id);
      event = `heavy:${damage}`;
    } else {
      const damage = weapon.strike - 2 + row.combo % 3;
      db.prepare('UPDATE battles SET enemy_hp=max(0,enemy_hp-?),energy=min(100,energy+15),combo=combo+1,last_command_at=? WHERE id=?')
        .run(damage, now, row.id);
      event = `strike:${damage}`;
    }
    row = db.prepare('SELECT * FROM battles WHERE id=?').get(row.id);
    if (row.enemy_hp === 0) row = finish(db, row, 'won', source, now);
    return publicBattle(db,row, now, event);
  });
}
