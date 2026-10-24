import test from 'node:test';
import assert from 'node:assert/strict';
import { createDryRunClaimLedger, simulateTaxPayout } from '../simulations/tax-payout.mjs';

const BNB = 10n ** 18n;
const wallet = n => `0x${n.toString(16).padStart(40, '0')}`;
const agent = (n, points, overrides = {}) => ({
  agentId: `agent${n}.ai`, gameWallet: wallet(n), resolvedWallet: wallet(n), points, approved: true, ...overrides,
});
const run = agents => simulateTaxPayout({ receivedWei: 5n * BNB, actualPlayerWei:3500000000000000000n, actualOperationsWei:1500000000000000000n, operatingWallet: wallet(99), agents });

test('5 BNB splits by approved Agent wallets, conserving every wei', () => {
  const result = run([agent(1, 50), agent(2, 30), agent(3, 20)]);
  assert.equal(result.operatingWei, 15n * BNB / 10n);
  assert.deepEqual(result.payouts.map(row => [row.wallet, row.amountWei]), [
    [wallet(1), 175n * BNB / 100n], [wallet(2), 105n * BNB / 100n], [wallet(3), 7n * BNB / 10n],
  ]);
  assert.equal(result.payouts.reduce((sum, row) => sum + row.amountWei, result.operatingWei + result.heldPlayerWei), 5n * BNB);
});

test('moved Agent ID and rejected match do not pay the old or new wallet', () => {
  const result = run([agent(1, 50), agent(2, 30, { resolvedWallet: wallet(8) }), agent(3, 20, { approved: false })]);
  assert.deepEqual(result.payouts.map(row => [row.wallet, row.amountWei]), [[wallet(1), 35n * BNB / 10n]]);
  assert.deepEqual(result.excluded.map(row => row.reason), ['agent_id_moved', 'match_not_approved']);
  assert.ok(!result.payouts.some(row => row.wallet === wallet(8)));
});

test('identity transfer before cutoff excludes that Agent and reallocates only among valid Agents', () => {
  const result = run([agent(1, 50), agent(2, 30), agent(3, 20, { resolvedWallet: wallet(8) })]);
  assert.deepEqual(result.payouts.map(row => [row.wallet, row.amountWei]), [
    [wallet(1), 21875n * BNB / 10000n], [wallet(2), 13125n * BNB / 10000n],
  ]);
  assert.equal(result.excluded[0].reason, 'agent_id_moved');
});

test('no eligible Agent holds the player share as a liability', () => {
  const result = run([agent(1, 50, { resolvedWallet: null })]);
  assert.deepEqual(result.payouts, []);
  assert.equal(result.heldPlayerWei, 35n * BNB / 10n);
  assert.equal(result.operatingWei, 15n * BNB / 10n);
});

test('colluding matches rejected by review cannot drain the player pool', () => {
  const result = run([agent(1, 50, { approved: false }), agent(2, 50, { approved: false })]);
  assert.equal(result.heldPlayerWei, 35n * BNB / 10n);
  assert.deepEqual(result.payouts, []);
  assert.deepEqual(result.excluded.map(row => row.reason), ['match_not_approved', 'match_not_approved']);
});

test('duplicate wallet or Agent ID stops snapshot instead of paying twice', () => {
  assert.throws(() => run([agent(1, 50), agent(2, 50, { gameWallet: wallet(1) })]), /duplicate_identity/);
  assert.throws(() => run([agent(1, 50), agent(2, 50, { agentId: 'agent1.ai' })]), /duplicate_identity/);
});

test('equal weights distribute one-wei dust deterministically', () => {
  const result = run([agent(3, 1), agent(1, 1), agent(2, 1)]);
  assert.deepEqual(result.payouts.map(row => row.amountWei), [
    1166666666666666667n, 1166666666666666667n, 1166666666666666666n,
  ]);
  assert.equal(result.payouts.reduce((sum, row) => sum + row.amountWei, 0n), 35n * BNB / 10n);
});

test('invalid destination or fabricated amount cannot enter a snapshot', () => {
  assert.throws(() => run([agent(1, 50, { resolvedWallet: '0xbroken' })]), /invalid_resolved_wallet/);
  assert.throws(() => run([agent(1, 50, { gameWallet: wallet(99) })]), /operating_wallet_is_player/);
  assert.throws(() => simulateTaxPayout({ receivedWei: 5, operatingWallet: wallet(99), agents: [] }), /invalid_received_wei/);
});

test('only the bound Agent wallet can claim once; a failed transfer remains claimable', () => {
  const snapshot = run([agent(1, 50), agent(2, 50)]);
  let failOnce = true;
  const sent = [];
  const ledger = createDryRunClaimLedger(snapshot, (destination, amountWei) => {
    if (failOnce) { failOnce = false; return false; }
    sent.push([destination, amountWei]);
    return true;
  });
  assert.throws(() => ledger.claim(wallet(3)), /no_claim_for_wallet/);
  assert.throws(() => ledger.claim(wallet(1)), /transfer_failed/);
  assert.equal(ledger.hasClaimed(wallet(1)), false);
  assert.equal(ledger.balanceWei(), 35n * BNB / 10n);
  assert.deepEqual(ledger.claim(wallet(1)), { wallet: wallet(1), amountWei: 175n * BNB / 100n });
  assert.throws(() => ledger.claim(wallet(1)), /already_claimed/);
  ledger.claim(wallet(2));
  assert.equal(ledger.balanceWei(), 0n);
  assert.deepEqual(sent, [[wallet(1), 175n * BNB / 100n], [wallet(2), 175n * BNB / 100n]]);
});

test('reentrant claim in the dry-run cannot collect twice', () => {
  const snapshot = run([agent(1, 100)]);
  let ledger;
  ledger = createDryRunClaimLedger(snapshot, () => {
    assert.throws(() => ledger.claim(wallet(1)), /already_claimed/);
    return true;
  });
  ledger.claim(wallet(1));
  assert.equal(ledger.balanceWei(), 0n);
});
