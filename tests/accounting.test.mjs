import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRadar} from './harness.mjs';
const cid='0x'+'a'.repeat(64), start=1770000000;
const fill=(extras={})=>({conditionId:cid,asset:'1',slug:`btc-updown-5m-${start}`,eventSlug:`btc-updown-5m-${start}`,timestamp:start+10,size:10,price:.4,side:'BUY',outcome:'Up',_isTaker:true,...extras});
const config={rate:.07,exponent:1,takerOnly:true,exact:true};
function enrich(a,trades,market={closed:true,resolved:true,outcomes:['Up','Down'],outcomePrices:[1,0]}){a.state.historySinceSec=start;a.state.clobMarkets.set(cid,{fd:{r:.07,e:1,to:true}});return a.enrichGroups(a.buildGroups(trades,start),[],[],new Map([[cid,market]]))[0];}
test('known collateral settlement model remains $4.1648',()=>{const a=loadRadar();assert.equal(a.calculateRoundSettlement([fill(),fill({side:'SELL',size:4,price:.6})],'Up',config).pnl,4.1648);assert.equal(a.runCalculationSelfTest().ok,true);});
test('live market extreme quotes cannot establish a winner',()=>{assert.equal(loadRadar().marketWinner({closed:false,outcomes:['Up','Down'],outcomePrices:[1,0]}),'');});
test('position timestamp and 98-cent price do not prove resolution',()=>{assert.equal(loadRadar().inferWinnerFromPositions([{outcome:'Up',curPrice:.99,timestamp:start}],true),'');});
test('redeemable exact final price can establish outcome',()=>{assert.equal(loadRadar().inferWinnerFromPositions([{outcome:'Down',curPrice:1,redeemable:true}],true),'Down');});
test('sell with missing opening inventory is excluded from cumulative P&L',()=>{const a=loadRadar();assert.equal(enrich(a,[fill({side:'SELL'})]).pnl,null);});
test('negative inventory at any point remains an exclusion even if later bought',()=>{const a=loadRadar();assert.equal(enrich(a,[fill({side:'SELL',timestamp:start+10}),fill({timestamp:start+20})]).pnl,null);});
test('invalid fill prices are quarantined',()=>{const a=loadRadar();assert.equal(enrich(a,[fill({price:2})]).pnl,null);});
test('truncated report cannot claim exact calculations',()=>{const a=loadRadar();a.state.truncatedTrades=true;const row=enrich(a,[fill()]);assert.equal(row.calculationExact,false);assert.equal(row.pnl,null);});
test('polling same maker evidence twice does not multiply fills',()=>{const a=loadRadar();const t=fill();assert.equal(a.mergeTakerTrades([t,t],[t,t]).length,2);});
test('one taker cannot be consumed once loosely and again exactly',()=>{const a=loadRadar();a.state.takerTrades=[fill()];a.state.takerHistoryComplete=true;a.state.takerCoverageEnd=start+100;a.state.allTrades=[fill({timestamp:start+11}),fill()];a.classifyTakerTrades();assert.equal(a.state.allTrades.filter(x=>x._isTaker===true).length,1);});
test('new fill outside taker snapshot stays unknown',()=>{const a=loadRadar();a.state.takerHistoryComplete=true;a.state.takerCoverageEnd=start;a.state.allTrades=[fill()];a.classifyTakerTrades();assert.equal(a.state.allTrades[0]._isTaker,null);});
test('both-side filter applies to chart as well as table',()=>{const a=loadRadar();a.state.rows=[{marketKey:'btc-5m',resolved:true,pnl:2,bothSides:true,endSec:1},{marketKey:'btc-5m',resolved:true,pnl:3,bothSides:false,endSec:2}];a.els.bothOnly.checked=true;assert.equal(a.getDailyChartRows().length,1);});
test('CSV guards spreadsheet formula injection',()=>{const a=loadRadar();const row=enrich(a,[fill()]);row.eventSlug='=HYPERLINK("https://bad")';assert.match(a.buildCsv([row]),/"'=HYPERLINK/);});
test('drawdown is peak-to-trough loss, including initial zero',()=>{const a=loadRadar();const pts=a.buildCumulativeSeries([{endSec:1,pnl:-2},{endSec:2,pnl:10},{endSec:3,pnl:-5}],0);assert.equal(a.calculateMaxDrawdownFromPoints(pts),5);});
test('same-second pagination retains every fill across boundary',async()=>{const rows=Array.from({length:1700},(_,i)=>fill({id:String(i),timestamp:start+1}));const a=loadRadar({fetch:async url=>{const u=new URL(url),lo=Number(u.searchParams.get('start')),hi=Number(u.searchParams.get('end')),off=Number(u.searchParams.get('offset')),lim=Number(u.searchParams.get('limit'));return {ok:true,json:async()=>rows.filter(x=>x.timestamp>=lo&&x.timestamp<=hi).slice(off,off+lim)};}});const got=await a.fetchActivityHistory('0x'+'1'.repeat(40),start,start+20);assert.equal(got.length,1700);});
test('live catchup paginates more than 200 records',async()=>{const rows=Array.from({length:550},(_,i)=>fill({id:String(i),timestamp:start+1}));const a=loadRadar({fetch:async url=>{const u=new URL(url),off=Number(u.searchParams.get('offset')),lim=Number(u.searchParams.get('limit'));return {ok:true,json:async()=>rows.slice(off,off+lim)};}});assert.equal((await a.fetchRecentActivity('0x'+'1'.repeat(40),start,start+20)).length,550);});
test('closed market with terminal quote alone is not resolved',()=>{assert.equal(loadRadar().marketWinner({closed:true,outcomes:['Up','Down'],outcomePrices:[1,0]}),'');});
test('invalid fee metadata cannot become an exact zero fee',()=>{const a=loadRadar();assert.equal(a.feeConfigForMarket(cid,{feeSchedule:{rate:-1,exponent:1}}).exact,false);});
test('malformed resolution price evidence is excluded',()=>{const a=loadRadar();assert.equal(enrich(a,[fill()],{resolved:true,winner:'Up',outcomes:['Up','Down'],outcomePrices:[-1,2]}).pnl,null);});
test('diagnostics are consistent with the plotted rows',()=>{const a=loadRadar();const rows=[{resolved:true,pnl:10,endSec:1,grossSettlementPnl:11,feeTotal:1,trades:[]},{resolved:true,pnl:-4,endSec:2,grossSettlementPnl:-3,feeTotal:1,trades:[]},{excluded:true,pnl:null,trades:[]}];const d=a.traderDiagnostics(rows);assert.equal(d.profitFactor,2.5);assert.equal(d.drawdown,4);assert.equal(d.pnl,d.gross-d.fees);assert.equal(d.excluded,1);});
test('audit queue starts with selected visible rounds before older or hidden streams',async()=>{
 class FixedDate extends Date {static now(){return (start+7200)*1000;}}
 const order=[],pending=[];
 const a=loadRadar({Date:FixedDate,fetch:url=>{
  order.push(new URL(url).searchParams.get('market'));
  return new Promise(resolve=>pending.push(()=>resolve({ok:true,json:async()=>[]})));
 }});
 a.state.proxyWallet='0x'+'1'.repeat(40);
 a.els.lookback.value='1';
 a.setMarketSelection(['btc-5m']);
 const groups=[
  {conditionId:'0x'+'3'.repeat(64),startSec:start,marketKey:'eth-5m',timeframe:'5m'},
  {conditionId:'0x'+'2'.repeat(64),startSec:start+6600,marketKey:'btc-5m',timeframe:'5m'},
  {conditionId:'0x'+'1'.repeat(64),startSec:start,marketKey:'btc-5m',timeframe:'5m'}
 ];
 const task=a.verifyMarketPnls(groups);
 assert.equal(pending.length,3);
 assert.deepEqual(order,['0x'+'2'.repeat(64),'0x'+'1'.repeat(64),'0x'+'3'.repeat(64)]);
 for(const done of pending)done();
 await task;
});

test('obsolete audit cannot mutate new wallet state or continue requests',async()=>{
 const pending=[],calls=[];const a=loadRadar({fetch:url=>{calls.push(url);return new Promise(resolve=>pending.push(()=>resolve({ok:true,json:async()=>[]})));}});
 a.state.proxyWallet='0x'+'1'.repeat(40);
 const groups=Array.from({length:7},(_,i)=>({conditionId:'0x'+String(i+1).padStart(64,'0'),startSec:start}));
 const task=a.verifyMarketPnls(groups);assert.equal(pending.length,6);
 a.state.generation++;a.state.proxyWallet='0x'+'2'.repeat(40);a.state.marketPnlCache.clear();a.state.auditLoading=true;
 for(const done of pending)done();await task;
 assert.equal(calls.length,6);assert.equal(a.state.marketPnlCache.size,0);assert.equal(a.state.auditLoading,true);
});
test('missing numeric P&L on an expected asset cannot claim API verification',()=>{
 const a=loadRadar();a.state.marketPnlCache.set(cid,{ok:true,pnl:5.832,rows:[{asset:'1',outcome:'Up',totalPnl:5.832},{asset:'2',outcome:'Down'}]});
 const r=enrich(a,[fill(),fill({asset:'2',outcome:'Down',size:1,price:.5})]);assert.equal(r.apiPnl,null);assert.equal(r.auditStatus,'no-api');
});
