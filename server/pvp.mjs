import {beginPlayScore,recordPlayInput,earnedPoints,playScoreBps} from './play-score.mjs';
import { transaction } from './db.mjs';
import { publicAppearance } from './studio-store.mjs';
import { isAddress } from 'viem';
import { isHolderWeightBps } from './token-holder.mjs';
import { RANGED, clampArena, meleeApproach } from './combat-rules.mjs';
import { weaponFor } from '../public/weapon-config.js';
import { createAttack, attackHits, readAttack } from './attack-rules.mjs';
import {reserveActivity,finishActivity} from './activity-rewards.mjs';

const EPOCH_MS = 15 * 60_000;
const CHALLENGE_MS = 5 * 60_000;
const MATCH_MS = 120_000;
const distance = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const epochOf = now => Math.floor(now / EPOCH_MS) * EPOCH_MS;

function resident(db, wallet) {
  return db.prepare('SELECT wallet,handle,avatar_id,is_demo,verified_ai FROM residents WHERE wallet=?').get(wallet);
}

function activeMatch(db, wallet) {
  return db.prepare("SELECT * FROM pvp_matches WHERE status='active' AND (a_wallet=? OR b_wallet=?) ORDER BY id DESC LIMIT 1").get(wallet, wallet);
}

function finish(db, row, now) {
  if (row.status !== 'active') return row;
  const winner = row.a_hp === row.b_hp ? null : row.a_hp > row.b_hp ? row.a_wallet : row.b_wallet;
  const epoch = epochOf(now);
  const pairCount = db.prepare(`SELECT count(*) AS n FROM pvp_matches
    WHERE status='finished' AND a_damage>=10 AND b_damage>=10 AND (a_points>0 OR b_points>0)
    AND finished_at>=? AND finished_at<? AND
    ((a_wallet=? AND b_wallet=?) OR (a_wallet=? AND b_wallet=?))`)
    .get(epoch, epoch + EPOCH_MS, row.a_wallet, row.b_wallet, row.b_wallet, row.a_wallet).n;
  const a = resident(db, row.a_wallet), b = resident(db, row.b_wallet);
  const priorA = db.prepare('SELECT count(*) AS n FROM pvp_matches WHERE status=? AND finished_at>=? AND finished_at<? AND ((a_wallet=? AND a_points>0) OR (b_wallet=? AND b_points>0))')
    .get('finished', epoch, epoch + EPOCH_MS, a.wallet, a.wallet).n;
  const priorB = db.prepare('SELECT count(*) AS n FROM pvp_matches WHERE status=? AND finished_at>=? AND finished_at<? AND ((a_wallet=? AND a_points>0) OR (b_wallet=? AND b_points>0))')
    .get('finished', epoch, epoch + EPOCH_MS, b.wallet, b.wallet).n;
  const engaged = row.a_damage >= 10 && row.b_damage >= 10;
  const canScore = engaged && !a.is_demo && !b.is_demo && pairCount < 3;
  const points = player => !canScore || player.is_demo || (player.wallet === a.wallet ? priorA : priorB) >= 12
    ? 0 : winner === null ? 3 : winner === player.wallet ? 10 : 2;
  const aPoints = earnedPoints(db,'pvp:'+row.id,a.wallet,points(a)), bPoints = earnedPoints(db,'pvp:'+row.id,b.wallet,points(b));
  if(row.energy_required)for(const who of [row.a_wallet,row.b_wallet])finishActivity(db,`pvp:${row.id}:${who.toLowerCase()}`,row.id,0,[],now);
  db.prepare("UPDATE pvp_matches SET status='finished',winner_wallet=?,a_points=?,b_points=?,finished_at=? WHERE id=?")
    .run(winner, aPoints, bPoints, now, row.id);
  for (const [player, value] of [[a, aPoints], [b, bPoints]]) {
    if (!value) continue;
    db.prepare(`INSERT INTO pvp_scores(epoch_start,wallet,points,wins,matches) VALUES(?,?,?,?,1)
      ON CONFLICT(epoch_start,wallet) DO UPDATE SET points=points+excluded.points,wins=wins+excluded.wins,matches=matches+1`)
      .run(epoch, player.wallet, value, winner === player.wallet ? 1 : 0);
  }
  db.prepare('INSERT INTO actions(wallet,handle,kind,source,message,score_delta,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(a.wallet, a.handle, 'pvp', 'system',
      winner ? `${winner === a.wallet ? a.handle : b.handle} 在联机格斗中击败了${winner === a.wallet ? b.handle : a.handle}。` : `${a.handle} 与 ${b.handle} 联机战成平局。`,
      0, now);
  return db.prepare('SELECT * FROM pvp_matches WHERE id=?').get(row.id);
}

