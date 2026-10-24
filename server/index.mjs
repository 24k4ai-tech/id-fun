import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createPublicClient, http, isAddress } from 'viem';
import {createChainClient} from './chain-client.mjs';
import { bsc } from 'viem/chains';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { isIP } from 'node:net';
import { openDatabase } from './db.mjs';
import { createAuth } from './auth.mjs';
import { claimAgentId } from './agent-id.mjs';
import { action, advanceWorld, setAvatar, setRole, state } from './game.mjs';
import { createStoryService } from './story.mjs';
import { battleCommand, battleState, startBattle } from './battle.mjs';
import { createChallenge, pvpCommand, pvpLobby, pvpState, resolveChallenge, receiveChallenge, startPvpSettlement } from './pvp.mjs';
import { nextPublicPayout } from './public-distribution.mjs';
import { matchHolderWeights } from './token-holder.mjs';
import { answerArenaSignal, arenaSignalState } from './arena-signal.mjs';
import { createStudioService } from './studio-service.mjs';
import { publicAppearance } from './studio-store.mjs';
import { startStudioWorker } from './studio-worker.mjs';
import { journeyState,journeyMove,journeyCommand } from './journey.mjs';
import {createRewardEstimator} from './reward-estimate.mjs';
import {startRewardWorker} from './reward-worker.mjs';
import {rewardCatalog,nextCatalogPayout} from './reward-catalog.mjs';
import {dispatchFlapTax} from './flap-tax-dispatch.mjs';
import {createEnergyService} from './energy.mjs';
import {createMobaService} from './moba.mjs';
import {gameControl,setGameControl,assertGameControl} from './game-control.mjs';
import {isGameWrite} from '../public/game-control-rules.js';
import {createCityLife} from './city-life.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const assets = new Map([
  ...['game-control.js','game-control-rules.js','remote-motion.js','token-info.js'].map(n=>['/'+n,[n,'text/javascript; charset=utf-8']]),
  ['/token-info.css',['token-info.css','text/css; charset=utf-8']],
  ['/game-control.css',['game-control.css','text/css; charset=utf-8']],
  ['/moba',['moba.html','text/html; charset=utf-8']],
  ...['moba-ui.js','moba-scene.js','moba-rules.js','world-actor.js','energy-ui.js','city-places.js','city-life-ui.js','city-people.js','city-interior.js'].map(n=>['/'+n,[n,'text/javascript; charset=utf-8']]),
  ...['moba.css','city-life.css'].map(n=>['/'+n,[n,'text/css; charset=utf-8']]),
  ['/flap-funding.js', ['flap-funding.js', 'text/javascript; charset=utf-8']],
  ['/', ['index-v2.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/game.css', ['game.css', 'text/css; charset=utf-8']],
  ['/city.css', ['city.css', 'text/css; charset=utf-8']],
  ['/logo.css', ['logo.css', 'text/css; charset=utf-8']],
  ['/city-hub-3d.png', ['city-hub-3d.png', 'image/png']],
  ['/figures-sheet.png', ['figures-sheet.png', 'image/png']],
  ['/avatar-ember.png', ['avatar-ember.png', 'image/png']],
  ['/avatar-shadow.png', ['avatar-shadow.png', 'image/png']],
  ['/avatar-maker.png', ['avatar-maker.png', 'image/png']],
  ['/avatar-trader.png', ['avatar-trader.png', 'image/png']],
  ['/portrait-jensen.png', ['portrait-jensen.png', 'image/png']],
  ['/portrait-vitalik.png', ['portrait-vitalik.png', 'image/png']],
  ['/portrait-trump.png', ['portrait-trump.png', 'image/png']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/battle.js', ['battle.js', 'text/javascript; charset=utf-8']],
  ['/combat-vfx.js', ['combat-vfx.js', 'text/javascript; charset=utf-8']],
  ['/character-assets.js', ['character-assets.js', 'text/javascript; charset=utf-8']],
  ['/character-manifest.js', ['character-manifest.js', 'text/javascript; charset=utf-8']],
  ['/character-preview.js', ['character-preview.js', 'text/javascript; charset=utf-8']],
  ['/studio-ui.js', ['studio-ui.js', 'text/javascript; charset=utf-8']],
  ['/studio-locale.js', ['studio-locale.js', 'text/javascript; charset=utf-8']],
  ['/studio.css', ['studio.css', 'text/css; charset=utf-8']],
  ['/lobby-art.webp', ['lobby-art.webp', 'image/webp']],
  ['/polish.css', ['polish.css', 'text/css; charset=utf-8']],
  ['/lobby.css', ['lobby.css', 'text/css; charset=utf-8']],
  ['/lobby-motion.js', ['lobby-motion.js', 'text/javascript; charset=utf-8']],
  ['/identity-v16.webp', ['identity-v16.webp', 'image/webp']],
  ['/identity-v16-mobile.webp', ['identity-v16-mobile.webp', 'image/webp']],
  ['/lineup-v16.webp', ['lineup-v16.webp', 'image/webp']],
  ['/lobby-v15.webp', ['lobby-v15.webp', 'image/webp']],
  ['/battle-controls.js', ['battle-controls.js', 'text/javascript; charset=utf-8']],
  ['/combat-camera.js', ['combat-camera.js', 'text/javascript; charset=utf-8']],
  ['/attack-telegraphs.js', ['attack-telegraphs.js', 'text/javascript; charset=utf-8']],
  ['/journey-rules.js', ['journey-rules.js', 'text/javascript; charset=utf-8']],
  ['/journey-ui.js', ['journey-ui.js', 'text/javascript; charset=utf-8']],
  ['/journey-world.js', ['journey-world.js', 'text/javascript; charset=utf-8']],
  ['/journey.css', ['journey.css', 'text/css; charset=utf-8']],
  ...['campaign-content.js','campaign-ui.js','puzzle-rules.js'].map(name=>['/'+name,[name,'text/javascript; charset=utf-8']]),
  ['/campaign.css',['campaign.css','text/css; charset=utf-8']],
  ['/weapon-config.js', ['weapon-config.js', 'text/javascript; charset=utf-8']],
  ['/weapon-model.js', ['weapon-model.js', 'text/javascript; charset=utf-8']],
  ['/city.js', ['city.js', 'text/javascript; charset=utf-8']],
  ['/city-buildings.js', ['city-buildings.js', 'text/javascript; charset=utf-8']],
  ['/city-controls.js', ['city-controls.js', 'text/javascript; charset=utf-8']],
  ['/locale.js', ['locale.js', 'text/javascript; charset=utf-8']],
  ['/guide.js', ['guide.js', 'text/javascript; charset=utf-8']],
  ['/fighter-identity.js', ['fighter-identity.js', 'text/javascript; charset=utf-8']],
  ['/battle-music.js', ['battle-music.js', 'text/javascript; charset=utf-8']],
  ['/arena-stage.js', ['arena-stage.js', 'text/javascript; charset=utf-8']],
  ['/arena-citadel.js', ['arena-citadel.js', 'text/javascript; charset=utf-8']],
  ['/arena-garden.js', ['arena-garden.js', 'text/javascript; charset=utf-8']],
  ['/vendor/meshopt-decoder.js',['vendor/meshopt-decoder.js','text/javascript; charset=utf-8']],
  ['/asset-credits',['ASSET-CREDITS.txt','text/plain; charset=utf-8']],
  ['/vegetation.js', ['vegetation.js', 'text/javascript; charset=utf-8']],
  ...['grass_ground-diff','grass_ground-nor_gl','forest_ground_04-diff','forest_ground_04-nor_gl','bark_brown_02-diff','bark_brown_02-nor_gl'].map(name=>['/textures/'+name+'.jpg',['textures/'+name+'.jpg','image/jpeg']]),
  ['/textures/arena-sky.hdr', ['textures/arena-sky.hdr', 'application/octet-stream']],
  ['/textures/square_floor-diff.jpg', ['textures/square_floor-diff.jpg', 'image/jpeg']],
  ['/textures/square_floor-nor.jpg', ['textures/square_floor-nor.jpg', 'image/jpeg']],
  ['/textures/rock_01-diff.jpg', ['textures/rock_01-diff.jpg', 'image/jpeg']],
  ['/textures/rock_01-nor.jpg', ['textures/rock_01-nor.jpg', 'image/jpeg']],
  ['/pvp-ui.js', ['pvp-ui.js', 'text/javascript; charset=utf-8']],
  ['/signal-ui.js', ['signal-ui.js', 'text/javascript; charset=utf-8']],
  ['/rewards-ui.js', ['rewards-ui.js', 'text/javascript; charset=utf-8']],
  ['/reward-overview.js', ['reward-overview.js', 'text/javascript; charset=utf-8']],
  ['/agent-guide', ['agent-guide.html', 'text/html; charset=utf-8']],
  ['/arena-agent-skill', ['arena-agent-skill.md', 'text/markdown; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
  ['/id-fun-logo.png', ['id-fun-logo.png', 'image/png']],
  ['/id-fun-logo.webp', ['id-fun-logo.webp', 'image/webp']],
]);
const errors = {
  control_invalid:[400,'请选择有效的操作模式'],control_no_agent:[409,'请先接入 Agent'],
  control_paused:[409,'操作权已切换，请查看页面上方的控制状态'],control_changed:[409,'操作权已更新，请刷新状态后重试'],
  energy_not_live:[409,'充能尚未开放，当前不会收费'],energy_insufficient:[409,'奖励能量不足，请先充能或选择免费练习'],
  energy_wallet_required:[403,'请先连接钱包'],energy_invalid:[400,'充能订单无效'],energy_burn_short:[409,'黑洞实际到账不足，请保留交易记录联系支持'],energy_payment_used:[409,'该交易已经充能，不能重复使用'],
  activity_not_live:[409,'奖励模式尚未开放，请选择免费练习'],activity_identity_required:[403,'奖励模式需要每位玩家绑定不同的 .ai 身份'],activity_token_required:[403,'奖励模式需要持有 IF'],city_inside:[409,'请先离开建筑'],activity_pair_limit:[409,'今天与该对手的奖励次数已满，请选择免费练习'],activity_busy:[409,'已有奖励活动正在进行'],activity_daily_limit:[409,'今日奖励活动次数已满，可继续免费练习'],
  moba_invalid:[400,'无效的战场操作'],moba_not_found:[404,'房间不存在或你尚未加入'],moba_already_joined:[409,'请先退出当前房间'],moba_full:[409,'房间已满'],moba_not_ready:[409,'请等待所有玩家准备，且由房主开始'],moba_need_players:[409,'奖励对局需要双方人数齐全'],moba_in_progress:[409,'对局仍在进行，可暂时离开页面，结束后再开新局'],moba_inactive:[409,'对局已结束'],
  city_invalid:[400,'未知的城市委托'],city_reward_limit:[409,'今日已参加三次奖励委托，可以继续普通探索'],city_wrong_alignment:[409,'方向不匹配，请观察仪器的标记'],city_too_fast:[409,'请完成观察和递送，再回来交付'],
  journey_invalid_move:[409,'位置同步中，请稍后再试'],journey_invalid_command:[400,'无效的旅程操作'],
  journey_in_progress:[409,'先完成或放弃当前旅程'],journey_locked:[409,'先完成前面的旅程目标'],
  journey_too_far:[409,'请走近目标再按 E'],journey_no_active:[409,'请先领取旅程'],
  journey_cooldown:[429,'稍候再互动'],journey_wrong_target:[409,'这里不是当前目标'],
  campaign_invalid_move:[400,'无法执行这个机关操作'],campaign_stale:[409,'进度已变化，请重试'],
  studio_not_live:[409,'AI 铸造将在 IF 发行并配置后开放，当前不会收费'],
  studio_wallet_required:[403,'请连接钱包以永久保存上传内容'],
  studio_invalid_appearance:[400,'形象参数无效'],studio_invalid_image:[400,'请上传 5 MB 以内的 JPG、PNG 或 WebP 图片'],
  studio_upload_limit:[429,'已达到上传数量上限'],studio_not_found:[404,'没有找到你的作品'],
  studio_invalid_prompt:[400,'请用 8 至 600 个字符描述你的作品'],studio_job_pending:[409,'已有作品正在制作或等待支付'],
  studio_in_battle:[409,'请在对局结束后更换形象'],studio_not_ready:[409,'作品还未制作完成'],
  studio_invalid_payment:[400,'交易与这笔订单不匹配'],studio_wrong_chain:[400,'请使用 BNB Smart Chain'],
  studio_confirming:[409,'交易正在确认，请稍后重试验证'],studio_payment_outside_invoice:[400,'交易不在订单有效时间内'],
  studio_payment_used:[409,'这笔交易已经用于另一件作品'],studio_already_paid:[409,'订单已支付'],
  studio_retry_unavailable:[409,'当前无法重试，请查看订单状态'],studio_refund_unavailable:[409,'当前状态无法申请退款'],
  studio_payment_unavailable:[503,'暂时无法核对交易，请保留交易哈希并稍后重试'],
  invalid_wallet: [400, '钱包地址格式不正确'], invalid_role: [400, '请选择有效角色'], invalid_action: [400, '未知行动'],
  invalid_avatar: [400, '请选择有效的形象和光环'],
  invalid_opponent: [400, '未知对手'], invalid_battle_command: [400, '未知战斗动作'],
  battle_in_progress: [409, '上一场战斗还在进行'], no_active_battle: [409, '请先开始战斗'],
  battle_command_cooldown: [429, '出招太快了'], battle_special_cooldown: [429, '绝招仍在冷却'],
  battle_not_enough_energy: [409, '能量不足，先用轻击积攒'], battle_heal_used: [409, '本局恢复已使用'],
  battle_out_of_range: [409, '距离太远，先靠近对手'], invalid_move: [400, '移动方向无效'],
  battle_move_cooldown: [429, '移动指令太频繁'],
  battle_dodge_cooldown: [429, '闪避仍在冷却'],
  pvp_invalid_target: [400, '请输入对手的钱包地址或准确名称'], pvp_ambiguous_target: [409, '有多个同名玩家，请用完整钱包地址约战'],
  pvp_target_not_found: [404, '没有找到这名已入场的玩家'], pvp_self_challenge: [400, '不能挑战自己'],
  pvp_match_in_progress: [409, '有玩家正在对战'], pvp_challenge_pending: [409, '双方已有待处理的约战'],
  pvp_too_many_challenges: [429, '待处理约战已满'], pvp_invalid_challenge: [400, '约战参数无效'],
  pvp_challenge_unavailable: [409, '约战已过期或已处理'], pvp_no_active_match: [409, '当前没有联机对战'],
  invalid_json: [400, '请求格式不正确'], body_too_large: [413, '请求过大'], unsupported_media_type: [415, '请发送 JSON'],
  challenge_expired: [401, '签名请求已过期，请重试'], bad_signature: [401, '钱包签名未通过验证'],
  agent_registry_unconfigured: [503, 'Agent ID 验证尚未配置，当前可体验演示模式'],
  agent_id_required: [403, '这个钱包还没有可验证的 .ai Agent ID'],
  agent_id_requires_wallet: [403, '请先用 .ai 对应的钱包签名进入'],
  agent_id_invalid_name: [400, '请输入有效的 .ai 名称'],
  agent_id_resolver_unavailable: [503, '.ai 名称服务暂时不可用，请稍后重试'],
  agent_id_not_found: [404, '没有查到这个 .ai 名称'],
  agent_id_wallet_mismatch: [403, '这个 .ai 名称解析到的钱包与你签名的钱包不同'],
  signal_expired: [409, '这轮信号已经切换，请读取新任务'],
  signal_already_answered: [409, '本轮信号已经处理，请等待下一轮'],
  viewer_code_invalid: [401, '接入码无效或已过期，请让 Agent 重新生成'],
  pair_invalid: [401, '配对码无效或已过期，请重新发起接入'],
  pair_not_ready: [409, 'Agent 还没有完成签名'],
  token_balance_unavailable: [503, '暂时无法核对持币，请稍后再接战'],
  demo_disabled: [403, '演示模式已关闭'], unauthorized: [401, '请先连接钱包或进入演示模式'],
  resident_not_found: [404, '居民不存在'], action_cooldown: [429, '行动冷却中，请稍候'],
  no_stamina: [409, '体力不足，请稍候恢复'], not_enough_material: [409, '材料不足'],
  role_locked: [409, '首次行动后角色锁定'], agent_key_requires_wallet: [403, '演示访客不能创建 Agent 密钥'],
  too_many_requests: [429, '操作太频繁，请稍后重试'],
  bad_origin: [403, '请求来源不匹配'], bad_method: [405, '请求方式不支持'], not_found: [404, '页面不存在'],
  invalid_treasury_day: [400, '请选择有效的 UTC 日期'],
};

function configFromEnv(env = process.env) {
  const port = Number(env.PORT || 3200);
  const roundSeconds = Number(env.ROUND_SECONDS || 120);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT');
  if (!Number.isInteger(roundSeconds) || roundSeconds < 5 || roundSeconds > 3600) throw new Error('Invalid ROUND_SECONDS');
  const bindAddress = env.BIND_ADDRESS || '127.0.0.1';
  if (!isIP(bindAddress)) throw new Error('Invalid BIND_ADDRESS');
  const origin = env.PUBLIC_ORIGIN || `http://127.0.0.1:${port}`;
  if (env.GAME_TOKEN_ADDRESS && !isAddress(env.GAME_TOKEN_ADDRESS)) throw new Error('Invalid GAME_TOKEN_ADDRESS');
  if (env.REWARD_TREASURY_ADDRESS && !isAddress(env.REWARD_TREASURY_ADDRESS)) throw new Error('Invalid REWARD_TREASURY_ADDRESS');
  const parsed = new URL(origin);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) {
    throw new Error('PUBLIC_ORIGIN must use HTTPS except on localhost');
  }
  return {
    port, bindAddress, origin: parsed.origin, roundMs: roundSeconds * 1000,
    dbPath: env.DB_PATH || './data/city.sqlite', demoMode: env.DEMO_MODE !== '0',
    trustProxy: env.TRUST_PROXY === '1',
    rpcUrl: env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/',
    gameTokenAddress: env.GAME_TOKEN_ADDRESS || null,
    energy:{enabled:env.ENERGY_ENABLED==='1',decimals:Number(env.GAME_TOKEN_DECIMALS||18),taxBps:Number(env.ENERGY_TRANSFER_TAX_BPS||0)},
    studio:{enabled:env.STUDIO_ENABLED==='1',recipient:env.STUDIO_PAYMENT_ADDRESS||null,decimals:Number(env.GAME_TOKEN_DECIMALS||18),
      taxBps:Number(env.STUDIO_TRANSFER_TAX_BPS||0),dir:env.STUDIO_DATA_DIR||null,piapiKey:env.PIAPI_API_KEY||null,
      higgsKey:env.HF_CREDENTIALS||null,dailyUsd:Number(env.STUDIO_DAILY_USD||3)},
    rewardTreasuryAddress: env.REWARD_TREASURY_ADDRESS || null,
    publicRewardManifestPath: env.PUBLIC_REWARD_MANIFEST_PATH || null,
    rewardManifestDir:env.REWARD_MANIFEST_DIR||null,rewardPeriodSeconds:Number(env.REWARD_PERIOD_SECONDS||60),
    rewardAutoEnabled:env.REWARD_AUTO_ENABLED==='1',rewardPublisherKey:env.REWARD_PUBLISHER_PRIVATE_KEY||null,
    rewardFromBlock:env.REWARD_FROM_BLOCK||null,
    agentRegistry: env.AGENT_ID_REGISTRY || null,
    aiApiKey: env.OPENROUTER_API_KEY || null,
    aiModel: env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
    storyCooldownMs: Math.max(30, Number(env.AI_STORY_COOLDOWN_SECONDS || 90)) * 1000,
    aiAllowDemo: env.AI_ALLOW_DEMO === '1',
    aiMaxDailyCalls: Math.max(0, Number(env.AI_MAX_DAILY_CALLS || 200)),
  };
}

function json(res, status, value, cookie = null) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...(cookie ? { 'Set-Cookie': cookie } : {}),
  });
  res.end(JSON.stringify(value));
}

