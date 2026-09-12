# Equity Radar: multi-market update and focused audit

**Date:** 2026-09-12  
**Input:** `equity_radar_chatgpt.zip`  
**Scope:** the uploaded project only. No remote machine, production recorder, live deployment, bank account or wallet extension was accessed or modified.

## Result

BTC, ETH and SOL now each have independent 5m, 15m and 1h checkboxes. Any combination produces one cumulative settled-P&L curve. Turning a stream off removes its contribution without deleting its data, restarting a wallet report or making a new API request. The same market selection controls the summary, diagnostics, market table, CSV, live fills and current-round cards.

The implementation changes **three runtime files**: `public/assets/radar.js`, `public/index.html`, and `public/assets/radar.css`. The Node server, Cloudflare worker, gateway, dependencies, lockfile, deployment configuration and reference HTML are unchanged. Four existing test files were updated, together with the README and this new review. No new runtime dependency was introduced. Existing files retain their original CRLF line endings to avoid a whole-file formatting diff.

## Findings and changes

| Finding | Classification | Resolution |
| --- | --- | --- |
| The old ingestion path discarded everything except the currently selected BTC interval. | Existing architectural limitation blocking the requested feature. | History/role ingestion now retains all nine supported streams. Selected markets are a presentation filter, not a fetch filter. |
| Round grouping, close times, live labels, audit eligibility and exports depended on one global interval. | Extension correctness risk. | Groups carry their own symbol, timeframe, market key and duration. Simultaneous BTC/ETH/SOL rounds remain separate by condition ID. |
| Real hourly identifiers are dated calendar slugs in Eastern Time, rather than necessarily `btc-updown-1h-<epoch>`. A trade timestamp can precede the named hour. | Extension correctness risk, verified against official market pages. | Strict parsing supports the dated Bitcoin/Ethereum/Solana hourly form, converts using `America/New_York`, and does not infer the candle from fill time. The epoch form remains supported for all three intervals. |
| A candle-aligned history window can miss earlier hourly purchases and their cost basis. | Material P&L risk introduced by adding hourly books. | A known hourly listing before loaded history, or missing listing metadata, excludes the row. Details explain that an earlier start/reload is required. The implementation does not silently assume zero opening inventory. |
| Sequentially plotting two markets with the same close time can invent a peak/trough. | Combined-portfolio risk. | Same-time closes are netted before cumulative points and drawdown are calculated. For example, simultaneous +$10 and -$10 produce a $0 change, not a transient $10 drawdown. |
| Straight lines interpolated gradual P&L movement between settlement points. | Existing chart inconsistency with close-based accounting. | The curve is now a staircase: flat until a scheduled close, then a step. The underlying fee/settlement calculation is unchanged. |
| Empty chart rendering retained the previous balance-row collection and could leave an old tooltip visible. | Existing stale presentation state. | Empty selections/results clear the balance data, hit targets, tooltip and chart rectangle. Empty equity is shown as unavailable, not a green $0 profit. |
| A quiet wallet repeatedly polled from its last supported trade, causing an increasingly redundant history range. | Existing polling inefficiency. | Successful activity coverage advances a watermark, with the existing 120-second overlap. Paused polling still catches up from its previous coverage. |
| Contradictory or unclassifiable supported-looking identifiers could disappear without an explicit coverage warning. | Data-quality risk. | Rejected identifiers generate a diagnostic warning and quarantine other known rows sharing the affected condition. Contradictory group identities cannot contribute equity. |
| Treating a filter change like a new report would create load/audit races and discard useful caches. | Extension race/performance risk. | Market toggles retain wallet generation and cached history/metadata/audits. Only view-specific UI and rebate requests are invalidated. Late rebates cannot populate the wrong selection. |

## Behavior and compatibility details

The default remains BTC 5m. Selection is saved under `pm-equity-markets-v1`; the previous BTC timeframe preference is read as a migration fallback. `?markets=btc-5m,btc-15m,eth-1h` specifies a precise selection and `?markets=` deliberately selects none. Legacy `?timeframe=15m` still selects BTC 15m. Values are whitelisted, deduplicated and ordered consistently. **All markets**, **Clear**, keyboard-operable native checkboxes and per-market countdown cards are included.

The fetch start now rounds down to the containing hour, regardless of which boxes are selected. This intentionally retrieves the largest supported candle boundary once. The actual loaded start is shown in the report; it can be up to 59 minutes earlier than the input. Toggling markets does not alter the loaded date range. To load a different start, change the input and press **Load report**.

CSV column positions from the original are retained. Three columns are appended: `symbol`, `timeframe`, `end_iso`. CSV filenames now encode the selected streams. Scripts that depend on the old filename pattern may need adjustment. The existing spreadsheet-formula-injection defense is preserved.

The visible-period, resolved-only and bought-both filters still govern the settled report. Current-round cards and live fills are explicitly separate current/latest views: they obey the market checkboxes, but not those settled-report filters. Wallet-wide paid rebates remain wallet-wide and are not misleadingly allocated among selected markets. Per-day accrual is matched against the currently visible condition IDs.

## Verification

### Automated tests

