import {createRadarServer} from '../server.mjs';
import {createProxy} from '../lib/proxy.mjs';
import {fixtureFetcher} from './fixture-adapter.mjs';
createRadarServer({proxy:createProxy(fixtureFetcher())}).listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log('Synthetic QA server; wallet 0x1111111111111111111111111111111111111111'));
