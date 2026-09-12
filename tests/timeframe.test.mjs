import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRadar} from './harness.mjs';

const start=Date.parse('2026-09-11T17:00:00Z')/1000;
const wallet='0x'+'1'.repeat(40);
const keys=['btc','eth','sol'].flatMap(symbol=>['5m','15m','1h'].map(tf=>`${symbol}-${tf}`));
const duration={'5m':300,'15m':900,'1h':3600};
const condition=key=>'0x'+String(keys.indexOf(key)+1).padStart(64,'0');
const fill=(key,extra={})=>({conditionId:condition(key),asset:key,slug:`${key.split('-')[0]}-updown-${key.split('-')[1]}-${start}`,timestamp:start+10,size:10,price:.4,side:'BUY',outcome:'Up',_isTaker:true,...extra});
class FixedDate extends Date {static now(){return (start+7200)*1000;}}
function seed(a) {
  a.state.historySinceSec=start;
  a.state.ledgerComplete=true;a.state.ledgerCoverageEnd=Infinity;
  a.state.takerHistoryComplete=true;a.state.takerCoverageEnd=Infinity;
  const trades=keys.map(key=>fill(key));a.state.takerTrades=trades;
  a.initializeTradeState(trades);
  const markets=new Map(keys.map(key=>[condition(key),{conditionId:condition(key),resolved:true,outcomes:['Up','Down'],outcomePrices:key==='btc-15m'?[0,1]:[1,0],feesEnabled:false,startDate:new Date(start*1000).toISOString()}]));
  a.state.markets=markets;
  a.state.rows=a.enrichGroups(a.buildGroups(a.state.allTrades,start),[],[],markets);
  a.state.proxyWallet=wallet;
}

test('all nine streams are supported, independent of the selected view',()=>{
 const a=loadRadar();assert.deepEqual([...a.state.selectedMarkets],['btc-5m']);
 for(const key of keys) {
  assert.equal(a.isSupportedMarket(fill(key)),true,key);
  assert.equal(a.getTimeframe(fill(key)).seconds,duration[key.split('-')[1]]);
 }
 assert.equal(a.normalizeTimeframe('1h'),'1h');
 for(const value of ['','4h','__proto__',null])assert.equal(a.normalizeTimeframe(value),'5m');
});

test('strict market identity rejects unsupported assets, suffixes and contradictory evidence',()=>{
 const a=loadRadar();
 for(const slug of [`xrp-updown-5m-${start}`,`x-btc-updown-5m-${start}`,`btc-updown-5m-${start}-extra`,`btc-updown-4h-${start}`])assert.equal(a.isSupportedMarket({slug}),false,slug);
 for(const eventSlug of [`eth-updown-5m-${start}`,`btc-updown-15m-${start}`,`btc-updown-5m-${start+300}`])assert.equal(a.isSupportedMarket({...fill('btc-5m'),eventSlug}),false,eventSlug);
 assert.equal(a.isSupportedMarket({...fill('btc-5m'),eventSlug:'wrapper-event'}),true);
 assert.equal(a.isBtc5m(fill('btc-5m')),true);assert.equal(a.isBtc5m(fill('eth-5m')),false);
});

test('calendar hourly slugs use Eastern time, independently of fill time and browser timezone',()=>{
 const a=loadRadar();
 for(const [name,symbol] of [['bitcoin','btc'],['ethereum','eth'],['solana','sol']]) {
  const record={slug:`${name}-up-or-down-september-11-2026-1pm-et`,timestamp:start-24*3600};
  const info=a.marketDescriptor(record);
  assert.equal(info.marketKey,`${symbol}-1h`);assert.equal(info.startSec,start);assert.equal(info.seconds,3600);
 }
 const time=slug=>a.getStartSec({slug});
 assert.equal(time('bitcoin-up-or-down-january-11-2026-1pm-et'),Date.parse('2026-01-11T18:00:00Z')/1000);
 assert.equal(time('bitcoin-up-or-down-september-11-2026-12am-et'),Date.parse('2026-09-11T04:00:00Z')/1000);
 assert.equal(time('bitcoin-up-or-down-september-11-2026-12pm-et'),Date.parse('2026-09-11T16:00:00Z')/1000);
});

