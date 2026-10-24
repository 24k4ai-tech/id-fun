import { createArena } from './battle.js';
import { createBattleMusic } from './battle-music.js';
import { createPvpUI } from './pvp-ui.js';
import { createRewardsUI } from './rewards-ui.js';
import { createSignalUI } from './signal-ui.js';
import { createCity } from './city.js';
import { initLocale, t, applyLocale } from './locale.js';
import { weaponFor } from './weapon-config.js';
import { BATTLE_KEYS, battleDirection } from './battle-controls.js';
import { createStudioUI } from './studio-ui.js';
import { createJourneyUI } from './journey-ui.js';
import {createGameControl} from './game-control.js';
import {createCityLifeUI} from './city-life-ui.js';
import {showTokenInfo} from './token-info.js';

const $ = id => document.getElementById(id);
const battleMusic = createBattleMusic($('battle-music'));
const labels = { builder: '建造者', explorer: '探索者', merchant: '交易者' };
const actionNames = { gather: '采集物资', scout: '探索城外', repair: '修复设施', build: '建造街区' };
const avatarImages = Object.fromEntries(['ember','shadow','maker','trader','cz','heyi','sbf','musk','jensen','vitalik','trump','afeng'].map(id=>[id,`/portraits/${id}.webp`]));
const figureClasses = {};
const avatarNames = { ember: '金焰守护者', shadow: '紫夜侦察者', maker: '星轨工程师', trader: '流光商旅者', cz: 'CZ', heyi: '何一', sbf: 'SBF', musk: '马斯克', jensen: '黄仁勋', vitalik: 'V神', trump: '特朗普',afeng:'阿峰' };
let config = null;
let world = null;
let busy = false;
let toastTimer = null;
let promptedAvatarFor = null;
let selectedAvatar = 'ember';
let selectedAura = 'gold';
let openingBattleFor = null;
let arenaRequest = 0;
let deferCity = false;
let arena = null;
let battle = null;
let battlePoll = null;
let battleBusy = false;
let selectedOpponent = 'cz';
let announceTimer = null;
let lastLocalBattleMoveAt = 0;
const heldKeys = new Set();
let battleMotionBusy = false;
let battleMotionTimer = null;
let weaponChargeStartedAt = 0;
let chargeRequest = Promise.resolve();
let city = null;
let journeyUI = null;
let cityLifeUI=null;
let rewardsUI=null;
let cityAvatar = null;
let cityLoading = false;
const cityKeys = new Set();
let pvpUI = null;
let signalUI = null;
let pairing = null;
let pairPoll = null;
let pairCompleting = false;
let studioUI=null;
const controls=createGameControl({toast,onChange:async()=>{
  heldKeys.clear();cityKeys.clear();city?.setMotion(0,0);weaponChargeStartedAt=0;arena?.setCharging(false);
  await journeyUI?.syncControl();await cityLifeUI?.syncControl();
}});
function direction() {
  const forwardInput = Number(heldKeys.has('KeyW')) - Number(heldKeys.has('KeyS'));
  const rightInput = Number(heldKeys.has('KeyD')) - Number(heldKeys.has('KeyA'));
  return battleDirection(forwardInput, rightInput, arena?.movementYaw() ?? Math.PI / 2);
}
const openingOpponent = avatarId => ({ cz: 'heyi', heyi: 'sbf', sbf: 'musk', musk: 'jensen', jensen: 'vitalik', vitalik: 'trump', trump: 'cz' }[avatarId] || 'cz');

function toast(message) {
  const box = $('toast');
  box.textContent = message;
  box.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('show'), 3600);
}

async function api(path, body) {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...controls.headers(path,body) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) {if(result.error?.startsWith('control_'))controls.refresh();throw new Error(result.message || '请求失败');}
  return result;
}

function number(value) { return new Intl.NumberFormat('zh-CN').format(value || 0); }
function relativeTime(ms) {
  const seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (seconds < 60) return `${seconds} 秒前`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  return `${Math.floor(seconds / 3600)} 小时前`;
}

function renderFeed(logs) {
  const feed = $('feed');
  feed.replaceChildren();
  if (!logs.length) { const empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = '城市还很安静。成为第一位行动的居民吧。'; feed.append(empty); return; }
  for (const log of logs.slice(0, 8)) {
    const row = document.createElement('div'); row.className = 'feed-item';
    const dot = document.createElement('span'); dot.className = 'feed-dot';
    const body = document.createElement('div');
    const message = document.createElement('p'); message.textContent = log.message;
    const time = document.createElement('small'); time.textContent = `${relativeTime(log.created_at)} · ${log.source === 'agent' ? 'Agent 行动' : log.source === 'system' ? '城市事件' : '居民行动'}`;
    body.append(message, time); row.append(dot, body); feed.append(row);
  }
}

function renderLeaders(leaders) {
  const container = $('leaders'); container.replaceChildren();
  if (!leaders.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = '还没有正式居民。'; container.append(p); return; }
  for (const [index, leader] of leaders.entries()) {
    const row = document.createElement('div'); row.className = 'leader';
    const rank = document.createElement('span'); rank.textContent = String(index + 1).padStart(2, '0');
    const portrait = document.createElement(figureClasses[leader.avatar_id] ? 'span' : 'img');
    if (figureClasses[leader.avatar_id]) portrait.className = `figure-portrait ${figureClasses[leader.avatar_id]}`;
    else { portrait.src = avatarImages[leader.avatar_id] || avatarImages.ember; portrait.alt = ''; }
    const name = document.createElement('div'); name.textContent = `${leader.handle} · ${labels[leader.role] || leader.role}`;
    const score = document.createElement('small'); score.textContent = `${number(leader.score)} 贡献`;
    row.append(rank, portrait, name, score); container.append(row);
  }
}

