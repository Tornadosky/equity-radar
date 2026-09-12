import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRadar} from './harness.mjs';

test('no included settled rounds cannot present a green zero PnL', () => {
  const a=loadRadar(); a.showDemo();
  for(const excluded of [false,true]) {
    for(const row of a.state.rows) {row.pnl=null; row.excluded=excluded;}
    a.render();
    assert.match(a.els.status.innerHTML,/No included settled rounds/);
    assert.doesNotMatch(a.els.status.innerHTML,/status-dot ok/);
    assert.ok(a.els.status.innerHTML.includes(a.els.dayPnl.textContent));
  }
});

test('banner follows the visible period and updated settlements, like the chart', () => {
  const a=loadRadar();
  a.showDemo();
  const original=a.els.status.innerHTML;
  a.els.lookback.value='1';
  a.render();
  assert.notEqual(a.els.status.innerHTML,original);
  assert.ok(a.els.status.innerHTML.includes(a.els.dayPnl.textContent));
  const before=a.els.status.innerHTML;
  const visible=a.getVisibleRows().find(r=>r.resolved && r.pnl!=null);
  visible.pnl+=100;
  a.render();
  assert.notEqual(a.els.status.innerHTML,before);
  assert.ok(a.els.status.innerHTML.includes(a.els.dayPnl.textContent));
  a.els.lookback.value='all';
  a.els.bothOnly.checked=true;
  a.render();
  assert.ok(a.els.status.innerHTML.includes(a.els.dayPnl.textContent));
});

test('filter rendering preserves active loading and audit progress', () => {
  const a=loadRadar(); a.showDemo();
  for (const flag of ['loading','auditLoading','reportHydrating']) {
    a.state[flag]=true;
    a.els.status.innerHTML='Progress in flight';
    a.render();
    assert.equal(a.els.status.innerHTML,'Progress in flight');
    a.state[flag]=false;
  }
});

test('audit diagnostics disclose tolerated differences without letting opposite gaps cancel', () => {
  const a=loadRadar(); a.showDemo();
  const rows=a.getVisibleRows().filter(r=>r.resolved && r.pnl!=null).slice(0,2);
  a.state.rows=rows;
  rows[0].reconciliationDelta=.49;
  rows[1].reconciliationDelta=-.4;
  for(const row of rows) {row.auditStatus='verified'; row.auditTolerance=.5;}
  a.render();
  const text=a.document.getElementById('coverageNote').textContent;
  assert.match(text,/0\.05%/);
  assert.match(text,/2\/2 compared/);
  assert.match(text,/net API − calc \+0,09/);
  assert.match(text,/sum of absolute gaps 0,89/);
  assert.match(a.els.dayAudit.title,/tolerance/);
});

const asyncStart=1770000300, asyncCondition='0x'+'b'.repeat(64), asyncWallet='0x'+'1'.repeat(40);

function seedAsyncReport(a, resolved) {
  const trade={conditionId:asyncCondition,asset:'1',slug:`btc-updown-5m-${asyncStart}`,timestamp:asyncStart+10,size:10,price:.4,side:'BUY',outcome:'Up',_isTaker:true};
  const market={conditionId:asyncCondition,resolved,outcomes:['Up','Down'],outcomePrices:resolved?[1,0]:[.5,.5],feeSchedule:{rate:.07,exponent:1,takerOnly:true}};
  Object.assign(a.state,{proxyWallet:asyncWallet,historySinceSec:asyncStart,allTrades:[trade],ledgerComplete:true,ledgerCoverageEnd:asyncStart+300});
  a.state.markets.set(asyncCondition,market);
  a.state.rows=a.enrichGroups(a.buildGroups([trade],asyncStart),[],[],a.state.markets);
  a.render();
  return a.buildGroups(a.state.allTrades,asyncStart);
}

test('completed async market audit updates the banner when it resolves a pending round',async()=>{
  for(const silent of [true,false]) {
    const a=loadRadar({fetch:async url=>{
      const request=new URL(url);
      assert.equal(request.pathname,'/api/data/v1/market-positions');
      assert.equal(request.searchParams.get('market'),asyncCondition);
      return {ok:true,json:async()=>[{token:'1',positions:[{proxyWallet:asyncWallet,conditionId:asyncCondition,asset:'1',outcome:'Up',size:10,redeemable:true,currPrice:1,totalPnl:5.832}]}]};
    }});
    const groups=seedAsyncReport(a,false);
    assert.equal(a.els.dayPnl.textContent,'—');
    await a.verifyMarketPnls(groups,{force:true,silent});
    assert.equal(a.state.auditLoading,false);
    assert.equal(a.state.rows[0].pnl,5.832);
    assert.match(a.els.dayPnl.textContent,/\+5,83/);
    assert.match(a.els.status.innerHTML,/\+5,83/);
    assert.match(a.els.status.innerHTML,/1 rounds/);
  }
});

test('completed automatic settlement refresh updates the banner when role evidence changes PnL',async()=>{
  const a=loadRadar({fetch:async url=>{
    const request=new URL(url);
    assert.ok(['/api/data/positions','/api/data/closed-positions','/api/data/trades','/api/data/activity'].includes(request.pathname),request.pathname);
    assert.equal(request.searchParams.get('user'),asyncWallet);
    return {ok:true,json:async()=>[]};
  }});
  seedAsyncReport(a,true);
  a.els.autoRefresh.checked=true;
  assert.equal(a.state.rows[0].pnl,5.832);
  await a.refreshSettlementData();
  assert.equal(a.state.settlementLoading,false);
  assert.equal(a.state.rows[0].pnl,6,'complete empty taker history classifies this fill as maker');
  assert.match(a.els.dayPnl.textContent,/\+6,00/);
  assert.match(a.els.status.innerHTML,/\+6,00/);
});
