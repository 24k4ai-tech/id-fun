import test from 'node:test';
import assert from 'node:assert/strict';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { concatHex, encodeAbiParameters, keccak256, parseAbiParameters } from 'viem';
import { simulateTaxPayout } from '../simulations/tax-payout.mjs';
import { buildClaimManifest } from '../server/reward-merkle.mjs';
import { classifyRevenueDay, revenueForDay, scanConfirmedRevenue } from '../server/vault-revenue.mjs';

const wallet = n => `0x${n.toString(16).padStart(40, '0')}`;
const BNB = 10n ** 18n;
const vault = wallet(50);
const event = (n, amountWei, playerWei, operationsWei) => ({
  address: vault, transactionHash: `0x${n.toString(16).padStart(64, '0')}`,
  logIndex: 0, blockNumber: 100n, args: { trigger: wallet(60), amountWei, playerWei, operationsWei },
});

test('confirmed Vault receipts conserve BNB and reject unconfirmed or duplicate logs', async () => {
  const good = event(1, 5n * BNB, 35n * BNB / 10n, 15n * BNB / 10n);
  const client = { getBlockNumber: async () => 120n, getLogs: async () => [good],
    getBlock: async () => ({ timestamp: 86_401n }) };
  const result = await scanConfirmedRevenue(client, { vaultAddress: vault, fromBlock: 100n, toBlock: 100n });
  assert.equal(result.receivedWei, 5n * BNB);
  assert.equal(result.playerWei, 35n * BNB / 10n);
  assert.equal(revenueForDay(result, 86_400_000).receivedWei, 5n * BNB);
  assert.equal(revenueForDay(result, 0).receivedWei, 0n);
  await assert.rejects(scanConfirmedRevenue(client, { vaultAddress: vault, fromBlock: 100n, toBlock: 110n }), /revenue_blocks_unconfirmed/);
  await assert.rejects(scanConfirmedRevenue({ ...client, getLogs: async () => [good, good] },
    { vaultAddress: vault, fromBlock: 100n, toBlock: 100n }), /duplicate_revenue_event/);
  await assert.rejects(scanConfirmedRevenue({ ...client, getLogs: async () => [event(2, 5n * BNB, 3n * BNB, 1n * BNB)] },
    { vaultAddress: vault, fromBlock: 100n, toBlock: 100n }), /invalid_revenue_event/);
});

test('daily accounting follows actual Vault event wei rather than recomputing the split', () => {
  const payout = simulateTaxPayout({ receivedWei: 1n, actualPlayerWei: 1n, actualOperationsWei: 0n,
    operatingWallet: wallet(99), agents: [] });
  assert.equal(payout.heldPlayerWei, 1n);
  assert.equal(payout.operatingWei, 0n);
  assert.throws(() => simulateTaxPayout({ receivedWei: 1n, actualPlayerWei: 1n, actualOperationsWei: 1n,
    operatingWallet: wallet(99), agents: [] }), /invalid_actual_split/);
  const noRevenue = simulateTaxPayout({ receivedWei: 0n, actualPlayerWei:0n, actualOperationsWei:0n, operatingWallet: wallet(99),
    agents: [1, 2].map(n => ({ agentId: `agent${n}.ai`, gameWallet: wallet(n),
      resolvedWallet: wallet(n), points: 10, approved: true })), minEligibleAgents: 2 });
  assert.equal(noRevenue.holdReason, 'no_player_revenue');
  assert.equal(noRevenue.payouts.length, 0);
  const dustOnly = simulateTaxPayout({ receivedWei: 1n, actualPlayerWei: 1n, actualOperationsWei: 0n,
    operatingWallet: wallet(99), agents: [1, 2].map(n => ({ agentId: `agent${n}.ai`, gameWallet: wallet(n),
      resolvedWallet: wallet(n), points: 10, approved: true })), minEligibleAgents: 2 });
  assert.equal(dustOnly.holdReason, 'minimum_positive_payouts_not_met');
  assert.equal(dustOnly.heldPlayerWei, 1n);
});

test('receipt classification uses supplied budgets and rejects non-conserving data',()=>{
 const rows=[{amountWei:11n,playerWei:0n,operationsWei:11n},{amountWei:13n,playerWei:8n,operationsWei:5n}];
 assert.equal(classifyRevenueDay({receipts:rows}),'mixed');
 assert.equal(classifyRevenueDay({receipts:[...rows].reverse()}),'mixed');
 assert.throws(()=>classifyRevenueDay({receipts:[{...rows[1],playerWei:9n}]}),/invalid_revenue_event/);
});

test('claim manifest binds amount to chain, treasury, day and Agent wallet', () => {
  const agents = [1, 2].map(n => ({ agentId: `agent${n}.ai`, gameWallet: wallet(n), resolvedWallet: wallet(n), points: n === 1 ? 10 : 2, approved: true }));
  const payout = simulateTaxPayout({ receivedWei: 5n * BNB, actualPlayerWei:3500000000000000000n, actualOperationsWei:1500000000000000000n, operatingWallet: wallet(99), agents, minEligibleAgents: 2 });
  const manifest = buildClaimManifest({ ...payout, status: 'draft_only', dayStart: 0 }, { treasuryAddress: vault });
  assert.equal(manifest.totalWei, String(35n * BNB / 10n));
  assert.equal(manifest.claims.length, 2);
  const types = ['uint256', 'address', 'uint256', 'address', 'uint256'];
  for (const claim of manifest.claims) {
    assert.equal(StandardMerkleTree.verify(manifest.root, types,
      ['56', vault, '0', claim.wallet, claim.amountWei], claim.proof), true);
    assert.equal(StandardMerkleTree.verify(manifest.root, types,
      ['56', vault, '0', wallet(8), claim.amountWei], claim.proof), false);
    let hash = keccak256(keccak256(encodeAbiParameters(parseAbiParameters('uint256,address,uint256,address,uint256'),
      [56n, vault, 0n, claim.wallet, BigInt(claim.amountWei)])));
    for (const sibling of claim.proof) {
      const pair = hash.toLowerCase() < sibling.toLowerCase() ? [hash, sibling] : [sibling, hash];
      hash = keccak256(concatHex(pair));
    }
    assert.equal(hash, manifest.root);
  }
  assert.throws(() => buildClaimManifest({ ...payout, status: 'draft_only', dayStart: 0, heldPlayerWei: 1n }, { treasuryAddress: vault }), /draft_not_publishable/);
});
