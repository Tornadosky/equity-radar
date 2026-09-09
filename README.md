# Equity Radar website

A faithful website port of `polymarket_equity_radar_v5_equity_only.html`, with corrected data-integrity handling and a collapsed trader-diagnostics/rebates panel.

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

### Cloudflare Workers (deployed)

Live: **https://equity-radar.equity-radar-website.workers.dev**

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

- **BTC markets:** choose 5m (default) or 15m. Switching reloads the same wallet into a separate interval-specific report, including chart, live fills, countdown and CSV.
- **Start date:** entered in your browser’s local time; fetches start at the containing selected market boundary (five or fifteen minutes).
- **Visible period / Resolved only / Bought both:** filter markets, totals, chart and market CSV together. Sorting changes table order. Live fills remain the wallet’s separate latest-fill view.
- **Equity curve:** cumulative settled trade P&L from $0 for the selected BTC 5m or 15m markets. It is not wallet balance, capital return or open-position equity.
- **Excluded from equity:** inspect Details for malformed data, missing inventory, lifecycle events or incomplete history. Raw fills remain visible.
- **Recheck P&L:** compares model results with public API P&L per expected outcome token.
- **Trader diagnostics:** drawdown, profit factor, gross P&L, estimated fees, maker/taker/unknown counts and coverage.
- **Rebates:** wallet-wide recorded payments and UTC-day market maker accrual are separate. Neither changes the equity line, and they are never added together.
- **Export CSV:** downloads the currently filtered markets, including exclusion reasons. A direct download link remains in a toast for 60 seconds.

This preserves the source’s English/Russian labels, fonts and currency formatting. See `docs/DEVIATIONS.md` for every intentional visual and behavioral change.

## Test

```bash
node --test tests/*.test.mjs
```

Tests exercise the actual browser calculations, independent fixture oracle, pagination, role matching, resolution, exclusions, race protection, gateway and portable HTTP server.

For an entirely synthetic end-to-end session:

```bash
node tests/fixture-server.mjs
```

Open `http://localhost:3000`, choose **5m**, and load **0x1111111111111111111111111111111111111111** with the default 24-hour start. The fixture is rebased to the current date. Expected: 8 rounds, 13 fills, 5 included settled rounds, 2 excluded rounds, **+$61.49075** underlying settled P&L, **$1.75** recorded wallet-wide rebate payments, and **$1.25** separately reported daily maker accrual. One additional market is unresolved. Do not use this synthetic server for live accounts.

`docs/REMOTE-VERIFICATION.md` records the current Windows and deployed-site checks, including real 5m/15m reports. `docs/TEST-REPORT.md` preserves the initial fixture and design audit. Public inputs and modeled fees are not transaction-receipt proof. A real wallet extension connection and browser-to-disk CSV download remain unverified in the available browser environment.
