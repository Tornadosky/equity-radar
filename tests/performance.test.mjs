import test from 'node:test';
import assert from 'node:assert/strict';
import {createProxy} from '../lib/proxy.mjs';

const wallet = '0x' + '1'.repeat(40);
const condition = '0x' + '2'.repeat(64);
const request = path => new Request('https://radar.test/api/' + path);
const market = index => `gamma/markets/slug/btc-updown-5m-${index}`;

test('coalesces simultaneous metadata requests and reuses a fresh independent response', async () => {
  let calls = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const handler = createProxy(async () => { calls++; await gate; return Response.json({winner:'Up'}); });
  const replies = Array.from({length:60}, () => handler(request(market(1))));
  release();
  const results = await Promise.all(replies);
  assert.equal(calls, 1, '60 concurrent clients require one upstream request');
  for (const result of results) {
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), {winner:'Up'});
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
  }
  assert.deepEqual(await (await handler(request(market(1)))).json(), {winner:'Up'});
  assert.equal(calls, 1);
});

test('metadata expires after 12 seconds and never serves stale success after an upstream failure', async () => {
  let calls = 0, now = 1000;
  const handler = createProxy(async () => {
    calls++;
    return calls === 2 ? new Response('Unavailable', {status:503}) : Response.json({version:calls});
  }, () => now);
  assert.equal((await handler(request(`clob/clob-markets/${condition}`))).status, 200);
  now += 11999;
  assert.deepEqual(await (await handler(request(`clob/clob-markets/${condition}`))).json(), {version:1});
  now++;
  assert.equal((await handler(request(`clob/clob-markets/${condition}`))).status, 503);
  assert.deepEqual(await (await handler(request(`clob/clob-markets/${condition}`))).json(), {version:3});
  assert.equal(calls, 3);
});

test('wallet, profile, event and rebate routes remain uncached and uncoalesced', async () => {
  let calls = 0;
  const handler = createProxy(async () => { calls++; return Response.json({}); });
  for (const path of [
    `data/activity?user=${wallet}`, `data/trades?user=${wallet}`,
    `data/positions?user=${wallet}`, `data/closed-positions?user=${wallet}`,
    `data/v1/market-positions?market=${condition}`,
    `gamma/public-profile?address=${wallet}`, 'gamma/events/slug/test',
    `gamma/markets?user=${wallet}`,
    `clob/rebates/current?maker_address=${wallet}&date=2026-09-09`,
  ]) {
    const before = calls;
    await Promise.all([handler(request(path)), handler(request(path))]);
    await handler(request(path));
    assert.equal(calls - before, 3, path);
  }
});

test('failed, aborted and malformed metadata responses are retried instead of cached', async () => {
  for (const failure of [
    () => new Response('Unavailable', {status:503}),
    () => { throw new DOMException('Aborted', 'AbortError'); },
    () => new Response('not JSON'),
  ]) {
    let calls = 0;
    const handler = createProxy(async () => { calls++; return calls === 1 ? failure() : Response.json({ok:true}); });
    assert.ok((await handler(request(market(1)))).status >= 500);
    assert.deepEqual(await (await handler(request(market(1)))).json(), {ok:true});
    assert.equal(calls, 2);
  }
});

test('cache keys isolate markets and queries and evict the least recently used entry at 128 entries', async () => {
  let calls = 0;
  const handler = createProxy(async url => { calls++; return Response.json({url}); });
  for (let i = 0; i < 128; i++) await handler(request(market(i)));
  await handler(request(market(0))); // Retain the recently read entry.
  await handler(request(market(128)));
  await handler(request(market(0)));
  assert.equal(calls, 129);
  await handler(request(market(1)));
  assert.equal(calls, 130);
  await handler(request('gamma/markets?closed=true'));
  await handler(request('gamma/markets?closed=false'));
  assert.equal(calls, 132);
});

test('large metadata remains readable but is not cached, and total cached strings stay within 4 MiB', async () => {
  let calls = 0;
  const body = JSON.stringify({padding:'x'.repeat(240 * 1024)});
  const handler = createProxy(async url => {
    calls++;
    return new Response(url.endsWith('/large') ? JSON.stringify({padding:'x'.repeat(300 * 1024)}) : body);
  });
  for (let i = 0; i < 2; i++) assert.equal((await handler(request('gamma/markets/slug/large'))).status, 200);
  assert.equal(calls, 2, 'an individual UTF-16 string larger than 512 KiB is not retained');
  for (let i = 0; i < 9; i++) await handler(request(market(i)));
  await handler(request(market(8)));
  assert.equal(calls, 11, 'the most recent cacheable entry is still reused');
  await handler(request(market(0)));
  assert.equal(calls, 12, 'nine 480 KiB strings cannot all remain in a 4 MiB cache');
});

test('48-request upstream limit still applies to distinct uncached markets', async () => {
  let calls = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const handler = createProxy(async () => { calls++; await gate; return Response.json({}); });
  const jobs = Array.from({length:48}, (_, index) => handler(request(market(index))));
  assert.equal((await handler(request(market(48)))).status, 429);
  release();
  assert.ok((await Promise.all(jobs)).every(result => result.status === 200));
  assert.equal(calls, 48);
});
