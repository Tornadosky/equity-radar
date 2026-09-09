# Equity Radar implementation plan
Goal: a hostable, visually faithful Equity Radar with trustworthy bounded accounting.
Architecture: unchanged vanilla working surface; portable Node HTTP server and shared allowlisted proxy; framework route serves identical markup for supervised browser QA.
Spec: ../specs/2026-09-09-equity-radar-design.md

- [x] Extract baseline assets and write failing accounting regressions in tests/accounting.test.mjs using the actual browser script in a VM.
- [x] Correct resolution finality, inventory/history validation, pagination and maker matching in public/assets/radar.js.
- [x] Add collapsed diagnostics and observed activity rebates, preserving existing layout.
- [x] Implement lib/proxy.mjs, server.mjs and framework API adapter. Test query allowlisting and upstream failures.
- [x] Run browser demo/reference visual checks and controlled API fixture scenarios; attempt public account loading.
- [x] Build, package deployment source and write docs/DEVIATIONS.md and docs/TEST-REPORT.md.
