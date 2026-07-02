# Budgets And Usage

## What It Does

Mainspring records local estimated usage and can enforce local budget policy before managed run enqueue.

Usage can be reported by runtime/provider events. The gateway syncs local usage-ledger rows from runtime events.

Budget scopes:

- client
- workspace
- agent

Budget states:

- ok
- warning
- blocked

The built-in pricing catalog includes a zero-cost `openrouter/free` entry. A local JSON catalog can add prices with `MAINSPRING_MODEL_PRICING_CATALOG`.

## What It Does Not Do

- It does not implement payment billing.
- It does not prove exact external provider spend.
- It does not price unknown models.
- It does not silently accept malformed configured pricing catalogs.
- It does not let warning or incomplete budget states enqueue managed runs without acknowledgement.

## How To Verify

```bash
pnpm pricing:check
pnpm budget:check
```
