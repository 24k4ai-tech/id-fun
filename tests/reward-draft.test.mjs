import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db.mjs';
import { createResident } from '../server/game.mjs';
import { createChallenge, resolveChallenge } from '../server/pvp.mjs';
import { rewardCandidates, scoreApprovedMatches } from '../server/reward-candidates.mjs';
import { buildRewardDraft } from '../server/reward-draft.mjs';

const DAY = 86_400_000;
const BNB = 10n ** 18n;
const wallet = n => `0x${n.toString(16).padStart(40, '0')}`;

function fixture() {
  const db = openDatabase(':memory:');
  const start = 2 * DAY;
  createResident(db, { wallet: wallet(1), handle: 'alpha.ai', verifiedAi: true }, start);
  createResident(db, { wallet: wallet(2), handle: 'beta.ai', verifiedAi: true }, start);
  return { db, start };
}

function finishMatch(db, start, index, { aDamage = 100, bDamage = 10, winner = wallet(1),
  aWeight = 10_000, bWeight = 10_000 } = {}) {
  const at = start + index * 10_000 + 1_000;
  const challenge = createChallenge(db, wallet(1), wallet(2), at);
  const match = resolveChallenge(db, wallet(2), challenge.id, 'accept', at + 1,
    { tokenAddress: wallet(40), blockNumber: 100n, weights: [aWeight, bWeight] }).match;
  db.prepare(`UPDATE pvp_matches SET status='finished',finished_at=?,a_damage=?,b_damage=?,
    winner_wallet=?,a_points=10,b_points=2 WHERE id=?`).run(at + 4_000, aDamage, bDamage, winner, match.id);
  return match.id;
}

test('reward candidate uses match-time Agent IDs and requires explicit match approval', () => {
  const { db, start } = fixture();
  try {
    const id = finishMatch(db, start, 0);
    db.prepare('UPDATE residents SET handle=?,verified_ai=0 WHERE wallet=?').run('old-name', wallet(1));
    const candidates = rewardCandidates(db, start);
    assert.equal(candidates.matches[0].a.agentId, 'alpha.ai');
    assert.deepEqual(scoreApprovedMatches(candidates, []), []);
    assert.deepEqual(scoreApprovedMatches(candidates, [id]).map(row => row.combatPoints), [5, 1]);
    assert.deepEqual(scoreApprovedMatches(candidates, [id]).map(row => row.points), [50_000, 10_000]);
    assert.throws(() => scoreApprovedMatches(candidates, [id, id]), /invalid_reviewed_match/);
  } finally { db.close(); }
});

test('any positive holding qualifies and a capped holder bonus raises payout weight', async () => {
  const { db, start } = fixture();
  try {
    const noToken = finishMatch(db, start, 0, { aWeight: 0 });
    const draw = finishMatch(db, start, 1, { winner: null, bWeight: 20_000 });
    const candidates = rewardCandidates(db, start, wallet(40));
    assert.deepEqual(candidates.matches.map(row => row.id), [draw]);
    assert.deepEqual(candidates.rejected, [{ id: noToken, reason: 'token_not_held_at_entry' }]);
    const draft = await buildRewardDraft({ db, dayStart: start, tokenAddress: wallet(40),
      receivedWei: 5n * BNB, actualPlayerWei:3500000000000000000n, actualOperationsWei:1500000000000000000n, operatingWallet: wallet(99),
      resolveName: async name => name === 'alpha.ai' ? wallet(1) : wallet(2) });
    assert.deepEqual(draft.scoreEvidence.map(row => row.combatPoints), [1.5, 1.5]);
    assert.deepEqual(draft.scoreEvidence.map(row => row.weightedPoints), [15_000, 30_000]);
    const playerPoolWei = 35n * BNB / 10n;
    assert.deepEqual(draft.payouts.map(row => row.amountWei),
      [playerPoolWei / 3n + 1n, playerPoolWei - (playerPoolWei / 3n + 1n)]);
  } finally { db.close(); }
});

test('daily pair cap rejects a fourth match even if all have practice points', () => {
  const { db, start } = fixture();
  try {
    for (let i = 0; i < 4; i++) finishMatch(db, start, i);
    const candidates = rewardCandidates(db, start);
    assert.equal(candidates.matches.length, 3);
    assert.equal(candidates.rejected[0].reason, 'pair_daily_limit');
  } finally { db.close(); }
});

test('daily draft holds player funds when review is empty or an Agent ID moved', async () => {
  const { db, start } = fixture();
  try {
    const id = finishMatch(db, start, 0);
    const input = { db, dayStart: start, receivedWei: 5n * BNB, actualPlayerWei:3500000000000000000n, actualOperationsWei:1500000000000000000n, operatingWallet: wallet(99) };
    const noReview = await buildRewardDraft({ ...input, approvedMatchIds: [], resolveName: async () => { throw new Error('should_not_resolve'); } });
    assert.equal(noReview.heldPlayerWei, 35n * BNB / 10n);
    assert.deepEqual(noReview.payouts, []);
    const moved = await buildRewardDraft({ ...input, approvedMatchIds: [id], resolveName: async name => name === 'alpha.ai' ? wallet(8) : wallet(2) });
    assert.equal(moved.holdReason, 'minimum_agents_not_met');
    assert.equal(moved.heldPlayerWei, 35n * BNB / 10n);
    await assert.rejects(buildRewardDraft({ ...input, approvedMatchIds: [id], resolveName: async () => { throw new Error('resolver_unavailable'); } }), /resolver_unavailable/);
  } finally { db.close(); }
});

test('reviewed, reverified match produces a wallet-bound draft with exact accounting', async () => {
  const { db, start } = fixture();
  try {
    const id = finishMatch(db, start, 0);
    const result = await buildRewardDraft({
      db, dayStart: start, approvedMatchIds: [id], receivedWei: 5n * BNB, actualPlayerWei:3500000000000000000n, actualOperationsWei:1500000000000000000n, operatingWallet: wallet(99),
      resolveName: async name => name === 'alpha.ai' ? wallet(1) : wallet(2),
    });
    assert.equal(result.status, 'draft_only');
    assert.equal(result.payouts.length, 2);
    assert.deepEqual(result.approvedMatchIds, [id]);
    assert.deepEqual(result.scoreEvidence.map(row => row.matchIds), [[id], [id]]);
    assert.equal(result.payouts.reduce((sum, row) => sum + row.amountWei, 0n), 35n * BNB / 10n);
    assert.equal(result.operatingWei, 15n * BNB / 10n);
  } finally { db.close(); }
});

test('automatic rules select eligible matches without owner review', async () => {
  const { db, start } = fixture();
  try {
    const id = finishMatch(db, start, 0);
    finishMatch(db, start, 1, { bDamage: 0 });
    const result = await buildRewardDraft({ db, dayStart: start, receivedWei: 5n * BNB, actualPlayerWei:3500000000000000000n, actualOperationsWei:1500000000000000000n,
      operatingWallet: wallet(99), resolveName: async name => name === 'alpha.ai' ? wallet(1) : wallet(2) });
    assert.equal(result.selectionMode, 'automatic_rules');
    assert.deepEqual(result.approvedMatchIds, [id]);
    assert.equal(result.rejectedMatches[0].reason, 'insufficient_combat');
    assert.equal(result.payouts.length, 2);
  } finally { db.close(); }
});