test('invalid dates, unsupported hourly naming and DST ambiguity cannot silently invent a timestamp',()=>{
 const a=loadRadar();
 for(const slug of ['bitcoin-up-or-down-february-30-2026-1pm-et','bitcoin-up-or-down-march-8-2026-2am-et','bitcoin-up-or-down-november-1-2026-1am-et','bitcoin-up-or-down-moon-1-2026-1pm-et','bitcoin-up-or-down-september-11-2026-13pm-et','bitcoin-up-or-down-on-september-11','bitcoin-up-or-down-september-11-1pm-et'])assert.equal(a.marketDescriptor({slug}),null,slug);
 const slug='bitcoin-up-or-down-november-1-2026-1am-et';
 assert.equal(a.getStartSec({slug,endDate:'2026-11-01T07:00:00Z'}),Date.parse('2026-11-01T06:00:00Z')/1000);
 assert.equal(a.getStartSec({slug,eventStartTime:'2026-11-01T05:00:00Z'}),Date.parse('2026-11-01T05:00:00Z')/1000);
});

test('grouping and live ingestion retain all assets and intervals without merging overlapping rounds',()=>{
 const a=loadRadar({Date:FixedDate});seed(a);
 assert.equal(a.state.rows.length,9);assert.equal(a.state.allTrades.length,9);
 a.mergeLiveTrades(keys.map(key=>fill(key,{timestamp:start+20})));
 assert.equal(a.state.allTrades.length,18);
 const groups=a.buildGroups(a.state.allTrades,start);assert.equal(groups.length,9);
 const rows=a.enrichGroups(groups,[],[],a.state.markets);
 for(const row of rows){assert.equal(row.trades.length,2);assert.equal(row.endSec-row.startSec,duration[row.timeframe]);}
});

test('combined equity is additive and disabling BTC 5m leaves only BTC 15m, without a fetch',()=>{
 const a=loadRadar({Date:FixedDate,fetch:()=>{throw new Error('A toggle must not fetch');}});seed(a);
 const originalTrades=a.state.allTrades, originalRows=a.state.rows, generation=a.state.generation;
 a.setMarketSelection(['btc-5m','btc-15m']);
 assert.equal(a.getVisibleRows().length,2);
 assert.equal(a.state.balanceRows.at(-1).value,2); // +6 and -4, zero fees
 assert.match(a.els.totalPnl.textContent,/\+2,00/);
 assert.match(a.els.status.innerHTML,/\+2,00/);
 a.setMarketSelection(['btc-15m']);
 assert.equal(a.getVisibleRows().length,1);assert.equal(a.state.balanceRows.at(-1).value,-4);
 assert.match(a.buildCsv(a.getVisibleRows()),/btc-updown-15m/);assert.doesNotMatch(a.buildCsv(a.getVisibleRows()),/btc-updown-5m/);
 assert.match(a.els.liveBody.innerHTML,/BTC 15m/);assert.doesNotMatch(a.els.liveBody.innerHTML,/BTC 5m/);
 assert.equal(a.state.allTrades,originalTrades);assert.equal(a.state.rows,originalRows);assert.equal(a.state.generation,generation);
 a.setMarketSelection(['eth-5m','eth-15m','eth-1h','sol-5m','sol-15m','sol-1h']);
 assert.equal(a.state.balanceRows.at(-1).value,36);assert.equal(a.getVisibleRows().length,6);
 assert.equal(a.traderDiagnostics(a.getVisibleRows()).pnl,36);
});

test('clear selection empties all report views and chart state without showing a green zero',()=>{
 const a=loadRadar({Date:FixedDate});seed(a);a.setMarketSelection(keys);
 a.els.balanceChartTooltip.hidden=false;a.setMarketSelection([]);
 assert.equal(a.state.rows.length,9);assert.equal(a.getVisibleRows().length,0);
 assert.equal(a.state.balanceRows.length,0);assert.equal(a.state.balanceHitPoints.length,0);
 assert.equal(a.els.balanceChartTooltip.hidden,true);assert.equal(a.els.totalPnl.textContent,'—');
 assert.match(a.els.balanceChartEmpty.textContent,/No markets selected/);
 assert.doesNotMatch(a.els.status.innerHTML,/status-dot ok/);assert.equal(a.els.export.disabled,true);
 a.setMarketSelection(keys);assert.equal(a.getVisibleRows().length,9);
});

