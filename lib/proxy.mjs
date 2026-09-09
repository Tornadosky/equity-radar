/** Read-only gateway. The browser cannot choose a host, credentials, or HTTP method. */
const hosts={data:'https://data-api.polymarket.com',gamma:'https://gamma-api.polymarket.com',clob:'https://clob.polymarket.com'};
const paths={data:/^\/(activity|trades|positions|closed-positions|v1\/market-positions)$/,gamma:/^\/(public-profile|markets|markets\/slug\/[a-zA-Z0-9_-]{1,200}|events\/slug\/[a-zA-Z0-9_-]{1,200})$/,clob:/^\/(clob-markets\/0x[a-fA-F0-9]{64}|rebates\/current)$/};
const keys=new Set(['user','address','maker_address','market','condition_ids','type','start','end','limit','offset','sortBy','sortDirection','takerOnly','sizeThreshold','redeemable','closed','status','date']);
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const error=(message,status)=>new Response(JSON.stringify({error:message}),{status,headers});
export function upstreamUrl(input){
  const url=new URL(input);const match=url.pathname.match(/^\/api\/(data|gamma|clob)(\/.*)$/);
  if(!match || !paths[match[1]].test(match[2])) throw new Error('Unsupported API route');
  if(url.search.length>12000)throw new Error('Query too long');
  for(const [k,v] of url.searchParams){
    if(!keys.has(k) || url.searchParams.getAll(k).length>1)throw new Error('Unsupported query parameter');
    if(['user','address','maker_address'].includes(k)&&!/^0x[a-fA-F0-9]{40}$/.test(v))throw new Error('Invalid wallet address');
    if(['market','condition_ids'].includes(k)&&!/^0x[a-fA-F0-9]{64}(,0x[a-fA-F0-9]{64}){0,34}$/.test(v))throw new Error('Invalid condition ID');
    if(['limit','offset','start','end','sizeThreshold'].includes(k)&&(!/^\d+(\.\d+)?$/.test(v)||!Number.isFinite(Number(v))))throw new Error('Invalid numeric parameter');
    if(k==='offset'&&Number(v)>(match[2]==='/activity'?5000:10000))throw new Error('Offset exceeds endpoint limit');
    if(k==='limit'&&Number(v)>(match[2]==='/activity'?500:10000))throw new Error('Limit exceeds endpoint limit');
    if(['closed','redeemable','takerOnly'].includes(k)&&!['true','false'].includes(v))throw new Error('Invalid boolean');
    if(k==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))))throw new Error('Invalid UTC date');
    if(['sortBy','sortDirection','status','type'].includes(k)&&!/^[A-Z_,]{1,150}$/.test(v))throw new Error('Invalid filter');
  }
  return hosts[match[1]]+match[2]+url.search;
}
// Only public market definitions may be reused. Wallet data and rebate accruals
// always reach their upstream endpoint; no stale response is served on failure.
const metadataTtlMs=12000, maxCacheEntries=128;
const maxEntryBytes=512*1024, maxCacheBytes=4*1024*1024;
function isMarketMetadata(upstream){
  const url=new URL(upstream);
  if(['user','address','maker_address'].some(key=>url.searchParams.has(key)))return false;
  return (url.origin===hosts.gamma && /^\/markets(?:\/slug\/[a-zA-Z0-9_-]{1,200})?$/.test(url.pathname)) ||
    (url.origin===hosts.clob && /^\/clob-markets\/0x[a-fA-F0-9]{64}$/.test(url.pathname));
}
const failure=(message,status)=>({text:JSON.stringify({error:message}),status});
const reply=result=>new Response(result.text,{status:result.status,headers});

export function createProxy(fetcher=fetch,now=Date.now){
  let active=0,cacheBytes=0;
  const cache=new Map(), pending=new Map();
  function remove(key){const entry=cache.get(key);if(entry){cacheBytes-=entry.bytes;cache.delete(key);}}
  function remember(key,result){
    // Count UTF-16 storage conservatively, not just UTF-8 network bytes.
    const bytes=result.text.length*2;
    if(result.status!==200 || bytes>maxEntryBytes)return;
    const time=now();
    for(const [key,entry] of cache)if(entry.expires<=time)remove(key);
    remove(key);
    while(cache.size>=maxCacheEntries || cacheBytes+bytes>maxCacheBytes)remove(cache.keys().next().value);
    cache.set(key,{result,bytes,expires:time+metadataTtlMs});cacheBytes+=bytes;
  }
  async function fetchUpstream(upstream){
    active++;
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),18000);
    try{
      const response=await fetcher(upstream,{method:'GET',headers:{Accept:'application/json'},redirect:'error',signal:controller.signal});
      if(!response.ok){await response.body?.cancel();return failure(`Polymarket returned HTTP ${response.status}. Try again later or check host access to the API.`,response.status);}
      const reader=response.body.getReader();const chunks=[];let size=0;
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8*1024*1024){await reader.cancel();return failure('Upstream response too large; shorten the range',502);}chunks.push(value);}
      if(controller.signal.aborted)throw new DOMException('Request timed out','AbortError');
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
      const text=new TextDecoder().decode(bytes);try{JSON.parse(text);}catch{return failure('Polymarket returned a non-JSON response',502);}
      return {text,status:200};
    }catch(e){return failure(e.name==='AbortError'?'Polymarket request timed out':'Unable to reach Polymarket from this host',e.name==='AbortError'?504:502);}
    finally{clearTimeout(timeout);active--;}
  }
  return async function proxy(request){
    if(request.method!=='GET')return error('Read-only endpoint; GET required',405);
    let upstream;try{upstream=upstreamUrl(request.url);}catch(e){return error(e.message,400);}
    const metadata=isMarketMetadata(upstream);
    if(metadata){
      const cached=cache.get(upstream);
      if(cached && cached.expires>now()){
        cache.delete(upstream);cache.set(upstream,cached); // Most recently used.
        return reply(cached.result);
      }
      remove(upstream);
      if(pending.has(upstream))return reply(await pending.get(upstream));
    }
    if(active>=48)return error('Too many concurrent requests; retry shortly',429);
    const work=fetchUpstream(upstream);
    if(!metadata)return reply(await work);
    pending.set(upstream,work);
    try{const result=await work;remember(upstream,result);return reply(result);}
    finally{pending.delete(upstream);}
  };
}
export const proxyRequest=createProxy();