function settle(db, row, now) {
  if (!row || row.status !== 'active') return row;
  const due = ['a', 'b'].map(side => ({ side, attack: readAttack(row[`${side}_attack`]) }))
    .filter(({ attack }) => attack && attack.impactAt <= Math.min(now, row.expires_at))
    .sort((a, b) => a.attack.impactAt - b.attack.impactAt);
  let groupAt = -1, alive = {}, endedAt = null;
  for (const { side, attack } of due) {
    // Equal-time attacks trade. An attack after its caster was defeated cancels.
    if (attack.impactAt !== groupAt) {
      groupAt = attack.impactAt;
      alive = { a: row.a_hp > 0, b: row.b_hp > 0 };
    }
    const other = side === 'a' ? 'b' : 'a';
    const hit = alive[side] && alive[other] && attackHits(attack, row[`${other}_x`], row[`${other}_z`], row[`${other}_dodge_until`]);
    const actual = hit ? Math.min(attack.damage, row[`${other}_hp`]) : 0;
    const effect = { ...attack, at: attack.impactAt, hit: Boolean(hit) };
    db.prepare(`UPDATE pvp_matches SET ${other}_hp=${other}_hp-?,${side}_damage=${side}_damage+?,
      ${side}_combo=${side}_combo+?,${side}_energy=min(100,${side}_energy+?),${side}_attack=NULL,${side}_effect=? WHERE id=?`)
      .run(actual, actual, hit ? 1 : 0, hit && attack.kind === 'strike' ? 15 : 0, JSON.stringify(effect), row.id);
    row = db.prepare('SELECT * FROM pvp_matches WHERE id=?').get(row.id);
    if (endedAt === null && (row.a_hp <= 0 || row.b_hp <= 0)) endedAt = attack.impactAt;
  }
  if (now >= row.expires_at || row.a_hp <= 0 || row.b_hp <= 0)
    return finish(db, row, endedAt ?? Math.min(now, row.expires_at));
  return row;
}

// Run without a connected browser, and before financial snapshots. Persist the
// actual expiry/impact time so a delayed request cannot move points to a new day.
export function settlePvpMatches(db, now = Date.now()) {
  return transaction(db, () => {
    const rows = db.prepare("SELECT * FROM pvp_matches WHERE status='active' ORDER BY expires_at,id").all();
    for (const row of rows) settle(db, row, now);
  });
}

export function startPvpSettlement(db) {
  db.exec(`CREATE INDEX IF NOT EXISTS pvp_active_expiry ON pvp_matches(expires_at,id) WHERE status='active';
    CREATE INDEX IF NOT EXISTS pvp_reward_finished ON pvp_matches(finished_at,id) WHERE status='finished';`);
  const tick = () => {
    try { settlePvpMatches(db); }
    catch { console.error('PVP settlement deferred'); }
  };
  tick();
  const timer = setInterval(tick, 1000);
  timer.unref();
  return () => clearInterval(timer);
}

