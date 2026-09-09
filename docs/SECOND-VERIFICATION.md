# Second verification — 9 September 2026

Scope: current BTC 5m / 15m settled trading P&L, preserving the original interface. This is public-data reconciliation, not complete wallet equity or a transaction-receipt audit.

## Release and automated evidence

- Final Cloudflare version: `af6effef-f9f5-4d6b-9af4-06ba94638456`.
- 76 tests pass, zero failures or skips, in scratch review and the Windows project. The suite includes independent fixture accounting, validation, pagination, interval isolation, asynchronous report replacement, rebates, and gateway behavior.
- New regressions cover absent/malformed prices, alternate price fields, pre-resolution fees/cash, visible-period totals, empty totals, tolerance disclosure, and the actual asynchronous audit/settlement refresh callbacks. Defect reproductions failed before their fixes.
- Syntax checks and `git diff --check` passed. Final Cloudflare smoke check passed: local/deployed assets identical, read-only routes enforced, valid health response, and CSS/JS ETag revalidation returned 304.
- Only JavaScript changed in production during this verification. HTML and CSS bytes stayed identical. See `DEVIATIONS.md` for each justified behavior/text change.

## Browser evidence

The following are paused observations, not fixed expected live balances. Browser date/time display was ET; all reports were checked on 9 September 2026.

| Wallet / scope | Included rounds | Trading P&L | API reconciliation |
|---|---:|---:|---|
| norm1e69, rolling 24h BTC 5m | 285 | +$768.54 | 285/285 within tolerance; signed and absolute API gap both $1.55 |
| norm1e69, BTC 15m from 09:00 ET | 4 | -$22.68 | 4/4 within tolerance |
| tmsd-test, BTC 15m from 09:00 ET | 5 | -$839.71 | 5/5 within tolerance |
| tmsd-test, automatic switch to BTC 5m | 16 | +$475.83 | 16/16 within tolerance; API gap $0.13 |

The full-day report had 98 fee/role fallback rounds. API agreement does not turn inferred maker/taker roles into receipt evidence. BTC interval links were isolated to the selected market scope.

Browser checks covered demo 5m/15m, same-wallet interval reload, both-side and resolved filters, visible-period changes, sorting, open-round details (nonzero modeled fees with pending payout), live feed count, live pause/resume, manual reconciliation, invalid wallet/date preservation, diagnostics, and rebate lookup/invalidation. Desktop content width equaled viewport width (1348px); no CSS/HTML change occurred.

A real norm1e69 ledger returned one $1,728.55 wallet-wide rebate payout record. This is separate from scoped trading P&L. The daily endpoint returned no records; UI correctly states that no amount is confirmed. An old daily result is invalidated by changing visible markets.

A persistent banner mismatch was caught during live settlement refresh on the first candidate. The final release adds updates to both completed async audit and settlement-refresh paths. Regression tests reproduce the old stale state and pass with the fix. The final live tmsd-test sample showed matching banner/chart/summary at +$387.00, 17 included rounds, and subsequent live/settlement heartbeat updates.

## Limits of the verification

- CSV bytes, scoped rows, numeric fields, pending blanks and formula-injection protection were checked by tests. Browser export produced its Download CSV link; the automation download event timed out. A saved file on disk was not verified.
- A real wallet-extension connection and signing were not exercised. The application does not implement trading or custody.
- No on-chain receipt reconciliation, full historical fee-version accounting, extra builder-fee reconstruction, external inventory reconstruction, or independent product-ranking benchmark was performed.
- Large full-day histories still require many public API reads. Metadata request sharing and ETag revalidation are covered, but this is not a claim of best available end-to-end loading speed.
- This pass visually checked desktop. Existing mobile styles are retained; a new physical-device/browser matrix was not run.

Conclusion: a better-supported implementation for the stated current-market scope, with confirmed defects fixed and quantified reconciliation differences. Neither zero bugs nor best-in-class coverage can be certified.
