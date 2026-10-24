import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/index.mjs';
import { privateKeyToAccount } from 'viem/accounts';

test('public rate limit trusts the proxy IP only when explicitly enabled', async () => {
  for (const trustProxy of [false, true]) {
    const config = {
      port: 0, origin: 'http://127.0.0.1:3200', roundMs: 120_000, dbPath: ':memory:',
      demoMode: true, trustProxy, rpcUrl: 'https://bsc-dataseed.binance.org/',
      agentRegistry: null, aiApiKey: null, aiModel: 'test', storyCooldownMs: 90_000,
      aiAllowDemo: false,
    };
    const { server, db } = createApp(config);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/auth/pair/start`;
    const request = address => fetch(url, {
      method: 'POST',
      headers: { Origin: config.origin, 'Content-Type': 'application/json', 'X-Real-IP': address },
      body: '{}',
    });
    try {
      for (let index = 0; index < 5; index++) assert.equal((await request('198.51.100.1')).status, 200);
      assert.equal((await request('198.51.100.1')).status, 429);
      assert.equal((await request('198.51.100.2')).status, trustProxy ? 200 : 429);
    } finally {
      await new Promise(resolve => server.close(resolve));
      db.close();
    }
  }
});

test('demo can play, but cannot issue an asset-capable or agent key', async () => {
  const config = {
    port: 0, origin: 'http://127.0.0.1:3200', roundMs: 120_000, dbPath: ':memory:',
    demoMode: true, rpcUrl: 'https://bsc-dataseed.binance.org/', agentRegistry: null,
    aiApiKey: null, aiModel: 'test', storyCooldownMs: 90_000, aiAllowDemo: false,
  };
  const { server, db } = createApp(config);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, body, cookie = '') => {
    const response = await fetch(`${base}${path}`, { method: 'POST', headers: { Origin: config.origin, 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) });
    return { response, data: await response.json() };
  };
  try {
    const guest = await post('/api/demo/start', {});
    assert.equal(guest.response.status, 200);
    const funding=await fetch(`${base}/api/treasury/funding`).then(response=>response.json());
    assert.equal(funding.status,'not_live');assert.equal(funding.data,undefined);
    const cookie = guest.response.headers.get('set-cookie').split(';')[0];
    const role = await post('/api/role', { role: 'explorer' }, cookie);
    assert.equal(role.data.role, 'explorer');
    const avatar = await post('/api/avatar', { avatarId: 'shadow', aura: 'violet' }, cookie);
    assert.equal(avatar.data.avatarId, 'shadow');
    assert.equal((await post('/api/avatar', { avatarId: 'unknown', aura: 'gold' }, cookie)).response.status, 400);
    const action = await post('/api/action', { kind: 'scout' }, cookie);
    assert.equal(action.data.material, 4);
    const story = await post('/api/story', {}, cookie);
    assert.equal(story.data.mode, 'base');
    const key = await post('/api/agent-key', {}, cookie);
    assert.equal(key.response.status, 403);
    assert.equal((await post('/api/agent-id/claim', { name: 'guest.ai' }, cookie)).response.status, 403);
    const world = await fetch(`${base}/api/state`, { headers: { Cookie: cookie } }).then(response => response.json());
    assert.equal(world.me.role, 'explorer');
    assert.equal(world.me.avatar_id, 'shadow');
    assert.equal(world.me.aura, 'violet');
    assert.equal(world.me.score, 1);
  } finally {
    await new Promise(resolve => server.close(resolve)); db.close();
  }
});

test('signed wallet can bind its .ai name and issue a game-only Agent key', async () => {
  const config = {
    port: 0, origin: 'http://127.0.0.1:3200', roundMs: 120_000, dbPath: ':memory:',
    demoMode: false, rpcUrl: 'https://bsc-dataseed.binance.org/', agentRegistry: null,
    aiApiKey: null, aiModel: 'test', storyCooldownMs: 90_000, aiAllowDemo: false,
  };
  const { server, db } = createApp(config);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const account = privateKeyToAccount(`0x${'11'.repeat(32)}`);
  config.agentIdFetcher = async url => {
    assert.match(url, /nameapi\.space\.id\/getAddress\?domain=fighter\.ai$/);
    return { ok: true, json: async () => ({ code: 0, address: account.address }) };
  };
  const post = async (path, body, cookie = '') => {
    const response = await fetch(`${base}${path}`, { method: 'POST', headers: { Origin: config.origin, 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) });
    return { response, data: await response.json() };
  };
  try {
    const challenge = await post('/api/auth/challenge', { address: account.address });
    assert.equal(challenge.response.status, 200);
    const signature = await account.signMessage({ message: challenge.data.message });
    const verified = await post('/api/auth/verify', { nonce: challenge.data.nonce, signature });
    assert.equal(verified.response.status, 200);
    assert.equal(verified.data.verifiedAi, false);
    const cookie = verified.response.headers.get('set-cookie').split(';')[0];
    const claimed = await post('/api/agent-id/claim', { name: 'Fighter.ai' }, cookie);
    assert.equal(claimed.response.status, 200);
    assert.equal(claimed.data.name, 'fighter.ai');
    const named = await fetch(`${base}/api/state`, { headers: { Cookie: cookie } }).then(response => response.json());
    assert.equal(named.me.handle, 'fighter.ai');
    assert.equal(named.me.verified_ai, 1);
    config.agentIdFetcher = async () => ({ ok: true, json: async () => ({ code: 0, address: `0x${'22'.repeat(20)}` }) });
    assert.equal((await post('/api/agent-id/claim', { name: 'other.ai' }, cookie)).response.status, 403);
    const issued = await post('/api/agent-key', {}, cookie);
    assert.equal(issued.response.status, 200);
    assert.match(issued.data.key, /^ac_[a-f0-9]{64}$/);
    const actionResponse = await fetch(`${base}/api/action`, { method: 'POST', headers: { Authorization: `Bearer ${issued.data.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'gather' }) });
    assert.equal(actionResponse.status, 200);
    const result = await actionResponse.json();
    assert.equal(result.score, 1);
    const world = await fetch(`${base}/api/state`, { headers: { Authorization: `Bearer ${issued.data.key}` } }).then(response => response.json());
    assert.equal(world.me.verified_ai, 1);
    assert.equal(world.logs[0].source, 'agent');
  } finally {
    await new Promise(resolve => server.close(resolve)); db.close();
  }
});