function present(db, row, wallet, now, event = null) {
  if (!row) return null;
  const meA = row.a_wallet === wallet;
  const mine = resident(db, wallet);
  const rival = resident(db, meA ? row.b_wallet : row.a_wallet);
  const myHp = meA ? row.a_hp : row.b_hp;
  const otherHp = meA ? row.b_hp : row.a_hp;
  return {
    mode: 'pvp', id: row.id, opponentId: meA ? row.b_avatar_id : row.a_avatar_id, opponentName: rival.handle,
    opponentWallet: rival.wallet, opponentVerifiedAi: Boolean(rival.verified_ai),
    playerAvatarId: meA ? row.a_avatar_id : row.b_avatar_id,
    playerCommand:{kind:row[`${meA?'a':'b'}_last_attack_kind`],at:row[`${meA?'a':'b'}_last_attack_at`]},chargeStartedAt:row[`${meA?'a':'b'}_charge_started`],
    playerAppearance:publicAppearance(db,wallet),opponentAppearance:publicAppearance(db,rival.wallet),
    playerHp: myHp, enemyHp: otherHp, enemyMaxHp: 100,
    energy: meA ? row.a_energy : row.b_energy,
    nextSpellAt: (meA ? row.a_last_special : row.b_last_special) + 1800,
    healAvailable: !(meA ? row.a_heal_used : row.b_heal_used),
    combo: meA ? row.a_combo : row.b_combo,
    playerX: meA ? row.a_x : row.b_x, playerZ: meA ? row.a_z : row.b_z,
    enemyX: meA ? row.b_x : row.a_x, enemyZ: meA ? row.b_z : row.a_z,
    status: row.status === 'active' ? 'active' : row.winner_wallet === null ? 'draw' : row.winner_wallet === wallet ? 'won' : 'lost',
    points: meA ? row.a_points : row.b_points,
    scored: row.status !== 'active' && Boolean((meA ? row.a_points : row.b_points)),
    engaged: row.a_damage >= 10 && row.b_damage >= 10,
    playerDamage: meA ? row.a_damage : row.b_damage,
    enemyDamage: meA ? row.b_damage : row.a_damage,
    enemyCast: row.status === 'active' ? readAttack(meA ? row.b_attack : row.a_attack) : null,
    playerCast: row.status === 'active' ? readAttack(meA ? row.a_attack : row.b_attack) : null,
    enemyAction: readAttack(meA ? row.b_effect : row.a_effect),
    playerAction: readAttack(meA ? row.a_effect : row.b_effect),
    rankedPractice: !mine.is_demo,
    rewardEligible: Boolean(row.a_agent_id && row.b_agent_id && row.a_holder_weight_bps && row.b_holder_weight_bps),
    startedAt: row.started_at, expiresAt: row.expires_at, serverNow: now, event,
  };
}

function expireChallenges(db, now) {
  db.prepare("UPDATE pvp_challenges SET status='expired' WHERE status='pending' AND expires_at<=?").run(now);
}

export function pvpLobby(db, wallet, now = Date.now()) {
  return transaction(db, () => {
    expireChallenges(db, now);
    const invitations = db.prepare(`SELECT c.id,c.challenger,c.created_at,c.expires_at,c.received_at,r.handle,r.avatar_id
      FROM pvp_challenges c JOIN residents r ON r.wallet=c.challenger
      WHERE c.target=? AND c.status='pending' ORDER BY c.id DESC LIMIT 10`).all(wallet);
    const outgoing = db.prepare(`SELECT c.id,c.target,c.created_at,c.expires_at,c.received_at,c.status,c.match_id,r.handle,r.avatar_id
      FROM pvp_challenges c JOIN residents r ON r.wallet=c.target
      WHERE c.challenger=? AND (c.status='pending' OR c.created_at>=?) ORDER BY c.id DESC LIMIT 10`).all(wallet,now-86400000);
    const epoch = epochOf(now);
    const leaders = db.prepare(`SELECT r.handle,r.avatar_id,r.verified_ai,s.points,s.wins,s.matches
      FROM pvp_scores s JOIN residents r ON r.wallet=s.wallet
      WHERE s.epoch_start=? ORDER BY s.points DESC,s.wins DESC,s.matches DESC LIMIT 20`).all(epoch);
    const mine = db.prepare('SELECT points,wins,matches FROM pvp_scores WHERE epoch_start=? AND wallet=?').get(epoch, wallet);
    return {
      invitations, outgoing, leaders, mine: mine || { points: 0, wins: 0, matches: 0 },
      serverNow: now,
      epochStart: epoch, epochEndsAt: epoch + EPOCH_MS,
      rewardEligible: false,
      match: present(db, settle(db, activeMatch(db, wallet), now), wallet, now),
    };
  });
}

function findTarget(db, value) {
  const query = String(value || '').trim();
  if (!query || query.length > 100) throw new Error('pvp_invalid_target');
  const exact = isAddress(query)
    ? db.prepare('SELECT wallet,handle,avatar_id,is_demo,verified_ai FROM residents WHERE lower(wallet)=?').get(query.toLowerCase())
    : resident(db, query);
  if (exact) return exact;
  const results = db.prepare('SELECT wallet,handle,avatar_id,is_demo,verified_ai FROM residents WHERE lower(handle)=lower(?) LIMIT 2').all(query);
  if (results.length !== 1) throw new Error(results.length ? 'pvp_ambiguous_target' : 'pvp_target_not_found');
  return results[0];
}

