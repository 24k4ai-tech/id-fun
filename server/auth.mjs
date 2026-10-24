import {setGameControl} from './game-control.mjs';
import { createHash, randomBytes } from 'node:crypto';
import { createPublicClient, getAddress, http, isAddress, verifyMessage, verifyTypedData } from 'viem';
import { bsc } from 'viem/chains';
import { createResident } from './game.mjs';
import { claimAgentId } from './agent-id.mjs';

const HANDLE_ABI = [{ type: 'function', name: 'handleOf', stateMutability: 'view', inputs: [{ name: 'wallet', type: 'address' }], outputs: [{ type: 'string' }] }];
const hash = value => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('hex');
const LOGIN_TYPES = { GameLogin: [
  { name: 'origin', type: 'string' }, { name: 'wallet', type: 'address' },
  { name: 'nonce', type: 'bytes32' }, { name: 'expiresAt', type: 'uint256' },
  { name: 'pairHash', type: 'bytes32' },
] };

export function createAuth(db, config) {
  const client = createPublicClient({ chain: bsc, transport: http(config.rpcUrl, { timeout: 10_000 }) });
  const challenge = address => {
    if (!isAddress(address)) throw new Error('invalid_wallet');
    const wallet = getAddress(address);
    const nonce = random();
    const expiry = Date.now() + 5 * 60_000;
    const message = `ID FUN login\nOrigin: ${config.origin}\nWallet: ${wallet}\nNonce: ${nonce}\nExpires: ${new Date(expiry).toISOString()}\n\nSigning only proves wallet control. It cannot spend tokens.`;
    db.prepare('INSERT INTO nonces(nonce,wallet,message,expires_at) VALUES(?,?,?,?)').run(nonce, wallet, message, expiry);
    return { nonce, message };
  };
  const typedChallenge = (address, pairCode = null) => {
    if (!isAddress(address)) throw new Error('invalid_wallet');
    const wallet = getAddress(address);
    const pairHash = pairCode === null ? `0x${'00'.repeat(32)}` : hashPairCode(pairCode);
    if (pairCode !== null && !db.prepare('SELECT 1 FROM agent_pairs WHERE code_hash=? AND wallet IS NULL AND expires_at>?').get(pairHash, Date.now()))
      throw new Error('pair_invalid');
    const nonce = `0x${random()}`;
    const expiresAt = Date.now() + 5 * 60_000;
    const typedData = {
      domain: { name: 'ID FUN Game Access', version: '1', chainId: 56 },
      types: LOGIN_TYPES, primaryType: 'GameLogin',
      message: { origin: config.origin, wallet, nonce, expiresAt, pairHash },
    };
    db.prepare('INSERT INTO nonces(nonce,wallet,message,expires_at) VALUES(?,?,?,?)')
      .run(nonce, wallet, JSON.stringify({ kind: 'typed', typedData, pairHash }), expiresAt);
    return { nonce, typedData, signRequest: { method: 'eth_signTypedData_v4', params: [wallet, JSON.stringify(typedData)] } };
  };

  const resolveHandle = async wallet => {
    if (!config.agentRegistry) throw new Error('agent_registry_unconfigured');
    const name = await client.readContract({ address: config.agentRegistry, abi: HANDLE_ABI, functionName: 'handleOf', args: [wallet] });
    if (!name || typeof name !== 'string' || !/^[a-z0-9-]{1,64}(\.ai)?$/i.test(name)) throw new Error('agent_id_required');
    return name.endsWith('.ai') ? name : `${name}.ai`;
  };

  const verify = async ({ nonce, signature }) => {
    const row = db.prepare('SELECT * FROM nonces WHERE nonce=? AND expires_at>?').get(nonce, Date.now());
    if (!row) throw new Error('challenge_expired');
    db.prepare('DELETE FROM nonces WHERE nonce=?').run(nonce);
    if (row.message.startsWith('{"kind":"typed"')) throw new Error('bad_signature');
    let valid = false;
    try { valid = await verifyMessage({ address: row.wallet, message: row.message, signature }); } catch { /* contract wallets use RPC verification */ }
    if (!valid) {
      try { valid = await client.verifyMessage({ address: row.wallet, message: row.message, signature }); } catch { /* invalid signature */ }
    }
    if (!valid) throw new Error('bad_signature');
    const verifiedAi = Boolean(config.agentRegistry);
    const handle = verifiedAi ? await resolveHandle(row.wallet) : `${row.wallet.slice(0, 6)}…${row.wallet.slice(-4)}`;
    createResident(db, { wallet: row.wallet, handle, verifiedAi });
    const token = random();
    db.prepare('INSERT INTO sessions(token_hash,wallet,expires_at) VALUES(?,?,?)').run(hash(token), row.wallet, Date.now() + 7 * 86400_000);
    return { token, wallet: row.wallet, handle, verifiedAi };
  };
  const viewerCode = wallet => {
    db.prepare('DELETE FROM viewer_codes WHERE wallet=? OR expires_at<=?').run(wallet, Date.now());
    const code = randomBytes(12).toString('hex').toUpperCase();
    db.prepare('INSERT INTO viewer_codes(code_hash,wallet,expires_at) VALUES(?,?,?)')
      .run(hash(code), wallet, Date.now() + 2 * 60_000);
    return code;
  };
  const hashPairCode = code => {
    if (typeof code !== 'string' || !/^[0-9A-F]{32}$/.test(code.trim().toUpperCase())) throw new Error('pair_invalid');
    return `0x${hash(code.trim().toUpperCase())}`;
  };
  const startPair = () => {
    db.prepare('DELETE FROM agent_pairs WHERE expires_at<=?').run(Date.now());
    const code = randomBytes(16).toString('hex').toUpperCase();
    const expiresAt = Date.now() + 10 * 60_000;
    db.prepare('INSERT INTO agent_pairs(code_hash,wallet,expires_at) VALUES(?,NULL,?)').run(hashPairCode(code), expiresAt);
    return { code, expiresAt };
  };
  const pairStatus = code => {
    const row = db.prepare('SELECT wallet,expires_at FROM agent_pairs WHERE code_hash=?').get(hashPairCode(code));
    if (!row || row.expires_at <= Date.now()) throw new Error('pair_invalid');
    return { ready: Boolean(row.wallet), expiresAt: row.expires_at };
  };
  const completePair = code => {
    const codeHash = hashPairCode(code);
    const row = db.prepare('SELECT wallet FROM agent_pairs WHERE code_hash=? AND expires_at>?').get(codeHash, Date.now());
    if (!row?.wallet) throw new Error('pair_not_ready');
    db.prepare('DELETE FROM agent_pairs WHERE code_hash=?').run(codeHash);
    const token = random();
    db.prepare('INSERT INTO sessions(token_hash,wallet,expires_at) VALUES(?,?,?)').run(hash(token), row.wallet, Date.now() + 7 * 86400_000);
    return { token, wallet: row.wallet };
  };
  const verifyTyped = async ({ nonce, signature, signatureRecovery, name }) => {
    const row = db.prepare('SELECT * FROM nonces WHERE nonce=? AND expires_at>?').get(nonce, Date.now());
    if (!row) throw new Error('challenge_expired');
    db.prepare('DELETE FROM nonces WHERE nonce=?').run(nonce);
    let payload;
    try { payload = JSON.parse(row.message); } catch { /* not a typed challenge */ }
    if (payload?.kind !== 'typed' || payload.typedData?.message?.wallet !== row.wallet ||
      payload.typedData?.message?.origin !== config.origin || payload.typedData?.message?.nonce !== nonce ||
      payload.typedData?.message?.expiresAt !== row.expires_at ||
      payload.typedData?.message?.pairHash !== payload.pairHash ||
      typeof signature !== 'string' || !/^(?:0x)?(?:[0-9a-f]{2}){1,1024}$/i.test(signature)) throw new Error('bad_signature');
    let normalizedSignature = signature.startsWith('0x') ? signature : `0x${signature}`;
    if (normalizedSignature.length === 130 && signatureRecovery !== undefined) {
      const recoveryText = typeof signatureRecovery === 'number' ? String(signatureRecovery) : String(signatureRecovery).replace(/^0x/i, '');
      if (!/^(?:0|1|00|01|27|28|1b|1c)$/i.test(recoveryText)) throw new Error('bad_signature');
      const recovery = /^(?:27|28)$/.test(recoveryText)
        ? Number(recoveryText) - 27 : /^(?:1b|1c)$/i.test(recoveryText)
          ? parseInt(recoveryText, 16) - 27 : Number(recoveryText);
      normalizedSignature += recovery === 0 ? '1b' : '1c';
    }
    let valid = false;
    try { valid = await verifyTypedData({ address: row.wallet, ...payload.typedData, signature: normalizedSignature }); } catch { /* contract wallet fallback */ }
    if (!valid) {
      try { valid = await client.verifyTypedData({ address: row.wallet, ...payload.typedData, signature: normalizedSignature }); } catch { /* invalid signature */ }
    }
    if (!valid) throw new Error('bad_signature');
    createResident(db, { wallet: row.wallet, handle: `${row.wallet.slice(0, 6)}…${row.wallet.slice(-4)}` });
    const claimed = await claimAgentId(db, row.wallet, name, config.agentIdFetcher);
    if (payload.pairHash !== `0x${'00'.repeat(32)}`) {
      const updated = db.prepare('UPDATE agent_pairs SET wallet=? WHERE code_hash=? AND wallet IS NULL AND expires_at>?')
        .run(row.wallet, payload.pairHash, Date.now());
      if (!updated.changes) throw new Error('pair_invalid');
    }
    return { ...claimed, ...issueAgentKey(row.wallet), ...(payload.pairHash === `0x${'00'.repeat(32)}` ? { viewerCode: viewerCode(row.wallet) } : {}) };
  };
  const redeemViewerCode = code => {
    if (typeof code !== 'string' || !/^[0-9A-F]{24}$/.test(code.trim().toUpperCase())) throw new Error('viewer_code_invalid');
    const codeHash = hash(code.trim().toUpperCase());
    const row = db.prepare('SELECT wallet FROM viewer_codes WHERE code_hash=? AND expires_at>?').get(codeHash, Date.now());
    if (!row) throw new Error('viewer_code_invalid');
    db.prepare('DELETE FROM viewer_codes WHERE code_hash=?').run(codeHash);
    const token = random();
    db.prepare('INSERT INTO sessions(token_hash,wallet,expires_at) VALUES(?,?,?)').run(hash(token), row.wallet, Date.now() + 7 * 86400_000);
    return { token, wallet: row.wallet };
  };

  const guest = () => {
    if (!config.demoMode) throw new Error('demo_disabled');
    const wallet = `demo:${randomBytes(8).toString('hex')}`;
    const handle = `访客-${wallet.slice(-4)}`;
    createResident(db, { wallet, handle, isDemo: true });
    const token = random();
    db.prepare('INSERT INTO sessions(token_hash,wallet,expires_at) VALUES(?,?,?)').run(hash(token), wallet, Date.now() + 86400_000);
    return { token, wallet, handle };
  };

  const walletFromSession = token => {
    if (!token) return null;
    return db.prepare('SELECT wallet FROM sessions WHERE token_hash=? AND expires_at>?').get(hash(token), Date.now())?.wallet || null;
  };
  const walletFromAgentKey = key => {
    if (!key) return null;
    return db.prepare('SELECT wallet FROM agent_keys WHERE key_hash=? AND expires_at>? AND revoked_at IS NULL').get(hash(key), Date.now())?.wallet || null;
  };
  const issueAgentKey = wallet => {
    if (wallet.startsWith('demo:')) throw new Error('agent_key_requires_wallet');
    db.prepare('UPDATE agent_keys SET revoked_at=? WHERE wallet=? AND revoked_at IS NULL').run(Date.now(), wallet);
    const key = `ac_${random()}`;
    db.prepare('INSERT INTO agent_keys(key_hash,wallet,expires_at,revoked_at) VALUES(?,?,?,NULL)').run(hash(key), wallet, Date.now() + 24 * 3600_000);
    setGameControl(db,wallet,'agent');
    return { key, expiresAt: Date.now() + 24 * 3600_000 };
  };
  const revokeAgentKeys = wallet => { db.prepare('UPDATE agent_keys SET revoked_at=? WHERE wallet=? AND revoked_at IS NULL').run(Date.now(), wallet); setGameControl(db,wallet,'human'); };
  const logout = token => { if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(token)); };
  return { challenge, typedChallenge, verify, verifyTyped, startPair, pairStatus, completePair, redeemViewerCode, guest, walletFromSession, walletFromAgentKey, issueAgentKey, revokeAgentKeys, logout, resolveHandle };
}
