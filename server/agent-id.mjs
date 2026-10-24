import { isAddress } from 'viem';
import { transaction } from './db.mjs';

const NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.ai$/;

export async function resolveAgentId(requestedName, fetcher = fetch) {
  const name = String(requestedName || '').trim().toLowerCase();
  if (!NAME.test(name)) throw new Error('agent_id_invalid_name');
  let response;
  try {
    response = await fetcher(`https://nameapi.space.id/getAddress?domain=${encodeURIComponent(name)}`,
      { signal: AbortSignal.timeout(5000), headers: { Accept: 'application/json' } });
  } catch { throw new Error('agent_id_resolver_unavailable'); }
  if (!response.ok) throw new Error('agent_id_resolver_unavailable');
  let result;
  try { result = await response.json(); }
  catch { throw new Error('agent_id_resolver_unavailable'); }
  // SPACE ID: 1 means no record; -1 means an upstream error. Never exclude a
  // player from a financial snapshot just because the resolver is failing.
  if (result?.code === 1) throw new Error('agent_id_not_found');
  if (result?.code !== 0 || !result.address) throw new Error('agent_id_resolver_unavailable');
  if (!isAddress(result.address)) throw new Error('agent_id_resolver_unavailable');
  if (/^0x0{40}$/i.test(result.address)) throw new Error('agent_id_not_found');
  return { name, address: result.address.toLowerCase() };
}

export async function claimAgentId(db, wallet, requestedName, fetcher = fetch) {
  const player = db.prepare('SELECT wallet,is_demo FROM residents WHERE wallet=?').get(wallet);
  if (!player || player.is_demo || !isAddress(wallet)) throw new Error('agent_id_requires_wallet');
  const { name, address } = await resolveAgentId(requestedName, fetcher);
  if (address !== wallet.toLowerCase()) throw new Error('agent_id_wallet_mismatch');

  return transaction(db, () => {
    const previous = db.prepare('SELECT wallet FROM residents WHERE lower(handle)=? AND wallet<>?').get(name, wallet);
    if (previous) {
      const fallback = `${previous.wallet.slice(0, 6)}…${previous.wallet.slice(-4)}`;
      db.prepare('UPDATE residents SET handle=?,verified_ai=0 WHERE wallet=?').run(fallback, previous.wallet);
    }
    db.prepare('UPDATE residents SET handle=?,verified_ai=1 WHERE wallet=?').run(name, wallet);
    return { name, wallet, verifiedAi: true };
  });
}