function updateClock() {
  if (!world) return;
  const seconds = Math.max(0, Math.ceil((world.city.next_round_at - Date.now()) / 1000));
  $('round-countdown').textContent = `${seconds} 秒后进入下一回合`;
  const me = world.me;
  if (!me) { $('action-timer').textContent = '进入城市开始'; return; }
  const remaining = Math.max(0, Math.ceil((me.last_action_at + 20_000 - Date.now()) / 1000));
  $('action-timer').textContent = remaining ? `${remaining} 秒后可再次行动` : '可以行动';
  const stamina = Math.min(5, me.stamina + Math.floor(Math.max(0, Date.now() - world.now) / 30_000));
  $('my-stamina').textContent = `${stamina}/5`;
  for (const button of document.querySelectorAll('[data-action]')) button.disabled = busy || Boolean(remaining) || stamina < 1;
}

function render(data) {
  world = data;
  controls.update(data.me);
  const { city: cityState, event, me } = data;
  $('round').textContent = `#${String(cityState.round).padStart(3, '0')}`;
  $('scene-round').textContent = `ROUND ${String(cityState.round).padStart(3, '0')}`;
  $('stability').textContent = `${cityState.stability}%`;
  $('district').textContent = `${cityState.district_level} 级`;
  $('power-state').textContent = cityState.stability < 40 ? '● 告急' : '● 稳定';
  $('event-status').textContent = event?.status === 'active' ? '进行中' : '平静';
  $('event-tag').textContent = event?.status === 'active' ? '共同目标进行中' : '等待下一事件';
  $('event-title').textContent = event?.title || '下一次事件即将到来';
  $('event-description').textContent = event?.description || '先熟悉你的城市。居民的每次行动都能改变这里。';
  $('event-progress').style.width = event ? `${Math.min(100, event.progress / event.target * 100)}%` : '0%';
  $('event-progress-label').textContent = event ? `${event.progress}/${event.target}` : '—';
  $('join-hint').hidden = Boolean(me);
  $('role-picker').hidden = !me || me.last_action_at > 0;
  $('profile-name').textContent = me?.handle || '等待新居民';
  $('profile-role').textContent = me ? `${labels[me.role] || me.role}${me.is_demo ? ' · 演示访客' : me.verified_ai ? ' · .ai 已核验' : ' · 钱包已签名，.ai 待核验'}` : '进入城市，选择你的职业';
  const avatarId = me?.avatar_id || 'ember';
  const avatar = me?.appearance?.portrait || avatarImages[avatarId] || avatarImages.ember;
  const figure = figureClasses[avatarId];
  const profileHolder = $('profile-avatar').parentElement;
  profileHolder.querySelector('.figure-portrait')?.remove();
  $('profile-avatar').hidden = Boolean(figure);
  if (figure) { const portrait = document.createElement('span'); portrait.className = `figure-portrait ${figure}`; profileHolder.append(portrait); }
  else $('profile-avatar').src = avatar;
  $('city-avatar').src = avatar;
  $('city-avatar').hidden = !me || Boolean(figure);
  $('city-figure').hidden = !me || !figure;
  $('city-figure').className = `city-figure ${figure || ''} aura-${me?.aura || 'gold'}`;
  $('city-avatar').className = `city-avatar aura-${me?.aura || 'gold'}`;
  $('profile-avatar').parentElement.className = `resident-avatar aura-${me?.aura || 'gold'}`;
  $('edit-avatar-btn').hidden = !me;
  $('arena-entry').hidden = !me;
  $('pvp-open').hidden = !me;
  $('agent-id-open').hidden = !me || Boolean(me.is_demo);
  $('viewer-open').hidden = Boolean(me && !me.is_demo);
  $('agent-pair-open').hidden = Boolean(me && !me.is_demo);
  $('agent-id-open').textContent = me?.verified_ai ? me.handle : '绑定 .ai';
  if (me) pvpUI?.start();
  else pvpUI?.stop();
  if (me) signalUI?.start();
  else signalUI?.stop();
  $('my-score').textContent = me ? number(me.score) : '—';
  journeyUI?.setPlayer(me?.wallet || null);
  if(rewardsUI&&rewardsUI.wallet!==me?.wallet){rewardsUI.wallet=me?.wallet;rewardsUI.refresh();}
  $('my-material').textContent = me ? number(me.material) : '—';
  $('my-stamina').textContent = me ? `${me.stamina}/5` : '—';
  $('logout-btn').hidden = !me;
  $('key-btn').disabled = !me || Boolean(me.is_demo);
  $('revoke-btn').hidden = !me || Boolean(me.is_demo);
  $('demo-btn').textContent = me ? '进入竞技场 ↗' : '立即试玩 3D 对战 ↗';
  if ((me?.avatar_set||controls.watching())&&!deferCity&&$('battle-screen').hidden) ensureCity(me.avatar_id, me.aura);
  else if (city || cityLoading) {
    city?.dispose(); city = null; cityAvatar = null;
    $('city-canvas').hidden = true;
    $('city-navigation').hidden = true;
    $('city-touch').hidden = true;
    document.querySelector('.map-frame').classList.remove('city-live');
  }
  for (const button of document.querySelectorAll('[data-role]')) button.classList.toggle('active', button.dataset.role === me?.role);
  renderFeed(data.logs);
  renderLeaders(data.leaders);
  updateClock();
  applyLocale();
  if (me && !controls.watching() && !me.is_demo && !me.avatar_set && promptedAvatarFor !== me.wallet) {
    promptedAvatarFor = me.wallet;
    openAvatar();
  }
}

