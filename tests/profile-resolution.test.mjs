import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRadar} from './harness.mjs';
const input='0x0cb038487586d1119b165466072e9baf666f3a90';
const mapped='0x6f35f7fa74201440453b42e660d98568e61b6827';
const trade={proxyWallet:input,type:'TRADE',timestamp:1788937200};
function resolver(rows,{profileWallet=mapped,probeError=false}={}){
 const calls=[];
 const a=loadRadar({fetch:async url=>{
  const u=new URL(url);calls.push(u);
  if(u.pathname.endsWith('/public-profile'))return {ok:true,json:async()=>({proxyWallet:profileWallet,name:'Trader'})};
  if(probeError)throw new Error('Activity unavailable');
  return {ok:true,json:async()=>rows};
 }});
 return {a,calls};
}

test('active explicit wallet is preserved when profile proposes a different wallet',async()=>{
 const {a,calls}=resolver([trade]);const profile=await a.resolveProfile(input);
 assert.equal(profile.proxyWallet,input);assert.equal(profile.warning,'');assert.equal(calls.length,2);
 const probe=calls[1];assert.equal(probe.searchParams.get('user'),input);assert.equal(probe.searchParams.get('type'),'TRADE');assert.equal(probe.searchParams.get('limit'),'1');assert.equal(probe.searchParams.get('sortBy'),'TIMESTAMP');assert.equal(probe.searchParams.get('sortDirection'),'DESC');
});

test('an EOA with empty activity resolves to its Gamma proxy',async()=>{
 const {a}=resolver([]);assert.equal((await a.resolveProfile(input)).proxyWallet,mapped);
});

test('unrelated wallet, other activity type and invalid timestamp do not prove an active input wallet',async()=>{
 for(const row of [{...trade,proxyWallet:mapped},{...trade,type:'MAKER_REBATE'},{...trade,timestamp:-1},{...trade,timestamp:'bad'},{...trade,proxyWallet:undefined}]){
  const {a}=resolver([row]);assert.equal((await a.resolveProfile(input)).proxyWallet,mapped);
 }
});

test('identical profile wallet skips the extra activity probe',async()=>{
 const {a,calls}=resolver([],{profileWallet:input});assert.equal((await a.resolveProfile(input)).proxyWallet,input);assert.equal(calls.length,1);
});

test('failed activity probe preserves the explicit address and exposes a persistent warning',async()=>{
 const {a}=resolver([],{probeError:true});const profile=await a.resolveProfile(input);
 assert.equal(profile.proxyWallet,input);assert.match(profile.warning,/could not be verified/i);
 let probes=0;
 const loaded=loadRadar({fetch:async url=>{
  const u=new URL(url);
  if(u.pathname.endsWith('/public-profile'))return {ok:true,json:async()=>({proxyWallet:mapped})};
  if(u.pathname.endsWith('/activity') && u.searchParams.get('limit')==='1'){probes++;throw new Error('Probe failed');}
  assert.equal(u.searchParams.get('user'),input);return {ok:true,json:async()=>[]};
 }});
 loaded.els.address.value=input;await loaded.loadReport();
 assert.equal(probes,1);assert.equal(loaded.state.proxyWallet,input);assert.match(loaded.els.resolvedAddress.textContent,/mapping unverified/i);
 assert.ok(loaded.state.qualityWarnings.some(w=>/could not be verified/i.test(w)));assert.ok(loaded.els.toastWrap.children.some(node=>/could not be verified/i.test(node.textContent)));
});

test('obsolete profile probe cannot resolve or warn for a new report',async()=>{
 let release;const a=loadRadar({fetch:async url=>new URL(url).pathname.endsWith('/public-profile')?{ok:true,json:async()=>({proxyWallet:mapped})}:await new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>[trade]});})});
 const old=a.resolveProfile(input);for(let i=0;i<12 && !release;i++)await Promise.resolve();assert.ok(release,'activity probe started');a.state.generation++;release();
 await assert.rejects(old,/Report changed/);assert.equal(a.state.qualityWarnings.length,0);
});
