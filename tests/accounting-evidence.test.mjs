import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRadar} from './harness.mjs';

const cid='0x'+'a'.repeat(64), start=1770000000;
const feeSchedule={rate:.07,exponent:1,takerOnly:true};
const fill=(extra={})=>({conditionId:cid,asset:'1',slug:`btc-updown-5m-${start}`,eventSlug:`btc-updown-5m-${start}`,timestamp:start+10,size:100,price:.5,usdcSize:50,side:'BUY',outcome:'Up',_isTaker:true,...extra});
const finalMarket=(extra={})=>({resolved:true,outcomes:['Up','Down'],outcomePrices:[1,0],feeSchedule,...extra});
function enrich(a,trades,market=finalMarket(),positions=[]) {
  a.state.historySinceSec=start;a.state.ledgerComplete=true;a.state.ledgerCoverageEnd=start+300;
  return a.enrichGroups(a.buildGroups(trades,start),positions,[],new Map([[cid,market]]))[0];
}
const winningPosition={conditionId:cid,asset:'1',outcome:'Up',curPrice:1,redeemable:true,size:100};

test('redeemable positions cannot rescue contradictory market resolution evidence',()=>{
  const a=loadRadar(), row=enrich(a,[fill()],finalMarket({winner:'Down'}),[winningPosition]);
  assert.equal(row.excluded,true);assert.equal(row.pnl,null);assert.equal(row.calculationExact,false);
  assert.ok(row.qualityIssues.includes('Conflicting resolution evidence'));
});

test('a market winner cannot hide contradictory redeemable position evidence',()=>{
  const a=loadRadar(), row=enrich(a,[fill()],finalMarket(),[winningPosition,{...winningPosition,asset:'2',outcome:'Down'}]);
  assert.equal(row.excluded,true);assert.equal(row.pnl,null);
});

test('cached audit winner cannot hide contradictory audit position evidence',()=>{
  const a=loadRadar();a.state.marketPnlCache.set(cid,{ok:true,winner:'Down',rows:[winningPosition]});
  const row=enrich(a,[fill()],{feeSchedule});
  assert.equal(row.excluded,true);assert.equal(row.pnl,null);
});

test('fee-inclusive notional uses authoritative market rate and exponent after normalization',()=>{
  const a=loadRadar(), trade=a.normalizeTradeRecord(fill({usdcSize:50.78125,_invalid:'Inconsistent fill notional'}));
  assert.equal(trade._invalid,'');
  const row=enrich(a,[trade],finalMarket({feeSchedule:{rate:.125,exponent:2,takerOnly:true}}));
  assert.equal(row.excluded,false);assert.equal(row.pnl,49.21875);assert.equal(row.feeTotal,.78125);
});

test('unavailable fee metadata leaves cash evidence provisional rather than falsely rejecting a historical fee',()=>{
  const a=loadRadar(), row=enrich(a,[a.normalizeTradeRecord(fill({usdcSize:50.78125}))],{resolved:true,outcomes:['Up','Down'],outcomePrices:[1,0]});
  assert.equal(row.excluded,false);assert.equal(row.calculationExact,false);assert.equal(row.approximate,true);
});

test('BUY cash below notional by a fee is inconsistent with a known schedule',()=>{
  const a=loadRadar(), row=enrich(a,[a.normalizeTradeRecord(fill({usdcSize:48.25}))]);
  assert.equal(row.excluded,true);assert.equal(row.pnl,null);
  assert.ok(row.qualityIssues.includes('Inconsistent fill notional'));
});

test('SELL cash above notional by a fee is inconsistent with a known schedule',()=>{
  const a=loadRadar(), row=enrich(a,[fill({_isTaker:false}),a.normalizeTradeRecord(fill({side:'SELL',timestamp:start+20,usdcSize:51.75}))]);
  assert.equal(row.excluded,true);assert.equal(row.pnl,null);
});

test('negative and nonnumeric notional remain invalid before fee metadata is loaded',()=>{
  const a=loadRadar();
  for(const usdcSize of [-1,'not-a-number',Infinity]) assert.ok(a.normalizeTradeRecord(fill({usdcSize}))._invalid);
  assert.equal(a.normalizeTradeRecord(fill({_invalid:'Missing opening inventory'}))._invalid,'Missing opening inventory');
});

test('a null rebate response reports unconfirmed evidence and clears the prior amount',async()=>{
  const a=loadRadar({fetch:async()=>({ok:true,json:async()=>null})});
  a.state.proxyWallet='0x'+'1'.repeat(40);a.state.dailyRebateRows=[{rebated_fees_usdc:'5'}];
  a.document.getElementById('rebateDate').value='2026-09-09';
  await a.loadDailyRebates();
  assert.equal(a.document.getElementById('rebateResult').textContent,'No rebate records returned for 2026-09-09; no amount confirmed.');
  assert.equal(a.state.dailyRebateRows.length,0);assert.equal(a.state.rebateLoading,false);
  assert.equal(a.document.getElementById('rebateLoad').disabled,false);
});


test('missing activity cash stays absent through normalization and does not exclude valid fills',()=>{
 const a=loadRadar();
 for(const usdcSize of [null,undefined]){
  const trade=a.normalizeTradeRecord(a.normalizeTradeRecord(fill({usdcSize})));
  assert.equal(trade.usdcSize,undefined);assert.equal(trade._invalid,'');
  const row=enrich(a,[trade]);assert.equal(row.excluded,false);assert.equal(row.pnl,48.25);
 }
 const explicitZero=a.normalizeTradeRecord(fill({usdcSize:0}));
 assert.equal(explicitZero.usdcSize,0);assert.equal(enrich(a,[explicitZero]).excluded,true);
});