function cookieValue(req, name) {
  const field = (req.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith(`${name}=`));
  return field ? field.slice(name.length + 1) : null;
}

async function readJson(req) {
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) throw new Error('unsupported_media_type');
  let length = 0;
  const parts = [];
  for await (const part of req) {
    length += part.length;
    if (length > 16_384) throw new Error('body_too_large');
    parts.push(part);
  }
  try {
    const result = JSON.parse(Buffer.concat(parts).toString('utf8'));
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
    return result;
  } catch { throw new Error('invalid_json'); }
}

export function createApp(config = configFromEnv()) {
  const db = openDatabase(config.dbPath, config.roundMs);
  const auth = createAuth(db, config);
  const tokenClient = config.gameTokenAddress ? createChainClient(config.rpcUrl) : null;
  const rewardClient=config.rewardTreasuryAddress?createChainClient(config.rpcUrl):null;
  const stopRewardWorker=startRewardWorker(db,rewardClient,config);
  const stopPvpSettlement=startPvpSettlement(db);
  const rewardEstimate=createRewardEstimator({db,client:rewardClient,config});
  const studio=createStudioService(db,config,tokenClient);
  const energy=createEnergyService(db,config,tokenClient);
  const moba=createMobaService(db,config,tokenClient);
  const cityLife=createCityLife(db,config,tokenClient);
  const stopStudioWorker=startStudioWorker(db,studio.settings);
  const story = createStoryService(db, { apiKey: config.aiApiKey, model: config.aiModel, cooldownMs: config.storyCooldownMs, maxDailyCalls: config.aiMaxDailyCalls });
  const rates = new Map();
  function rateLimit(req, name, limit, periodMs) {
    const proxyAddress = req.headers['x-real-ip'];
    const address = config.trustProxy && typeof proxyAddress === 'string' && isIP(proxyAddress)
      ? proxyAddress : req.socket.remoteAddress;
    const key = `${address || 'unknown'}:${name}`;
    const now = Date.now();
    const row = rates.get(key);
    const next = !row || row.resetAt <= now ? { count: 1, resetAt: now + periodMs } : { count: row.count + 1, resetAt: row.resetAt };
    rates.set(key, next);
    if (next.count > limit) throw new Error('too_many_requests');
  }
  const sessionCookie = token => `ac_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${config.origin.startsWith('https:') ? '; Secure' : ''}`;
  const clearCookie = `ac_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${config.origin.startsWith('https:') ? '; Secure' : ''}`;
  const server = createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', config.origin);
      const path = requestUrl.pathname;
      if(req.method==='GET'&&path.startsWith('/creations/')){
        const asset=await studio.publicFile(path);res.writeHead(200,{'Content-Type':asset.mime,'Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'});res.end(asset.bytes);return;
      }
      if(req.method==='GET'&&/^\/(?:models\/(?:ember|shadow|maker|trader|cz|heyi|sbf|musk|jensen|vitalik|trump|afeng)-v2(?:-lod)?\.glb|portraits\/(?:ember|shadow|maker|trader|cz|heyi|sbf|musk|jensen|vitalik|trump|afeng)(?:-full)?\.webp)$/.test(path)){
        const data=await readFile(join(root,'public',path.slice(1)));res.writeHead(200,{'Content-Type':path.endsWith('.glb')?'model/gltf-binary':'image/webp','Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'});res.end(data);return;
      }
      if (req.method === 'GET' && path === '/engine/babylon.js') {
        const data = await readFile(join(root, 'node_modules', 'babylonjs', 'babylon.js'));
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
        res.end(data);
        return;
      }
      if (req.method === 'GET' && path === '/engine/babylonjs.loaders.js') {
        const data = await readFile(join(root, 'node_modules', 'babylonjs-loaders', 'babylonjs.loaders.min.js'));
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
        res.end(data);
        return;
      }
      if (req.method === 'GET' && ['/models/fighter-male.glb', '/models/fighter-female.glb', '/models/outfit-male.glb', '/models/outfit-female.glb',
        '/models/gothic_statue.glb', '/models/rock_face_01.glb', '/models/ember-v1.glb', '/models/cz-v1.glb', '/models/garden-gate-v1.glb', '/models/jacaranda-tree-v1.glb', '/models/grass_medium_01.glb', '/models/market-pavilion-v1.glb', '/models/observatory-pavilion-v1.glb',
        '/models/tunic-male.glb', '/models/tunic-female.glb',
        '/models/hair-buzzed.glb', '/models/hair-buzzedfemale.glb', '/models/hair-simpleparted.glb', '/models/hair-long.glb', '/models/hair-buns.glb'].includes(path)) {
        const data = await readFile(join(root, 'public', path.slice(1)));
        res.writeHead(200, { 'Content-Type': 'model/gltf-binary', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
        res.end(data);
        return;
      }
      if (req.method === 'GET' && assets.has(path)) {
        const [file, mime] = assets.get(path);
        const data = await readFile(join(root, 'public', file));
        res.writeHead(200, {
          'Content-Type': mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
          'Referrer-Policy': 'no-referrer',
        });
        res.end(data);
        return;
      }
      if (!path.startsWith('/api/')) throw new Error('not_found');
      const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
      const session = cookieValue(req, 'ac_session');
      const wallet = bearer ? auth.walletFromAgentKey(bearer) : auth.walletFromSession(session);
      if(req.method==='GET'&&path==='/api/control'){if(!wallet)throw new Error('unauthorized');json(res,200,gameControl(db,wallet));return;}
      if(req.method==='GET'&&path==='/api/energy'){json(res,200,energy.status(wallet));return;}
      if(req.method==='GET'&&path==='/api/moba/lobby'){if(!wallet)throw new Error('unauthorized');rateLimit(req,`moba-lobby:${wallet}`,100,60000);json(res,200,moba.lobby(wallet));return;}
      if(req.method==='GET'&&path==='/api/moba/state'){if(!wallet)throw new Error('unauthorized');rateLimit(req,`moba-state:${wallet}`,400,60000);json(res,200,moba.state(wallet,requestUrl.searchParams.get('id')));return;}
      if(req.method==='GET'&&path==='/api/city-life'){if(!wallet)throw new Error('unauthorized');json(res,200,cityLife.status(wallet));return;}
      if(req.method==='GET'&&path==='/api/studio') {json(res,200,studio.status(wallet));return;}
      if(req.method==='GET'&&/^\/api\/studio\/reference\/[a-f0-9-]{36}$/.test(path)){
        if(!wallet||bearer)throw new Error('unauthorized');const data=await studio.reference(wallet,path.split('/').at(-1));res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.end(data);return;
      }
      if (req.method === 'GET' && path === '/api/health') {
        db.prepare('SELECT 1').get();
        json(res,200,{ok:true,rewardsConfigured:config.rewardAutoEnabled===true});return;
      }
      if (req.method === 'GET' && path === '/api/config') {
        json(res, 200, { demoMode: config.demoMode, agentIdReady: true, agentIdMethod: 'space-id-api', aiConfigured: story.isConfigured,
          tokenLive: Boolean(config.gameTokenAddress),tokenAddress:config.gameTokenAddress||null,treasuryAddress:config.rewardTreasuryAddress||null,chainId:56,
          scorePolicy:{manualBps:5000,agentBps:10000,precision:2,mixed:'accepted_input_seconds'}, roundSeconds: config.roundMs / 1000,rewardPeriodSeconds:config.rewardPeriodSeconds??60 });
        return;
      }
      if (req.method === 'GET' && path === '/api/rewards/next') {
        if (!config.publicRewardManifestPath&&!config.rewardTreasuryAddress) { json(res, 200, { status: 'not_live' }); return; }
        rateLimit(req, 'reward-preview', 20, 60_000);
        const mine=requestUrl.searchParams.get('mine')==='1';if(mine&&!wallet)throw new Error('unauthorized');
        const client=rewardClient||createPublicClient({chain:bsc,transport:http(config.rpcUrl,{timeout:10000})});
        const result=await nextCatalogPayout(client,await rewardCatalog(config,db,mine?wallet:null),mine?wallet:null);
        json(res,200,result.status==='not_live'&&config.rewardTreasuryAddress?{status:'waiting'}:result);
        return;
      }
      if(req.method==='GET'&&path==='/api/rewards/estimate'){
        rateLimit(req,'reward-estimate',30,60000);const result=await rewardEstimate();
        json(res,200,{...result,me:wallet?result.rows.find(r=>r.wallet.toLowerCase()===wallet.toLowerCase())||null:null});return;
      }
      if(req.method==='GET'&&path==='/api/treasury/funding'){
        if(!rewardClient||!config.gameTokenAddress){json(res,200,{status:'not_live'});return;}
        rateLimit(req,'treasury-funding',20,60000);
        try {
          json(res,200,await dispatchFlapTax({client:rewardClient,tokenAddress:config.gameTokenAddress,vaultAddress:config.rewardTreasuryAddress}));
        } catch { json(res,503,{status:'unavailable'}); }
        return;
      }
      if (req.method === 'GET' && path === '/api/state') {
        advanceWorld(db, Date.now(), config.roundMs);
        const world=state(db,wallet);if(world.me){world.me.appearance=publicAppearance(db,wallet);world.me.control=gameControl(db,wallet);}json(res,200,world);
        return;
      }
      if (req.method === 'GET' && path === '/api/arena-signal') {
        if (!wallet) throw new Error('unauthorized');
        json(res, 200, arenaSignalState(db, wallet));
        return;
      }
      if (req.method === 'GET' && path === '/api/journey') {
        if (!wallet) throw new Error('unauthorized');
        json(res,200,journeyState(db,wallet));return;
      }
      if (req.method === 'GET' && path === '/api/battle/state') {
        if (!wallet) throw new Error('unauthorized');
        json(res, 200, { battle: battleState(db, wallet) });
        return;
      }
      if (req.method === 'GET' && path === '/api/pvp/lobby') {
        if (!wallet) throw new Error('unauthorized');
        json(res, 200, {...pvpLobby(db, wallet),energyRequired:energy.live,energyCost:4});
        return;
      }
      if (req.method === 'GET' && path === '/api/pvp/state') {
        if (!wallet) throw new Error('unauthorized');
        json(res, 200, { battle: pvpState(db, wallet) });
        return;
      }
      if (req.method !== 'POST') throw new Error('bad_method');
      const typedAuth = path === '/api/auth/typed-challenge' || path === '/api/auth/typed-verify';
      if (req.headers.origin !== config.origin && !(bearer && wallet && !req.headers.origin) &&
          !(typedAuth && !req.headers.origin)) throw new Error('bad_origin');
      let controlLease;
      const checkControl=()=>{if(isGameWrite(path)){const s=assertGameControl(db,wallet,Boolean(bearer),controlLease??req.headers['x-game-control']);controlLease=s.version;}};
      if(path.startsWith('/api/moba/')||path.startsWith('/api/energy/')||path.startsWith('/api/city-life/')){
        if(!wallet)throw new Error('unauthorized');
        rateLimit(req,`expansion:${wallet}`,600,60000);const input=await readJson(req);checkControl();let result;
        if(path==='/api/energy/order'||path==='/api/energy/confirm'){
          if(bearer)throw new Error('unauthorized');rateLimit(req,`energy:${wallet}`,20,60000);
          result=path.endsWith('/order')?energy.order(wallet):await energy.confirm(wallet,input.id,input.hash);
        }else if(path==='/api/moba/create'){rateLimit(req,`moba-create:${wallet}`,10,60000);result=moba.create(wallet,input);}
        else if(path==='/api/moba/join')result=moba.join(wallet,input.id,input.hero);
        else if(path==='/api/moba/ready')result=moba.ready(wallet,input.id,input.hero,input.ready);
        else if(path==='/api/moba/start')result=await moba.start(wallet,input.id,checkControl);
        else if(path==='/api/moba/leave')result=moba.leave(wallet,input.id);
        else if(path==='/api/moba/forfeit')result=moba.forfeit(wallet,input.id);
        else if(path==='/api/moba/command')result=moba.command(wallet,input.id,input,bearer?'agent':'human');
        else if(path==='/api/city-life/enter')result=cityLife.enter(wallet,input.id);
        else if(path==='/api/city-life/exit')result=cityLife.exit(wallet);
        else if(path==='/api/city-life/move')result=cityLife.move(wallet,input,Date.now(),bearer?'agent':'human');
        else if(path==='/api/city-life/start')result=await cityLife.start(wallet,input.kind,input.ranked===true,Date.now(),checkControl);
        else if(path==='/api/city-life/interact')result=cityLife.interact(wallet,input.choice,Date.now(),bearer?'agent':'human');
        else if(path==='/api/city-life/abandon')result=cityLife.abandon(wallet);
        else throw new Error('not_found');json(res,200,result);return;
      }
      if(path.startsWith('/api/studio/')){
        if(!wallet||bearer)throw new Error('unauthorized');rateLimit(req,'studio',30,60_000);
        if(path==='/api/studio/upload'){rateLimit(req,'studio-upload',5,3_600_000);json(res,201,await studio.upload(wallet,req));return;}
        const body=await readJson(req);let result;
        if(path==='/api/studio/appearance')result=studio.save(wallet,body);
        else if(path==='/api/studio/equip')result=studio.equip(wallet,body);
        else if(path==='/api/studio/invoice')result=studio.invoice(wallet,body);
        else if(path==='/api/studio/payment')result=await studio.pay(wallet,body);
        else if(path==='/api/studio/retry')result=studio.retry(wallet,body.id);
        else if(path==='/api/studio/refund')result=studio.requestRefund(wallet,body.id);
        else throw new Error('not_found');json(res,200,result);return;
      }
      const body = await readJson(req);
      checkControl();
      if(path==='/api/control'){if(!wallet||bearer)throw new Error('unauthorized');json(res,200,setGameControl(db,wallet,body.mode));return;}
      if (path === '/api/auth/challenge') {
        rateLimit(req, 'challenge', 10, 60_000);
        json(res, 200, auth.challenge(body.address));
      } else if (path === '/api/auth/typed-challenge') {
        rateLimit(req, 'typed-challenge', 10, 60_000);
        json(res, 200, auth.typedChallenge(body.address, body.pairCode ?? null));
      } else if (path === '/api/auth/typed-verify') {
        rateLimit(req, 'typed-verify', 10, 60_000);
        json(res, 200, await auth.verifyTyped(body));
      } else if (path === '/api/auth/pair/start') {
        rateLimit(req, 'pair-start', 5, 60_000);
        json(res, 200, auth.startPair());
      } else if (path === '/api/auth/pair/status') {
        rateLimit(req, 'pair-status', 90, 60_000);
        json(res, 200, auth.pairStatus(body.code));
      } else if (path === '/api/auth/pair/complete') {
        rateLimit(req, 'pair-complete', 10, 60_000);
        const result = auth.completePair(body.code);
        json(res, 200, { wallet: result.wallet }, sessionCookie(result.token));
      } else if (path === '/api/auth/viewer') {
        rateLimit(req, 'viewer-code', 5, 60_000);
        const result = auth.redeemViewerCode(body.code);
        json(res, 200, { wallet: result.wallet }, sessionCookie(result.token));
      } else if (path === '/api/auth/verify') {
        rateLimit(req, 'verify', 10, 60_000);
        const result = await auth.verify(body);
        json(res, 200, { wallet: result.wallet, handle: result.handle, verifiedAi: result.verifiedAi }, sessionCookie(result.token));
      } else if (path === '/api/demo/start') {
        rateLimit(req, 'demo', 5, 3_600_000);
        const result = auth.guest();
        json(res, 200, { wallet: result.wallet, handle: result.handle }, sessionCookie(result.token));
      } else if (path === '/api/logout') {
        auth.logout(session);
        json(res, 200, { ok: true }, clearCookie);
      } else if (path === '/api/role') {
        if (!wallet || bearer) throw new Error('unauthorized');
        json(res, 200, { role: setRole(db, wallet, body.role) });
      } else if (path === '/api/avatar') {
        if (!wallet || bearer) throw new Error('unauthorized');
        json(res, 200, setAvatar(db, wallet, body.avatarId, body.aura));
      } else if (path === '/api/agent-id/claim') {
        if (!wallet || bearer) throw new Error('agent_id_requires_wallet');
        rateLimit(req, 'agent-id-claim', 6, 60 * 60_000);
        json(res, 200, await claimAgentId(db, wallet, body.name, config.agentIdFetcher));
      } else if (path === '/api/action') {
        if (!wallet) throw new Error('unauthorized');
        advanceWorld(db, Date.now(), config.roundMs);
        json(res, 200, action(db, wallet, body.kind, bearer ? 'agent' : 'human'));
      } else if (path === '/api/journey/move') {
        if (!wallet) throw new Error('unauthorized');
        if(cityLife.status(wallet).visit)throw new Error('city_inside');
        rateLimit(req,`journey-move:${wallet}`,400,60000);
        json(res,200,journeyMove(db,wallet,body,Date.now(),bearer?'agent':'human'));
      } else if (path === '/api/journey/command') {
        if (!wallet) throw new Error('unauthorized');
        rateLimit(req,`journey-command:${wallet}`,360,60000);
        json(res,200,journeyCommand(db,wallet,body.command,body,Date.now(),bearer?'agent':'human'));
      } else if (path === '/api/arena-signal') {
        if (!wallet) throw new Error('unauthorized');
        rateLimit(req, 'arena-signal', 12, 60_000);
        json(res, 200, answerArenaSignal(db, wallet, body.roundId, body.choice, bearer ? 'agent' : 'human'));
      } else if (path === '/api/battle/start') {
        if (!wallet) throw new Error('unauthorized');
        rateLimit(req, 'battle-start', 30, 60_000);
        json(res, 200, { battle: startBattle(db, wallet, body.opponentId) });
      } else if (path === '/api/battle/command') {
        if (!wallet) throw new Error('unauthorized');
        rateLimit(req, 'battle-command', 900, 60_000);
        json(res, 200, { battle: battleCommand(db, wallet, body.command, bearer ? 'agent' : 'human', Date.now(), body) });
      } else if (path === '/api/pvp/challenge') {
        if (!wallet) throw new Error('unauthorized');
        rateLimit(req, 'pvp-challenge', 12, 60_000);
        json(res, 200, { challenge: createChallenge(db, wallet, body.target) });
      } else if (path === '/api/pvp/challenge/received') {
        if (!wallet) throw new Error('unauthorized');
        rateLimit(req, 'pvp-receipt', 120, 60_000);
        json(res, 200, receiveChallenge(db, wallet, Number(body.id)));
      } else if (path === '/api/pvp/challenge/respond') {
        if (!wallet) throw new Error('unauthorized');
        const challengeId = Number(body.id);
        let holderCheck = null;
        if (body.decision === 'accept' && tokenClient) {
          const challenge = db.prepare('SELECT challenger,target,status FROM pvp_challenges WHERE id=?').get(challengeId);
          if (challenge?.status === 'pending' && challenge.target === wallet &&
              isAddress(challenge.challenger) && isAddress(wallet)) {
            try {
              holderCheck = { ...(await matchHolderWeights(tokenClient, config.gameTokenAddress,
                [challenge.challenger, wallet])), tokenAddress: config.gameTokenAddress,energyRequired:energy.live };
            } catch { throw new Error('token_balance_unavailable'); }
          }
        }
        checkControl();
        json(res, 200, resolveChallenge(db, wallet, challengeId, body.decision, Date.now(), holderCheck));
      } else if (path === '/api/pvp/command') {
        if (!wallet) throw new Error('unauthorized');
        rateLimit(req, 'pvp-command', 900, 60_000);
        json(res, 200, { battle: pvpCommand(db, wallet, body.command, body,Date.now(),bearer?'agent':'human') });
      } else if (path === '/api/story') {
        if (!wallet) throw new Error('unauthorized');
        json(res, 200, await story.generate(wallet, Date.now(), !wallet.startsWith('demo:') || config.aiAllowDemo));
      } else if (path === '/api/agent-key') {
        if (!wallet || bearer) throw new Error('unauthorized');
        json(res, 200, auth.issueAgentKey(wallet));
      } else if (path === '/api/agent-key/revoke') {
        if (!wallet || bearer) throw new Error('unauthorized');
        auth.revokeAgentKeys(wallet);
        json(res, 200, { ok: true });
      } else {
        throw new Error('not_found');
      }
    } catch (error) {
      const [status, message] = errors[error.message] || [500, '服务器暂时无法处理，请稍后重试'];
      if (status === 500) console.error(error);
      json(res, status, { error: status === 500 ? 'internal_error' : error.message, message });
    }
  });
  server.on('close',stopStudioWorker);
  server.on('close',stopRewardWorker);
  server.on('close',stopPvpSettlement);
  server.on('close',moba.stop);
  return { server, db, config };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const { server, config } = createApp();
  server.listen(config.port, config.bindAddress || '127.0.0.1', () => console.log(`ID FUN: ${config.origin}`));
}
