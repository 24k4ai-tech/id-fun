# ID FUN

ID FUN 游戏与 Agent 接入开源版：3D 格斗、城市探索、星环战场、玩家积分和领奖客户端。

**本仓库仅剥离 3/7 分成与 DEV 提取／回收实现及其管理界面。** 玩家积分、资格检查、
奖励预算读取、结算分配、Merkle 证明、签名服务和玩家领奖代码保留。
包含这些私有功能的金库 Solidity 源文件未发布；这是游戏和接入层的开源版本，
不是线上金库的完整源码，也不代表金融系统已通过审计。

## Run / 本地运行

Requires Node.js **24+** and npm. Guest play requires no wallet, token or API key.

```sh
npm ci --ignore-scripts
npm start
```

Open <http://127.0.0.1:3200> and select **试玩**. Copy `.env.example` to `.env` only if you need
custom configuration. Local data is stored in `data/city.sqlite`; never copy production data here.
Chain rewards, paid AI and token energy are opt-in and disabled without their configuration.

## Included / 内容

- 3D combat: character selection, weapons, magic, dodge telegraphs, 1v1 invitations and PvP.
- City exploration: interiors, NPC dialogue, commissions, puzzles and campaign progress.
- Star-ring / MOBA: solo practice and multiplayer rooms with computer teammates.
- Character appearance and portrait uploads; optional paid AI character/place pipeline.
- `.ai` wallet identity checks, browser pairing, revocable game sessions and Agent spectating.
- Human/Agent scoring, holding weights, player reward estimates, allocation and claims.
- Chinese/English UI, keyboard/touch controls and music.

### Controls

WASD move; right-mouse drag camera; wheel zoom; left mouse/J attack; hold/release K charge;
1–4 skills; Shift+1/2 extra skills; Space dodge; Q/middle mouse lock; H heal; E city interaction.

## Architecture

| Directory | Purpose |
| --- | --- |
| `public/` | Babylon.js visuals, UI, game rules, model and texture assets |
| `server/` | HTTP API, SQLite, sessions, authoritative gameplay, rewards and AI providers |
| `simulations/` | Player allocation using explicitly supplied external budgets |
| `tools/character-pipeline/` | Optional mesh simplification, animation retargeting and textures |
| `tests/` | Gameplay, authentication, scoring, payment verification and player reward tests |

Agent instructions: `/agent-guide`, `/arena-agent-skill`, [Agent guide](docs/AGENT-GUIDE.md).
Financial boundary and trust model: [reward integration](docs/REWARD-INTEGRATION.md).
Remote Agents require your own HTTPS deployment; localhost is not externally reachable.

For optional AI generation, install pipeline dependencies with
`npm ci --ignore-scripts --prefix tools/character-pipeline`, then configure your own provider
keys, studio payment recipient, token and budget. Provider charges are separate from this code.
Default gameplay does not call paid providers. Do not commit `.env` or user-generated files.

## Tests

```sh
npm test
```

Tests cover this distribution, not excluded contracts. Server-authoritative outcomes and
publisher signatures remain trust dependencies; this project does not claim trustless settlement.

## License

Original code and documentation: [MIT](LICENSE). Art, models, portraits and third-party assets
have separate terms: [ASSETS.md](ASSETS.md). Existing license and attribution notices are retained.
This entertainment project is unofficial and does not imply endorsement by depicted people,
Binance, Flap or other organizations.

Use issues for bugs and proposals. Keep changes modular and preserve Chinese/English labels.
Never submit secrets, user databases, production manifests or private treasury implementations.