test('EIP-712 Agentic Wallet flow issues a game key only after a matching .ai signature', async () => {
  const account = privateKeyToAccount(`0x${'33'.repeat(32)}`);
  const config = {
    port: 0, origin: 'http://127.0.0.1:3200', roundMs: 120_000, dbPath: ':memory:',
    demoMode: false, rpcUrl: 'https://bsc-dataseed.binance.org/', agentRegistry: null,
    aiApiKey: null, aiModel: 'test', storyCooldownMs: 90_000, aiAllowDemo: false,
    agentIdFetcher: async () => ({ ok: true, json: async () => ({ code: 0, address: account.address }) }),
  };
  const { server, db } = createApp(config);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, body, browser = false) => {
    const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(browser ? { Origin: config.origin } : {}) }, body: JSON.stringify(body) });
    return { response, data: await response.json() };
  };
  try {
    const challenge = await post('/api/auth/typed-challenge', { address: account.address });
    assert.equal(challenge.response.status, 200);
    assert.equal(challenge.data.signRequest.method, 'eth_signTypedData_v4');
    assert.equal(challenge.data.typedData.domain.chainId, 56);
    const signature = await account.signTypedData(challenge.data.typedData);
    const verified = await post('/api/auth/typed-verify', { nonce: challenge.data.nonce, signature, name: 'fighter.ai' });
    assert.equal(verified.response.status, 200);
    assert.equal(verified.data.name, 'fighter.ai');
    assert.match(verified.data.key, /^ac_[a-f0-9]{64}$/);
    assert.match(verified.data.viewerCode, /^[0-9A-F]{24}$/);
    const viewed = await post('/api/auth/viewer', { code: verified.data.viewerCode }, true);
    assert.equal(viewed.response.status, 200);
    assert.ok(viewed.response.headers.get('set-cookie'));
    assert.equal((await post('/api/auth/viewer', { code: verified.data.viewerCode }, true)).response.status, 401);
    assert.equal((await post('/api/auth/typed-verify', { nonce: challenge.data.nonce, signature, name: 'fighter.ai' })).response.status, 401);
    const state = await fetch(`${base}/api/arena-signal`, { headers: { Authorization: `Bearer ${verified.data.key}` } }).then(response => response.json());
    assert.equal(state.attempt, null);
    assert.equal(state.reward, 'game_score_only');
    config.agentIdFetcher = async () => ({ ok: true, json: async () => ({ code: 0, address: `0x${'44'.repeat(20)}` }) });
    const second = await post('/api/auth/typed-challenge', { address: account.address });
    const secondSignature = await account.signTypedData(second.data.typedData);
    assert.equal((await post('/api/auth/typed-verify', { nonce: second.data.nonce, signature: secondSignature, name: 'other.ai' })).response.status, 403);
    config.agentIdFetcher = async () => ({ ok: true, json: async () => ({ code: 0, address: account.address }) });
    const started = await post('/api/auth/pair/start', {}, true);
    assert.equal(started.response.status, 200);
    assert.match(started.data.code, /^[0-9A-F]{32}$/);
    const pairedChallenge = await post('/api/auth/typed-challenge', { address: account.address, pairCode: started.data.code });
    assert.equal(pairedChallenge.data.typedData.message.pairHash.length, 66);
    const pairedSignature = await account.signTypedData(pairedChallenge.data.typedData);
    const v = parseInt(pairedSignature.slice(-2), 16);
    const paired = await post('/api/auth/typed-verify', {
      nonce: pairedChallenge.data.nonce,
      signature: pairedSignature.slice(2, -2),
      signatureRecovery: String(v >= 27 ? v - 27 : v).padStart(2, '0'),
      name: 'fighter.ai',
    });
    assert.equal(paired.response.status, 200);
    assert.equal(paired.data.viewerCode, undefined);
    const status = await post('/api/auth/pair/status', { code: started.data.code }, true);
    assert.equal(status.data.ready, true);
    const completed = await post('/api/auth/pair/complete', { code: started.data.code }, true);
    assert.equal(completed.response.status, 200);
    const session = completed.response.headers.get('set-cookie').split(';')[0];
    const browserState = await fetch(`${base}/api/state`, { headers: { Cookie: session } }).then(response => response.json());
    assert.equal(browserState.me.handle, 'fighter.ai');
    assert.equal((await post('/api/auth/pair/complete', { code: started.data.code }, true)).response.status, 409);
  } finally { await new Promise(resolve => server.close(resolve)); db.close(); }
});
