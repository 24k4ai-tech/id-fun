# Player reward integration

Included: gameplay scoring, eligibility checks, external receipt scanning, player pool allocation,
Merkle proofs, signer/worker code, read-only estimates, and user-triggered player claims.
Excluded: the private treasury Solidity implementation, its revenue split, DEV withdrawal/recovery
functions, DEV UI/API, deployment artifacts and production credentials.

`simulations/tax-payout.mjs` requires `actualPlayerWei` and `actualOperationsWei` as exact integer
amounts from verified receipts. Missing or non-conserving budgets are rejected. It has no default
revenue split. `server/vault-revenue.mjs` checks conservation without implementing a split policy.
The Solidity files combine private accounting and administration, so they are omitted as a unit.
Player-facing ABI fragments remain in the server and browser modules that consume them.

Default local startup is guest mode with no token/vault configured, no reward signing, no AI
spending and no chain transactions. Optional integrations require your own compatible deployed
vault, RPC and explicit configuration; this repository cannot deploy the production treasury.
The server only proposes player transactions; the connected wallet signs and pays gas.

Points and outcomes are server authoritative. Published reward roots are signed by a configured
publisher. This is a trust dependency, not a decentralized proof of gameplay or an audit claim.
Reading external balances is not verification of the external contract's safety or permissions.
Do not infer that excluded treasury/admin capabilities do not exist in the live deployment.

All automated tests use local fixtures and test keys, never production wallets or provider calls.
