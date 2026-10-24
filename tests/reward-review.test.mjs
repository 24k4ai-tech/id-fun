import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db.mjs';
import { createResident } from '../server/game.mjs';
import { createChallenge, resolveChallenge } from '../server/pvp.mjs';
import { BSC_SPLIT_VAULT_FACTORY, verifyFlapVault } from '../server/flap-vault.mjs';
import { dispatchFlapTax } from '../server/flap-tax-dispatch.mjs';
import { buildReviewedRewardPackage } from '../server/reward-review.mjs';

const wallet = n => `0x${n.toString(16).padStart(40, '0')}`;
const BNB = 10n ** 18n;
const DAY = 86_400_000;

function fixture() {
  const db = openDatabase(':memory:');
  const start = 2 * DAY;
  createResident(db, { wallet: wallet(1), handle: 'alpha.ai', verifiedAi: true }, start);
  createResident(db, { wallet: wallet(2), handle: 'beta.ai', verifiedAi: true }, start);
  const challenge = createChallenge(db, wallet(1), wallet(2), start + 1_000);
  const match = resolveChallenge(db, wallet(2), challenge.id, 'accept', start + 1_001,
    { tokenAddress: wallet(40), blockNumber: 100n, weights: [10_000, 10_000] }).match;
  db.prepare(`UPDATE pvp_matches SET status='finished',finished_at=?,winner_wallet=?,a_damage=100,b_damage=10 WHERE id=?`)
    .run(start + 5_000, wallet(1), match.id);
  return { db, start, matchId: match.id };
}

function client({ mappedVault = wallet(50), chainId = 56, published = false, unallocatedWei = 35n * BNB / 10n,
  dayUnallocatedWei = unallocatedWei, playerWei = 35n * BNB / 10n, renounced = true, enabled = true,
  firstTimestamp = 2 * DAY / 1000 - 1, lastTimestamp = 3 * DAY / 1000 + 1 } = {}) {
  return {
    getChainId: async () => chainId,
    getBalance: async () => 5n * BNB,
    readContract: async input => ({ accountedWei:5n*BNB,operationsWei:15n*BNB/10n,operations: wallet(99), rewardAccountingEnabled: enabled,
      playerWithdrawalRenounced: renounced, unallocatedPlayerWei: unallocatedWei, unallocatedByDayWei: dayUnallocatedWei,
      playerLiabilityWei: 35n * BNB / 10n, epochs: [published ? `0x${'a'.repeat(64)}` : `0x${'0'.repeat(64)}`, 0n, 0n, 0n],
      taxProcessor: wallet(61), marketAddress: wallet(50), getQuoteToken: wallet(0), rewardAsset: wallet(0),
      tryGetVault: [true, { vault: mappedVault, vaultFactory: wallet(51), description: 'Arena', isOfficial: false, riskLevel: 0 }],
    })[input.functionName],
    getBytecode: async () => '0x6000',
    getBlockNumber: async () => 120n,
    getBlock: async ({ blockNumber }) => ({ timestamp: BigInt(blockNumber === 99n ? firstTimestamp :
      blockNumber === 101n ? lastTimestamp : 2 * DAY / 1000 + 10) }),
    getLogs: async () => [{ address: wallet(50), blockNumber: 100n, logIndex: 0,
      transactionHash: `0x${'a'.repeat(64)}`,
      args: { trigger: wallet(60), amountWei: 5n * BNB, playerWei, operationsWei: 5n * BNB - playerWei } }],
  };
}

test('Flap mapping and chain must match the expected Vault', async () => {
  const inputs = { tokenAddress: wallet(40), vaultAddress: wallet(50) };
  assert.equal((await verifyFlapVault(client(), inputs)).vaultAddress, wallet(50));
  await assert.rejects(verifyFlapVault(client({ mappedVault: wallet(80) }), inputs), /flap_vault_mismatch/);
  await assert.rejects(verifyFlapVault(client({ chainId: 97 }), inputs), /wrong_chain/);
  const direct = client();
  direct.readContract = async input => ({ tryGetVault: [false, {}], taxProcessor: wallet(61),
    marketAddress: wallet(50), getQuoteToken: wallet(0), rewardAsset: wallet(0) })[input.functionName];
  assert.equal((await verifyFlapVault(direct, inputs)).route, 'direct-beneficiary');
  direct.readContract = async input => ({ tryGetVault: [true, { vault: wallet(50), vaultFactory: wallet(0),
    description: 'Direct', isOfficial: false, riskLevel: 0 }], taxProcessor: wallet(61),
    marketAddress: wallet(50), getQuoteToken: wallet(0), rewardAsset: wallet(0) })[input.functionName];
  assert.equal((await verifyFlapVault(direct, inputs)).route, 'direct-beneficiary');
  direct.readContract = async input => ({ tryGetVault: [false, {}], taxProcessor: wallet(61),
    marketAddress: wallet(8), getQuoteToken: wallet(0), rewardAsset: wallet(0) })[input.functionName];
  await assert.rejects(verifyFlapVault(direct, inputs), /flap_vault_mismatch/);
  direct.readContract = async input => ({ tryGetVault: [false, {}], taxProcessor: wallet(61),
    marketAddress: wallet(50), getQuoteToken: wallet(8), rewardAsset: wallet(0) })[input.functionName];
  await assert.rejects(verifyFlapVault(direct, inputs), /flap_vault_mismatch/);
});

