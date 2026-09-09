import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRadar} from './harness.mjs';
const start=1770000300; // divisible by 900; both intervals share a boundary
const wallet='0x'+'1'.repeat(40);
const fill=(timeframe,extra={})=>({conditionId:'0x'+(timeframe==='15m'?'b':'a').repeat(64),asset:'1',slug:`btc-updown-${timeframe}-${start}`,eventSlug:`btc-updown-${timeframe}-${start}`,timestamp:start+10,size:10,price:.4,side:'BUY',outcome:'Up',_isTaker:true,...extra});
class FixedDate extends Date {static now(){return (start+721)*1000;}}

test('timeframe values are whitelisted, with 5m as the compatible default',()=>{
 const a=loadRadar();assert.equal(a.state.timeframe,'5m');
 for(const value of ['','1h','BTC15m','__proto__',null])assert.equal(a.normalizeTimeframe(value),'5m');
 assert.equal(a.normalizeTimeframe('15m'),'15m');
 assert.equal(a.getTimeframe().seconds,300);a.state.timeframe='15m';assert.equal(a.getTimeframe().seconds,900);
});

test('strict BTC slugs reject other assets, suffixes and contradictory interval evidence',()=>{
 const a=loadRadar();
 for(const timeframe of ['5m','15m']){
  a.state.timeframe=timeframe;assert.equal(a.isBtcMarket(fill(timeframe)),true);
  assert.equal(a.isBtcMarket(fill(timeframe==='5m'?'15m':'5m')),false);
  for(const slug of [`eth-updown-${timeframe}-${start}`,`x-btc-updown-${timeframe}-${start}`,`btc-updown-${timeframe}-${start}-extra`])assert.equal(a.isBtcMarket({slug,title:'Bitcoin Up or Down'}),false);
 }
 assert.equal(a.isBtcMarket({...fill('15m'),eventSlug:`btc-updown-5m-${start}`}),false);
});

test('15m fills across three five-minute buckets remain one round with a 900-second close',()=>{
 const a=loadRadar({Date:FixedDate});a.state.timeframe='15m';a.state.historySinceSec=start;
 const trades=[fill('5m'),fill('15m'),fill('15m',{timestamp:start+310}),fill('15m',{timestamp:start+610})];
 const groups=a.buildGroups(trades,start);assert.equal(groups.length,1);assert.equal(groups[0].trades.length,3);
 const row=a.enrichGroups(groups,[],[],new Map())[0];assert.equal(row.startSec,start);assert.equal(row.endSec,start+900);assert.equal(row.isPastEnd,false);
 a.renderCurrentRound();assert.match(a.els.currentRoundSummary.innerHTML,/02:59/);assert.match(a.els.currentRoundSummary.innerHTML,/15m/);
});

test('5m closes at 300 seconds and selected scope controls live merging and CSV',()=>{
 const a=loadRadar({Date:FixedDate});a.state.historySinceSec=start;a.initializeTradeState([fill('5m'),fill('15m')]);
 a.mergeLiveTrades([fill('15m',{timestamp:start+20}),fill('5m',{timestamp:start+20})]);
 assert.equal(a.state.allTrades.length,2);assert.ok(a.state.allTrades.every(a.isBtc5m));
 const groups=a.buildGroups(a.state.allTrades,start);const rows=a.enrichGroups(groups,[],[],new Map());
 assert.equal(rows[0].endSec,start+300);assert.equal(rows[0].isPastEnd,true);
 assert.match(a.buildCsv(rows),/btc-updown-5m-/);assert.doesNotMatch(a.buildCsv(rows),/btc-updown-15m-/);
});

test('switching demo invalidates caches, preserves the model and updates title, labels and export',async()=>{
 const a=loadRadar({Date:FixedDate});a.showDemo();const baseline=a.state.rows.filter(r=>r.resolved).reduce((sum,r)=>sum+r.pnl,0);
 const previousGeneration=a.state.generation;a.state.dailyRebateRows=[{old:true}];a.els.timeframe.value='15m';
 await a.handleTimeframeChange();assert.ok(a.state.generation>previousGeneration);assert.equal(a.state.timeframe,'15m');assert.equal(a.state.demo,true);
 assert.ok(a.state.rows.length>1);assert.ok(a.state.rows.every(r=>r.endSec-r.startSec===900 && r.eventSlug.startsWith('btc-updown-15m-')));
 assert.equal(a.state.rows.filter(r=>r.resolved).reduce((sum,r)=>sum+r.pnl,0),baseline);
 assert.equal(a.state.dailyRebateRows.length,0);assert.match(a.document.title,/BTC 15m/);assert.match(a.els.balanceChart.attributes['aria-label'],/BTC 15m/);
 assert.match(a.buildCsv(a.state.rows),/btc-updown-15m-/);assert.doesNotMatch(a.buildCsv(a.state.rows),/btc-updown-5m-/);
 a.exportCsv();const download=a.document.body.children.at(-1);assert.match(download.download,/polymarket-btc15m-/);URL.revokeObjectURL(download.href);
 a.els.timeframe.value='5m';await a.handleTimeframeChange();assert.ok(a.state.rows.every(r=>r.endSec-r.startSec===300));
});

