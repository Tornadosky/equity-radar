import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRadar} from './harness.mjs';

/* Real Polymarket activity rows for BTC 5m fills. usdcSize is gross cash moved, so it carries the
   crypto taker fee on top of size x price; these are valid fills, not corrupt ones. */
const liveFills = [
  {size: 75, price: 0.91, usdcSize: 68.67997},
  {size: 30, price: 0.8, usdcSize: 24.336},
  {size: 5, price: 0.14, usdcSize: 0.74214},
  {size: 120, price: 0.01, usdcSize: 1.28316},
  {size: 11.89, price: 0.13, usdcSize: 1.63983}
];
const asFill = (fill, index) => ({
  side: 'BUY', outcome: 'Up', timestamp: 1788937200 + index,
  conditionId: '0x' + '1'.repeat(64), ...fill
});

test('fee-inclusive usdcSize is not treated as an inconsistent notional', () => {
  const a = loadRadar();
  for (const [index, fill] of liveFills.entries()) {
    const record = a.normalizeTradeRecord(asFill(fill, index));
    assert.equal(record._invalid, '', `fill ${index} (${fill.size} @ ${fill.price}) was rejected`);
  }
});

test('notional stays size x price so the modeled fee is not counted twice', () => {
  const a = loadRadar();
  const config = {rate: 0.07, exponent: 1, takerOnly: true, exact: true};
  for (const [index, fill] of liveFills.entries()) {
    const trade = a.normalizeTradeRecord({...asFill(fill, index), _isTaker: true});
    const fee = a.feeForTrade(trade, config);
    const settlement = a.calculateRoundSettlement([trade], 'Up', config);
    assert.ok(Math.abs(settlement.rawBuyNotional - fill.size * fill.price) < 1e-8,
      `fill ${index} notional ${settlement.rawBuyNotional} != ${fill.size * fill.price}`);
    // usdcSize is exactly the cash the wallet paid: notional + fee.
    assert.ok(Math.abs(settlement.buyCash - fill.usdcSize) < 1e-4,
      `fill ${index} buy cash ${settlement.buyCash} != usdcSize ${fill.usdcSize}`);
    assert.ok(fee > 0);
  }
});

test('a genuinely inconsistent notional is still rejected', () => {
  const a = loadRadar();
  const record = a.normalizeTradeRecord(asFill({size: 10, price: 0.5, usdcSize: 9}, 0));
  assert.equal(record._invalid, ''); // Cash evidence is checked after the market schedule loads.
  a.state.historySinceSec=1788937200;
  record.slug=record.eventSlug='btc-updown-5m-1788937200';
  const market={resolved:true,outcomes:['Up','Down'],outcomePrices:[1,0],feeSchedule:{rate:.07,exponent:1,takerOnly:true}};
  const row=a.enrichGroups(a.buildGroups([record],1788937200),[],[],new Map([[record.conditionId,market]]))[0];
  assert.equal(row.excluded,true);
  assert.ok(row.qualityIssues.includes('Inconsistent fill notional'));
});

test('btc-updown-15m does not enter a 5m report', () => {
  const a = loadRadar();
  const row = slug => ({eventSlug: slug, slug, title: 'Bitcoin Up or Down - September 9, 6:30AM-6:45AM ET'});
  assert.equal(a.isBtc5m(row('btc-updown-5m-1788937200')), true);
  assert.equal(a.isBtc5m(row('btc-updown-15m-1788935400')), false);
  assert.equal(a.isBtc5m(row('btc-updown-1h-1788937200')), false);
  assert.equal(a.isBtc5m({eventSlug: 'sol-updown-5m-1788957000', slug: 'sol-updown-5m-1788957000', title: 'Solana Up or Down'}), false);
});