test('official Flap Split Vault must forward 100% to the game treasury', async () => {
  const inputs = { tokenAddress: wallet(40), vaultAddress: wallet(50) };
  const splitClient = client();
  let recipients = [{ recipient: wallet(50), bps: 10_000, accumulated: 0n, claimed: 0n }];
  let quote = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
  splitClient.readContract = async input => ({ tryGetVault: [true, { vault: wallet(70),
    vaultFactory: BSC_SPLIT_VAULT_FACTORY, description: 'Split', isOfficial: true, riskLevel: 0 }],
    taxProcessor: wallet(61), marketAddress: wallet(70), getQuoteToken: quote, rewardAsset: wallet(0),
    taxToken: wallet(40), factory: BSC_SPLIT_VAULT_FACTORY, getRecipientsInfo: recipients,
  })[input.functionName];
  const verified = await verifyFlapVault(splitClient, inputs);
  assert.equal(verified.route, 'official-split-vault-100');
  assert.equal(verified.flapVaultAddress, wallet(70));
  for (const unsupported of ['0xce24439f2d9c6a2289f741120fe202248b666666', '0x4902c5ebc598265ed2212b559b042de8a5eeec3f']) {
    quote = unsupported;
    await assert.rejects(verifyFlapVault(splitClient, inputs), /flap_vault_mismatch/);
  }
  quote = wallet(0);
  recipients = [{ recipient: wallet(50), bps: 7_000 }, { recipient: wallet(99), bps: 3_000 }];
  await assert.rejects(verifyFlapVault(splitClient, inputs), /flap_split_recipient_mismatch/);
  recipients = [{ recipient: wallet(99), bps: 10_000 }];
  await assert.rejects(verifyFlapVault(splitClient, inputs), /flap_split_recipient_mismatch/);
});

test('Split Vault keeper dispatches only after verifying token and treasury mapping', async () => {
  const splitClient = client();
  splitClient.readContract = async input => ({ tryGetVault: [true, { vault: wallet(70),
    vaultFactory: BSC_SPLIT_VAULT_FACTORY, description: 'Split', isOfficial: true, riskLevel: 0 }],
    taxProcessor: wallet(61), marketAddress: wallet(70), getQuoteToken: wallet(0), rewardAsset: wallet(0),
    taxToken: wallet(40), factory: BSC_SPLIT_VAULT_FACTORY,
    accountedWei: 5n * BNB, getRecipientsInfo: [{ recipient: wallet(50), bps: 10_000 }], userBalances: [5n * BNB, 0n],
  })[input.functionName];
  let calls = 0;
  splitClient.simulateContract = async input => { calls++; assert.equal(input.functionName, 'dispatch'); return { request: input }; };
  splitClient.waitForTransactionReceipt = async () => ({ status: 'success' });
  const options = { client: splitClient, tokenAddress: wallet(40), vaultAddress: wallet(50) };
  const preview=await dispatchFlapTax(options);
  assert.equal(preview.status, 'ready');
  assert.equal(preview.data,'0xe9c4a3ac');assert.equal(preview.value,'0x0');assert.equal(preview.chainId,56);
  assert.equal(preview.splitVault,wallet(70));assert.equal(preview.vaultAddress,wallet(50));
  assert.equal(calls, 0);
  const walletClient = { account: { address: wallet(9) }, writeContract: async () => `0x${'1'.repeat(64)}` };
  assert.equal((await dispatchFlapTax({ ...options, walletClient, broadcast: true })).status, 'dispatched');
  assert.equal(calls, 1);
});

test('review package links Flap Vault receipts, matches, fresh Agent IDs and Merkle claims', async () => {
  const { db, start, matchId } = fixture();
  try {
    const result = await buildReviewedRewardPackage({ client: client(), db, dayStart: start,
      approvedMatchIds: [matchId], tokenAddress: wallet(40), vaultAddress: wallet(50), fromBlock: 99n, toBlock: 101n,
      fetcher: async url => ({ ok: true, json: async () => ({ code: 0,
        address: url.includes('alpha.ai') ? wallet(1) : wallet(2) }) }),
    });
    assert.equal(result.status, 'prepared_only');
    assert.equal(result.revenue.receivedWei, 5n * BNB);
    assert.equal(result.revenueMode, 'reward_accounting');
    assert.equal(result.draft.payouts.length, 2);
    assert.equal(result.manifest.totalWei, String(35n * BNB / 10n));
    assert.equal(result.manifest.claims.length, 2);
  } finally { db.close(); }
});

