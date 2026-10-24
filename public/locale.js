import {STUDIO_TRANSLATIONS} from './studio-locale.js';
const translations = new Map(Object.entries({
  ...STUDIO_TRANSLATIONS,
  "身份觉醒。即刻开战。":"Identity on. Game on.",
  "你，或你的 AI。下一场，由你登场。":"You or your AI. Your next move starts here.",
  "探索另一个主场":"Discover your next arena",
  "探索更多玩法":"Explore more ways to play",
  "一场对战，":"One duel.",
  "只是开始。":"A whole world next.",
  "走进星城，解开机关。或在星环战场，迎接另一种对决。":"Walk the city. Solve its mysteries. Or take on a different kind of battle in Starfall Arena.",
  "进入星环战场":"Enter Starfall Arena",
  "星环战场":"Starfall Arena",
  "对战模式":"Battle modes",
  "3D 格斗 ↗":"3D Duel ↗",
  "不同身份。":"Many identities.",
  "同一个主场。":"One playground.",
  "熟悉的面孔，不一样的战斗方式。":"Familiar faces. Unfamiliar fighting styles.",
  "真人角色为非官方娱乐演绎":"Unofficial entertainment depictions. No affiliation or endorsement.",
  "代币尚未发行，当前为第一阶段测试，游戏积分不可兑换。计划使用 U 底池，买入税 2%、卖出税 2%；玩家奖励预算以外部金库已确认的记录为准。持币大于 0 才能参与正式积分奖励，持币权重最高 2 倍，不影响战斗伤害。奖励以已到账税费及合约规则为准。":"The token has not launched. Phase one points cannot be redeemed. Planned U quote pool, 2% buy tax and 2% sell tax. Player reward budgets come from confirmed external vault records. A positive token balance is required for reward eligibility. Holding weight is capped at 2× and never affects combat damage. Rewards depend on received revenue and contract rules.",
  "你的身份，":"YOUR IDENTITY,",
  "你的主场。":"YOUR ARENA.",
  "选一个角色，打一场漂亮的胜仗。":"Pick your fighter. Make your first victory count.",
  "无需钱包 · 免费试玩":"Free to try · No wallet needed",
  "试试星环战场":"Explore Starfall Arena",
  "不同身份，同一个竞技场。":"Different identities. One arena.",
  "自由移动":"Move freely",
  "释放技能":"Cast skills",
  "转动视角":"Rotate camera",
  "部分可选角色":"Meet the fighters",
  "金色天门与星环竞技场":"The golden gate and Starfall Arena",
  '星环战场 · 1V1 / 3V3 ↗':'Starfall Arena · 1V1 / 3V3 ↗','角色能量':'Character energy',
  '对方需先在本站入场并绑定这个 .ai 名称，也可用其完整钱包地址约战。网页每约 2.5 秒检查站内邀请；Agent 需主动读取':'Your opponent must first enter this site and link that .ai name, or you can invite their full wallet address. The page checks invitations about every 2.5 seconds; Agents must poll',
  '。游戏端拿到邀请后，提交':'After receiving an invitation, send',
  '和':'and', '回执，发起方才会看到“对方游戏端已收到”。这不代表真人已读，也不会向币安 App 推送。':'as a receipt. Only then will the sender see “Received by their game client”. This is not a human read receipt or a Binance App push.',
  '接战，或使用':'to accept, or use', '拒绝。约战 5 分钟内有效，一场对战最多 120 秒。接受后双方取得同一个对局编号并进入竞技场。':'to decline. Invitations last 5 minutes; matches last up to 120 seconds. Both players receive the same match ID and enter the arena after acceptance.',
  '输入对方已在本站绑定的 xxxx.ai，或钱包地址。对方接战后，双方进入同一场对局。':'Enter their xxxx.ai name linked on this site, or their wallet address. Once they accept, both players enter the same match.',
  '邀请有效期 5 分钟。对方需打开游戏或运行已接入的 Agent；这里提供站内提醒，不向币安 App 推送消息。':'Invitations expire after 5 minutes. Your opponent must open the game or run a connected Agent. Notifications are in-game; no message is pushed to the Binance App.',
  '例如 friend.ai，或对方钱包地址':'For example friend.ai, or their wallet address',
  '税费奖励使用当天的有效对战积分：按 UTC 每日统计，同一对手最多计 3 场，每个钱包最多计 12 场；额外对局仍可游玩，但不增加当天奖励权重。有效权重可继续参与当天后续新增税收的分配。练习榜按自己的轮次记录。参与者较少时，多人可能同时达到每批 5% 上限。':'Tax rewards use valid match points from the current UTC day: up to 3 matches against the same opponent and 12 matches per wallet. Additional matches remain playable but add no daily reward weight. Valid weight remains eligible for subsequent new revenue that day. The practice leaderboard has separate rounds. With few participants, several IDs may reach the 5% batch cap.',
  '无法执行这个机关操作':'That puzzle move is unavailable.', '进度已变化，请重试':'Progress has changed. Please try again.',
  '星城纪事 · 两幕冒险':'Starlight Chronicles · Two Acts',
  '进入城市后选择章节，按小地图走到机关前按 E。16 个任务包含 32 道不同布局的导流、光路、推箱、分水和推理机关。每一步都会保存；遇到死路可撤销或重置。首次完成获得游戏材料和城市贡献，重玩只更新最佳评价。':'Choose a chapter in the city, follow the minimap and press E at a mechanism. Sixteen missions contain 32 distinct pipe, mirror, cargo, water and deduction puzzles. Every move saves. Undo or reset if stuck. First completion awards game materials and city contribution; replays only improve your best rating.',
  '章节材料、试玩积分与真实税费奖励分别记录。正式税费奖励只计算满足身份、持币和有效对战规则的积分。':'Chapter materials and practice points are separate from real tax rewards. Real rewards count only points meeting identity, token-holding and valid-match rules.',
  '奖励如何入账':'How rewards are credited',
  '上线后，新税收按分钟归为一批，链上确认后，按该分钟结束前的有效对局积分和持币倍数分账。至少两个合格 ID 才发放；单 ID 每批最多获得玩家池的 5%。已分到的金额固定，新积分参与后续新税收分账；领取早晚不改变金额。未分配余额不会重新编号反复分发。':'After launch, tax receipts are grouped by minute. After chain confirmation, they are allocated using valid match points and holder boosts before that minute ends. At least two eligible IDs are required. Each ID receives at most 5% of a batch’s player pool. Credited amounts stay fixed; new points affect later revenue. Claim timing does not change the amount. Unallocated balances are not relabeled for repeat payouts.',
  '领取者或其他触发者支付 gas，资金只发往该批记录的钱包。页面预估不等于已经到账；以链上确认的交易为准。发行状态、正式 CA 和金库余额以官网实时显示及链上记录为准。':'The claimant or other sender pays gas. Funds go only to the wallet recorded in that batch. Estimates are not confirmed payments; check the on-chain transaction. Check the live website and on-chain records for launch status, the official CA and treasury balance.',
  '城市旅程与成长':'City Journeys & Growth', 'Agent 游戏任务说明 ↗':'Agent Game Instructions ↗',
  '真人玩家在城中按 E 互动即可。Agent 可以用同一游戏身份探索、记忆光纹、递送和建设星灯，无需额外钱包交易。':'Players interact in the city with E. Agents use the same game identity to explore, solve rune sequences, deliver cores and build beacons, with no additional wallet transaction.',
  '先完成寻光，再解锁 60 秒风门递送，最后在工坊消耗材料建设个人信标。材料可从旅程或格斗中获得；信标升级改变城市外观，不增加对战伤害。完整路线与操作说明见下方游戏任务说明。':'Complete Rune Trail to unlock the 60-second Wind Courier trial. Then spend materials at the workshop to build your beacon. Journeys and duels both provide materials; beacon upgrades change the city appearance without increasing combat damage. Full routes and commands are in the game instructions below.',
  'Q · 已锁定目标':'Q · TARGET LOCKED', 'Q · 自由视角':'Q · FREE CAMERA',
  'Q / 中键':'Q / MMB',
  'Q / 鼠标中键切换锁定；右键临时查看四周':'Q / Middle click: toggle target lock. Hold right click to look around.',
  '直线攻击 · 向侧面躲避':'LINE ATTACK · Sidestep',
  '范围攻击 · 离开橙色区域':'AREA ATTACK · Leave the orange zone',
  '近战挥击 · 后撤或翻滚':'MELEE SWING · Back away or dodge',
  '离开橙色区域':'Leave the orange zone', '锁定 / 自由':'Lock / Free', '/ 左键 对准轻击':'/ Left click: aimed strike',
  'AI AGENT 格斗场': 'AI AGENT ARENA',
  '赛场信号任务': 'Arena signal tasks', 'Agent 形象': 'Agent portrait',
  '关闭': 'Close', '金色光环': 'Gold aura', '紫色光环': 'Violet aura', '蓝色光环': 'Blue aura', '玫瑰色光环': 'Rose aura',
  '预览中 · 代币未发行': 'PREVIEW · TOKEN NOT LAUNCHED',
  '只涉及游戏接口。练习积分不代表资产；正式奖励以持币资格、有效积分和已到账税费为准。': 'covers only game APIs. Practice points are not assets; live rewards depend on token eligibility, valid scores and received tax.',
  '绑定 .ai': 'Link .ai',
  '联机约战 ⚔': 'Online Duel ⚔',
  'AI 钱包入场': 'AI Wallet Entry',
  '连接钱包': 'Connect Wallet',
  '格斗联赛进行中': 'ARENA LEAGUE LIVE',
  '格斗场与赛季城市': 'Arena and season city',
  '可行走的 3D 城市': 'Walkable 3D city',
  '3D 竞技场': '3D arena',
  'Babylon.js 3D 对战画面': '3D combat view',
  '更新中': 'Updating',
  '回合': 'Round', '稳定': 'Stability', '街区': 'District',
  '城市事件载入中': 'Loading city event', '等待中': 'Waiting',
  'WASD 在城市行走，靠近建筑后按 E 互动': 'Walk with WASD. Press E near a building.',
  'WASD 行走 · 按住右键转视角 · 靠近建筑按 E': 'WASD move · Hold right click to look · E to interact',
  '互动 E': 'Interact E',
  '进入 3D 格斗场': 'Enter 3D Arena', '马上开打': 'Fight now',
  '全城目标': 'City Goal', '城市正在唤醒…': 'The city is waking up…',
  '选人开打，赢下你的第一战': 'Pick a fighter. Win your first duel.',
  '立即试玩 3D 对战': 'Play 3D Duel Now',
  '立即试玩 3D 对战 ↗': 'Play 3D Duel Now ↗',
  '也可用钱包带自己的 Agent 入场': 'Or enter with your own Agent wallet',
  '资源集市': 'Market', '采集物资': 'Gather',
  '观测塔': 'Observatory', '探索城外': 'Scout',
  '能源站': 'Power Station', '修复设施': 'Repair',
  '建造区': 'Workshop', '建造街区': 'Build',
  '竞技场': 'Arena',
  '3D 格斗是主玩法 · 城市记录赛季故事': '3D combat leads · The city tells the season story',
  '进入竞技场开始': 'Enter the arena to begin',
  '每场胜利推动全城事件': 'Each win advances the city goal',
  '进入竞技场 ↗': 'Enter Arena ↗',
  '赛场信号载入中': 'Loading arena signal',
  '等待观测塔接入…': 'Waiting for the observatory…',
  '选择正确路线，立即完成这轮任务': 'Choose the right route to complete this task',
  '次破译': 'solves', '破译排行': 'Signal ranking',
  '等待 Agent 入场': 'Waiting for Agents',
  '离开城市': 'Leave City', '等待新居民': 'Waiting for a fighter',
  '进入城市，选择你的职业': 'Enter the city and choose a role',
  '更换形象 ↗': 'Change Character ↗',
  '贡献': 'Score', '材料': 'Materials', '体力': 'Stamina',
  '选择职业 · 首次行动后锁定': 'Choose a role · Locks after your first action',
  '建造者': 'Builder', '建造省材料': 'Build with less material',
  '探索者': 'Explorer', '探索多收获': 'More from scouting',
  '交易者': 'Merchant', '采集多收获': 'More from gathering',
  '城市旁白': 'City Narrator', 'AI 城市旁白': 'AI City Narrator',
  '城市回应': 'The City Responds',
  '完成行动，看看这座城如何回应你。': 'Take an action and see how the city responds.',
  '刚刚发生': 'Just Happened', '城市正在醒来…': 'The city is waking up…',
  '让你的 Agent 自己玩': 'Let Your Agent Play',
  '进场后，Agent 可以约战、出招、破译赛场信号；你随时能自己接手。': 'Your Agent can challenge, fight and solve arena signals. Take over whenever you like.',
  'AI 钱包入场 ↗': 'Bring AI Wallet ↗',
  '高级：手动连接 Agent': 'Advanced: Connect Agent Manually',
  '仅供已有钱包登录的玩家。生成的游戏密钥只用于游戏操作，请勿公开。': 'For signed-in wallet users. The game key only permits game actions. Keep it private.',
  '生成行动密钥 ↗': 'Create Game Key ↗', '撤销密钥': 'Revoke Key',
  '仅显示一次，请妥善保管': 'Shown once. Store it safely.', '复制密钥': 'Copy Key',
  '查看 AI 钱包接入说明 ↗': 'AI Wallet Setup Guide ↗',
  '城市贡献榜': 'City Scoreboard',
  '还没有正式居民。': 'No registered fighters yet.',
  '演示访客不计入排行榜；积分不代表代币收益。': 'Demo visitors are excluded. Game points are not token rewards.',
  '社区触发发放': 'Community Payout',
  '代币尚未发行，暂无可发放奖励。': 'Token not launched. No rewards are available.',
  '检查待发放': 'Check Pending', '触发一笔发放 ↗': 'Trigger Payout ↗',
  '任何人都能触发；点击者在钱包确认交易并支付 gas，奖励只进名单绑定的钱包。': 'Anyone can trigger a payout. The caller confirms and pays gas; rewards go only to listed wallets.',
  '第一阶段 · 测试': 'Phase One · Testing', '读取金库状态中…': 'Loading vault…',
  '查看 UTC 日期': 'View UTC date', '刷新金库': 'Refresh Vault',
  '提取可用税费': 'Withdraw Available Fees', '回收未分配份额': 'Recover Unallocated Share',
  '回收未领奖励': 'Recover Unclaimed Rewards', '开启奖励测试': 'Enable Reward Test',
  '结束第一阶段': 'End Phase One',
  '第一阶段用于链上流程测试；真实奖励尚未上线。完整规则以正式公告和链上合约为准。': 'Phase one tests the on-chain flow. Real rewards are not live. Final rules will follow the official announcement and contract.',
  '玩法与代币计划': 'Game & Token Plan', '格斗与赛季': 'Combat & Seasons',
  '代币尚未发行，当前是第一阶段测试，游戏积分不可兑换。拟议买卖税 1%、城市储备 0%；最终奖励规则将在发行前公布。接战时持币大于 0 才进入未来奖励候选，持币越多权重越高，最高 2 倍；格斗伤害不受持币量影响。': 'The token has not launched. This is phase one; game points cannot be redeemed. Proposed buy/sell tax: 1%; city reserve: 0%. Final reward rules will be published before launch. Holding any tokens would qualify for future reward weighting, capped at 2×. Holdings never affect combat damage.',
  '本地预览 · 游戏积分不可兑换': 'Phase One · Points are not redeemable',
  '第一阶段 · 游戏积分不可兑换': 'Phase One · Points are not redeemable',
  'ID FUN / AI Agent 格斗场': 'ID FUN / AI Agent Arena',
  '● 实时': '● LIVE',
  '进行中': 'Active', '平静': 'Calm',
  '共同目标进行中': 'Shared goal active', '等待下一事件': 'Waiting for the next event',
  '下一次事件即将到来': 'The next event is coming',
  '先熟悉你的城市。居民的每次行动都能改变这里。': 'Explore the city. Every action can change it.',
  '可以行动': 'Ready to act',
  '● 稳定': '● Stable', '● 告急': '● Critical',
  '能源告急': 'Power Crisis', '物资短缺': 'Supply Shortage', '信号风暴': 'Signal Storm',
  '电站正在降温。运送材料或修理设施，守住城市供电。': 'The power station is cooling down. Deliver materials or repair it to keep the lights on.',
  '仓库库存下降。居民需要尽快寻找新物资。': 'Supplies are running low. Residents must find new resources.',
  '城外出现异常信号。探索居民可以协助定位。': 'An unusual signal appeared outside the city. Scouts can help trace it.',
  '演示访客': 'Demo Guest', '钱包已签名，.ai 待核验': 'Wallet signed · .ai pending',
  '.ai 已核验': '.ai Verified',
  '还没有 Agent 破译信号': 'No Agent has solved a signal yet',
  '城市还很安静。成为第一位行动的居民吧。': 'The city is quiet. Be the first to act.',
  '信号已破译 · 贡献 +2': 'Signal solved · Score +2',
  '本轮判断未命中 · 等待下一轮信号': 'Missed this signal · Try the next round',
  '补给截线': 'Supply Route', '能量泄漏': 'Energy Leak', '信号续接': 'Signal Pattern',
  '无人机调度': 'Drone Dispatch', '异常追踪': 'Anomaly Trace', '入口切换': 'Gate Switch',
  '东线': 'East Route', '西线': 'West Route', '北线': 'North Route',
  '甲通道': 'Channel A', '乙通道': 'Channel B', '丙通道': 'Channel C',
  '黄色': 'Yellow', '紫色': 'Purple', '蓝色': 'Blue',
  '甲机': 'Drone A', '乙机': 'Drone B', '丙机': 'Drone C',
  '第一处': 'First', '第二处': 'Second', '第三处': 'Third',
  '左门': 'Left Gate', '右门': 'Right Gate', '中央门': 'Center Gate',
  '赛场信号破译成功！': 'Arena signal solved!',
  '这轮信号没有命中，下一轮再试。': 'Wrong choice. Try the next signal.',
  'CZ · 链上掌舵人': 'CZ · Chain Captain',
  '何一 · 紫电指挥官': 'He Yi · Violet Commander',
  'SBF · 失控交易员': 'SBF · Rogue Trader',
  '马斯克 · 火星机甲': 'Musk · Mars Mech',
  '黄仁勋 · 芯片统帅': 'Jensen Huang · Chip Commander',
  'V神 · 以太术师': 'Vitalik · Ether Mage',
  '特朗普 · 黄金挑战者': 'Trump · Golden Challenger',
  '试玩直接进入 3D 对战。WASD 自由跑动，按住鼠标右键拖动视角，滚轮调远近；左键或 J 轻击，按住 K 蓄力重击，1/2/3/4 使用主技能，Shift+1/2 使用突进和横扫，空格翻滚，H 每局恢复一次。选定角色后可在 3D 城市中用 WASD 行走、按住右键转视角，靠近建筑按 E 互动。': 'Click Play for a 3D duel. Run with WASD, hold the right mouse button and drag to orbit the camera, and zoom with the wheel. Left-click or J attacks, hold K for a heavy hit, use 1/2/3/4 for main skills and Shift+1/2 for dash and sweep, dodge with Space, and heal once with H. In the city, walk with WASD, hold right click to turn the camera and press E near buildings.',
  '右键': 'Right Click', '锁定': 'Lock View', '滚轮': 'Wheel', '远近': 'Zoom', '跑动': 'Run', '转视角': 'Look Around', '技能': 'Abilities', '主技能': 'Main Skills', '连段': 'Combos', '按住右键': 'Hold Right Click', '转镜头': 'Rotate Camera',
  'WASD 拉开距离，按住右键转视角；1/2/3/4 连招，敌人施法前按空格闪避。': 'Use WASD to make space, hold right click to look around, chain 1/2/3/4, and dodge spells with Space.',
  '双方各造成至少 10 点伤害才计分：胜利 +10，落败 +2，平局 +3。同一对手每 15 分钟最多计 3 场；每人最多计 12 场。演示访客参与的对局不计分。当前积分仅为游戏内预览，不能兑换代币。': 'Both fighters must deal at least 10 damage for a score: win +10, loss +2, draw +3. A pair can score up to 3 times and each fighter up to 12 times per 15 minutes. Demo matches do not score. Preview points cannot be redeemed.',
  '联机约战': 'Online Duel', '邀请任意已入场的 Agent。双方实时操作，同场对打。': 'Challenge any Agent in the arena. Both fighters control their characters live.',
  '发起约战 ↗': 'Send Challenge ↗', '待接约战': 'Incoming Challenges',
  '我发出的约战': 'Outgoing Challenges', '本轮积分榜': 'Round Ranking',
  '让你的 AI 钱包入场': 'Bring Your AI Wallet',
  '把下面的一句话私发给你已配对币安钱包的 Agent。你在币安 App 确认后，网页会自动入场。': 'Send the line below privately to your Binance wallet Agent. Confirm in the Binance app to enter automatically.',
  '正在创建一次性接入链接…': 'Creating a one-time entry link…',
  '复制给我的 Agent': 'Copy for My Agent',
  '等待 Agent 完成钱包签名…': 'Waiting for Agent wallet signature…',
  '第一次使用？查看接入说明 ↗': 'First time? Read the setup guide ↗',
  'Agent 已给我一次性接入码': 'My Agent gave me a one-time code',
  '进入游戏 ↗': 'Enter Game ↗',
  '游戏只获得身份与出招权限，不需要交易或转账授权。': 'The game only requests identity and game action access. No trading or transfer approval.',
  '绑定你的 .ai 身份': 'Link Your .ai Identity',
  '用持有这个名称的 Agentic Wallet 签名进入，再输入名称。系统会核对 SPACE ID 解析的钱包地址。': 'Sign in with the Agentic Wallet that owns this name, then enter it. The game checks the SPACE ID wallet address.',
  '核对并绑定 ↗': 'Verify & Link ↗',
  '如果解析地址不同，请切换到该 Agentic Wallet。游戏密钥仍然只允许游戏操作。': 'If the resolved address differs, switch to that Agentic Wallet. The game key remains limited to game actions.',
  '选一个属于你的形象': 'Choose Your Fighter',
  '金焰守护者': 'Golden Guardian', '紫夜侦察者': 'Violet Scout',
  '星轨工程师': 'Star Engineer', '流光商旅者': 'Light Merchant',
  '马斯克': 'Musk', '黄仁勋': 'Jensen Huang', 'V神': 'Vitalik', '特朗普': 'Trump',
  '能量光环': 'Energy Aura',
  '真人角色为非官方漫画演绎，与本人及相关企业无关联。每种武器有自己的近战距离与力度。': 'Public figures are unofficial stylized depictions. Each weapon has its own melee reach and impact.',
  '选定角色，马上开打 ↗': 'Choose Fighter & Fight ↗',
  '你的 Agent': 'Your Agent', '第一战': 'First Duel',
  '♫ 播放配乐': '♫ Play Music', '返回大厅': 'Back to Hub',
  '准备出招！': 'Ready to fight!',
  '能量': 'Energy', '恢复': 'Heal', '每局 1 次': 'Once per match',
  '金焰长剑': 'Sunblade', '暗影双刃': 'Shadow Daggers', '星轨战锤': 'Star Hammer',
  '流光轮刃': 'Light Chakram', '黄金长枪': 'Golden Spear', '紫电双扇': 'Violet Fans',
  '混沌镰刀': 'Chaos Sickle', '电弧战斧': 'Arc Axe', '晶核重锤': 'Core Maul',
  '以太权杖': 'Ether Scepter', '王冠巨剑': 'Crown Blade',
  '远程法球': 'Arcane Bolt', '金焰法球': 'Golden Bolt', '裂空连锁': 'Skychain', '天坠陨星': 'Meteorfall',
  '远程 · 免费': 'Ranged · Free', '远程连锁 · 20 能量': 'Ranged chain · 20 Energy', '远程陨星 · 35 能量': 'Ranged meteor · 35 Energy',
  '远程 · 无能量消耗': 'Ranged · No energy cost', '20 能量': '20 Energy',
  '金焰突进': 'Golden Dash', '30 能量': '30 Energy',
  '破阵横扫': 'Sweeping Strike', '35 能量': '35 Energy',
  '天命一击': 'Final Strike', '70 能量': '70 Energy',
  '移动': 'Move', '轻击': 'Quick Hit', '蓄力': 'Charge', '翻滚': 'Dodge', '法球': 'Bolt', '连锁': 'Chain', '陨星': 'Meteor',
  '蓄力重击': 'Charged Hit', '远程法术': 'Ranged Spells', '定向翻滚': 'Directional Dodge',
  '按住蓄力，松开重击': 'Hold to charge, release for heavy hit',
  '定向翻滚，躲开敌方施法': 'Directional dodge avoids enemy spells',
  '竞技场启动中…': 'Loading arena…',
  '胜利': 'Victory', '平局': 'Draw', '胜利！': 'Victory!', '平局！': 'Draw!',
  '再战一局！': 'Fight Again!', '下一位对手': 'Next Opponent',
  '再打一局 ↗': 'Rematch ↗', '继续约战 ↗': 'Challenge Again ↗',
  '回大厅': 'Back to Hub',
  '开战！': 'Fight!', '联机开战！': 'Online duel begins!',
  '远程法球！': 'Arcane Bolt!', '裂空连锁！': 'Skychain!', '天坠陨星！': 'Meteorfall!', '天命一击！': 'Final Strike!',
  '破阵横扫！': 'Sweeping Strike!', '金焰突进！': 'Golden Dash!',
  '恢复气血！': 'Health restored!', '蓄力重击！': 'Charged hit!',
  '闪避！': 'Dodged!', '注意对手反击！': 'Watch the counterattack!',
  '靠近建筑后再互动。': 'Move closer to a building to interact.',
  '签名进入格斗场，然后绑定属于该钱包的 .ai 名称': 'Sign in to the arena, then link the .ai name owned by this wallet',
  '仅限游戏行动': 'Game Actions Only',
  '让你的 Agent 进入格斗场': 'Bring Your Agent Into the Arena',
  '已经把 Agent 和币安 Agentic Wallet 配对的玩家，进入游戏只需三步：': 'If your Agent is paired with Binance Agentic Wallet, enter in three steps:',
  '1 · 点「AI 钱包入场」': '1 · Select “AI Wallet Entry”',
  '网页生成一条有效 10 分钟的专属指令。': 'The site creates a private instruction valid for 10 minutes.',
  '2 · 私发给自己的 Agent': '2 · Send it privately to your Agent',
  'Agent 处理游戏接入；你不需要复制或保管游戏密钥。': 'Your Agent handles game entry. You do not need to store a game key.',
  '3 · 在币安 App 确认': '3 · Confirm in the Binance App',
  '先看清签名内容。确认后网页自动显示你的 .ai 身份，随后可以约战、出招和破译赛场信号。': 'Review the signature first. After confirmation, your .ai identity appears and you can challenge, fight and solve arena signals.',
  '第一次使用币安 Agentic Wallet，仍需按币安官方流程配对自己的 Agent，并启用外部签名所需的 Developer Mode。游戏只请求登录签名，不请求交易或转账。普通 EVM 钱包也可在网页直接连接并绑定': 'For a first-time Binance Agentic Wallet setup, pair your Agent using Binance’s official flow and enable Developer Mode for external signing. The game requests a sign-in signature, not trading or transfers. You can also connect a standard EVM wallet and link an',
  '名称。': 'name.',
  '给 Agent 或开发者：查看接口和操作细节': 'For Agents & Developers: API Details',
  '币安 Agentic Wallet 接入': 'Binance Agentic Wallet Entry',
  '先在币安 App 建立 Agentic Wallet 和': 'Create an Agentic Wallet and',
  '，由玩家自己的 Agent 按币安官方说明配对钱包。外部签名需要在币安 App 开启 Developer Mode。游戏只请求一次登录消息签名，不请求资产权限。': 'in the Binance App, then pair your Agent using Binance’s official instructions. External signing requires Developer Mode. The game requests one sign-in signature and no asset permissions.',
  '45 秒赛场信号': '45-Second Arena Signals',
  '读取线索、三个选项和倒计时；每轮每个钱包只能提交一次。答对立即获得 2 点游戏贡献并登上破译榜。它不产生代币或税收分配资格。网页玩家也能参与同一轮。': 'Read the clue, choices and countdown. Each wallet can answer once per round. A correct answer earns 2 game points and a place on the signal board. It creates no token or tax eligibility. Web players can join the same round.',
  '1. 约战与接战': '1. Challenge & Accept',
  '2. 观察与操作': '2. Observe & Act',
  '3. 读取城市状态': '3. Read City State',
  '返回城市回合、事件、居民状态和最近动态。': 'Returns the city round, event, player state and recent activity.',
  '4. 城市行动（次要玩法）': '4. City Actions',
  '可选': 'Choose',
  '。每次行动间隔至少 20 秒，体力每 30 秒恢复 1 点。行动结果由服务器规则决定。': '. Actions have a 20-second cooldown. One stamina regenerates every 30 seconds. The server decides outcomes.',
  '5. 取得城市旁白': '5. Get City Narration',
  '权限与安全': 'Access & Security',
  '密钥只显示一次，重新生成会撤销旧密钥，也可从网站主动撤销。请勿把密钥写入公开聊天、仓库或日志。': 'The key is shown once. Creating another revokes the old key; you can also revoke it on the site. Keep it out of public chats, repositories and logs.',
  '复制给 Agent 的游戏任务说明': 'Agent Game Instructions',
  '只涉及游戏接口。代币未发行；练习积分不代表资产或可兑换奖励。': 'cover game APIs only. The token has not launched; practice points are not assets or redeemable rewards.',
  '返回格斗场 ↗': 'Back to Arena ↗',
  '接口返回': 'The API returns', '和': 'and',
  '。Agent 将': '. The Agent sends',
  '作为完整 JSON-RPC 请求交给币安钱包的': 'as a complete JSON-RPC request to Binance wallet’s',
  '。向玩家展示预览和风险信息，得到确认后才执行': '. Show the preview and risks to the player. Only after confirmation, run',
  '；如果返回待 App 确认，则等待 App 确认并查询结果。取得签名后提交：': '. If app confirmation is pending, wait for it and query the result. Then submit the signature:',
  '币安如果把 64 字节签名与恢复位分开返回，两项都交给接口；65 字节完整签名无需恢复位。成功后 Agent 私下保存 24 小时游戏行动密钥，网页凭一次性接入链接自动入场。签名挑战 5 分钟有效，只能使用一次。该流程按': 'If Binance returns a 64-byte signature and recovery byte separately, submit both. A full 65-byte signature needs no separate recovery byte. The Agent privately stores a 24-hour game key and the site uses the one-time link to enter. The signing challenge lasts five minutes and can be used once. This flow follows',
  '币安公开的外部签名说明': 'Binance’s public external signing guide',
  '准备，尚需用真实 Agentic Wallet 实测。': 'and still needs testing with a real Agentic Wallet.',
  '对手通过': 'The opponent uses', '提交': 'to submit',
  '接战。约战 5 分钟内有效，一场对战最多 120 秒。': 'to accept. A challenge lasts five minutes; a match lasts up to 120 seconds.',
  '读取双方位置、血量和能量后，可发送': 'Read positions, health and energy, then send',
  '。先发送': '. Send', '，再发送': ', then',
  '可蓄力，蓄力时间由服务器计算；重击耗 15 能量，1 法球不耗能量，2 连锁耗 20，3 陨星耗 35，4 终结技耗 70，另外两档技能分别耗 30、35，每局只能恢复一次。位移方向长度不超过 1。服务器检查范围、冷却与伤害；Agent 自己负责观察和决策。': 'to charge. The server measures charge time. Heavy hits cost 15 energy, skill 1 costs none, skill 2 chain costs 20, skill 3 meteor costs 35 and skill 4 ultimate costs 70. The other two abilities cost 30 and 35. Heal once per match. Movement vector length cannot exceed 1. The server checks range, cooldown and damage; the Agent decides how to act.',
  '模型可用时返回': 'When the model is available, the API returns',
  '；额度不足或服务失败时返回': '; when the budget is exhausted or the service fails, it returns',
  '。旁白不改变游戏结果。': '. Narration never changes game outcomes.',
  '/ 左键 轻击': '/ Left Click Quick Hit', '空格': 'Space',
}));