The original archive passed **76/76** tests before modification. The updated suite passes **87/87**, with zero failures/skips, in each of these process time zones: **UTC**, **America/Los_Angeles**, **Asia/Tokyo**. JavaScript syntax checking also passes.

The unchanged independent eight-market accounting fixture still produces **$61.49075** of eligible settled P&L, with its original five included settled rounds and two exclusions. The existing known buy/sell fee example still produces **$4.1648**. These are synthetic regression values, not observed wallet performance.

New/updated assertions cover the nine-stream universe, combined totals, single-stream removal, separate mixed-duration closes, exact epoch/calendar classification, winter/summer Eastern Time, invalid dates, DST ambiguity, per-stream CSV metadata, empty selection, stale chart state, storage/URL migration, zero-fetch toggles, load and rebate races, pre-candle hourly coverage, contradictory identities and idle polling. A complete mocked load exercises the actual load path for all nine streams including calendar-style hourly slugs.

### Chromium UI and download checks

Actual HTML/CSS/JavaScript was exercised in Chromium at **1440×1080** and **390×844**, with browser time zone **Europe/Berlin**. Browser navigation is administrator-blocked in this environment, so this was an **isolated about:blank DOM/rendering harness**, with only the test API origin/query and storage injected and synthetic `fetch` responses. No browser policy was changed and no real wallet/API requests were made. HTTP serving and gateway behavior are separately covered by the Node suite; a browser-to-live-server session was not verified.

The browser fixture produced:

| Selection | Expected and displayed P&L |
| --- | ---: |
| BTC 5m | +$6 |
| BTC 5m + BTC 15m | +$2 |
| BTC 15m only | -$4 |
| All nine streams | +$44 |

There were **zero API calls caused by toggling**. Nine simultaneous closes appeared together in one tooltip. The daily rebate fixture showed $18 separately from equity. An actual browser blob download was saved and parsed: it contained exactly the selected BTC 15m row with -$4 P&L and the new CSV fields. Native Space-key checkbox operation passed, the mobile page had no document-level horizontal overflow, and no uncaught JavaScript errors were recorded. Persistence and query precedence were tested with injected storage/query across fresh pages; real-origin browser localStorage/navigation were not tested.

The accompanying verification bundle contains test logs, the browser JSON report, desktop/mobile screenshots, the downloaded synthetic CSV, and the optional browser harness.

## Remaining limitations and recommended next work

**This is not wallet-balance or marked-to-market equity.** It remains cumulative trade-only settled P&L from zero. It omits deposits, withdrawals, open inventory marks, funding/capital constraints and external token transfers. Confirmed settlements are backdated to the scheduled round end, not the actual on-chain resolution/claim time. Its drawdown therefore must not be interpreted as intraperiod portfolio/capital drawdown.

**Hourly opening history is protected by exclusion, not automatically repaired.** With a short lookback, many hourly markets can be excluded because their books opened earlier. Select a start before the relevant market listing and reload. The useful next extension is a bounded per-condition backfill of pre-candle trades, role evidence and lifecycle events; all three must be handled together. Automatically adding earlier trades alone would not establish reliable cost basis or fee classification.

**Identifier support is deliberately strict.** Year-bearing calendar hourly slugs and the explicit supported epoch formats are handled. Yearless legacy hourly names, unknown formats and a repeated fall-back hour without explicit disambiguating candle metadata are not guessed. They generate coverage warnings when encountered in trade ingestion. A future metadata-driven classifier could expand coverage without relying on fill-time heuristics.

**The public API is not a complete ledger guarantee.** Existing request/page caps, service failures, indexer corrections and the 120-second live overlap remain. A fill indexed later than that overlap can require a manual reload; advancing the idle watermark is not a completeness guarantee. Fee schedules and maker/taker classifications remain modeled public inputs, not receipt-level proof. A missing/partial lifecycle history remains provisional; known unsupported lifecycle events remain excluded.

**Loading more streams costs more metadata/audit work.** Market filters themselves are local and cheap, but an all-stream load may need more market definitions and audits than the old BTC-only report. Existing whole-range taker/lifecycle refreshes can still be expensive for large wallets. No server-wide caching, concurrency, rate limiting or infrastructure behavior was changed. Incremental lifecycle refresh with a conservative correction window is a sensible separate optimization.

**Deployment was not performed.** The supplied patch/archive must be applied and tested on the intended host. The old remote-verification and single-file reference documents remain historical evidence, not proof that this update is already running on the existing URL. This was a focused correctness review, not an exhaustive security assessment or a guarantee that no other bugs exist.

## Official references checked

- Polymarket's Ethereum hourly example identifies a 1-hour ET candle and separately lists a market opening two days earlier: https://polymarket.com/event/ethereum-up-or-down-september-11-2026-1pm-et
- The corresponding Solana hourly example uses the same dated ET naming and 1-hour candle convention: https://polymarket.com/event/solana-up-or-down-september-11-2026-1pm-et
- Gamma market-by-slug schema, including market timing and fee metadata: https://docs.polymarket.com/api-reference/markets/get-market-by-slug

These references establish naming/timing conventions; they are not evidence of a live-account reconciliation for the patched app.
