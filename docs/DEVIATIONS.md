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
| L14 | `isBtc5m`'s title fallback matches `-5m-` rather than `5m`. | `'btc-updown-15m-...'.includes('5m')` is true, so 15-minute markets entered a 5-minute report. `getStartSec` cannot parse their slug, so their fills were bucketed into `floor(ts/300)*300` rounds with a wrong 300-second end, splitting one 15m market across up to three fabricated rounds and producing the only round that failed the independent API P&L audit. |
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
