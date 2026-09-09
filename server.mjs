import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {proxyRequest} from './lib/proxy.mjs';
const root=fileURLToPath(new URL('./public/',import.meta.url));
const assets=new Map([['/','index.html'],['/index.html','index.html'],['/assets/radar.css','assets/radar.css'],['/assets/radar.js','assets/radar.js']]);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
export function createRadarServer({proxy=proxyRequest}={}){
 return http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost');
   const security={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store'};
   if(url.pathname==='/healthz'){res.writeHead(200,{...security,'Content-Type':'application/json'});res.end('{"ok":true}');return;}
   if(url.pathname.startsWith('/api/')){const reply=await proxy(new Request(url,{method:req.method}));res.writeHead(reply.status,{...security,...Object.fromEntries(reply.headers)});res.end(Buffer.from(await reply.arrayBuffer()));return;}
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,security);res.end('Method not allowed');return;}
   const asset=assets.get(url.pathname);
   if(!asset){res.writeHead(404,security);res.end('Not found');return;}
   const bytes=await readFile(path.join(root,asset));
   res.writeHead(200,{...security,'Content-Type':mime[path.extname(asset)],'Content-Length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes);
  }catch{res.writeHead(500,{'Content-Type':'text/plain'});res.end('Request failed');}
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=Number(process.env.PORT||3000),bind=process.env.RADAR_BIND||'0.0.0.0';
 const server=createRadarServer();server.listen(port,bind,()=>console.log(`Equity Radar listening on port ${port}`));
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