async function ensureCity(avatarId, aura) {
  const identity = `${avatarId}:${aura}:${world?.me?.appearance?.updatedAt||0}`;
  if (cityAvatar === identity && (city || cityLoading)) return;
  if (cityLoading) { cityAvatar = identity; return; }
  cityAvatar = identity;
  cityLoading = true;
  city?.dispose(); city = null;
  try {
    const instance = await createCity($('city-canvas'), avatarId, aura, site => {
      $('city-nearby').textContent = site ? (document.documentElement.lang==='en'?`Press E · ${site.en}`:`按 E · ${site.name}`) : 'WASD 行走 · 按住右键转视角 · 靠近建筑按 E';
      applyLocale();
    },world?.me?.appearance);
    if (cityAvatar !== identity) { instance.dispose(); return; }
    city = instance;
    await journeyUI?.attachCity(instance);
    $('city-canvas').hidden = false;
    $('city-navigation').hidden = false;
    $('city-touch').hidden = false;
    document.querySelector('.map-frame').classList.add('city-live');
    city.pause(!$('battle-screen').hidden||!$('avatar-modal').hidden||cityLifeUI?.blocked());
    applyLocale();
  } catch (error) { console.warn('3D city unavailable:', error); }
  finally {
    cityLoading = false;
    if (cityAvatar && cityAvatar !== identity && world?.me?.avatar_set) ensureCity(world.me.avatar_id, world.me.aura);
  }
}

function cityMotion() {
  if(!controls.canPlay()||document.body.classList.contains('puzzle-open')||cityLifeUI?.blocked()){city?.setMotion(0,0);return;}
  const x = Number(cityKeys.has('KeyD')) - Number(cityKeys.has('KeyA'));
  const z = Number(cityKeys.has('KeyS')) - Number(cityKeys.has('KeyW'));
  city?.setMotion(x, z);
}

function cityInteract() {
  if (!controls.canPlay() || !city || !$('battle-screen').hidden || !world?.me) return;
  const site = city.near();
  if (!site) return toast(t('靠近建筑后再互动。'));
  if(cityLifeUI?.interact(site))return;
  if(site.kind==='npc'){cityLifeUI?.talk(site.id).catch(e=>toast(e.message));return;}
  if (site.kind === 'journey') journeyUI?.interact(site.id);
  else if (site.kind === 'build') journeyUI?.interact('workshop');
  else if (site.kind === 'arena') openBattle(openingOpponent(world.me.avatar_id));
  else if(site.kind==='home'){openAvatar();studioUI?.open();}
  else doAction(site.kind);
}

function openAvatar() {
  if (!world?.me) return;
  selectedAvatar = world.me.avatar_id || 'ember';
  selectedAura = world.me.aura || 'gold';
  for (const button of document.querySelectorAll('[data-avatar]')) button.classList.toggle('active', button.dataset.avatar === selectedAvatar);
  for (const button of document.querySelectorAll('[data-aura]')) button.classList.toggle('active', button.dataset.aura === selectedAura);
  $('avatar-modal').hidden = false;
  city?.pause(true);
  document.body.classList.add('modal-open');
  studioUI?.openPreview();
}

function openAgentId() {
  if (!world?.me || world.me.is_demo) return;
  $('agent-id-name').value = world.me.verified_ai ? world.me.handle : '';
  $('agent-id-modal').hidden = false;
  document.body.classList.add('modal-open');
  $('agent-id-name').focus();
}

function closeAgentId() {
  $('agent-id-modal').hidden = true;
  if ($('avatar-modal').hidden && $('pvp-modal').hidden && $('battle-screen').hidden) document.body.classList.remove('modal-open');
}

async function claimAgentId() {
  const name = $('agent-id-name').value.trim();
  if (!name) return toast('请输入你的 .ai 名称。');
  const button = $('agent-id-submit');
  button.disabled = true;
  try {
    const result = await api('/api/agent-id/claim', { name });
    closeAgentId();
    await refresh(true);
    toast(`${result.name} 已绑定到当前签名钱包。`);
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; }
}

function closeAvatar() {
  studioUI?.closePreview();
  $('avatar-modal').hidden = true;
  city?.pause(!$('battle-screen').hidden);
  document.body.classList.remove('modal-open');
}

async function saveAvatar() {
  if (!world?.me) return;
  const button=$('save-avatar-btn');if(button.disabled)return;button.disabled=true;
  try {
    await api('/api/avatar', { avatarId: selectedAvatar, aura: selectedAura });
    await studioUI?.save();
    closeAvatar();
    deferCity=true;
    await refresh(true);
    openingBattleFor = null;
    await openBattle(openingOpponent(selectedAvatar));
  } catch (error) { toast(error.message); }finally{button.disabled=false;deferCity=false;}
}

function animateAction(kind) {
  const frame = document.querySelector('.map-frame');
  const focus = { gather: ['22px', '-4px'], repair: ['11px', '9px'], build: ['-12px', '9px'], scout: ['-22px', '-4px'] }[kind];
  frame.style.setProperty('--focus-x', focus[0]);
  frame.style.setProperty('--focus-y', focus[1]);
  frame.classList.add('is-focusing');
  const hotspot = document.querySelector(`[data-action="${kind}"]`);
  hotspot.classList.add('hit');
  setTimeout(() => { frame.classList.remove('is-focusing'); hotspot.classList.remove('hit'); }, 900);
}

async function refresh(silent = false) {
  try { render(await api('/api/state')); }
  catch (error) { if (!silent) toast(error.message); }
}

async function enterDemo() {
  const button=$('demo-btn');if(button.disabled)return;
  button.disabled=true;deferCity=true;
  try {
    if (!world?.me) {
      await api('/api/demo/start', {});
      await api('/api/avatar', { avatarId: 'ember', aura: 'gold' });
      await refresh(true);
    }
    await openBattle(openingOpponent(world.me.avatar_id));
  } catch (error) { toast(error.message); }
  finally { button.disabled=false;deferCity=false; }
}

