import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db.mjs';
import { action, createResident } from '../server/game.mjs';
import { createStoryService } from '../server/story.mjs';

function setup() {
  const db = openDatabase(':memory:');
  createResident(db, { wallet: '0x1', handle: 'ada.ai' }, 1_000_000);
  action(db, '0x1', 'gather', 'human', 1_000_000);
  return db;
}

test('insufficient model balance falls back without changing the action', async () => {
  const db = setup();
  let calls = 0;
  const story = createStoryService(db, { apiKey: 'test', model: 'test', fetcher: async () => { calls++; return { ok: false, status: 402 }; } });
  const answer = await story.generate('0x1', 1_001_000);
  assert.equal(answer.mode, 'base');
  assert.match(answer.text, /仓库/);
  assert.equal(db.prepare('SELECT score FROM residents WHERE wallet=?').get('0x1').score, 0.5);
  assert.equal((await story.generate('0x1', 1_002_000)).mode, 'base');
  assert.equal(calls, 1);
  db.close();
});

test('valid model response is used only as narration', async () => {
  const db = setup();
  const story = createStoryService(db, { apiKey: 'test', model: 'test', fetcher: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '补给车缓缓驶入城门，居民向你挥手致意。' } }] }) }) });
  const answer = await story.generate('0x1', 1_001_000);
  assert.equal(answer.mode, 'ai');
  assert.equal(db.prepare('SELECT score FROM residents WHERE wallet=?').get('0x1').score, 0.5);
  db.close();
});

test('a second action during AI cooldown receives its own base response', async () => {
  const db = setup();
  let calls = 0;
  const story = createStoryService(db, { apiKey: 'test', model: 'test', fetcher: async () => {
    calls++;
    return { ok: true, json: async () => ({ choices: [{ message: { content: '补给车缓缓驶入城门，居民向你挥手致意。' } }] }) };
  } });
  assert.equal((await story.generate('0x1', 1_001_000)).mode, 'ai');
  action(db, '0x1', 'scout', 'human', 1_021_000);
  const next = await story.generate('0x1', 1_022_000);
  assert.equal(next.mode, 'base');
  assert.match(next.text, /城外/);
  assert.equal(calls, 1);
  db.close();
});