test('per-market times, title, current-round countdowns and CSV metadata follow the selected streams',()=>{
 class DuringRound extends Date {static now(){return (start+121)*1000;}}
 const a=loadRadar({Date:DuringRound});seed(a);a.setMarketSelection(['btc-5m','eth-15m','sol-1h']);
 assert.match(a.document.title,/BTC 5m.*ETH 15m.*SOL 1h/);
 assert.match(a.els.balanceChart.attributes['aria-label'],/SOL 1h/);
 for(const value of ['02:59','12:59','57:59','BTC 5m','ETH 15m','SOL 1h'])assert.ok(a.els.currentRoundSummary.innerHTML.includes(value),value);
 const csv=a.buildCsv(a.getVisibleRows());assert.match(csv, /"symbol","timeframe","end_iso"/);
 assert.match(csv,/"SOL","1h","2026-09-11T18:00:00.000Z"/);
 a.exportCsv();const download=a.document.body.children.at(-1);
 assert.match(download.download,/polymarket-btc-5m_eth-15m_sol-1h-/);URL.revokeObjectURL(download.href);
});

test('simultaneous closes are netted before drawdown; arbitrary row order cannot create a spike',()=>{
 const a=loadRadar();const rows=[{key:'a',pnl:10,endSec:100},{key:'b',pnl:-10,endSec:100},{key:'c',pnl:3,endSec:200}];
 for(const order of [rows,[...rows].reverse(),[rows[1],rows[2],rows[0]]]){
  const points=a.buildCumulativeSeries(order,0);assert.equal(points.length,3);assert.equal(points[1].rows.length,2);assert.equal(points[1].value,0);assert.equal(points.at(-1).value,3);
  assert.equal(a.calculateMaxDrawdownFromPoints(points),0);
 }
 const points=a.buildCumulativeSeries([{pnl:-2,endSec:100},{pnl:-3,endSec:100},{pnl:8,endSec:200}],0);
 assert.equal(a.calculateMaxDrawdownFromPoints(points),5);
});

test('single-stream demo oracle is preserved; toggles reuse a nine-stream demo rather than regenerating it',()=>{
 const a=loadRadar({Date:FixedDate});a.showDemo();
 assert.equal(new Set(a.state.rows.map(r=>r.marketKey)).size,9);
 const baseline=a.getVisibleRows().reduce((sum,r)=>sum+(r.pnl||0),0);
 const trades=a.state.allTrades,rows=a.state.rows,generation=a.state.generation;
 a.setMarketSelection(['btc-15m']);assert.ok(a.getVisibleRows().every(r=>r.timeframe==='15m'));
 assert.ok(Math.abs(a.getVisibleRows().reduce((sum,r)=>sum+(r.pnl||0),0)-baseline)<1e-8);
 a.setMarketSelection(keys);assert.equal(a.state.allTrades,trades);assert.equal(a.state.rows,rows);assert.equal(a.state.generation,generation);assert.equal(a.state.demo,true);
});

test('toggle during profile loading retains the same request and loaded universe',async()=>{
 let release,profiles=0;const calls=[];
 const a=loadRadar({Date:FixedDate,fetch:async url=>{
  const u=new URL(url);calls.push(u);
  if(u.pathname.endsWith('/public-profile')){profiles++;await new Promise(resolve=>{release=resolve;});return {ok:true,json:async()=>({proxyWallet:wallet})};}
  return {ok:true,json:async()=>[]};
 }});
 a.els.address.value=wallet;a.els.start.value=new Date((start+355)*1000).toISOString();
 const loading=a.loadReport(),generation=a.state.generation;
 a.setMarketSelection(['eth-1h','btc-15m']);assert.equal(a.state.loading,true);assert.equal(a.state.generation,generation);
 release();await loading;
 assert.equal(profiles,1);assert.equal(a.state.proxyWallet,wallet);assert.equal(a.state.historySinceSec,start);
 assert.deepEqual([...a.state.selectedMarkets],['btc-15m','eth-1h']);assert.equal(a.state.loading,false);
 assert.ok(calls.filter(u=>u.pathname.endsWith('/activity')).every(u=>u.searchParams.get('start')===String(start)));
});