async function connectWallet() {
  if (!window.ethereum) return toast('请在支持 EVM 钱包的浏览器中打开。');
  try {
    const [address] = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const challenge = await api('/api/auth/challenge', { address });
    const signature = await window.ethereum.request({ method: 'personal_sign', params: [challenge.message, address] });
    const verified = await api('/api/auth/verify', { nonce: challenge.nonce, signature });
    openingBattleFor = verified.wallet;
    await refresh();
    if (world?.me?.avatar_set) openingBattleFor = null;
    toast(verified.verifiedAi ? '.ai 身份验证成功。' : '钱包签名成功；可在顶部绑定 .ai 名称。');
  } catch (error) { toast(error.message || '连接失败'); }
}

function pairPrompt() {
  return `请打开 ${location.origin}/arena-agent-skill?pair=${pairing.code} ，用我已绑定的 .ai Agentic Wallet 加入格斗场。只做游戏操作，不交易或转账。`;
}

async function checkPair() {
  if (!pairing || $('viewer-modal').hidden || pairCompleting) return;
  if (Date.now() >= pairing.expiresAt) {
    $('pair-status').textContent = '接入链接已过期，关闭后重新打开即可刷新。';
    return;
  }
  try {
    const status = await api('/api/auth/pair/status', { code: pairing.code });
    if (!status.ready) { $('pair-status').textContent = '等待 Agent 完成钱包签名…'; return; }
    pairCompleting = true;
    await api('/api/auth/pair/complete', { code: pairing.code });
    pairing = null;
    closeViewer();
    await refresh(true);
    toast('AI 钱包已入场，可以开始观看或操作。');
  } catch (error) { $('pair-status').textContent = error.message; }
  finally { pairCompleting = false; }
}

async function openViewer() {
  $('viewer-modal').hidden = false;
  document.body.classList.add('modal-open');
  $('pair-local-note').hidden = !['127.0.0.1', 'localhost'].includes(location.hostname);
  if (!pairing || pairing.expiresAt <= Date.now()) {
    $('pair-prompt').textContent = '正在创建一次性接入链接…';
    $('pair-copy').disabled = true;
    try { pairing = await api('/api/auth/pair/start', {}); }
    catch (error) { $('pair-status').textContent = error.message; return; }
  }
  $('pair-prompt').textContent = pairPrompt();
  $('pair-copy').disabled = false;
  $('pair-status').textContent = '等待 Agent 完成钱包签名…';
  clearInterval(pairPoll);
  pairPoll = setInterval(checkPair, 2000);
  checkPair();
}

function closeViewer() {
  clearInterval(pairPoll);
  pairPoll = null;
  $('viewer-modal').hidden = true;
  if ($('avatar-modal').hidden && $('agent-id-modal').hidden && $('pvp-modal').hidden && $('battle-screen').hidden)
    document.body.classList.remove('modal-open');
}

async function redeemViewerCode() {
  const code = $('viewer-code').value.trim();
  if (!code) return toast('请输入 Agent 给你的一次性接入码。');
  const button = $('viewer-submit');
  button.disabled = true;
  try {
    await api('/api/auth/viewer', { code });
    pairing = null;
    $('viewer-code').value = '';
    closeViewer();
    await refresh(true);
    toast('AI 钱包已入场。');
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; }
}

async function chooseRole(role) {
  try { await api('/api/role', { role }); await refresh(true); toast(`已选择${labels[role]}。`); }
  catch (error) { toast(error.message); }
}

async function doAction(kind) {
  if (busy || !world?.me) return toast('请先进入城市。');
  busy = true; updateClock();
  try {
    const result = await api('/api/action', { kind });
    animateAction(kind);
    $('story-text').textContent = result.message;
    $('story-mode').textContent = '行动结果';
    toast(`${actionNames[kind]}成功，贡献 +${result.score}`);
    await refresh(true);
    api('/api/story', {}).then(story => {
      $('story-text').textContent = story.text;
      $('story-mode').textContent = story.mode === 'ai' ? 'AI 城市旁白' : '城市旁白';
    }).catch(() => {});
  } catch (error) { toast(error.message); }
  finally { busy = false; updateClock(); }
}

async function issueKey() {
  try {
    const result = await api('/api/agent-key', {});await controls.refresh();
    $('key-value').textContent = result.key;
    $('key-result').hidden = false;
    toast('密钥已生成，旧密钥已自动撤销。');
  } catch (error) { toast(error.message); }
}

async function revokeKey() {
  try { await api('/api/agent-key/revoke', {});await controls.refresh(); $('key-result').hidden = true; $('key-value').textContent = ''; toast('Agent 行动密钥已撤销。'); }
  catch (error) { toast(error.message); }
}

async function logout() {
  try { leaveBattle(); pvpUI?.close(); closeAgentId(); await api('/api/logout', {}); closeAvatar(); $('key-result').hidden = true; $('key-value').textContent = ''; await refresh(); toast('已离开城市。'); }
  catch (error) { toast(error.message); }
}

function announceBattle(message) {
  const node = $('battle-announcement');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => node.classList.remove('show'), 750);
}

function battlePortrait(element, avatarId) {
  if (figureClasses[avatarId]) {
    element.style.backgroundImage = "url('/figures-sheet.png')";
    element.style.backgroundSize = '800% auto';
    element.style.backgroundPosition = `${({ cz: 6.5, heyi: 35, sbf: 64, musk: 92 })[avatarId]}% top`;
  } else {
    element.style.backgroundImage = `url('${avatarImages[avatarId] || avatarImages.ember}')`;
    element.style.backgroundSize = 'cover';
    element.style.backgroundPosition = 'center 20%';
  }
}

