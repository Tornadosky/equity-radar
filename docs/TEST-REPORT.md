# Initial test report — 2026-09-09

**Historical record:** the current deployment and live-account results are documented in [REMOTE-VERIFICATION.md](REMOTE-VERIFICATION.md). The initial deployment/API limitations below describe the earlier packaging stage and are superseded where the new report provides direct evidence.

## Result

**29 automated tests pass.** The synthetic full report was exercised through the browser and server gateway. The live-account check is blocked by this environment’s API access; this is not an assertion that live production data has been validated. The website has not been deployed.

## Automated verification

Command: `node --test tests/*.test.mjs` — 29 passed, 0 failed, 0 skipped.

The browser script itself is evaluated in a DOM-stubbed VM for calculation tests; tests do not use a separate reimplementation of the production formula. A separately authored fixture/oracle checks an eight-market scenario. An actual ephemeral Node HTTP server checks asset serving and the gateway using injected synthetic upstream responses.

Covered cases:

- Original known collateral-fee calculation: $4.1648.
- Exact finality versus active extreme quotes, ordinary position timestamps and closed-but-unresolved markets.
- Redeemable final-price evidence.
- Negative/missing inventory, including inventory that is bought back later.
- Invalid fill prices, invalid fee metadata, malformed outcome-price evidence.
- Truncated history withheld from equity.
- Legitimate duplicate fills preserved; repeated taker snapshots do not multiply records.
- A taker record cannot be consumed twice; fresh fills outside coverage remain unknown.
- Same-second pagination: 1,700 fills retained; live catch-up retains more than 200 fills.
- Market filters affect plotted data.
- CSV formula-injection escaping.
- Drawdown and diagnostic gross/net/fee consistency.
- Obsolete audit cannot mutate a new wallet’s cache, continue requesting its targets, or reset its loading flag.
- Missing numeric P&L on an expected asset cannot produce API verification.
- Allowlisted read-only proxy, credential stripping, invalid query rejection, forbidden upstream response handling and malformed upstream JSON.
- Actual Node HTTP serving of HTML/CSS/JS/health and fixture API responses; source files are not exposed as HTTP assets.

## Independent eight-market oracle

| Observation | Expected | Browser observed |
|---|---:|---:|
| Loaded markets | 8 | 8 |
| Fills | 13 | 13 |
| Included settled rounds | 5 | 5 |
| Excluded rounds | 2 | 2 |
| Additional unresolved round | 1 | 1 |
| Net settled P&L | $61.49075 | +$61.49 displayed |
| API matches among included rounds | 5 | 5 |
| Max dollar drawdown | $48 | $48 |
| Gross P&L | $65.50 | $65.50 |
| Modeled fees | $4.00925 | $4.01 displayed |
| Maker / taker / unknown fills | 5 / 8 / 0 | 5 / 8 / 0 |
| Wallet-wide recorded rebate payments | $1.75 | $1.75 |
| Separate daily reported maker accrual | $1.25 | $1.25 |

The fixture wallet is `0x1111111111111111111111111111111111111111`. It is explicitly synthetic. It is never used to claim results for a real account. The fixture dates are rebased when its test server starts.

The missing-inventory market and SPLIT/MERGE market are excluded. The near-terminal unresolved market remains unresolved. The source’s unsafe handling of these scenarios would overstate results; the independent fixture keeps that distinction explicit.

## Browser checks completed

- Loaded the original HTML and the website separately in Chrome.
- Compared eight main-surface rectangles and computed visual properties: header, controls, switches, grid, chart stats, summary metrics, chart wrapper and market panel had matching x/y/width/height, font family, background color and border radius before loading. This is measured geometry equality, not a claim of zero pixel difference in every dynamic state.
- Visually inspected desktop screenshots. Original CSS is preserved verbatim as the prefix of the website stylesheet; fixes/additions are appended.
- Demo loads 42 settled rounds plus one current round and preserves the seeded -$47.50 result; its charts and modal render.
- Synthetic wallet loads through profile → activities/roles/positions/ledger → market/fee data → per-market P&L audit, with the expected totals above.
- Resolved-only gives 7 market rows. Both-side gives 2 rows and +$10.33 included P&L. Resetting filters restores the report.
- Best-P&L sorting places the largest modeled round first.
- One-hour range reaches the appropriate reduced/empty result; returning to Loaded range restores results.
- Details opens, renders fills, fee/cashflow and API rows, and closes with its Close control.
- Chart pointer inspection shows the selected round, cumulative P&L, fee and winner. The hidden empty overlay is absent over loaded data.
- Pause/resume controls and repeated polling preserve 13 fills and the same total; Recheck P&L returns API match 5/5.
- Diagnostics opens and shows independent risk/fee figures. Daily rebates returns $1.25. Changing a market filter clears stale rebate scope. The curve stays $61.49.
- Reload preserves saved address/settings. Invalid wallet/future date produce a validation toast and preserve the existing report. No-wallet-extension handling displays a usable message.
- Fixed-width browser frames: 390px phone frame has 375px content width and 375px scroll width; 768px tablet frame has 753px content width and 753px scroll width. No page-wide horizontal overflow. Data tables intentionally scroll inside their table containers. Phone controls have one column; tablet controls have two. This does not certify every physical mobile device or browser.
- Production gateway failure displays an error, removes prior P&L and disables export. There is no fallback to demo data.

Screenshots under `evidence/` show the synthetic desktop report and tablet layout. The latter was captured in the responsive test frame. Browser extension metadata errors were present independently of the application and are not counted as application failures.

## Limits and checks still needed after hosting

1. Direct API attempts for the supplied project wallets (`tmsd-test` and `norm1e69`) received HTTP 403 in this execution environment. The production gateway browser attempt reported HTTP 502 / unable to reach upstream and correctly cleared results. Official documentation was available; real wallet histories, true API timing, historical fee applicability, rebates and rate-limit behavior were not successfully validated live.
2. CSV generation/escaping and the export control/direct fallback link were tested. This browser automation did not emit a completed download event after either automatic or direct-link attempts. End-to-end transfer of the CSV to disk is therefore **unverified**, despite the generated CSV bytes and direct download link being available. Confirm one download in your ordinary browser after hosting.
3. A real wallet extension connection, account prompt/rejection and account-change events were not exercised; no wallet extension was available. The absent-provider branch passed. No transaction signing is implemented.
4. Docker packaging is provided but no Docker image was built here. The zero-dependency Node HTTP server did run in integration tests. The optional framework/Worker preview build completed successfully; the portable release needs no framework build.
5. No exhaustive million-fill stress test, physical-device matrix, transaction-receipt reconciliation, or security penetration test is claimed. Public inputs cannot prove a complete transfer-free wallet ledger. Modeled equity is explicitly limited to included settled BTC 5m trading activity.

## Reproduce

Run the automated test command above. Run `node tests/fixture-server.mjs`, open the site and load the synthetic address to repeat the browser scenarios. Stop that test server and run `node server.mjs` for production API access. The release server has no request parameter or environment switch that silently substitutes fixtures.
