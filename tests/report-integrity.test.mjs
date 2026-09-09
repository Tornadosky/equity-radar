import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRadar} from './harness.mjs';

const start=1770000300, conditionId='0x'+'a'.repeat(64), wallet='0x'+'1'.repeat(40);
const fill=(extra={})=>({conditionId,asset:'1',slug:`btc-updown-5m-${start}`,timestamp:start+10,size:10,price:.4,side:'BUY',outcome:'Up',_isTaker:true,...extra});

async function auditPrice(priceFields) {
  const a=loadRadar({fetch:async url=>{
    const request=new URL(url);
    assert.equal(request.pathname,'/api/data/v1/market-positions');
    assert.equal(request.searchParams.get('market'),conditionId);
    assert.equal(request.searchParams.get('user'),wallet);
    return {ok:true,json:async()=>[{token:'1',positions:[{proxyWallet:wallet,conditionId,asset:'1',outcome:'Up',size:10,redeemable:true,totalPnl:5.832,...priceFields}]}]};
  }});
  a.state.proxyWallet=wallet;
  a.state.historySinceSec=start;
  a.state.allTrades=[fill()];
  a.state.clobMarkets.set(conditionId,{fd:{r:.07,e:1,to:true}});
  const groups=a.buildGroups(a.state.allTrades,start);
  await a.verifyMarketPnls(groups);
  return a.enrichGroups(groups,[],[],new Map())[0];
}

test('missing or blank audited prices cannot create a zero-price losing outcome',async()=>{
  for (const priceFields of [{curPrice:null},{curPrice:''},{curPrice:' '},{curPrice:undefined},{curPrice:null,currPrice:' '},{curPrice:false},{curPrice:true},{curPrice:[]},{curPrice:{}},{curPrice:null,currPrice:false}]) {
    const row=await auditPrice(priceFields);
    assert.equal(row.resolved,false,`prices ${JSON.stringify(priceFields)} must stay unresolved`);
    assert.equal(row.winner,'');
    assert.equal(row.pnl,null);
  }
});

test('direct redeemable positions cannot resolve from absent or nonnumeric prices',()=>{
  const a=loadRadar();
  a.state.historySinceSec=start;
  const groups=a.buildGroups([fill()],start);
  for (const curPrice of [null,'',' ',false,true,[],{}]) {
    const positions=[{conditionId,asset:'1',outcome:'Up',size:10,redeemable:true,curPrice}];
    const row=a.enrichGroups(groups,positions,[],new Map())[0];
    assert.equal(row.resolved,false,`direct price ${JSON.stringify(curPrice)} must stay unresolved`);
    assert.equal(row.pnl,null);
  }
});

test('direct position price fallback ignores blank primary prices and preserves explicit zero',()=>{
  const a=loadRadar();
  for (const curPrice of [null,'',' ']) {
    assert.equal(a.inferWinnerFromPositions([{outcome:'Up',redeemable:true,curPrice,currPrice:'1'}]),'Up');
  }
  assert.equal(a.inferWinnerFromPositions([{outcome:'Up',redeemable:true,curPrice:0,currPrice:1}]),'Down');
});

test('a valid alternate audited price establishes the winner when the primary price is absent',async()=>{
  for (const curPrice of [null,'',' ']) {
    const row=await auditPrice({curPrice,currPrice:1});
    assert.equal(row.winner,'Up');
    assert.equal(row.resolved,true);
    assert.equal(row.pnl,5.832);
  }
  const zero=await auditPrice({curPrice:0,currPrice:1});
  assert.equal(zero.winner,'Down','an explicit zero remains real evidence');
});

test('unresolved fills expose modeled fees and cash while settlement PnL and payout remain pending',()=>{
  const a=loadRadar();
  a.state.historySinceSec=start;
  a.state.clobMarkets.set(conditionId,{fd:{r:.07,e:1,to:true}});
  const groups=a.buildGroups([fill(),fill({timestamp:start+20,side:'SELL',size:4,price:.6})],start);
  const row=a.enrichGroups(groups,[],[],new Map([[conditionId,{closed:false,outcomes:['Up','Down'],outcomePrices:[.6,.4]}]]))[0];
  assert.equal(row.resolved,false);
  assert.equal(row.pnl,null);
  assert.equal(row.feeTotal,.2352);
  assert.equal(row.buyCashWithFees,4.168);
  assert.equal(row.sellCashAfterFees,2.3328);
  assert.equal(row.netCashBeforePayout,-1.8352);
  assert.equal(row.payout,null);
  assert.equal(row.grossSettlementPnl,null);
  assert.equal(row.settlement.pnl,null);
  assert.equal(row.settlement.payout,null);
  assert.equal(row.settlement.takerCount,2);
  assert.equal(row.settlement.fillBreakdown.length,2);
  a.state.rows=[row];
  a.openDetails(row.key);
  assert.match(a.els.modalBody.innerHTML,/Pending resolution/);
  assert.match(a.els.modalBody.innerHTML,/Modeled taker fee/);
  assert.match(a.els.modalBody.innerHTML,/payout pending/);
  const csv=a.buildCsv([row]);
  const values=[...csv.split('\r\n')[1].matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(m=>m[1]);
  assert.equal(values[7],'','unresolved PnL is blank');
  assert.equal(values[9],'','unresolved payout is blank');
  assert.equal(Number(values[10]),.2352);
  assert.equal(Number(values[11]),4.168);
  assert.equal(Number(values[12]),2.3328);
  const settled=a.enrichGroups(groups,[],[],new Map([[conditionId,{resolved:true,outcomes:['Up','Down'],outcomePrices:[1,0]}]]))[0];
  assert.equal(settled.pnl,4.1648);
  assert.equal(settled.payout,6);
  assert.equal(settled.feeTotal,.2352);
});