function renderBattle(next, command = null) {
  if (battle?.id === next.id && battle.mode === next.mode && next.serverNow < battle.serverNow) return;
  const previous = battle;
  battle = next;
  arena?.sync(next, command);
  const avatarId = next.playerAvatarId || world?.me?.avatar_id || 'ember';
  const myWeapon = weaponFor(avatarId);
  $('battle-player-name').textContent = `${t(world?.me?.handle || '你的 Agent')} · ${t(avatarNames[avatarId] || '战士')}`;
  const english = document.documentElement.lang === 'en';
  $('battle-player-weapon').textContent = `${english ? myWeapon.en : myWeapon.zh} · ${myWeapon.reach.toFixed(1)}m`;
  const enemyWeapon = weaponFor(next.opponentId);
  $('battle-enemy-weapon').textContent = english ? enemyWeapon.en : enemyWeapon.zh;
  battlePortrait($('battle-player-portrait'), avatarId);
  battlePortrait($('battle-enemy-portrait'), next.opponentId);
  $('battle-enemy-name').textContent = next.opponentName;
  $('battle-player-health').style.width = `${next.playerHp}%`;
  $('battle-enemy-health').style.width = `${next.enemyHp / next.enemyMaxHp * 100}%`;
  $('battle-player-hp').textContent = next.playerHp;
  $('battle-enemy-hp').textContent = next.enemyHp;
  const bearing = arena?.targetBearing();
  $('battle-target-bearing').hidden = next.status !== 'active' || !bearing;
  if (bearing) $('battle-target-bearing').textContent = `${document.documentElement.lang === 'en' ? 'RIVAL' : '对手'} ${bearing.arrow} ${bearing.distance.toFixed(0)}m`;
  $('battle-energy-fill').style.width = `${next.energy}%`;
  $('battle-energy-value').textContent = next.energy;
  $('battle-wave').textContent = next.combo >= 5 ? `${next.combo} 连击！` : `${next.combo} 连击`;
  const eligibility = $('battle-eligibility');
  eligibility.hidden = next.mode !== 'pvp' || next.status !== 'active';
  if (next.mode === 'pvp') {
    eligibility.textContent = next.engaged ? '✓ 双方有效交手' :
      `计分进度 · 你 ${Math.min(10, next.playerDamage || 0)}/10 · 对手 ${Math.min(10, next.enemyDamage || 0)}/10`;
    if (next.rewardEligible) eligibility.textContent += ' · 持币奖励候选';
    eligibility.classList.toggle('ready', next.engaged);
  }
  updateTargetLock();
  const cast = next.enemyCast;
  const casting = next.status === 'active' && cast && cast.impactAt > next.serverNow;
  $('battle-cast').hidden = !casting;
  if (casting) {
    $('battle-cast-label').textContent = t(cast.shape === 'lane' ? '直线攻击 · 向侧面躲避'
      : cast.shape === 'circle' ? '范围攻击 · 离开橙色区域' : '近战挥击 · 后撤或翻滚');
    $('battle-cast-fill').style.width = `${Math.max(0, Math.min(100,(next.serverNow-cast.castAt)/(cast.impactAt-cast.castAt)*100))}%`;
  }
  $('battle-enemy-name').classList.toggle('battle-warning', Boolean(casting));
  $('battle-clock').textContent = Math.max(0, Math.ceil((next.expiresAt - next.serverNow) / 1000));
  for (const button of document.querySelectorAll('[data-battle-command]')) {
    const cost = { arc: 20, meteor: 35, skill1: 30, skill2: 35, ultimate: 70 }[button.dataset.battleCommand] || 0;
    const isSpell = ['spell', 'arc', 'meteor', 'skill1', 'skill2', 'ultimate'].includes(button.dataset.battleCommand);
    const cooldown = isSpell ? Math.max(0, (next.nextSpellAt || 0) - (next.serverNow || Date.now())) : 0;
    if (cooldown) button.dataset.cooldown = String(Math.ceil(cooldown / 1000));
    else delete button.dataset.cooldown;
    button.disabled = !controls.canPlay() || next.status !== 'active' || next.energy < cost || cooldown > 0 || (button.dataset.battleCommand === 'heal' && !next.healAvailable);
  }
  if (command === 'ultimate') announceBattle('天命一击！');
  else if (command === 'spell') announceBattle('远程法球！');
  else if (command === 'arc') announceBattle('裂空连锁！');
  else if (command === 'meteor') announceBattle('天坠陨星！');
  else if (command === 'skill2') announceBattle('破阵横扫！');
  else if (command === 'skill1') announceBattle('金焰突进！');
  else if (command === 'heal') announceBattle('恢复气血！');
  else if (command === 'heavy') announceBattle('蓄力重击！');
  else if (command === 'dodge') announceBattle('闪避！');
  else if (command === 'strike' && next.combo % 3 === 0) announceBattle(`${next.combo} 连击！`);
  else if (previous && next.playerHp < previous.playerHp) announceBattle('注意对手反击！');
  if (next.status !== 'active' && previous?.status === 'active') finishBattle(next);
}

function finishBattle(result) {
  battleMusic.leave();
  if (document.pointerLockElement === $('battle-canvas')) document.exitPointerLock();
  clearInterval(battlePoll);
  battlePoll = null;
  clearInterval(battleMotionTimer);
  battleMotionTimer = null;
  $('battle-result-title').textContent = result.status === 'won' ? '胜利！' : result.status === 'draw' ? '平局！' : '再战一局！';
  $('battle-result-copy').textContent = result.mode === 'pvp'
    ? result.scored
      ? `双方有效交手，本轮练习分 +${result.points}。15 分钟重置；当前不能兑换代币。`
      : result.engaged
        ? '本场未计分：可能达到本轮场次上限，或有演示访客。继续约战仍可练习。'
        : '本场未计分：双方各造成至少 10 点伤害，才算有效交手。继续约战随时再打。'
    : result.status === 'won'
      ? result.rewarded ? (document.documentElement.lang==='en'?`+${result.contribution} contribution, +2 materials. Ready for the next duel.`:`贡献 +${result.contribution}，材料 +2，城市事件推进 1 点。下一场随时开打。`) : '你击败了对手！积分奖励有 60 秒间隔和每日上限，但可以继续挑战。'
      : 'WASD 拉开距离，按住右键转视角；1/2/3/4 连招，敌人施法前按空格闪避。';
  $('battle-rematch').textContent = result.mode === 'pvp' ? '继续约战 ↗' : '再打一局 ↗';
  document.querySelector('.opponent-pick').hidden = result.mode === 'pvp';
  setTimeout(() => { if (!$('battle-screen').hidden) $('battle-result').hidden = false; }, 650);
  refresh(true);
}

