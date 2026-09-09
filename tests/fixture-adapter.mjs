import original from './fixtures/polymarket.json' with {type:'json'};
export function makeFixture({rebase=true}={}){
 const delta=rebase?Math.floor((Date.now()/1000-original.meta.now)/300)*300:0;
 function shift(v,key=''){
  if(typeof v==='number'&&['timestamp','start','end','now','recommendedStart'].includes(key))return v+delta;
  if(typeof v==='string'){
   if(/btc-updown-5m-\d{10}/.test(v))return v.replace(/btc-updown-5m-(\d{10})/g,(_,n)=>'btc-updown-5m-'+(Number(n)+delta));
   if(/^\d{4}-\d{2}-\d{2}T/.test(v))return new Date(Date.parse(v)+delta*1000).toISOString();
   if(key==='date')return new Date(Date.now()).toISOString().slice(0,10);
  }
  if(Array.isArray(v))return v.map(x=>shift(x));
  if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,shift(x,k)]));
  return v;
 }
 return shift(original);
}
export function fixtureFetcher(fixture=makeFixture()){
 let activityPolls=0;
 return async function fixtureFetch(input){
  const u=new URL(input),p=u.searchParams,path=u.pathname;
  const wallet=p.get('user')||p.get('address')||p.get('maker_address');
  if(wallet&&wallet!==fixture.meta.wallet)return new Response(JSON.stringify({error:'Synthetic test server: use 0x1111111111111111111111111111111111111111 only'}),{status:404});
  let result;
  const slice=rows=>rows.slice(Number(p.get('offset')||0),Number(p.get('offset')||0)+Number(p.get('limit')||500));
  const inRange=rows=>rows.filter(r=>(!p.has('start')||r.timestamp>=Number(p.get('start')))&&(!p.has('end')||r.timestamp<=Number(p.get('end'))));
  if(path==='/public-profile')result=fixture.profile;
  else if(path==='/activity'){
   activityPolls++;
   let rows=inRange(fixture.activity);
   if(p.has('type')){const types=p.get('type').split(',');rows=rows.filter(r=>types.includes(r.type));}
   result=slice(rows.sort((a,b)=>p.get('sortDirection')==='ASC'?a.timestamp-b.timestamp:b.timestamp-a.timestamp));
  }
  else if(path==='/trades')result=slice(inRange(p.get('takerOnly')==='false'?fixture.trades:fixture.takerTrades).sort((a,b)=>b.timestamp-a.timestamp));
  else if(path==='/positions')result=slice(fixture.positions.filter(r=>p.get('redeemable')!=='true'||r.redeemable));
  else if(path==='/closed-positions')result=slice(fixture.closedPositions);
  else if(path==='/v1/market-positions')result=fixture.marketPositions[p.get('market')]||[];
  else if(path==='/markets')result=fixture.markets.filter(m=>(!p.has('condition_ids')||p.get('condition_ids').split(',').includes(m.conditionId))&&(!p.has('closed')||m.closed===(p.get('closed')==='true')));
  else if(path.startsWith('/markets/slug/'))result=fixture.markets.find(m=>m.slug===path.split('/').at(-1))||null;
  else if(path.startsWith('/events/slug/'))result={markets:fixture.markets.filter(m=>m.slug===path.split('/').at(-1))};
  else if(path.startsWith('/clob-markets/'))result=fixture.clobMarkets[path.split('/').at(-1)]||null;
  else if(path==='/rebates/current')result=fixture.rebates.filter(r=>r.date===p.get('date'));
  else return new Response('Unknown fixture route',{status:404});
  return Response.json(result);
 };
}