test('daily package is generated automatically without match approvals', async () => {
  const { db, start, matchId } = fixture();
  try {
    const result = await buildReviewedRewardPackage({ client: client(), db, dayStart: start,
      tokenAddress: wallet(40), vaultAddress: wallet(50), fromBlock: 99n, toBlock: 101n,
      fetcher: async url => ({ ok: true, json: async () => ({ code: 0,
        address: url.includes('alpha.ai') ? wallet(1) : wallet(2) }) }),
    });
    assert.equal(result.status, 'prepared_only');
    assert.equal(result.draft.selectionMode, 'automatic_rules');
    assert.deepEqual(result.draft.approvedMatchIds, [matchId]);
    assert.equal(result.manifest.totalWei, String(35n * BNB / 10n));
  } finally { db.close(); }
});

test('review stops on incomplete day, prior root, and spent player allocation', async () => {
  const { db, start, matchId } = fixture();
  const input = { db, dayStart: start, approvedMatchIds: [matchId], tokenAddress: wallet(40),
    vaultAddress: wallet(50), fromBlock: 99n, toBlock: 101n };
  try {
    await assert.rejects(buildReviewedRewardPackage({ ...input, client: client({ lastTimestamp: 3 * DAY / 1000 - 1 }) }),
      /reward_day_blocks_incomplete/);
    await assert.rejects(buildReviewedRewardPackage({ ...input, client: client({ published: true }) }),
      /reward_epoch_already_published/);
    await assert.rejects(buildReviewedRewardPackage({ ...input, client: client({ unallocatedWei: 3n * BNB }) }),
      /reward_player_funds_unavailable/);
    await assert.rejects(buildReviewedRewardPackage({ ...input, client: client({ dayUnallocatedWei: 3n * BNB }) }),
      /reward_player_funds_unavailable/);
    await assert.rejects(buildReviewedRewardPackage({ ...input, client: client({ playerWei: 4n * BNB }) }),
      /reward_player_funds_unavailable/);
    await assert.rejects(buildReviewedRewardPackage({ ...input, client: client({ enabled: false }) }),
      /reward_accounting_not_active/);
    const testMode = await buildReviewedRewardPackage({ ...input, client: client({ renounced: false }),
      fetcher: async url => ({ ok: true, json: async () => ({ code: 0,
        address: url.includes('alpha.ai') ? wallet(1) : wallet(2) }) }) });
    assert.equal(testMode.treasury.renounced, false);
  } finally { db.close(); }
});

test('creator test fees stay creator-owned; a mixed transition day pays only protected receipts', async () => {
  const { db, start } = fixture();
  const input = { db, dayStart: start, tokenAddress: wallet(40), vaultAddress: wallet(50),
    fromBlock: 99n, toBlock: 101n,
    fetcher: async url => ({ ok: true, json: async () => ({ code: 0,
      address: url.includes('alpha.ai') ? wallet(1) : wallet(2) }) }) };
  try {
    const pre = await buildReviewedRewardPackage({ ...input,
      client: client({ playerWei: 0n, unallocatedWei: 0n, renounced: false, enabled: false }) });
    assert.equal(pre.revenueMode, 'creator_test');
    assert.equal(pre.draft.operatingWei, 5n * BNB);
    assert.equal(pre.manifest, null);
    const mixedClient = client({ playerWei: 0n, unallocatedWei: 7n * BNB / 10n });
    mixedClient.getLogs = async () => [
      { address: wallet(50), blockNumber: 100n, logIndex: 0, transactionHash: `0x${'a'.repeat(64)}`,
        args: { trigger: wallet(60), amountWei: 4n * BNB, playerWei: 0n, operationsWei: 4n * BNB } },
      { address: wallet(50), blockNumber: 100n, logIndex: 1, transactionHash: `0x${'b'.repeat(64)}`,
        args: { trigger: wallet(60), amountWei: 1n * BNB, playerWei: 7n * BNB / 10n,
          operationsWei: 3n * BNB / 10n } },
    ];
    const mixed = await buildReviewedRewardPackage({ ...input, client: mixedClient });
    assert.equal(mixed.revenueMode, 'mixed');
    assert.equal(mixed.revenue.receivedWei, 5n * BNB);
    assert.equal(mixed.manifest.totalWei, String(7n * BNB / 10n));
  } finally { db.close(); }
});

test('all Flap routing and treasury review reads use one pinned chain state',async()=>{
 const {db,start}=fixture(),rpc=client(),calls=[];
 const original=rpc.readContract;
 rpc.readContract=async input=>{calls.push(input);return original(input);};
 try{
  const result=await buildReviewedRewardPackage({client:rpc,db,dayStart:start,tokenAddress:wallet(40),vaultAddress:wallet(50),fromBlock:99n,toBlock:101n,
   fetcher:async url=>({ok:true,json:async()=>({code:0,address:url.includes('alpha.ai')?wallet(1):wallet(2)})})});
  assert.ok(calls.length>=10);assert.ok(calls.every(r=>r.blockNumber===120n));
  assert.equal(result.treasury.blockNumber,120n);
 }finally{db.close();}
});
