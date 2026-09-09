import test from 'node:test';
import assert from 'node:assert/strict';
import {createRadarServer} from '../server.mjs';
import {createProxy} from '../lib/proxy.mjs';
import {fixtureFetcher,makeFixture} from './fixture-adapter.mjs';
import {loadRadar} from './harness.mjs';
const fixture=makeFixture({rebase:false});
test('complete 8-market accounting fixture reconciles independent oracle',()=>{
 class FixedDate extends Date { static now(){return fixture.meta.now*1000;} }
 const a=loadRadar({Date:FixedDate});a.state.historySinceSec=fixture.meta.recommendedStart;a.state.ledgerComplete=true;
 a.state.ledgerEvents=fixture.activity.filter(x=>x.type!=='TRADE');a.state.takerHistoryComplete=true;a.state.takerCoverageEnd=Infinity;
 a.state.allTrades=a.prepareTradeBatch(fixture.trades);a.state.takerTrades=a.prepareTradeBatch(fixture.takerTrades);a.classifyTakerTrades();
 a.state.clobMarkets=new Map(Object.entries(fixture.clobMarkets));
 const rows=a.enrichGroups(a.buildGroups(a.state.allTrades,a.state.historySinceSec),fixture.positions,fixture.closedPositions,new Map(fixture.markets.map(m=>[m.conditionId,m])));
 assert.equal(rows.length,8);const trusted=rows.filter(r=>r.pnl!=null);assert.equal(trusted.length,5);
 assert.ok(Math.abs(trusted.reduce((n,r)=>n+r.pnl,0)-61.49075)<1e-8);
 for(const row of rows){const expected=fixture.expected.rounds.find(r=>r.conditionId===row.conditionId);if(expected.eligibleWhenLifecycleUnsupported)assert.equal(row.pnl,expected.correctPnl);else assert.equal(row.pnl,null);}
 assert.equal(rows.filter(r=>r.excluded).length,2);
});
test('HTTP server serves exact assets and gateway fixture with no production mock switch',async()=>{
 const server=createRadarServer({proxy:createProxy(fixtureFetcher(fixture))});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const base=`http://127.0.0.1:${server.address().port}`;
  const response=await fetch(base+'/');assert.equal(response.status,200);assert.match(await response.text(),/Equity Radar v5/);
  for(const p of ['/assets/radar.js','/assets/radar.css','/healthz'])assert.equal((await fetch(base+p)).status,200);
  assert.equal((await fetch(base+'/server.mjs')).status,404);
  const r=await fetch(base+'/api/data/activity?user='+fixture.meta.wallet+'&type=TRADE&limit=500');assert.equal((await r.json()).length,13);
  const rebates=await fetch(base+'/api/clob/rebates/current?maker_address='+fixture.meta.wallet+'&date='+fixture.rebates[0].date);assert.equal((await rebates.json())[0].rebated_fees_usdc,'1.250000');
 }finally{await new Promise(resolve=>server.close(resolve));}
});