export function createChallenge(db, wallet, target, now = Date.now()) {
  return transaction(db, () => {
    expireChallenges(db, now);
    const challenger = resident(db, wallet);
    if (!challenger) throw new Error('unauthorized');
    const rival = findTarget(db, target);
    if (rival.wallet === wallet) throw new Error('pvp_self_challenge');
    if (settle(db, activeMatch(db, wallet), now)?.status === 'active' ||
        settle(db, activeMatch(db, rival.wallet), now)?.status === 'active') throw new Error('pvp_match_in_progress');
    const pending = db.prepare(`SELECT id FROM pvp_challenges WHERE status='pending' AND
      ((challenger=? AND target=?) OR (challenger=? AND target=?))`)
      .get(wallet, rival.wallet, rival.wallet, wallet);
    if (pending) throw new Error('pvp_challenge_pending');
    const count = db.prepare("SELECT count(*) AS n FROM pvp_challenges WHERE challenger=? AND status='pending'").get(wallet).n;
    if (count >= 5) throw new Error('pvp_too_many_challenges');
    const result = db.prepare('INSERT INTO pvp_challenges(challenger,target,created_at,expires_at) VALUES(?,?,?,?)')
      .run(wallet, rival.wallet, now, now + CHALLENGE_MS);
    return { id: Number(result.lastInsertRowid), targetWallet: rival.wallet, targetHandle: rival.handle, expiresAt: now + CHALLENGE_MS };
  });
}

// Explicit client receipt: fetching the lobby alone must not claim delivery.
// Only the invitation's authenticated recipient can acknowledge it.
export function receiveChallenge(db, wallet, id, now = Date.now()) {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('pvp_invalid_challenge');
  return transaction(db, () => {
    expireChallenges(db, now);
    const invitation = db.prepare('SELECT * FROM pvp_challenges WHERE id=?').get(id);
    if (!invitation || invitation.target !== wallet) throw new Error('unauthorized');
    if (invitation.status === 'pending' && invitation.received_at === null) {
      db.prepare('UPDATE pvp_challenges SET received_at=? WHERE id=?').run(now,id);
      invitation.received_at = now;
    }
    return { id, status: invitation.status, receivedAt: invitation.received_at };
  });
}