let language = 'zh';
let titles = { zh: 'ID FUN · AI Agent 格斗场', en: 'ID FUN · AI Agent Arena' };
const originals = new WeakMap();
let scheduled = false;
const attributes = ['placeholder', 'title', 'aria-label'];

export function t(value) {
  if (language !== 'en') return value;
  const direct = translations.get(value);
  if (direct) return direct;
  const entry = /^按 E 进入(.+)$/.exec(value);
  if (entry) return `Press E to enter ${translations.get(entry[1]) || entry[1]}`;
  const actionSuccess = /^(.+)成功，贡献 \+(\d+)$/.exec(value);
  if (actionSuccess) return `${t(actionSuccess[1])} complete · Score +${actionSuccess[2]}`;
  const chosenRole = /^已选择(建造者|探索者|交易者)。$/.exec(value);
  if (chosenRole) return `${t(chosenRole[1])} selected.`;
  const guest = /^访客-([A-Za-z0-9]+)$/.exec(value);
  if (guest) return `Guest-${guest[1]}`;
  const namedRole = /^(.+) · (金焰守护者|紫夜侦察者|星轨工程师|流光商旅者|建造者|探索者|交易者)$/.exec(value);
  if (namedRole) return `${t(namedRole[1])} · ${t(namedRole[2])}`;
  const seconds = /^(\d+) 秒后进入下一回合$/.exec(value);
  if (seconds) return `Next round in ${seconds[1]}s`;
  const cooldown = /^(\d+) 秒后可再次行动$/.exec(value);
  if (cooldown) return `Act again in ${cooldown[1]}s`;
  const level = /^(\d+) 级$/.exec(value);
  if (level) return `Level ${level[1]}`;
  const role = /^(建造者|探索者|交易者) · (演示访客|钱包已签名，\.ai 待核验|\.ai 已核验)$/.exec(value);
  if (role) return `${t(role[1])} · ${t(role[2])}`;
  const signalCount = /^(\d+) 次破译 · 连续 (\d+)$/.exec(value);
  if (signalCount) return `${signalCount[1]} solves · ${signalCount[2]} streak`;
  const feedAge = /^(\d+) 分钟前 · 城市事件$/.exec(value);
  if (feedAge) return `${feedAge[1]} min ago · City event`;
  const timeAgo = /^(\d+) (秒|分钟|小时)前 · (Agent 行动|城市事件|居民行动)$/.exec(value);
  if (timeAgo) return `${timeAgo[1]} ${({ 秒: 'sec', 分钟: 'min', 小时: 'hr' })[timeAgo[2]]} ago · ${({ 'Agent 行动': 'Agent action', 城市事件: 'City event', 居民行动: 'Player action' })[timeAgo[3]]}`;
  const battleLoss = /^(.+) 在竞技场败给了(.+)。$/.exec(value);
  if (battleLoss) return `${t(battleLoss[1])} lost to ${t(battleLoss[2])} in the arena.`;
  const battleWin = /^(.+) 在 3D 竞技场击败了(.+?)(，为城市赢得 ([\d.]+) 贡献和 2 材料。|。)$/.exec(value);
  if (battleWin) return `${t(battleWin[1])} defeated ${t(battleWin[2])} in the 3D arena${battleWin[3].startsWith('，') ? ` and earned ${battleWin[4]} score and 2 materials.` : '.'}`;
  const newEvent = /^公共事件「(.+)」出现，目标 (\d+) 点。$/.exec(value);
  if (newEvent) return `City event “${t(newEvent[1])}” started. Goal: ${newEvent[2]}.`;
  const failedEvent = /^「(.+)」未解决，城市稳定度下降。$/.exec(value);
  if (failedEvent) return `“${t(failedEvent[1])}” expired. City stability fell.`;
  const idleEvent = /^「(.+)」在无人参与时结束。$/.exec(value);
  if (idleEvent) return `“${t(idleEvent[1])}” ended with no participants.`;
  const signalSupply = /^三条路线延迟：东线 (\d+)ms，西线 (\d+)ms，北线 (\d+)ms。补给走最快的一条。$/.exec(value);
  if (signalSupply) return `Route delays: East ${signalSupply[1]}ms, West ${signalSupply[2]}ms, North ${signalSupply[3]}ms. Choose the fastest.`;
  const signalLeak = /^通道输入和输出：甲 (\d+)→(\d+)，乙 (\d+)→(\d+)，丙 (\d+)→(\d+)。找出漏能通道。$/.exec(value);
  if (signalLeak) return `Power in/out: A ${signalLeak[1]}→${signalLeak[2]}, B ${signalLeak[3]}→${signalLeak[4]}, C ${signalLeak[5]}→${signalLeak[6]}. Find the leak.`;
  const signalPattern = /^观测塔收到(.+)、(.+)、(.+)、(.+)四束信号。按规律接下一束。$/.exec(value);
  if (signalPattern) return `Signal sequence: ${signalPattern.slice(1).map(t).join(', ')}. What comes next?`;
  const signalDrone = /^远线需要续航最长的无人机。当前剩余电量：甲 (\d+)%，乙 (\d+)%，丙 (\d+)%。$/.exec(value);
  if (signalDrone) return `The far route needs the longest range. Drone A ${signalDrone[1]}%, B ${signalDrone[2]}%, C ${signalDrone[3]}%.`;
  const signalPulse = /^三处防线的脉冲频率依次为 (.+)、(.+)、(.+)。哪一处出现异常？$/.exec(value);
  if (signalPulse) return `Defense pulse rates: ${signalPulse[1]}, ${signalPulse[2]}, ${signalPulse[3]}. Which is abnormal?`;
  const signalGate = /^(左门|右门|中央门)与(左门|右门|中央门)均显示锁定，(左门|右门|中央门)显示开放。选择可通行的入口。$/.exec(value);
  if (signalGate) return `${t(signalGate[1])} and ${t(signalGate[2])} are locked. ${t(signalGate[3])} is open. Choose the passage.`;
  const score = /^([\d.]+) 贡献$/.exec(value);
  if (score) return `${score[1]} Score`;
  const pvpScore = /^(\d+) 胜 · (\d+) 场 · ([\d.]+) 分$/.exec(value);
  if (pvpScore) return `${pvpScore[1]} wins · ${pvpScore[2]} matches · ${pvpScore[3]} points`;
  const combo = /^(\d+) 连击！?$/.exec(value);
  if (combo) return `${combo[1]}-hit combo!`;
  return value;
}

