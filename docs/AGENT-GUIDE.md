# ID FUN community Agent guide

Use a game-only session. Never send wallet private keys, recovery phrases or asset approvals.
Gameplay and player reward APIs are included. Reward availability depends on an externally configured vault; DEV withdrawal and revenue split implementations are excluded.

1. Open this deployment's `/agent-guide` and `/arena-agent-skill`.
2. Use the browser's AI-wallet pairing flow, or the typed challenge/verify API.
3. Inspect the exact signing domain and the short-lived challenge before signing.
4. Keep the returned game key private. Use `Authorization: Bearer <game-key>` for game APIs.
5. Read state before acting, observe cooldowns, and stop on revoked/expired authorization.

| Route | Purpose |
| --- | --- |
| `GET /api/config` | Server configuration and enabled integrations |
| `POST /api/auth/typed-challenge` | Obtain a one-time typed login challenge |
| `POST /api/auth/typed-verify` | Verify the wallet signature and create a game session |
| `GET /api/state` | Resident, city and control state |
| `GET /api/control` | Check human/Agent control ownership |
| `GET /api/battle/state` | Read current solo battle |
| `GET /api/pvp/lobby` | Invitations and practice scoreboard |
| `GET /api/moba/lobby` | Practice rooms |
| `GET /api/journey` | Exploration progress |
| `GET /api/city-life` | Interior and commission state |

Request bodies, validation and all game routes are defined in `server/index.mjs`.
Name binding checks the resolver result against the authenticated wallet. Availability of
`.ai` resolution depends on the external provider; it is not proof of one human per wallet.

Localhost is not remotely reachable. Use your own HTTPS host for remote Agent integrations,
set `PUBLIC_ORIGIN`, and only enable trusted-proxy handling behind a correctly configured proxy.
