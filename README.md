# Equity Radar website

A focused multi-market extension of `polymarket_equity_radar_v5_equity_only.html`, with corrected data-integrity handling and a collapsed trader-diagnostics/rebates panel. BTC, ETH and SOL each support independent 5m, 15m and 1h equity filters. The original settlement/fee model is retained. See `docs/MULTI-MARKET-REVIEW.md` for this update, its tests and remaining limitations.

## Run locally

Install Node.js 22 or newer. No npm dependencies or build step are required for the portable website.

```bash
node server.mjs
```

Open `http://localhost:3000`. Click **Demo** for the seeded example, or enter a public Polymarket wallet/proxy address and choose **Load report**. The **Wallet** button only asks an available browser wallet for its public address; it does not sign or place orders.

The website needs the included server. Opening `public/index.html` as a local file or uploading only `public/` to a static host will not provide the API gateway.

## Host later

Deploy `server.mjs`, `lib/` and `public/` together to a Node-capable host. Start command: `node server.mjs`. It listens on `0.0.0.0` and the host-provided `PORT` (default `3000`). Place your host’s HTTPS reverse proxy in front of it. Health endpoint: `/healthz`. No database, API key or wallet secret is required.

The host needs outbound HTTPS access to `data-api.polymarket.com`, `gamma-api.polymarket.com` and `clob.polymarket.com`. The read-only gateway permits only the public endpoints used by this application. Upstream failures remain errors, without invented trades.

### Cloudflare Workers

Existing deployment recorded in the original project: **https://equity-radar.equity-radar-website.workers.dev**

This multi-market archive has **not** been deployed to that endpoint; its current contents were not verified during this update.

`worker.mjs` is the Cloudflare entry point. It reuses the same read-only gateway from `lib/proxy.mjs`
(only the `redirect` mode differs, since Workers' `fetch` has no `redirect:'error'`) and serves `public/`
through the Workers Static Assets binding. No Node built-ins, so no `nodejs_compat` flag is needed.

```bash
npm install
npx wrangler deploy      # or: npm run deploy
npx wrangler dev         # local Workers runtime on http://localhost:8787
```

Config lives in `wrangler.jsonc`. `server.mjs` remains the portable Node host and is unchanged.

### Docker

```bash
docker build -t equity-radar .
docker run --rm -p 3000:3000 equity-radar
```

Dockerfile is provided; an actual Docker build was not run in this environment.

## Use the report

- **Markets included in equity:** independently enable BTC, ETH or SOL at 5m, 15m and 1h. BTC 5m is the default. **All markets** selects all nine; **Clear** selects none. Selection is saved locally. Loading retrieves all supported streams for that wallet/range once; toggling does not fetch again or discard disabled streams.
- **Combined equity:** enabling BTC 5m and BTC 15m adds their included settled P&L. Disabling BTC 5m leaves BTC 15m alone. The same rule applies across assets. Market filters update the curve, totals, diagnostics, market table, CSV, current-round cards and live fills together.
- **Shareable scope:** `?markets=btc-5m,btc-15m,eth-1h` selects exactly those streams. `?markets=` is an explicit empty selection. Legacy `?timeframe=5m` and `?timeframe=15m` links still select the corresponding BTC stream. An explicit URL selection overrides saved settings.
- **Start date:** entered in your browser's local time. The fetch starts at the containing **hour boundary**, independent of the selected view, to retain complete 1h candle windows for later toggles. This may include up to 59 additional minutes; the actual loaded start is disclosed in the report. Changing the input takes effect on **Load report**.
- **Hourly opening history:** hourly books can accept fills before the candle starts. When Gamma says an hourly market opened before the loaded history, that round is **excluded**, with a reason in Details. Choose an earlier start date, before its market opening, and reload. Missing opening metadata is also an exclusion. No automatic pre-range backfill is performed.
- **Visible period / Resolved only / Bought both:** filter market rows, totals, chart, diagnostics and market CSV together. Sorting changes table order, not the equity calculation. Live fills and current-round cards follow enabled market streams, but remain a separate latest/current view rather than inheriting those three settled-report filters.
- **Equity curve:** cumulative settled trade P&L from $0, not wallet balance, capital return or marked-to-market open-position equity. Confirmed outcomes are plotted at their scheduled round close, not the later claim/payment transaction. Simultaneous closes are netted into one step before drawdown is computed; the tooltip lists the constituent markets.
- **Excluded from equity:** inspect Details for malformed or conflicting evidence, missing inventory, lifecycle events, incomplete history or incomplete hourly opening coverage. Available raw fills remain visible. Unsupported/ambiguous market identifiers produce a coverage warning rather than an invented classification.
- **Recheck P&L:** compares modeled results with public API P&L per expected outcome token. Reconciliation is not transaction-receipt verification.
- **Trader diagnostics:** drawdown, profit factor, gross P&L, estimated fees, maker/taker/unknown counts and coverage.
- **Rebates:** wallet-wide recorded payments and UTC-day maker accrual for the visible conditions are separate. Neither changes the equity line, and they are never added together. A selection change invalidates an in-flight old-scope rebate response.
- **Export CSV:** exports only currently visible markets, including exclusions. Existing column positions are preserved; `symbol`, `timeframe` and `end_iso` are appended. Filenames identify the enabled streams. A direct download link remains in a toast for 60 seconds.

The original English/Russian labels and theme are retained. Historical documents under `docs/` and the original `reference/` HTML describe earlier single-stream revisions; this README and `docs/MULTI-MARKET-REVIEW.md` describe the current multi-market behavior.

## Test

```bash
node --test tests/*.test.mjs
```

The suite currently contains 87 passing tests. It exercises the actual browser calculations, the unchanged independent accounting fixture, all nine supported streams, combined equity, simultaneous closes, hourly time zones/DST handling, exclusions, pagination, role matching, selection persistence, rebate/load races, the gateway and the portable HTTP server.

For an entirely synthetic end-to-end session:

```bash
node tests/fixture-server.mjs
```

Open `http://localhost:3000`, enable only **BTC 5m**, and load **0x1111111111111111111111111111111111111111** with the default 24-hour start. The fixture is rebased to the current date. Expected: 8 rounds, 13 fills, 5 included settled rounds, 2 excluded rounds, **+$61.49075** underlying settled P&L, **$1.75** recorded wallet-wide rebate payments, and **$1.25** separately reported daily maker accrual. One additional market is unresolved. Do not use this synthetic server for live accounts.

`docs/REMOTE-VERIFICATION.md` records historical Windows and deployed-site checks, including real 5m/15m reports. `docs/TEST-REPORT.md` preserves the initial fixture and design audit. Public inputs and modeled fees are not transaction-receipt proof. A real wallet extension connection and production deployment of this update remain unverified. An actual browser blob CSV download was verified with synthetic inputs in this update; see the review for the isolated browser-harness limitations.
