# Screenshot discrepancy — 9 September 2026

The supplied screenshots compare norm1e69, BTC 5m, Last 24h, with the same displayed chart range.

| Measure | Original HTML | Website |
|---|---:|---:|
| Visible settled P&L | +$477.98 | +$525.06 |
| Settled rounds | 377 | 286 |
| Found rounds | 379 | 287 |
| API matches | 274 | 286 |
| API mismatches | 103 | 0 |

The displayed net difference is $47.08. Exact row-level attribution is not available from screenshots; no CSV exports were found in the checked Downloads/project locations.

Confirmed source defect 1: the original isBtc5m fallback uses slug.includes('5m'), which also matches btc-updown-15m. The website requires the selected interval. The 91 extra settled rounds strongly fit this contamination; 24 hours has only 288 nonoverlapping five-minute slots. The original groups by condition ID, so each 15m market contributes one extra group with incorrectly inferred five-minute start/end times.

Confirmed source defect 2: original tradeNotional accepts fee-inclusive usdcSize within 0.5% of shares times price, then calculateRoundSettlement deducts the fee again. A source-function probe of 10 winning shares at $0.96 with a $0.02688 fee gives original P&L $0.34624 versus website $0.37312: one fee was deducted twice in the original. This can also change common 5m-market P&L.

The HTML's green chart 'matched' indicator verifies its cumulative sum, not all API comparisons: the same screenshot explicitly reports 103 API mismatches. Website API matching is within tolerance and does not prove receipt-level fee accuracy; both screenshots still label some calculations as approximate.

These intentional corrections mean preserving the layout and settlement formula does not guarantee the original's totals. They are not a rebate adjustment; rebates are separate from the website equity curve. Auto-refresh means live snapshots can differ too, but it cannot explain the structural excess of rounds by itself.

For an exact $47.08 bridge, compare the two paused exports from these snapshots by condition ID, separating HTML-only 15m markets from shared 5m markets and comparing fees and P&L. A later live reload is not the same snapshot. No production calculation was changed during this investigation.