export function resolveChallenge(db, wallet, id, decision, now = Date.now(), holderCheck = null) {
  if (!Number.isSafeInteger(id) || id < 1 || !['accept', 'decline'].includes(decision)) throw new Error('pvp_invalid_challenge');
  return transaction(db, () => {
    expireChallenges(db, now);
    const challenge = db.prepare('SELECT * FROM pvp_challenges WHERE id=?').get(id);
    if (!challenge || challenge.status !== 'pending') throw new Error('pvp_challenge_unavailable');
    if (challenge.target !== wallet) throw new Error('unauthorized');
    if (decision === 'decline') {
      db.prepare("UPDATE pvp_challenges SET status='declined',received_at=coalesce(received_at,?) WHERE id=?").run(now,id);
      return { declined: true };
    }
    if (settle(db, activeMatch(db, challenge.challenger), now)?.status === 'active' ||
        settle(db, activeMatch(db, wallet), now)?.status === 'active') throw new Error('pvp_match_in_progress');
    if(db.prepare("SELECT 1 FROM moba_members m JOIN moba_rooms r ON r.id=m.room_id WHERE r.status='active' AND m.wallet IN (?,?)").get(challenge.challenger,wallet))throw new Error('activity_busy');
    const challenger = resident(db, challenge.challenger);
    const target = resident(db, wallet);
    const agentId = player => player.verified_ai && !player.is_demo && player.handle.endsWith('.ai') ? player.handle : null;
    const [aWeight, bWeight] = holderCheck?.weights || [0, 0];
    if (![aWeight, bWeight].every(isHolderWeightBps))
      throw new Error('invalid_token_holder_check');
    if (holderCheck && (!isAddress(holderCheck.tokenAddress) ||
        typeof holderCheck.blockNumber !== 'bigint' || holderCheck.blockNumber < 0n))
      throw new Error('invalid_token_holder_check');
    const result = db.prepare(`INSERT INTO pvp_matches(a_wallet,b_wallet,a_avatar_id,b_avatar_id,a_agent_id,b_agent_id,
      token_address,token_check_block,a_holder_weight_bps,b_holder_weight_bps,started_at,expires_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(challenge.challenger, wallet, challenger.avatar_id, target.avatar_id, agentId(challenger), agentId(target),
        holderCheck?.tokenAddress?.toLowerCase() || null, holderCheck?.blockNumber?.toString() || null,
        aWeight, bWeight, now, now + MATCH_MS);
    const matchId = Number(result.lastInsertRowid);
    for(const who of [challenge.challenger,wallet])beginPlayScore(db,'pvp:'+matchId,who);
    if(holderCheck?.energyRequired&&agentId(challenger)&&agentId(target)&&aWeight&&bWeight){
      for(const [p,weight] of [[challenger,aWeight],[target,bWeight]])reserveActivity(db,`pvp:${matchId}:${p.wallet.toLowerCase()}`,'duel',{
        wallet:p.wallet,agentId:agentId(p).toLowerCase(),token:holderCheck.tokenAddress,block:String(holderCheck.blockNumber),weight},now,[p.wallet===challenger.wallet?target.wallet:challenger.wallet]);
      db.prepare('UPDATE pvp_matches SET energy_required=1 WHERE id=?').run(matchId);
    }
    db.prepare("UPDATE pvp_challenges SET status='accepted',match_id=?,received_at=coalesce(received_at,?) WHERE id=?").run(matchId,now,id);
    db.prepare("UPDATE pvp_challenges SET status='expired' WHERE status='pending' AND (challenger IN (?,?) OR target IN (?,?))")
      .run(challenge.challenger, wallet, challenge.challenger, wallet);
    return { match: present(db, db.prepare('SELECT * FROM pvp_matches WHERE id=?').get(matchId), wallet, now, 'start') };
  });
}

export function pvpState(db, wallet, now = Date.now()) {
  return transaction(db, () => {
    const row = activeMatch(db, wallet) || db.prepare('SELECT * FROM pvp_matches WHERE a_wallet=? OR b_wallet=? ORDER BY id DESC LIMIT 1').get(wallet, wallet);
    return present(db, settle(db, row, now), wallet, now);
  });
}

export function pvpCommand(db, wallet, command, input = {}, now = Date.now(),source='human') {
  if (!['move', 'strike', 'charge', 'heavy', 'dodge', 'spell', 'arc', 'meteor', 'special', 'skill1', 'skill2', 'ultimate', 'heal'].includes(command)) throw new Error('invalid_battle_command');
  return transaction(db, () => {
    let row = settle(db, activeMatch(db, wallet), now);
    if (!row || row.status !== 'active') throw new Error('pvp_no_active_match');
    recordPlayInput(db,'pvp:'+row.id,wallet,source,now);
    const side = row.a_wallet === wallet ? 'a' : 'b';
    const other = side === 'a' ? 'b' : 'a';
    let gap = distance(row.a_x, row.a_z, row.b_x, row.b_z);
    if (command === 'move') {
      const dx = Number(input.dx), dz = Number(input.dz);
      if (!Number.isFinite(dx) || !Number.isFinite(dz) || Math.hypot(dx, dz) > 1.01 || Math.hypot(dx, dz) < .1) throw new Error('invalid_move');
      const seconds = Math.min(.22, Math.max(0, (now - (row[`${side}_last_move`] || row.started_at)) / 1000));
      if (seconds < .045) throw new Error('battle_move_cooldown');
      const speed = input.sprint === true ? 7.2 : 5;
      const next = clampArena(row[`${side}_x`] + dx * seconds * speed, row[`${side}_z`] + dz * seconds * speed);
      db.prepare(`UPDATE pvp_matches SET ${side}_x=?,${side}_z=?,${side}_last_move=? WHERE id=?`).run(next.x, next.z, now, row.id);
      return present(db, db.prepare('SELECT * FROM pvp_matches WHERE id=?').get(row.id), wallet, now, 'move');
    }
    db.prepare(`UPDATE pvp_matches SET ${side}_last_attack_kind=?,${side}_last_attack_at=? WHERE id=?`).run(command,now,row.id);
    if (command === 'charge') {
      db.prepare(`UPDATE pvp_matches SET ${side}_charge_started=? WHERE id=?`).run(now, row.id);
      return present(db, db.prepare('SELECT * FROM pvp_matches WHERE id=?').get(row.id), wallet, now, 'charge');
    }
    if (now - row[`${side}_last_command`] < (command === 'heavy' ? 620 : 350)) throw new Error('battle_command_cooldown');
    const weapon = weaponFor(row[`${side}_avatar_id`]);
    if (command === 'strike' || command === 'heavy') {
      const step=meleeApproach({x:row[`${side}_x`],z:row[`${side}_z`]},
        {x:row[`${other}_x`],z:row[`${other}_z`]},weapon.reach,input.assist===true);
      row[`${side}_x`]=step.x;row[`${side}_z`]=step.z;
      db.prepare(`UPDATE pvp_matches SET ${side}_x=?,${side}_z=? WHERE id=?`).run(step.x,step.z,row.id);
      gap=distance(row.a_x,row.a_z,row.b_x,row.b_z);
    }
    const reach = RANGED[command]?.range ?? (command === 'skill1' || command === 'special' ? 5 : command === 'skill2' || command === 'ultimate' ? 8 : weapon.reach);
    if (!['dodge', 'heal'].includes(command) && gap > reach) throw new Error('battle_out_of_range');
    let event = command;
    if (command === 'dodge') {
      if (now < row[`${side}_dodge_until`] + 430) throw new Error('battle_dodge_cooldown');
      const ax = Number(input.dx), az = Number(input.dz);
      const awayX = row[`${side}_x`] - row[`${other}_x`], awayZ = row[`${side}_z`] - row[`${other}_z`];
      const awayLength = Math.hypot(awayX, awayZ) || 1;
      const vector = Number.isFinite(ax) && Number.isFinite(az) && Math.hypot(ax, az) > .1 && Math.hypot(ax, az) <= 1.01
        ? [ax, az] : [awayX / awayLength, awayZ / awayLength];
      const next = clampArena(row[`${side}_x`] + vector[0] * 1.05, row[`${side}_z`] + vector[1] * 1.05);
      db.prepare(`UPDATE pvp_matches SET ${side}_dodge_until=?,${side}_x=?,${side}_z=?,${side}_last_command=? WHERE id=?`)
        .run(now + 620, next.x, next.z, now, row.id);
    } else if (command === 'heal') {
      if (row[`${side}_heal_used`]) throw new Error('battle_heal_used');
      db.prepare(`UPDATE pvp_matches SET ${side}_hp=min(100,${side}_hp+25),${side}_heal_used=1,${side}_last_command=? WHERE id=?`).run(now, row.id);
    } else {
      if (row[`${side}_attack`]) throw new Error('battle_command_cooldown');
      const energy = row[`${side}_energy`];
      const cost = RANGED[command]?.cost ?? (command === 'heavy' ? 15 : command === 'ultimate' ? 70 : command === 'skill2' ? 35 : ['skill1', 'special'].includes(command) ? 30 : 0);
      if (energy < cost) throw new Error('battle_not_enough_energy');
      const isSkill = ['spell', 'arc', 'meteor', 'special', 'skill1', 'skill2', 'ultimate'].includes(command);
      if (isSkill && now - row[`${side}_last_special`] < 1800) throw new Error('battle_special_cooldown');
      const charge = row[`${side}_charge_started`] ? Math.min(1200, Math.max(0, now - row[`${side}_charge_started`])) : 0;
      const damage = RANGED[command]?.damage ?? (command === 'ultimate' ? 42 : command === 'skill2' ? 26 : isSkill ? 19 : command === 'heavy' ? weapon.heavy + Math.floor(charge / 240) : weapon.strike);
      const attack = createAttack(command, { x: row[`${side}_x`], z: row[`${side}_z`] },
        { x: row[`${other}_x`], z: row[`${other}_z`] }, now, damage, reach);
      db.prepare(`UPDATE pvp_matches SET ${side}_energy=?,${side}_last_command=?,${side}_last_special=?,
        ${side}_charge_started=0,${side}_last_attack_kind=?,${side}_last_attack_at=?,${side}_attack=? WHERE id=?`)
        .run(energy - cost, now, isSkill ? now : row[`${side}_last_special`], command, now, JSON.stringify(attack), row.id);
      event = `${command}:windup`;
    }
    row = settle(db, db.prepare('SELECT * FROM pvp_matches WHERE id=?').get(row.id), now);
    return present(db, row, wallet, now, event);
  });
}