async function pollBattle() {
  if ($('battle-screen').hidden || battleBusy || !battle || battle.status !== 'active') return;
  $('battle-clock').textContent = Math.max(0, Math.ceil((battle.expiresAt - (arena?.serverNow() || Date.now())) / 1000));
  try {
    const result = await api(battle.mode === 'pvp' ? '/api/pvp/state' : '/api/battle/state');
    if (result.battle?.id === battle.id) renderBattle(result.battle);
  } catch { /* The next poll can recover without disrupting a match. */ }
}

async function openBattle(opponentId = 'cz') {
  if (!world?.me) return toast('请先试玩或连接钱包。');
  const request=++arenaRequest;
  battleMusic.enter();
  $('battle-screen').hidden = false;
  city?.pause(true);
  $('battle-loading').hidden = false;
  $('battle-result').hidden = true;
  document.body.classList.add('modal-open');
  clearInterval(battlePoll);
  clearInterval(battleMotionTimer);
  arena?.dispose(); arena = null; battle = null;
  try {
    let current = (await api('/api/battle/state')).battle;
    const fresh = !current || current.status !== 'active';
    if(fresh&&!controls.canPlay())throw new Error(document.documentElement.lang==='en'?'No live duel to watch.':'当前没有正在进行的格斗。');
    const enemyId = fresh ? opponentId : current.opponentId;
    selectedOpponent = enemyId;
    document.querySelector('.opponent-pick').hidden = false;
    for (const button of document.querySelectorAll('[data-opponent]')) button.classList.toggle('active', button.dataset.opponent === selectedOpponent);
    try { const loaded = await createArena($('battle-canvas'), fresh ? world.me.avatar_id : current.playerAvatarId || world.me.avatar_id, enemyId, world.me.aura,world.me.appearance);if(request!==arenaRequest){loaded.dispose();return;}arena=loaded; }
    catch (error) { throw new Error(`3D 竞技场加载失败：${error.message}`); }
    if (fresh) current = (await api('/api/battle/start', { opponentId: enemyId })).battle;
    if(request!==arenaRequest)return;
    renderBattle(current);
    $('battle-loading').hidden = true;
    announceBattle('开战！');
    battlePoll = setInterval(pollBattle, 180);
    battleMotionTimer = setInterval(sendBattleMotion, 90);
  } catch (error) { if(request===arenaRequest){leaveBattle(); toast(error.message);} }
}

async function openPvpBattle(current) {
  if (!world?.me || !current || current.status !== 'active') return;
  const request=++arenaRequest;
  battleMusic.enter();
  closeAgentId();
  $('battle-screen').hidden = false;
  city?.pause(true);
  $('battle-loading').hidden = false;
  $('battle-result').hidden = true;
  document.querySelector('.opponent-pick').hidden = true;
  document.body.classList.add('modal-open');
  clearInterval(battlePoll);
  clearInterval(battleMotionTimer);
  arena?.dispose(); arena = null; battle = null;
  try {
    const loaded = await createArena($('battle-canvas'), current.playerAvatarId || world.me.avatar_id, current.opponentId, world.me.aura,current.playerAppearance||world.me.appearance,current.opponentAppearance);
    if(request!==arenaRequest){loaded.dispose();return;}arena=loaded;
    renderBattle(current);
    $('battle-loading').hidden = true;
    announceBattle('联机开战！');
    battlePoll = setInterval(pollBattle, 180);
    battleMotionTimer = setInterval(sendBattleMotion, 90);
  } catch (error) { if(request===arenaRequest){leaveBattle(); toast(error.message);} }
}

function leaveBattle(resumeCity = true) {
  arenaRequest++;
  battleMusic.leave();
  clearInterval(battlePoll); battlePoll = null;
  clearInterval(battleMotionTimer); battleMotionTimer = null;
  heldKeys.clear();
  weaponChargeStartedAt = 0;
  arena?.setCharging(false);
  arena?.dispose(); arena = null; battle = null;
  $('battle-screen').hidden = true;
  city?.pause(false);
  if(resumeCity!==false&&world?.me?.avatar_set)ensureCity(world.me.avatar_id,world.me.aura);
  if ($('avatar-modal').hidden) document.body.classList.remove('modal-open');
}

async function battleMove(command, input = {}) {
  if (!controls.canPlay() || battleBusy || !battle || battle.status !== 'active') return;
  const now = performance.now();
  if (now - lastLocalBattleMoveAt < 370) return;
  lastLocalBattleMoveAt = now;
  battleBusy = true;
  if (command === 'strike' || command === 'heavy') arena?.aimMelee();
  try {
    const result = await api(battle.mode === 'pvp' ? '/api/pvp/command' : '/api/battle/command',
      { command, ...(['strike','heavy'].includes(command) ? {assist:true} : {}), ...(command === 'dodge' ? direction() : {}), ...input });
    renderBattle(result.battle, command);
  } catch (error) {
    if (!/太快|冷却/.test(error.message)) announceBattle(error.message);
  } finally { battleBusy = false; }
}

function updateTargetLock() {
  const locked = arena?.isTargetLocked() ?? true;
  $('battle-lock').setAttribute('aria-pressed', String(locked));
  $('battle-lock').textContent = t(locked ? 'Q · 已锁定目标' : 'Q · 自由视角');
}
function toggleTargetLock() { arena?.toggleLock(); updateTargetLock(); }

function beginStaffCharge() {
  if (!controls.canPlay() || !battle || battle.status !== 'active' || weaponChargeStartedAt) return;
  weaponChargeStartedAt = performance.now();
  arena?.setCharging(true);
  chargeRequest = api(battle.mode === 'pvp' ? '/api/pvp/command' : '/api/battle/command', { command: 'charge' })
    .catch(() => { arena?.setCharging(false); });
}