test('stored multi-selection, explicit share URLs and old timeframe bookmarks initialize the actual UI',()=>{
 const stored=(markets,legacy='15m')=>({getItem:key=>key==='pm-equity-markets-v1'?markets:key==='pm-btc-timeframe'?legacy:null,setItem(){}});
 let a=loadRadar({window:{localStorage:stored('["btc-5m","eth-1h"]')}},{boot:true});assert.deepEqual([...a.state.selectedMarkets],['btc-5m','eth-1h']);
 a=loadRadar({window:{localStorage:stored('[]')}},{boot:true});assert.equal(a.state.selectedMarkets.size,0);
 a=loadRadar({location:{search:'?markets=sol-15m,btc-1h'},window:{localStorage:stored('["eth-5m"]')}},{boot:true});assert.deepEqual([...a.state.selectedMarkets],['btc-1h','sol-15m']);
 a=loadRadar({location:{search:'?markets='},window:{localStorage:stored('["eth-5m"]')}},{boot:true});assert.equal(a.state.selectedMarkets.size,0);
 a=loadRadar({location:{search:'?timeframe=5m'},window:{localStorage:stored('["eth-5m"]')}},{boot:true});assert.deepEqual([...a.state.selectedMarkets],['btc-5m']);
 for(const bad of ['oops','{}','["__proto__"]']){
  a=loadRadar({window:{localStorage:stored(bad)}},{boot:true});assert.deepEqual([...a.state.selectedMarkets],['btc-15m']);
 }
});

test('selection is whitelisted, deduplicated, canonically ordered and persisted, including empty',()=>{
 const saved=[];const a=loadRadar({window:{localStorage:{getItem:()=>null,setItem:(...args)=>saved.push(args)}}});
 a.setMarketSelection(['sol-1h','btc-5m','sol-1h','xrp-5m','__proto__']);
 assert.deepEqual([...a.state.selectedMarkets],['btc-5m','sol-1h']);
 assert.deepEqual(saved.at(-1),['pm-equity-markets-v1','["btc-5m","sol-1h"]']);
 a.setMarketSelection([]);assert.deepEqual(saved.at(-1),['pm-equity-markets-v1','[]']);
});

test('rebates follow selected conditions; a late response for an old view cannot populate the new one',async()=>{
 const day='2026-09-11';let release,requests=0;
 const credits=keys.map(key=>({condition_id:condition(key),maker_address:wallet,date:day,rebated_fees_usdc:'2'}));
 const a=loadRadar({Date:FixedDate,fetch:async()=>{requests++;if(requests===1)await new Promise(resolve=>{release=resolve;});return {ok:true,json:async()=>credits};}});
 seed(a);a.document.getElementById('rebateDate').value=day;
 const pending=a.loadDailyRebates();a.setMarketSelection(['eth-1h','sol-5m']);release();await pending;
 assert.equal(a.state.dailyRebateRows.length,0);assert.doesNotMatch(a.document.getElementById('rebateResult').textContent,/reported for/);
 await a.loadDailyRebates();assert.equal(a.state.dailyRebateRows.length,2);assert.match(a.document.getElementById('rebateResult').textContent,/4,00.*ETH 1h.*SOL 5m/);
});

test('hourly markets with potentially missing pre-candle trades are excluded, not shown as complete equity',()=>{
 const a=loadRadar({Date:FixedDate});seed(a);
 const group=a.buildGroups([fill('btc-1h')],start);
 for(const market of [{startDate:new Date((start-86400)*1000).toISOString()},{}]){
  const metadata={...a.state.markets.get(condition('btc-1h')),...market};if(!Object.hasOwn(market,'startDate'))delete metadata.startDate;
  const row=a.enrichGroups(group,[],[],new Map([[condition('btc-1h'),metadata]]))[0];
  assert.equal(row.excluded,true);assert.equal(row.pnl,null);assert.ok(row.qualityIssues.some(x=>x.includes('Hourly')));
 }
 a.state.historySinceSec=start-2*86400;
 const row=a.enrichGroups(group,[],[],new Map([[condition('btc-1h'),{...a.state.markets.get(condition('btc-1h')),startDate:new Date((start-86400)*1000).toISOString()}]]))[0];
 assert.equal(row.excluded,false);assert.equal(row.pnl,6);
});

