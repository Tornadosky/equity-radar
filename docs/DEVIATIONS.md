# Deviations from the supplied HTML

Reference: `polymarket_equity_radar_v5_equity_only.html`. This is a port of that application, not a redesign. Original page structure, CSS variables, typography, gradients, borders, spacing, summary cards, table columns, canvas rendering style, modal, demo, address loading, wallet connection, refresh controls, dates, filters and CSV remain. Original mixed English/Russian labels and USD formatting remain unless explicitly listed below.

## Visual and interaction changes

| ID | Change | Why this is necessary / useful |
|---|---|---|
| D01 | The embedded CSS and script become local `/assets/radar.css` and `/assets/radar.js`. A Node server serves the same HTML directly. | Makes the app hostable and maintainable without changing its DOM into framework components or adding a runtime dependency. |
| D02 | Added `[hidden] { display:none !important }`. | Original `.chart-empty { display:grid }` overrode the browser’s hidden state, leaving “No cumulative equity” text over loaded charts. |
| D03 | Canvas width subtracts the wrapper’s 24px horizontal padding. | Original renderer could draw past its panel and clip the chart. Colors, strokes, markers and grid styling are unchanged. |
| D04 | Below 560px, controls become one column; chart stats use three columns; status and typography fit the screen. | Original phone layout overflowed. Desktop rules are preserved. Phone and tablet layouts were inspected in fixed-width browser frames. |
| D05 | One **collapsed Trader diagnostics** panel follows the existing Live fills panel. | Adds useful analysis without rearranging the original working surface. It uses existing panel/card styles. It contains drawdown, profit factor, gross P&L, modeled fees, role counts, exclusions and rebate evidence. |
| D06 | Existing chart caption explains that the curve is settled BTC 5m P&L from zero, not wallet balance. | The source does not reconstruct deposits, withdrawals, cash or open-position marks; calling this actual wallet equity would overstate the calculation. |
| D07 | Excluded rows retain their fills and Details button, with an existing-style red badge and reason; their P&L is blank. The modal repeats the reason. | Corrupt/incomplete ledger data must not produce an apparently trustworthy equity point. |
| D08 | Chart Audit shows the number of included rounds that match independent API P&L. | Original green “matched” only compared the sum of chart inputs with its endpoint: a self-consistency check, not independent verification. The caption retains endpoint information. |
| D09 | “Resolved only” and “Bought both” apply to chart, summary and CSV as well as market rows. Sorting changes row order only. Live fills remain the wallet’s independent recent feed. | Prevents totals referring to a different set of markets than the visible table. |
| D10 | Entered start time is rounded down to the start of its five-minute round for fetching and calculation. The original entered field value remains; diagnostics show effective loaded range. | Prevents missing opening buys when a user starts partway through a market. |
| D11 | Chart x positions use elapsed timestamps rather than equal index spacing. | Inactive gaps should occupy their real duration. The same line/point style remains. |
| D12 | Visible keyboard focus, dialog/canvas labels, polite status updates and reduced-motion support. | Improves keyboard and assistive-technology use without restyling the default surface. Touch can inspect a chart point. |
| D13 | Idle live indicator is paused until a wallet is loaded. “Load report” returns to its original English label after loading. Model-complete replaces claims of exact real-world fees. | Fixes misleading status and preserves initial label consistency. |
| D14 | CSV keeps the original fields and adds `excluded` and `quality_issues`; string cells that could execute spreadsheet formulas are escaped. A temporary Download CSV link appears in an existing-style toast. | Makes exports auditable and safer, and gives a direct download fallback. Blob cleanup is delayed so downloads are not revoked immediately. |
| D15 | Live fills “All” displays all loaded fills, replacing the source’s hidden 500-row cap. | Aligns the existing option with its label. Large loaded histories can be expensive to render; select a bounded row count for regular monitoring. |

## Data and accounting changes

