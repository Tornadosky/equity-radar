import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {loadRadar} from './harness.mjs';

const ROUND_COUNT = Number(process.env.BENCH_ROUNDS || 1946);
const RTT_MS = Number(process.env.BENCH_RTT_MS || 40);
const SELECTED = ['btc-5m', 'btc-15m', 'eth-5m', 'sol-5m'];
const KEYS = ['btc', 'eth', 'sol'].flatMap(symbol => ['5m', '15m', '1h'].map(tf => `${symbol}-${tf}`));
const SECONDS = {'5m': 300, '15m': 900, '1h': 3600};
const START = Date.parse('2026-09-08T12:28:00Z') / 1000;
const NOW = Date.parse('2026-09-12T09:21:00Z') / 1000;
const WALLET = '0x' + 'a'.repeat(40);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildTrades(count) {
  const trades = [];
  let i = 0;
  const alignedNow = Math.floor(NOW / 300) * 300 - 300;
  for (let t = alignedNow; t >= START && trades.length < count; t -= 300) {
    for (const key of KEYS) {
      if (trades.length >= count) break;
      const [symbol, tf] = key.split('-');
      const sec = SECONDS[tf];
      if (t % sec !== 0) continue;
      i += 1;
      trades.push({
        conditionId: '0x' + i.toString(16).padStart(64, '0'),
        asset: '1',
        slug: `${symbol}-updown-${tf}-${t}`,
        timestamp: t + 10,
        size: 10,
        price: 0.4,
        side: 'BUY',
        outcome: 'Up',
        _isTaker: true
      });
    }
  }
  return trades;
}

function requestedIds(url) {
  return String(url.searchParams.get('condition_ids') || '')
    .split(',')
    .map(id => id.toLowerCase())
    .filter(Boolean);
}

function classify(url) {
  const pathName = url.pathname;
  if (pathName.endsWith('/market-positions')) return 'audit';
  if (pathName.includes('/clob-markets/')) return 'clob';
  if (pathName.endsWith('/markets')) return 'gamma';
  if (pathName.includes('/markets/slug/') || pathName.includes('/events/slug/')) return 'gammaFallback';
  if (pathName.endsWith('/activity')) return 'activity';
  if (pathName.endsWith('/trades')) return 'taker';
  if (pathName.endsWith('/positions') || pathName.endsWith('/closed-positions')) return 'positions';
  if (pathName.endsWith('/public-profile')) return 'profile';
  return 'other';
}

async function runOnce({label, source, trades, marketsHaveFees}) {
  const counts = {audit: 0, clob: 0, gamma: 0, gammaFallback: 0, activity: 0, taker: 0, positions: 0, profile: 0, other: 0};
  let interactiveMs = null;
  const byId = new Map(trades.map(trade => [trade.conditionId, trade]));
  class FixedDate extends Date { static now() { return NOW * 1000; } }
  const a = loadRadar({
    Date: FixedDate,
    fetch: async raw => {
      const url = new URL(raw);
      const kind = classify(url);
      counts[kind] += 1;
      await sleep(RTT_MS);
      let payload = [];
      if (kind === 'profile') payload = {proxyWallet: WALLET};
      else if (kind === 'activity' && url.searchParams.get('type') === 'TRADE') payload = trades;
      else if (kind === 'gamma') {
        payload = requestedIds(url).map(id => {
          const trade = byId.get(id);
          return {
            conditionId: id,
            slug: trade?.slug || '',
            resolved: true,
            outcomes: ['Up', 'Down'],
            outcomePrices: [1, 0],
            startDate: new Date(START * 1000).toISOString(),
            ...(marketsHaveFees ? {feesEnabled: false} : {})
          };
        });
      } else if (kind === 'clob') payload = {fd: {r: 0, e: 1, to: true}};
      return {ok: true, json: async () => payload};
    }
  }, {source});
  a.setMarketSelection(SELECTED);
  a.els.lookback.value = '24';
  a.els.address.value = WALLET;
  a.els.start.value = new Date((START + 60) * 1000).toISOString();
  const started = Date.now();
  const pending = a.loadReport();
  while (a.state.loading) await sleep(5);
  interactiveMs = Date.now() - started;
  await pending;
  return {
    label,
    marketsHaveFees,
    interactiveMs,
    completeMs: Date.now() - started,
    rows: a.state.rows.length,
    visible: a.getVisibleRows().length,
    counts
  };
}

function printResult(result) {
  const {counts} = result;
  console.log(`${result.label} fees=${result.marketsHaveFees ? 'gamma' : 'clob-needed'}`);
  console.log(`  interactive ${result.interactiveMs}ms  complete ${result.completeMs}ms  rows ${result.rows}  visible ${result.visible}`);
  console.log(`  requests gamma=${counts.gamma} clob=${counts.clob} audit=${counts.audit} activity=${counts.activity} taker=${counts.taker} positions=${counts.positions} fallback=${counts.gammaFallback}`);
}

const trades = buildTrades(ROUND_COUNT);
if (trades.length !== ROUND_COUNT) {
  throw new Error(`built ${trades.length} trades, expected ${ROUND_COUNT}`);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-bench-'));
const headPath = path.join(tmp, 'radar-head.js');
fs.writeFileSync(headPath, execFileSync('git', ['show', 'HEAD:public/assets/radar.js'], {encoding: 'utf8'}));
const currentPath = new URL('../public/assets/radar.js', import.meta.url);

console.log(`Simulated wallet: ${ROUND_COUNT} rounds, ${SELECTED.join(', ')}, Last 24h, RTT ${RTT_MS}ms`);
console.log(`Start ${new Date(START * 1000).toISOString()}  now ${new Date(NOW * 1000).toISOString()}\n`);

for (const marketsHaveFees of [true, false]) {
  const head = await runOnce({label: 'HEAD', source: headPath, trades, marketsHaveFees});
  const current = await runOnce({label: 'now ', source: currentPath, trades, marketsHaveFees});
  printResult(head);
  printResult(current);
  const interactive = head.interactiveMs / Math.max(1, current.interactiveMs);
  const complete = head.completeMs / Math.max(1, current.completeMs);
  console.log(`  speedup interactive ${interactive.toFixed(2)}x  whole process ${complete.toFixed(2)}x`);
  console.log(`  clob requests ${head.counts.clob} → ${current.counts.clob}  gamma ${head.counts.gamma} → ${current.counts.gamma}\n`);
}

fs.rmSync(tmp, {recursive: true, force: true});
