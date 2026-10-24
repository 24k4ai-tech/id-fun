import { isAddress } from 'viem';
import { transaction } from './db.mjs';
import { validateDistributionManifest } from './reward-distributor.mjs';

// An epoch number alone does not identify a reward: chain, token and treasury
// must remain fixed for the lifetime of the persisted scan cursor and roots.
export function bindRewardLedger(db, config) {
  if (![config.gameTokenAddress, config.rewardTreasuryAddress].every(isAddress) ||
      !/^\d+$/.test(config.rewardFromBlock || '') || config.rewardPeriodSeconds !== 60)
    throw new Error('invalid_reward_ledger_domain');
  const domain = JSON.stringify({ chainId: 56, token: config.gameTokenAddress.toLowerCase(),
    treasury: config.rewardTreasuryAddress.toLowerCase(), periodSeconds: 60,
    fromBlock: String(BigInt(config.rewardFromBlock)) });
  db.exec('CREATE TABLE IF NOT EXISTS reward_ledger_domain(id INTEGER PRIMARY KEY CHECK(id=1),domain TEXT NOT NULL)');
  return transaction(db, () => {
    const existing = db.prepare('SELECT domain FROM reward_ledger_domain WHERE id=1').get();
    if (existing) {
      if (existing.domain !== domain) throw new Error('reward_ledger_domain_mismatch');
      return;
    }
    // Never guess which vault an older unbound database was scanning.
    if (db.prepare('SELECT 1 FROM reward_batches LIMIT 1').get() || db.prepare('SELECT 1 FROM reward_scan_cursor LIMIT 1').get())
      throw new Error('reward_ledger_migration_required');
    db.prepare('INSERT INTO reward_ledger_domain(id,domain) VALUES(1,?)').run(domain);
  });
}

export function validateWorkerManifest(manifest, epoch, config) {
  if (manifest?.chainId !== 56 || manifest?.periodSeconds !== 60 || manifest?.day !== epoch ||
      manifest?.treasuryAddress?.toLowerCase() !== config.rewardTreasuryAddress.toLowerCase())
    throw new Error('reward_manifest_domain_mismatch');
  validateDistributionManifest(manifest);
}