| ID | Change | Motivation |
|---|---|---|
| L01 | Calls use a fixed, read-only same-origin gateway for three official APIs. | Avoids browser CORS dependence and centralizes timeouts, response limits and query validation. No private keys, trading endpoints, user cookies or authorization headers are forwarded. |
| L02 | Activity pagination uses bounded, nonoverlapping time windows and exhausts dense timestamp boundaries. Live catch-up uses the same complete-pagination path. | Original skipped same-second fills at a page boundary and silently capped live recovery at 200 fills. If the request budget or a single-second endpoint ceiling is reached, the report marks history incomplete and withholds equity. |
| L03 | Fallback trade history is visibly incomplete; failed optional position/role/ledger sources are disclosed. | A successful HTTP response is not proof of a complete trading ledger. |
| L04 | Taker requests use fixed start/end parameters. Maker inference requires complete evidence covering the trade timestamp. Each taker record can match only once; repeated snapshots preserve multiplicity without accumulating polling duplicates. | Fixes taker double use, false maker inference on newly arrived fills, and repeated-poll count inflation. Public timestamp-mismatched role inference remains model evidence, not on-chain proof. |
| L05 | Resolution requires an explicit winner/token winner or resolved status with an exact 1/0 pair, or strictly redeemable position evidence. Near-final prices, elapsed end times and ordinary position timestamps do not resolve a market. Conflicting/invalid evidence is excluded. | Source could settle an active 98-cent or 99.9-cent market at $1. Closed positions alone are not resolved markets. |
| L06 | Validate fill side, outcome, price, size, notional, timestamp and condition ID. Check inventory through chronological fills. Missing inventory, malformed fills, partial rounds and incomplete history do not enter equity. | Original clamped negative inventory while retaining sell proceeds, yielding spurious profit. |
| L07 | Fetch SPLIT, MERGE and CONVERSION activity. Affected rounds are excluded, and known events survive incomplete refreshes. | The inherited fills-only formula cannot correctly reconstruct these token/collateral movements. Implementing a complete lifecycle ledger would change the core accounting substantially; explicit exclusion is the minimal trustworthy behavior. |
| L08 | Support Gamma `feeSchedule` as well as CLOB `fd`. Reject malformed configurations; keep unknown/fallback role/fee estimates provisional. | Retains the supplied fee model while accepting current documented metadata. Present schedules do not prove historical charged fees. |
| L09 | A zero API P&L that differs from the model is a mismatch, not automatically “stale zero rejected.” Each expected asset must have numeric P&L before API verification. | Neither a model disagreement nor an existing row proves the API is stale or complete. |
| L10 | Report generations isolate asynchronous load, polling, fee/market refresh, audit and rebate requests. Invalid input is checked before clearing the active report. Switching reports closes old details. | Prevents results from a previous wallet or date overwriting the current report or changing its loading state. |
| L11 | Demo fill timestamps stay inside their actual market window and demo markets carry explicit resolution status. Synthetic values and the seeded trading formula remain. | Original index-based timestamps drifted up to roughly 90 minutes outside five-minute rounds. Demo remains synthetic and never fabricates real-account evidence. |
| L13 | `usdcSize` is validated against `size x price` **plus or minus the modeled fee**, and the bare `size x price` is what enters settlement. | Polymarket reports `usdcSize` as gross cash moved, which since the crypto taker fee launched is the notional plus that fee on a BUY. Comparing it with the bare notional flagged 95.8% of a live account's fills as `Inconsistent fill notional`, excluding every round and leaving the equity curve empty. Using `usdcSize` as the notional would instead count the fee twice. |
| L14 | `isBtc5m`'s title fallback matches `-5m-` rather than `5m`. | `'btc-updown-15m-...'.includes('5m')` is true, so 15-minute markets entered a 5-minute report. `getStartSec` cannot parse a 15m slug, so it floors a fill timestamp to a five-minute boundary and assigns a 300-second end. `buildGroups` still groups by condition ID: each 15m market becomes one extra, incorrectly timed round, not three separate rounds. This mixes market intervals and can calculate the wrong payout when fills are filtered by the incorrect end time. |
| L12 | Observed MAKER_REBATE/TAKER_REBATE payouts are shown wallet-wide. A separate UTC-day lookup displays API-reported maker rebate accrual for visible condition IDs. Neither is added to trading P&L or to the other amount. | Separates market accrual from payment and avoids counting the same rebate twice. Invalid/failed rebate evidence is unavailable, not zero. Changes to day, wallet or filters invalidate prior results. |