test('inconsistent market identities sharing one condition cannot silently be merged into valid equity',()=>{
 const a=loadRadar({Date:FixedDate});seed(a);
 const trades=[fill('btc-5m'),fill('eth-5m',{conditionId:condition('btc-5m')})];
 const row=a.enrichGroups(a.buildGroups(trades,start),[],[],a.state.markets)[0];
 assert.equal(row.excluded,true);assert.equal(row.pnl,null);assert.match(row.qualityIssues.join(' '),/Conflicting or unclassified market identity/);
});

test('idle live polling advances an activity watermark instead of re-reading the entire quiet history',async()=>{
 const calls=[];const a=loadRadar({Date:FixedDate,fetch:async url=>{calls.push(new URL(url));return {ok:true,json:async()=>[]};}});
 a.state.proxyWallet=wallet;a.state.historySinceSec=start-86400;a.state.activityCoverageEnd=start;
 a.els.autoRefresh.checked=true;
 await a.pollLiveTrades();assert.equal(a.state.activityCoverageEnd,start+7200);
 await a.pollLiveTrades();
 const histories=calls.filter(u=>u.pathname.endsWith('/activity'));
 assert.equal(Number(histories[0].searchParams.get('start')),start-120);
 assert.equal(Number(histories[1].searchParams.get('start')),start+7200-120);
});

test('successful report load enables daily rebates even with auto-refresh off',async()=>{
 const a=loadRadar({Date:FixedDate,fetch:async url=>({ok:true,json:async()=>new URL(url).pathname.endsWith('/public-profile')?{proxyWallet:wallet}:[]})});
 a.els.address.value=wallet;a.els.autoRefresh.checked=false;a.els.start.value=new Date(start*1000).toISOString();
 await a.loadReport();assert.equal(a.state.loading,false);assert.equal(a.state.proxyWallet,wallet);assert.equal(a.document.getElementById('rebateLoad').disabled,false);
});


test('malformed supported-market identifiers generate a coverage warning and quarantine related rows',()=>{
 const a=loadRadar({Date:FixedDate});seed(a);
 a.initializeTradeState([fill('btc-5m'),fill('btc-5m',{eventSlug:`eth-updown-5m-${start}`})]);
 assert.equal(a.state.allTrades.length,1);
 assert.ok(a.state.qualityWarnings.some(w=>w.includes('market identifiers')));
 const row=a.enrichGroups(a.buildGroups(a.state.allTrades,start),[],[],a.state.markets)[0];
 assert.equal(row.excluded,true);assert.equal(row.pnl,null);
});

test('complete load fetches all nine streams once, including real calendar-style hourly slugs',async()=>{
 const trades=keys.map(key=>fill(key,key.endsWith('1h')?{slug:`${{btc:'bitcoin',eth:'ethereum',sol:'solana'}[key.split('-')[0]]}-up-or-down-september-11-2026-1pm-et`}:{}));
 const markets=keys.map(key=>({conditionId:condition(key),slug:trades[keys.indexOf(key)].slug,resolved:true,outcomes:['Up','Down'],outcomePrices:[1,0],feesEnabled:false,startDate:new Date(start*1000).toISOString()}));
 let calls=0;
 const a=loadRadar({Date:FixedDate,fetch:async raw=>{
  calls++;const u=new URL(raw);let payload=[];
  if(u.pathname.endsWith('/public-profile'))payload={proxyWallet:wallet};
  else if(u.pathname.endsWith('/activity') && u.searchParams.get('type')==='TRADE')payload=trades;
  else if(u.pathname.endsWith('/markets'))payload=markets;
  else if(u.pathname.includes('/clob-markets/'))payload={fd:{r:0,e:1,to:true}};
  return {ok:true,json:async()=>payload};
 }});
 a.els.address.value=wallet;a.els.start.value=new Date((start+123)*1000).toISOString();
 await a.loadReport();
 assert.equal(a.state.rows.length,9);assert.equal(a.state.allTrades.length,9);
 const loadedCalls=calls;a.setMarketSelection(keys);assert.equal(calls,loadedCalls);
 assert.equal(a.getVisibleRows().length,9);assert.equal(a.state.balanceRows.at(-1).value,54);
 assert.ok(a.state.rows.every(r=>r.calculationExact));
 a.setMarketSelection(['eth-1h','sol-1h']);assert.equal(calls,loadedCalls);assert.equal(a.state.balanceRows.at(-1).value,12);
});