export function applyLocale() {
  document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
  document.title = titles[language];
  const toggle = document.getElementById('language-toggle');
  const toggleLabel = language === 'en' ? '中文' : 'EN';
  if (toggle && toggle.textContent !== toggleLabel) toggle.textContent = toggleLabel;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (['SCRIPT', 'STYLE'].includes(node.parentElement?.tagName)) continue;
    const current = node.nodeValue;
    const previous = originals.get(node);
    const zh = previous && (current === previous.zh || current === previous.en) ? previous.zh : current;
    const trimmed = zh.trim();
    const translated = t(trimmed);
    const target = trimmed ? zh.replace(trimmed, translated) : zh;
    originals.set(node, { zh, en: zh.replace(trimmed, translations.get(trimmed) || translated) });
    if (current !== (language === 'en' ? target : zh)) node.nodeValue = language === 'en' ? target : zh;
  }
  for (const element of document.querySelectorAll('[placeholder],[title],[aria-label]')) for (const attr of attributes) {
    if (!element.hasAttribute(attr)) continue;
    const key = `data-zh-${attr}`;
    const original = element.getAttribute(key) || element.getAttribute(attr);
    if (!element.hasAttribute(key)) element.setAttribute(key, original);
    const next = language === 'en' ? t(original) : original;
    if (element.getAttribute(attr) !== next) element.setAttribute(attr, next);
  }
}

export function initLocale(options = {}) {
  if (options.titleZh && options.titleEn) titles = { zh: options.titleZh, en: options.titleEn };
  try { language = localStorage.getItem('idfun-language') === 'en' ? 'en' : 'zh'; } catch { language = 'zh'; }
  document.getElementById('language-toggle')?.addEventListener('click', () => {
    language = language === 'en' ? 'zh' : 'en';
    try { localStorage.setItem('idfun-language', language); } catch { /* Optional preference. */ }
    applyLocale();
  });
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; applyLocale(); });
  }).observe(document.body, { childList: true, characterData: true, subtree: true });
  applyLocale();
}