## Formula retained

For each modeled fill, fee is rounded to five decimal places:

`fee = shares × rate × (price × (1 − price)) ^ exponent`

Maker fee is zero for taker-only schedules. Unknown roles use the conservative taker estimate. BUY cash out is notional plus modeled fee; SELL cash in is notional minus modeled fee. After authoritative resolution:

`settled P&L = SELL cash in − BUY cash out + remaining winning shares × $1`

A claim/redeem does not add a second payout. The formula, five-decimal fee rounding, duplicate legitimate fill preservation and zero-based cumulative sum remain the source’s model. Historical schedules, externally transferred inventory and complete account returns are not established by these public inputs.

## Official sources checked on 2026-09-09

- [Activity types and limits](https://docs.polymarket.com/api-reference/core/get-user-activity)
- [Trade pagination and taker filter](https://docs.polymarket.com/api-reference/core/get-trades-for-a-user-or-markets)
- [Fees](https://docs.polymarket.com/trading/fees)
- [Market details, status and fee schedule](https://docs.polymarket.com/market-data/market-details)
- [CLOB market information](https://docs.polymarket.com/api-reference/markets/get-clob-market-info)
- [Market-position P&L fields](https://docs.polymarket.com/api-reference/core/get-positions-for-a-market)
- [Maker rebates by UTC day and market](https://docs.polymarket.com/api-reference/rebates/get-current-rebated-fees-for-a-maker)
- [Token lifecycle](https://docs.polymarket.com/concepts/positions-tokens)
- [Resolution](https://docs.polymarket.com/concepts/resolution)
- [API changelog](https://docs.polymarket.com/changelog/predictions)

The source snapshot and complete unified diff accompany this document so every code change is reviewable.

## Windows deployment update — 9 September 2026

This addendum records changes after Windows commit `7a992ec`; earlier D01–D15 and limitations still apply.

| Change | Motivation and effect |
|---|---|
| BTC 5m / BTC 15m selector in the existing switch row | Requested by the user. Keeps the original primary controls, chart, cards, typography and colors. Each report contains only the selected BTC interval; grouping, closing time, countdown, live fills, demo, labels, and CSV use 300 or 900 seconds consistently. |
| Strict BTC market slugs | Stops 15m, other assets, or contradictory market/event identifiers entering a 5m report. The old title/sub-string fallback could accept wrong intervals. |
| New report on interval switch | Automatically reloads the same wallet, clears previous data and rebates, and invalidates obsolete requests. A delayed 5m response cannot overwrite 15m results. Selected interval is remembered; `?timeframe=15m` is supported. |
| Metadata-aware cash validation | Activity may report fee-inclusive USDC. Validation occurs after the market fee schedule arrives, accepts bare notional or the side-correct fee adjustment, and avoids permanently rejecting valid historical fees based on today's fallback rate. Gross notional stays shares × price; fees are deducted once. |
| Explicit conflicting resolution evidence | A second source cannot silently rescue contradictory winners or final prices. Affected rounds are excluded and explained instead of entering the equity curve. |
| Null rebate response | The live endpoint returned HTTP 200 with JSON null. It now reports that no records were returned and no amount is confirmed, rather than a generic error or a fabricated zero. |
| Bounded 12-second market metadata reuse | Simultaneous identical market requests share one upstream call. Public market definitions are reused for at most 12 seconds, bounded to 128 entries / 4 MiB. Wallet history, positions, profiles and rebates are never cached. Newly published metadata can consequently appear up to 12 seconds later. |
| Static asset revalidation | Cloudflare's asset header changes from `no-store` to `no-cache`, allowing ETag revalidation without serving an unchecked old release. This reduces repeat transfer sizes when the browser has an unchanged asset. API responses remain no-store. |
| Missing cash evidence | Null or absent USDC values remain absent rather than becoming a false zero and excluding otherwise valid fills. Explicit zero remains genuine data subject to validation. |
| Rebate button after loading | Diagnostics refresh after loading finishes, so a report loaded with auto-refresh off immediately enables the rebate lookup. |
| Verified input wallet before proxy substitution | The live tmsd-test lookup proposed an empty proxy although the entered wallet had recent trades. When profile and input differ, one matching TRADE record now preserves the entered wallet; an empty input still resolves normally to its profile proxy. A failed probe retains the input and visibly marks mapping as unverified. This prevents false empty reports and adds no request when the profile address already matches. |
| Expanded regression coverage | Tests cover both intervals, obsolete responses, historical fee evidence, contradictory settlement sources, null rebates and gateway request sharing. These do not alter the product layout. |

The existing diagnostics panel shows modeled fees already included in net P&L, gross P&L, drawdown, profit factor, role counts, coverage, observed wallet-wide rebate payouts, and separate daily maker accruals for visible markets. Daily accruals and payouts are not added together or to the settlement curve. Rewards, deposits, withdrawals, transfers and open-position marks are not reconstructed; the curve remains settled trading P&L from zero rather than wallet equity or return on capital.


## Second verification — 9 September 2026

| Change | Motivation and effect |
|---|---|
| Missing or malformed API prices remain unknown | JavaScript numeric coercion could turn an absent price into zero and falsely infer the opposite winner. Finite numbers and nonblank numeric strings are the accepted evidence; actual zero remains meaningful. |
| Fees and cash before resolution | Open rounds now show their modeled fill fees, BUY cash, SELL cash, inventory and role counts in the existing table, detail modal and CSV. Payout and settled P&L remain pending. Previously the aggregate fields showed false zeros while fill details showed fees. Missing inventory can be flagged before resolution. |
| One visible-period status total | The top banner now uses the same filters and included settled rows as the chart and summary, updating after loads, manual reconciliation, filters and live refreshes. It says `Visible 5m/15m P&L`. Loading and audit progress remain visible while requests run. This fixes differing scopes and stale totals. |
| Explicit reconciliation tolerance | Existing API badges and details disclose the tolerance: max($0.03, 0.05% of round buy + sell notional). The collapsed diagnostics panel shows comparison coverage, signed net API-minus-calculation difference, and sum of absolute differences so positive/negative gaps cannot hide one another. No fee, P&L or tolerance formula was changed. |
| More precise fee and pending labels | Detail fee is explicitly modeled. Pending payouts are blank in CSV and pending in details, not zero or the text `null`. Diagnostics fee totals explicitly refer to included settled rounds. |

No CSS, page structure, controls, charts, spacing, colors, or layout changed in this verification. The changes correct data interpretation and labeling within the existing interface.

### Remaining accounting scope

The tested September reports use the current cash-fee convention. This is not full wallet equity, capital-adjusted return, or an on-chain receipt audit. Historical fee versions, possible additional builder fees and externally transferred inventory are not completely reconstructed. In particular, reports before the V2 migration are not validated by these tests: [Polymarket's changelog](https://docs.polymarket.com/changelog/predictions) dates V2 deployment to 28 April 2026; [the original exchange documentation](https://github.com/Polymarket/ctf-exchange/blob/main/docs/Overview.md) describes BUY fees collected in outcome tokens. Do not treat a model-complete/API-matched label as proof of exact historical paid fees.

Current formula and rounding were cross-checked against [official fees](https://docs.polymarket.com/trading/fees). Maker/taker public-data classification and current metadata remain model evidence. No comparative product benchmark or claim of best-in-class coverage is made.
