import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db.mjs';
import { createResident } from '../server/game.mjs';
import { answerArenaSignal, arenaSignalState } from '../server/arena-signal.mjs';

test('arena signal rotates every 45 seconds, accepts one answer and awards game score only', () => {
  const db = openDatabase(':memory:');
  try {
    createResident(db, { wallet: 'demo:one', handle: '访客一', isDemo: true });
    const now = 45_000 * 10 + 100;
    const first = arenaSignalState(db, 'demo:one', now);
    assert.equal(first.options.length, 3);
    assert.equal('correct' in first, false);
    assert.equal(first.reward, 'game_score_only');
    const wrong = answerArenaSignal(db, 'demo:one', first.roundId, 'A', 'human', now);
    assert.equal(wrong.attempt.choice, 'A');
    assert.throws(() => answerArenaSignal(db, 'demo:one', first.roundId, 'B', 'human', now + 1), /signal_already_answered/);
    assert.equal(wrong.leaders.length, 0);
    assert.throws(() => answerArenaSignal(db, 'demo:one', first.roundId, 'A', 'human', now + 45_000), /signal_expired/);
    const next = arenaSignalState(db, 'demo:one', now + 45_000);
    assert.equal(next.roundId, first.roundId + 1);
    assert.equal(next.attempt, null);
    assert.equal(db.prepare('SELECT score FROM residents WHERE wallet=?').get('demo:one').score, wrong.correct ? 2 : 0);
  } finally { db.close(); }
});

test('correct agent answer appears in signal ranking without touching PVP reward records', () => {
  const db = openDatabase(':memory:');
  try {
    createResident(db, { wallet: '0x1111111111111111111111111111111111111111', handle: 'pilot.ai' });
    const now = 45_000 * 7 + 100;
    const before = arenaSignalState(db, '0x1111111111111111111111111111111111111111', now);
    const leak = [...before.clue.matchAll(/(甲|乙|丙) (\d+)→(\d+)/g)]
      .find(match => match[2] !== match[3]);
    const choice = before.options.find(option => option.text === `${leak[1]}通道`)?.id;
    assert.ok(choice);
    const after = answerArenaSignal(db, '0x1111111111111111111111111111111111111111', before.roundId, choice, 'agent', now);
    assert.equal(after.correct, true);
    assert.equal(after.stats.solved, 1);
    assert.equal(after.leaders[0].handle, 'pilot.ai');
    assert.equal(db.prepare('SELECT score FROM residents WHERE wallet=?').get('0x1111111111111111111111111111111111111111').score, 2);
    assert.equal(db.prepare('SELECT count(*) AS n FROM pvp_scores').get().n, 0);
  } finally { db.close(); }
});
