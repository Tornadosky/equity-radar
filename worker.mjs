/** Cloudflare Worker entry point. Serves public/ via the ASSETS binding and reuses the read-only gateway. */
import {createProxy} from './lib/proxy.mjs';

/* Workers' fetch() has no redirect:'error' mode; 'manual' surfaces the 3xx, which the gateway rejects as !ok. */
const proxy = createProxy((url, init) => fetch(url, {...init, redirect: 'manual'}));

const security = {'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store'};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/healthz') return new Response('{"ok":true}', {headers: {...security, 'Content-Type': 'application/json'}});
    if (url.pathname.startsWith('/api/')) {
      const reply = await proxy(request);
      const headers = new Headers(reply.headers);
      for (const [k, v] of Object.entries(security)) headers.set(k, v);
      return new Response(reply.body, {status: reply.status, headers});
    }
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', {status: 405, headers: security});
    return env.ASSETS.fetch(request);
  },
};