test('switch during profile loading refetches the same wallet and old responses cannot overwrite it',async()=>{
 let releaseOld;let profiles=0;const calls=[];
 const a=loadRadar({Date:FixedDate,fetch:async url=>{
  const u=new URL(url);calls.push(u);
  if(u.pathname.endsWith('/public-profile')){
   profiles++;if(profiles===1)return await new Promise(resolve=>{releaseOld=()=>resolve({ok:true,json:async()=>({proxyWallet:'0x'+'2'.repeat(40),name:'Old scope'})});});
   return {ok:true,json:async()=>({proxyWallet:wallet,name:'Current scope'})};
  }
  return {ok:true,json:async()=>[]};
 }});
 a.els.address.value=wallet;a.els.start.value=new Date((start+355)*1000).toISOString();
 const old=a.loadReport();assert.equal(a.state.loading,true);a.els.timeframe.value='15m';await a.handleTimeframeChange();
 assert.equal(profiles,2);assert.equal(a.state.timeframe,'15m');assert.equal(a.state.proxyWallet,wallet);assert.equal(a.state.historySinceSec,start);assert.equal(a.state.loading,false);
 releaseOld();await old;assert.equal(a.state.proxyWallet,wallet);assert.match(a.els.resolvedAddress.textContent,/Current scope/);assert.equal(a.state.rows.length,0);
 const histories=calls.filter(u=>u.pathname.endsWith('/activity'));assert.ok(histories.length);assert.ok(histories.every(u=>u.searchParams.get('start')===String(start)));
});


test('stored timeframe and explicit share URL initialize the actual UI with validated values',()=>{
 const stored=value=>({getItem:key=>key==='pm-btc-timeframe'?value:null,setItem(){}});
 let a=loadRadar({window:{localStorage:stored('15m')}},{boot:true});assert.equal(a.state.timeframe,'15m');assert.equal(a.els.timeframe.value,'15m');assert.match(a.document.title,/BTC 15m/);
 a=loadRadar({window:{localStorage:stored('__proto__')}},{boot:true});assert.equal(a.state.timeframe,'5m');
 a=loadRadar({location:{search:'?timeframe=5m'},window:{localStorage:stored('15m')}},{boot:true});assert.equal(a.state.timeframe,'5m');
});

test('daily rebates follow selected conditions and a late 5m response cannot populate 15m',async()=>{
 const day='2026-02-02';let releaseRebates;let rebateCalls=0;
 const credits=['5m','15m'].map(timeframe=>({condition_id:fill(timeframe).conditionId,maker_address:wallet,date:day,rebated_fees_usdc:timeframe==='5m'?'2':'7'}));
 const a=loadRadar({Date:FixedDate,fetch:async url=>{
  const u=new URL(url);
  if(u.pathname.endsWith('/rebates/current')){
   rebateCalls++;if(rebateCalls===1)return await new Promise(resolve=>{releaseRebates=()=>resolve({ok:true,json:async()=>credits});});
   return {ok:true,json:async()=>credits};
  }
  return {ok:true,json:async()=>u.pathname.endsWith('/public-profile')?{proxyWallet:wallet}:[]};
 }});
 a.state.proxyWallet=wallet;a.state.inputAddress=wallet;a.els.start.value=new Date(start*1000).toISOString();a.document.getElementById('rebateDate').value=day;
 a.state.rows=[{conditionId:fill('5m').conditionId,startSec:start}];
 const old=a.loadDailyRebates();assert.equal(a.state.rebateLoading,true);
 a.els.timeframe.value='15m';await a.handleTimeframeChange();releaseRebates();await old;
 assert.equal(a.state.dailyRebateRows.length,0);assert.doesNotMatch(a.document.getElementById('rebateResult').textContent,/reported for/);
 a.state.rows=[{conditionId:fill('15m').conditionId,startSec:start}];await a.loadDailyRebates();
 assert.equal(a.state.dailyRebateRows.length,1);assert.equal(a.state.dailyRebateRows[0].rebated_fees_usdc,'7');assert.match(a.document.getElementById('rebateResult').textContent,/BTC 15m/);
});


test('successful report load enables daily rebates even when auto-refresh is off',async()=>{
 const a=loadRadar({Date:FixedDate,fetch:async url=>({ok:true,json:async()=>new URL(url).pathname.endsWith('/public-profile')?{proxyWallet:wallet}:[]})});
 a.els.address.value=wallet;a.els.autoRefresh.checked=false;a.els.start.value=new Date(start*1000).toISOString();
 await a.loadReport();
 assert.equal(a.state.loading,false);assert.equal(a.state.proxyWallet,wallet);
 assert.equal(a.document.getElementById('rebateLoad').disabled,false);
});