test('report becomes interactive after selected metadata while the P&L audit is still in flight',async()=>{
 const trades=keys.map(key=>fill(key));
 const markets=keys.map(key=>({conditionId:condition(key),slug:trades[keys.indexOf(key)].slug,resolved:true,outcomes:['Up','Down'],outcomePrices:[1,0],feesEnabled:false,startDate:new Date(start*1000).toISOString()}));
 let releaseAudit,auditStarted=0;
 const auditGate=new Promise(resolve=>{releaseAudit=resolve;});
 const a=loadRadar({Date:FixedDate,fetch:async raw=>{
  const u=new URL(raw);let payload=[];
  if(u.pathname.includes('/clob-markets/'))throw new Error('CLOB is unnecessary when Gamma already has a usable fee flag');
  if(u.pathname.endsWith('/public-profile'))payload={proxyWallet:wallet};
  else if(u.pathname.endsWith('/activity') && u.searchParams.get('type')==='TRADE')payload=trades;
  else if(u.pathname.endsWith('/markets'))payload=markets;
  else if(u.pathname.endsWith('/market-positions')){
   auditStarted++;
   await auditGate;
   payload=[];
  }
  return {ok:true,json:async()=>payload};
 }});
 a.els.address.value=wallet;a.els.start.value=new Date((start+123)*1000).toISOString();
 const pending=a.loadReport();
 for(let i=0;i<200 && (a.state.loading || !a.state.auditLoading);i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(a.state.loading,false);
 assert.equal(a.state.auditLoading,true);
 assert.equal(a.state.reportHydrating,true);
 assert.equal(a.state.rows.length,9);
 assert.ok(auditStarted>=1);
 releaseAudit();
 await pending;
 assert.equal(a.state.loading,false);
 assert.equal(a.state.auditLoading,false);
 assert.equal(a.state.reportHydrating,false);
});

test('BTC results paint while ETH and SOL metadata is still loading',async()=>{
 const trades=keys.map(key=>fill(key));
 const markets=keys.map(key=>({conditionId:condition(key),slug:trades[keys.indexOf(key)].slug,resolved:true,outcomes:['Up','Down'],outcomePrices:[1,0],feesEnabled:false,startDate:new Date(start*1000).toISOString()}));
 let releaseRest;
 const restGate=new Promise(resolve=>{releaseRest=resolve;});
 const a=loadRadar({Date:FixedDate,fetch:async raw=>{
  const u=new URL(raw);let payload=[];
  if(u.pathname.endsWith('/public-profile'))payload={proxyWallet:wallet};
  else if(u.pathname.endsWith('/activity') && u.searchParams.get('type')==='TRADE')payload=trades;
  else if(u.pathname.endsWith('/markets')){
   const ids=String(u.searchParams.get('condition_ids')||'').split(',').filter(Boolean);
   if(ids.some(id=>{
    const trade=trades.find(row=>row.conditionId===id.toLowerCase());
    return trade && !String(trade.slug).startsWith('btc-');
   })) await restGate;
   payload=markets;
  }
  return {ok:true,json:async()=>payload};
 }});
 a.setMarketSelection(['btc-5m','eth-5m','sol-5m']);
 a.els.address.value=wallet;a.els.start.value=new Date((start+123)*1000).toISOString();
 const pending=a.loadReport();
 for(let i=0;i<200 && a.state.loading;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(a.state.loading,false);
 assert.equal(a.state.readySymbols.has('btc'),true);
 assert.equal(a.state.readySymbols.has('eth'),false);
 const visible=a.getVisibleRows();
 assert.ok(visible.length>=1);
 assert.ok(visible.every(row=>row.marketKey.startsWith('btc')));
 assert.match(a.els.status.innerHTML,/Showing BTC 5m P&amp;L/);
 assert.match(a.els.status.innerHTML,/ETH · SOL not on the chart yet/);
 assert.doesNotMatch(a.els.status.innerHTML,/Showing BTC 5m · ETH 5m · SOL 5m P&amp;L/);
 assert.match(a.document.getElementById('marketSelectionNote').textContent,/Chart shows BTC 5m only/);
 assert.match(a.document.getElementById('marketSelectionNote').textContent,/ETH · SOL are enabled but not on the equity plot yet/);
 releaseRest();
 await pending;
 const after=a.getVisibleRows();
 assert.ok(after.some(row=>row.marketKey==='eth-5m'));
 assert.ok(after.some(row=>row.marketKey==='sol-5m'));
});

test('Recheck P&L stays disabled until background hydration finishes',async()=>{
 const trades=keys.map(key=>fill(key));
 const markets=keys.map(key=>({conditionId:condition(key),slug:trades[keys.indexOf(key)].slug,resolved:true,outcomes:['Up','Down'],outcomePrices:[1,0],feesEnabled:false,startDate:new Date(start*1000).toISOString()}));
 let releaseAudit;
 const auditGate=new Promise(resolve=>{releaseAudit=resolve;});
 const a=loadRadar({Date:FixedDate,fetch:async raw=>{
  const u=new URL(raw);let payload=[];
  if(u.pathname.endsWith('/public-profile'))payload={proxyWallet:wallet};
  else if(u.pathname.endsWith('/activity') && u.searchParams.get('type')==='TRADE')payload=trades;
  else if(u.pathname.endsWith('/markets'))payload=markets;
  else if(u.pathname.endsWith('/market-positions'))await auditGate;
  return {ok:true,json:async()=>payload};
 }});
 a.els.address.value=wallet;a.els.start.value=new Date((start+123)*1000).toISOString();
 const pending=a.loadReport();
 for(let i=0;i<200 && (a.state.loading || !a.state.auditLoading);i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(a.state.loading,false);
 assert.equal(a.state.reportHydrating,true);
 assert.equal(a.els.audit.disabled,true);
 assert.equal(a.state.auditLoading,true);
 a.verifyMarketPnls(a.state.rows,{force:true});
 assert.equal(a.state.auditCompleted,0,'a second Recheck must not replace the in-flight hydration audit');
 releaseAudit();
 await pending;
 assert.equal(a.els.audit.disabled,false);
});

test('Demo after first paint clears hydration so the demo banner can render',async()=>{
 const trades=keys.map(key=>fill(key));
 const markets=keys.map(key=>({conditionId:condition(key),slug:trades[keys.indexOf(key)].slug,resolved:true,outcomes:['Up','Down'],outcomePrices:[1,0],feesEnabled:false,startDate:new Date(start*1000).toISOString()}));
 let releaseAudit;
 const auditGate=new Promise(resolve=>{releaseAudit=resolve;});
 const a=loadRadar({Date:FixedDate,fetch:async raw=>{
  const u=new URL(raw);let payload=[];
  if(u.pathname.endsWith('/public-profile'))payload={proxyWallet:wallet};
  else if(u.pathname.endsWith('/activity') && u.searchParams.get('type')==='TRADE')payload=trades;
  else if(u.pathname.endsWith('/markets'))payload=markets;
  else if(u.pathname.endsWith('/market-positions'))await auditGate;
  return {ok:true,json:async()=>payload};
 }});
 a.els.address.value=wallet;a.els.start.value=new Date((start+123)*1000).toISOString();
 const pending=a.loadReport();
 for(let i=0;i<200 && (a.state.loading || !a.state.auditLoading);i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(a.state.loading,false);
 assert.equal(a.state.reportHydrating,true);
 a.showDemo();
 assert.equal(a.state.reportHydrating,false);
 assert.equal(a.state.demo,true);
 assert.match(a.els.status.innerHTML,/Demo|Visible/);
 releaseAudit();
 await pending;
 assert.equal(a.state.demo,true);
 assert.equal(a.state.reportHydrating,false);
});
