# Equity Radar website specification
Preserve the supplied HTML design, DOM hierarchy, CSS, canvas chart, filters, tables, modal, demo, wallet address connection, auto-refresh and CSV. Serve its extracted HTML/CSS/JS directly. Use a same-origin read-only API proxy shared by portable Node hosting and the preview framework. No publication requested: supply hostable source.

Add one collapsed Trader diagnostics section below existing panels. Display peak-to-trough settled P&L drawdown, profit factor, fees, maker participation, quality exclusions and observed rebates. Wallet-wide rebates remain separate from BTC P&L because attribution is absent. The curve is cumulative settled trade P&L from zero, not account balance or investment return.

Correct false resolution, missing inventory, malformed fills, same-second pagination loss, taker double-counting, stale async state and misleading audit certainty. Quarantine untrustworthy rounds from the curve with visible reasons; retain all inspectable fills. Retain original fee accounting unless official evidence requires change, and explain estimation.

Verify deterministic accounting regressions, API contracts, browser original-versus-port visual fidelity, every primary control and the live loading flow. Record actual live endpoint accessibility honestly. Package source, portable server, Dockerfile, README, deviation log and test evidence.