async function releaseStaffCharge() {
  if (!weaponChargeStartedAt) return;
  weaponChargeStartedAt = 0;
  arena?.setCharging(false);
  await chargeRequest;
  battleMove('heavy');
}

async function sendBattleMotion() {
  if (!controls.canPlay() || battleMotionBusy || !battle || battle.status !== 'active' || $('battle-screen').hidden) return;
  const { dx, dz } = direction();
  if (!dx && !dz) return;
  battleMotionBusy = true;
  try {
    const result = await api(battle.mode === 'pvp' ? '/api/pvp/command' : '/api/battle/command',
      { command: 'move', dx, dz, sprint: heldKeys.has('ShiftLeft') || heldKeys.has('ShiftRight') });
    if (result.battle?.id === battle.id) renderBattle(result.battle);
  } catch (error) {
    if (!/太频繁|冷却/.test(error.message)) announceBattle(error.message);
  } finally { battleMotionBusy = false; }
}

let watchedDuel=null,watchReading=false;
setInterval(async()=>{
  if(!controls.watching()||!world?.me||watchReading||document.hidden)return;watchReading=true;
  try{
    const [duel,lobby]=await Promise.all([api('/api/battle/state'),api('/api/moba/lobby')]);
    const r=lobby.current;controls.activity(r? (document.documentElement.lang==='en'?'Watch Starfall ↗':'观看星环战场 ↗'):null);
    if(duel.battle?.status==='active'&&duel.battle.id!==watchedDuel&&$('battle-screen').hidden&&!document.body.classList.contains('modal-open')){watchedDuel=duel.battle.id;await openBattle();}
  }catch{}finally{watchReading=false;}
},2000);

