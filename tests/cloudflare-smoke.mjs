import fs from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const base=process.argv[2] || 'https://equity-radar.equity-radar-website.workers.dev';
const checks=[];
for(const pathname of ['/assets/radar.js','/assets/radar.css','/']){
 const response=await fetch(base+pathname);assert.equal(response.status,200);
 const bytes=Buffer.from(await response.arrayBuffer());
 const local=fs.readFileSync(new URL('../public/'+(pathname==='/'?'index.html':pathname.slice(1)),import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),createHash('sha256').update(local).digest('hex'));
 assert.equal(response.headers.get('cache-control'),'no-cache');
 const etag=response.headers.get('etag');let revalidation=null;
 if(etag){const next=await fetch(base+pathname,{headers:{'If-None-Match':etag}});revalidation=next.status;assert.equal(next.status,304);}
 checks.push({pathname,status:200,bytes:bytes.length,identicalToLocal:true,revalidation});
}
assert.deepEqual(await (await fetch(base+'/healthz')).json(),{ok:true});
assert.equal((await fetch(base+'/api/data/activity',{method:'POST'})).status,405);
assert.equal((await fetch(base+'/api/data/arbitrary')).status,400);
assert.equal((await fetch(base+'/api/data/activity?user=invalid')).status,400);
console.log(JSON.stringify({checks,health:true,readOnly405:true,rejectedRoutes400:true},null,2));