async function boot() {
  initLocale();
  journeyUI=createJourneyUI({api,toast,getCity:()=>city,controls,
    isActive:()=>$('battle-screen').hidden&&!document.body.classList.contains('modal-open')&&!cityLifeUI?.blocked(),onChanged:()=>refresh(true)});
  cityLifeUI=createCityLifeUI({api,toast,controls,isVisible:()=>$('battle-screen').hidden&&$('avatar-modal').hidden,getCity:()=>city,getWorld:()=>world,flush:()=>journeyUI.flush(),continueJourney:id=>journeyUI.interact(id),onChanged:()=>refresh(true)});
  $('city-energy-open').onclick=()=>cityLifeUI.energy.open();
  rewardsUI=createRewardsUI({toast,getPlayer:()=>world?.me});
  signalUI = createSignalUI({ api, toast, onSolved: () => refresh(true) });
  pvpUI = createPvpUI({ api, toast, onMatch: openPvpBattle,
    currentMatch: () => battle?.mode === 'pvp' && battle.status === 'active' ? battle.id : null });
  try {
    config = await api('/api/config');
    showTokenInfo(config,toast);
    if (!config.demoMode) $('demo-btn').hidden = true;
    $('wallet-btn').title = '签名进入格斗场，然后绑定属于该钱包的 .ai 名称';
    await refresh();
    if (world?.me?.is_demo && !world.me.avatar_set) {
      await api('/api/avatar', { avatarId: 'ember', aura: 'gold' });
      await refresh(true);
    } else if (world?.me?.avatar_set) {
      const livePvp = (await api('/api/pvp/state')).battle;
      if (livePvp?.status === 'active') await openPvpBattle(livePvp);
    }
  } catch (error) { toast(error.message); }
  $('demo-btn').addEventListener('click', enterDemo);
  $('arena-entry').addEventListener('click', () => openBattle(openingOpponent(world?.me?.avatar_id)));
  $('battle-exit').addEventListener('click', leaveBattle);
  $('battle-city').addEventListener('click', leaveBattle);
  $('battle-lock').addEventListener('click', toggleTargetLock);
  $('battle-rematch').addEventListener('click', () => {
    const wasPvp = battle?.mode === 'pvp';
    leaveBattle(wasPvp);
    if (wasPvp) pvpUI.open();
    else openBattle(selectedOpponent);
  });
  for (const button of document.querySelectorAll('[data-opponent]')) button.addEventListener('click', () => {
    selectedOpponent = button.dataset.opponent;
    for (const item of document.querySelectorAll('[data-opponent]')) item.classList.toggle('active', item === button);
  });
  document.addEventListener('keydown', event => {
    if ($('battle-screen').hidden) return;
    battleMusic.userGesture();
    if (['ShiftLeft', 'ShiftRight'].includes(event.code)) { event.preventDefault(); heldKeys.add(event.code); }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) { event.preventDefault(); heldKeys.add(event.code); return; }
    if (event.code === 'KeyQ') { event.preventDefault(); if (!event.repeat) toggleTargetLock(); return; }
    if (event.code === 'KeyK') { event.preventDefault(); beginStaffCharge(); return; }
    const command = event.shiftKey && event.code === 'Digit1' ? 'skill1'
      : event.shiftKey && event.code === 'Digit2' ? 'skill2' : BATTLE_KEYS[event.code];
    if (command) { event.preventDefault(); if (!event.repeat) battleMove(command); }
    if (event.code === 'Escape') {
      if (document.pointerLockElement === $('battle-canvas')) document.exitPointerLock();
      else leaveBattle();
    }
  });
  document.addEventListener('keyup', event => {
    heldKeys.delete(event.code);
    if (event.code === 'KeyK') releaseStaffCharge();
  });
  window.addEventListener('blur', () => heldKeys.clear());
  document.addEventListener('keydown', event => {
    if (!city || !$('battle-screen').hidden || !document.querySelector('.map-frame').classList.contains('city-live') ||
        document.body.classList.contains('modal-open') || document.body.classList.contains('puzzle-open') || cityLifeUI?.blocked() || ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) { event.preventDefault(); cityKeys.add(event.code); cityMotion(); }
    if (event.code === 'KeyE' && !event.repeat) { event.preventDefault(); cityInteract(); }
  });
  document.addEventListener('keyup', event => { cityKeys.delete(event.code); cityMotion(); });
  for (const button of document.querySelectorAll('[data-city-key]')) {
    button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); cityKeys.add(button.dataset.cityKey); cityMotion(); });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => { cityKeys.delete(button.dataset.cityKey); cityMotion(); });
  }
  $('city-interact').addEventListener('click', cityInteract);
  $('battle-canvas').addEventListener('pointerdown', event => {
    if ($('battle-screen').hidden) return;
    if (event.pointerType === 'mouse' && event.button === 0) battleMove('strike');
  });
  $('battle-canvas').addEventListener('contextmenu', event => event.preventDefault());
  $('battle-screen').addEventListener('pointerdown', event => {
    if (!event.target.closest('#battle-music')) battleMusic.userGesture();
  }, { capture: true });
  for (const button of document.querySelectorAll('[data-battle-command]')) button.addEventListener('click', () => battleMove(button.dataset.battleCommand));
  for (const button of document.querySelectorAll('[data-battle-key]')) {
    button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); heldKeys.add(button.dataset.battleKey); });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => heldKeys.delete(button.dataset.battleKey));
  }
  const touchCharge = document.querySelector('[data-battle-charge]');
  touchCharge.addEventListener('pointerdown', event => { event.preventDefault(); touchCharge.setPointerCapture(event.pointerId); beginStaffCharge(); });
  for (const type of ['pointerup', 'pointercancel']) touchCharge.addEventListener(type, releaseStaffCharge);
  window.addEventListener('blur', () => { heldKeys.clear(); cityKeys.clear(); cityMotion(); });
  $('wallet-btn').addEventListener('click', connectWallet);
  $('viewer-open').addEventListener('click', openViewer);
  $('agent-pair-open').addEventListener('click', openViewer);
  $('viewer-close').addEventListener('click', closeViewer);
  $('viewer-modal').addEventListener('click', event => { if (event.target === $('viewer-modal')) closeViewer(); });
  $('pair-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(pairPrompt()); toast('已复制，私发给你的 Agent 即可。'); }
    catch { toast('复制失败，请手动复制。'); }
  });
  $('viewer-submit').addEventListener('click', redeemViewerCode);
  $('viewer-code').addEventListener('keydown', event => { if (event.key === 'Enter') redeemViewerCode(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('viewer-modal').hidden) closeViewer(); });
  $('agent-id-open').addEventListener('click', openAgentId);
  $('agent-id-close').addEventListener('click', closeAgentId);
  $('agent-id-submit').addEventListener('click', claimAgentId);
  $('agent-id-name').addEventListener('keydown', event => { if (event.key === 'Enter') claimAgentId(); });
  $('agent-id-modal').addEventListener('click', event => { if (event.target === $('agent-id-modal')) closeAgentId(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('agent-id-modal').hidden) closeAgentId(); });
  $('logout-btn').addEventListener('click', logout);
  studioUI=createStudioUI({api,toast,getWorld:()=>world,getAvatar:()=>selectedAvatar,onSaved:()=>refresh(true)});
  $('edit-avatar-btn').addEventListener('click', openAvatar);
  $('close-avatar-btn').addEventListener('click', closeAvatar);
  $('save-avatar-btn').addEventListener('click', saveAvatar);
  $('avatar-modal').addEventListener('click', event => { if (event.target === $('avatar-modal')) closeAvatar(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('avatar-modal').hidden) closeAvatar(); });
  for (const button of document.querySelectorAll('[data-avatar]')) {
    const label = document.createElement('small');
    label.className = 'avatar-weapon';
    const spec = weaponFor(button.dataset.avatar);
    label.append(document.createTextNode(spec.zh), document.createTextNode(` · ${spec.reach.toFixed(1)}m`));
    button.append(label);
    button.addEventListener('click', () => {
    selectedAvatar = button.dataset.avatar;
    studioUI?.select();
    for (const item of document.querySelectorAll('[data-avatar]')) item.classList.toggle('active', item === button);
    });
  }
  for (const button of document.querySelectorAll('[data-aura]')) button.addEventListener('click', () => {
    selectedAura = button.dataset.aura;
    for (const item of document.querySelectorAll('[data-aura]')) item.classList.toggle('active', item === button);
  });
  $('key-btn').addEventListener('click', issueKey);
  $('revoke-btn').addEventListener('click', revokeKey);
  $('copy-key-btn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('key-value').textContent); toast('密钥已复制。'); }
    catch { toast('复制失败，请手动复制。'); }
  });
  for (const button of document.querySelectorAll('[data-role]')) button.addEventListener('click', () => chooseRole(button.dataset.role));
  for (const button of document.querySelectorAll('[data-action]')) button.addEventListener('click', () => doAction(button.dataset.action));
  const map = document.querySelector('.map-frame');
  map.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || map.classList.contains('is-focusing')) return;
    const bounds = map.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - .5;
    const y = (event.clientY - bounds.top) / bounds.height - .5;
    map.style.setProperty('--scene-x', `${(-x * 9).toFixed(1)}px`);
    map.style.setProperty('--scene-y', `${(-y * 7).toFixed(1)}px`);
    map.style.setProperty('--scene-rx', `${(-y * 1.2).toFixed(2)}deg`);
    map.style.setProperty('--scene-ry', `${(x * 1.2).toFixed(2)}deg`);
  });
  map.addEventListener('pointerleave', () => {
    for (const key of ['--scene-x', '--scene-y', '--scene-rx', '--scene-ry']) map.style.removeProperty(key);
  });
  setInterval(updateClock, 1000);
  setInterval(() => refresh(true), 5000);
}

boot();
