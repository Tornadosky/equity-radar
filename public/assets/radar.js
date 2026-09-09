
(() => {
  'use strict';

  const DATA_API = `${window.location.origin}/api/data`;
  const GAMMA_API = `${window.location.origin}/api/gamma`;
  const CLOB_API = `${window.location.origin}/api/clob`;
  const CRYPTO_TAKER_FEE_RATE = 0.07;
  const DEFAULT_CRYPTO_FEE = Object.freeze({ rate: CRYPTO_TAKER_FEE_RATE, exponent: 1, takerOnly: true, source: 'crypto default' });
  const TIMEFRAMES = Object.freeze({ '5m': Object.freeze({seconds:300}), '15m': Object.freeze({seconds:900}) });
  const HISTORY_HOURS = 24;
  const LIVE_POLL_MS = 2500;
  const SETTLEMENT_REFRESH_MS = 15000;
  const MARKET_PNL_CONCURRENCY = 6;
  const ACTIVITY_PAGE_SIZE = 500;
  const ACTIVITY_MAX_OFFSET = 5000;
  const TAKER_PAGE_SIZE = 1000;
  const TAKER_MAX_OFFSET = 9000;

  const els = {
    address: document.getElementById('addressInput'),
    timeframe: document.getElementById('timeframeSelect'),
    lookback: document.getElementById('lookbackSelect'),
    start: document.getElementById('startInput'),
    load: document.getElementById('loadBtn'),
    export: document.getElementById('exportBtn'),
    wallet: document.getElementById('walletBtn'),
    demo: document.getElementById('demoBtn'),
    status: document.getElementById('statusText'),
    resolvedAddress: document.getElementById('resolvedAddress'),
    resolvedOnly: document.getElementById('resolvedOnly'),
    bothOnly: document.getElementById('bothOnly'),
    audit: document.getElementById('auditBtn'),
    autoRefresh: document.getElementById('autoRefresh'),
    sort: document.getElementById('sortSelect'),
    lastUpdated: document.getElementById('lastUpdated'),
    body: document.getElementById('rowsBody'),
    totalPnl: document.getElementById('totalPnl'),
    pnlNote: document.getElementById('pnlNote'),
    roundCount: document.getElementById('roundCount'),
    roundNote: document.getElementById('roundNote'),
    upVolume: document.getElementById('upVolume'),
    upNote: document.getElementById('upNote'),
    downVolume: document.getElementById('downVolume'),
    downNote: document.getElementById('downNote'),
    bothCount: document.getElementById('bothCount'),
    bothNote: document.getElementById('bothNote'),
    chartCount: document.getElementById('chartCount'),
    chart: document.getElementById('pnlChart'),
    chartWrap: document.getElementById('chartWrap'),
    chartTooltip: document.getElementById('chartTooltip'),
    chartEmpty: document.getElementById('chartEmpty'),
    balanceChart: document.getElementById('balanceChart'),
    balanceChartWrap: document.getElementById('balanceChartWrap'),
    balanceChartTooltip: document.getElementById('balanceChartTooltip'),
    balanceChartEmpty: document.getElementById('balanceChartEmpty'),
    chartCaption: document.getElementById('chartCaption'),
    dayPnl: document.getElementById('dayPnl'),
    dayRounds: document.getElementById('dayRounds'),
    dayWinRate: document.getElementById('dayWinRate'),
    dayAverage: document.getElementById('dayAverage'),
    dayAudit: document.getElementById('dayAudit'),
    liveBody: document.getElementById('liveBody'),
    liveCount: document.getElementById('liveCount'),
    liveToggle: document.getElementById('liveToggle'),
    livePulse: document.getElementById('livePulse'),
    liveStatus: document.getElementById('liveStatus'),
    currentRoundSummary: document.getElementById('currentRoundSummary'),
    dialog: document.getElementById('detailDialog'),
    modalTitle: document.getElementById('modalTitle'),
    modalSub: document.getElementById('modalSub'),
    modalBody: document.getElementById('modalBody'),
    closeModal: document.getElementById('closeModal'),
    toastWrap: document.getElementById('toastWrap')
  };

  const state = {
    generation: 0,
    timeframe: '5m',
    takerCoverageEnd: 0,
    ledgerEvents: [],
    ledgerComplete: false,
    ledgerCoverageEnd: 0,
    rebateRequest: 0,
    rebateLoading: false,
    qualityWarnings: [],
    loading: false,
    livePolling: false,
    settlementLoading: false,
    rows: [],
    allTrades: [],
    currentPositions: [],
    closedPositions: [],
    markets: new Map(),
    clobMarkets: new Map(),
    takerTrades: [],
    takerHistoryComplete: false,
    takerClassifiedCount: 0,
    takerAssumedCount: 0,
    tradeKeys: new Set(),
    newTradeKeys: new Map(),
    proxyWallet: '',
    inputAddress: '',
    historySinceSec: 0,
    lastTradeTimestamp: 0,
    lastLoadAt: 0,
    lastLiveAt: 0,
    lastSettlementAt: 0,
    truncatedTrades: false,
    demo: false,
    marketPnlCache: new Map(),
    auditLoading: false,
    auditCompleted: 0,
    auditFailed: 0,
    chartHitPoints: [],
    chartRows: [],
    chartRect: null,
    balanceHitPoints: [],
    balanceRows: [],
    balanceRect: null,
    calculationSelfTest: { ok: false, message: 'не запускался' },
    chartResizeTimer: 0
  };

  const moneyFmt = new Intl.NumberFormat('ru-RU', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2
  });
  const numFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 4 });
  const dateFmt = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const timeFmt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const shortTimeFmt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const axisDateTimeFmt = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  function asNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function asBool(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
  }

  function normalizeTimestamp(value) {
    const n = asNumber(value);
    if (!n) return 0;
    return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function fmtMoney(value, signed = false) {
    const n = asNumber(value);
    if (!signed) return moneyFmt.format(n);
    if (n > 0) return '+' + moneyFmt.format(n);
    return moneyFmt.format(n);
  }

  function fmtCompactMoney(value) {
    const n = asNumber(value);
    const abs = Math.abs(n);
    if (abs >= 1000000) return `${n < 0 ? '-' : ''}$${(abs / 1000000).toFixed(2)}M`;
    if (abs >= 1000) return `${n < 0 ? '-' : ''}$${(abs / 1000).toFixed(2)}K`;
    return fmtMoney(n);
  }

  function fmtAxisMoney(value) {
    const n = asNumber(value);
    const abs = Math.abs(n);
    if (abs >= 1000) return `${n < 0 ? '−' : ''}$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
    return `${n < 0 ? '−' : ''}$${abs.toFixed(abs < 10 ? 1 : 0)}`;
  }

  function fmtShares(value) {
    return numFmt.format(asNumber(value));
  }

  function fmtPrice(value) {
    return `${(asNumber(value) * 100).toFixed(1)}¢`;
  }

  function shortAddress(address) {
    if (!address || address.length < 12) return address || '';
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
  }

  function normalizeOutcome(value) {
    const text = String(value ?? '').trim();
    const lower = text.toLowerCase();
    if (lower === 'up' || lower.includes(' up')) return 'Up';
    if (lower === 'down' || lower.includes(' down')) return 'Down';
    return text || 'Unknown';
  }

  function parseJsonArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return value.split(',').map(v => v.trim()).filter(Boolean);
    }
  }

  function extractAddress(value) {
    const match = String(value || '').match(/0x[a-fA-F0-9]{40}/);
    return match ? match[0] : '';
  }

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (_) { return null; }
  }

  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (_) {}
  }

  function normalizeTimeframe(value) {
    return value === '15m' ? '15m' : '5m';
  }

  function getTimeframe() {
    return TIMEFRAMES[normalizeTimeframe(state.timeframe)];
  }

  function btcMarketSlug(record) {
    const slugs = [record?.eventSlug, record?.slug].map(value => String(value || '').toLowerCase());
    const matches = slugs.map(slug => slug.match(/^btc-updown-(5m|15m)-(\d{10}|\d{13})$/)).filter(Boolean);
    // Conflicting market/event evidence is unsafe to assign to either report.
    if (!matches.length || matches.some(match => match[1] !== matches[0][1] || normalizeTimestamp(match[2]) !== normalizeTimestamp(matches[0][2]))) return null;
    return { timeframe: matches[0][1], startSec: normalizeTimestamp(matches[0][2]) };
  }

  function isBtcMarket(record) {
    return btcMarketSlug(record)?.timeframe === state.timeframe;
  }

  function isBtc5m(record) {
    return btcMarketSlug(record)?.timeframe === '5m';
  }

  function getStartSec(record) {
    const market = btcMarketSlug(record);
    if (market?.timeframe === state.timeframe) return market.startSec;
    const ts = normalizeTimestamp(record.timestamp);
    return ts ? Math.floor(ts / getTimeframe().seconds) * getTimeframe().seconds : 0;
  }

  function syncTimeframeLabels() {
    els.timeframe.value = state.timeframe;
    document.title = `Polymarket BTC ${state.timeframe} Equity Radar v5`;
    document.getElementById('marketSubtitle').textContent = `BTC ${state.timeframe} · close-settlement P&L · taker/maker fee model · live refresh`;
    els.balanceChart.setAttribute('aria-label', `Cumulative settled BTC ${state.timeframe} trading P&L`);
  }

  async function handleTimeframeChange() {
    const next = normalizeTimeframe(els.timeframe.value);
    if (next === state.timeframe) { syncTimeframeLabels(); return; }
    const wasDemo = state.demo;
    const wallet = state.loading ? extractAddress(els.address.value)
      : state.inputAddress || extractAddress(state.proxyWallet) || extractAddress(els.address.value);
    // A scope change is a new report. Late history, audit and rebate results cannot enter it.
    state.generation++;
    state.timeframe = next;
    storageSet('pm-btc-timeframe', next);
    els.dialog.close();
    els.chartTooltip.hidden = true; els.balanceChartTooltip.hidden = true;
    invalidateRebates();
    Object.assign(state, {
      demo:false, proxyWallet:'', inputAddress:'', rows:[], allTrades:[], currentPositions:[], closedPositions:[],
      markets:new Map(), clobMarkets:new Map(), marketPnlCache:new Map(), takerTrades:[],
      takerHistoryComplete:false, takerCoverageEnd:0, takerClassifiedCount:0, takerAssumedCount:0,
      ledgerEvents:[], ledgerComplete:false, ledgerCoverageEnd:0, qualityWarnings:[], truncatedTrades:false,
      tradeKeys:new Set(), newTradeKeys:new Map(), livePolling:false, settlementLoading:false, auditLoading:false,
      auditCompleted:0, auditFailed:0, lastTradeTimestamp:0, lastLoadAt:0, lastLiveAt:0, lastSettlementAt:0,
      historySinceSec:0, chartHitPoints:[], chartRows:[], balanceHitPoints:[], balanceRows:[]
    });
    setLoading(false);
    els.audit.textContent = 'Recheck P&L';
    els.resolvedAddress.textContent = '—'; els.lastUpdated.textContent = 'Not loaded';
    syncTimeframeLabels();
    render();
    if (wasDemo) { showDemo(); return; }
    if (wallet) { els.address.value = wallet; await loadReport(); return; }
    setStatus(`BTC ${next} selected. Enter an address and load a report.`);
  }

  function formatRange(startSec) {
    if (!startSec) return 'Время неизвестно';
    return `${dateFmt.format(new Date(startSec * 1000))} — ${shortTimeFmt.format(new Date((startSec + getTimeframe().seconds) * 1000))}`;
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(total / 60);
    const secs = total % 60;
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }


  function datetimeLocalFromSec(sec) {
    const date = new Date(Math.max(0, Math.floor(sec)) * 1000);
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function getHistorySinceSec() {
    const raw = String(els.start?.value || '').trim();
    if (raw) {
      const ms = Date.parse(raw);
      if (Number.isFinite(ms)) return Math.floor(ms / 1000);
    }
    return Math.floor(Date.now() / 1000) - HISTORY_HOURS * 3600;
  }

  function periodLabel() {
    if (els.lookback?.value === 'all') return 'загруженный период';
    const hours = Number(els.lookback?.value) || HISTORY_HOURS;
    return `${hours} ч`;
  }

  function loadedRangeLabel() {
    const since = state.historySinceSec || getHistorySinceSec();
    return `${dateFmt.format(new Date(since * 1000))} → ${timeFmt.format(new Date())}`;
  }

  function setStatus(message, kind = '') {
    const cls = kind ? ` ${kind}` : '';
    els.status.innerHTML = `<span class="status-dot${cls}"></span>${escapeHtml(message)}`;
  }

  function renderReportStatus() {
    if (state.loading || state.auditLoading || (!state.demo && !state.proxyWallet)) return;
    const rows = getVisibleRows().filter(row => row.resolved && row.pnl != null);
    if (!rows.length) {
      setStatus(`${state.demo ? 'Demo · ' : ''}Visible ${state.timeframe} P&L: — · No included settled rounds.`);
      return;
    }
    const total = roundTo(rows.reduce((sum, row) => sum + row.pnl, 0), 8);
    const verified = rows.filter(row => row.auditStatus === 'verified').length;
    const mismatches = rows.filter(row => row.auditStatus === 'mismatch').length;
    const fallback = rows.filter(row => !row.calculationExact).length;
    setStatus(`${state.demo ? 'Demo · ' : ''}Visible ${state.timeframe} P&L: ${fmtMoney(total, true)} · ${rows.length} rounds · API✓ ${verified}${mismatches ? ` · mismatches ${mismatches}` : ''}${fallback ? ` · fallback ${fallback}` : ''}.`, mismatches ? 'loading' : 'ok');
  }

  function toast(message, kind = '') {
    const div = document.createElement('div');
    div.className = `toast${kind ? ' ' + kind : ''}`;
    div.textContent = message;
    els.toastWrap.appendChild(div);
    window.setTimeout(() => div.remove(), 4800);
  }

  async function fetchJson(url, options = {}) {
    const generation = state.generation;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), options.timeout || 22000);
    try {
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        credentials: 'omit',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
      if (generation !== state.generation) throw new Error('Report changed');
      if (options.allow404 && response.status === 404) return null;
      if (!response.ok) {
        let detail = '';
        try { detail = (await response.text()).slice(0, 180); } catch (_) {}
        throw new Error(`${options.label || 'API'}: HTTP ${response.status}${detail ? ` — ${detail}` : ''}`);
      }
      const payload = await response.json();
      if (generation !== state.generation) throw new Error('Report changed');
      return payload;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error(`${options.label || 'API'}: превышено время ожидания`);
      if (error instanceof TypeError) {
        throw new Error(`${options.label || 'API'} недоступен из браузера. Check that this website’s server can reach Polymarket.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function resolveProfile(address) {
    const url = new URL(`${GAMMA_API}/public-profile`);
    url.searchParams.set('address', address);
    const profile = await fetchJson(url.toString(), { label: 'Профиль', allow404: true });
    let proxyWallet = extractAddress(profile?.proxyWallet) || address;
    let warning = '';
    if (proxyWallet.toLowerCase() !== address.toLowerCase()) {
      // An explicit trading wallet may have activity while its profile points at a newer,
      // empty proxy. Confirm the input before replacing the address the user requested.
      const activityUrl = new URL(`${DATA_API}/activity`);
      for (const [key,value] of Object.entries({user:address,type:'TRADE',limit:1,sortBy:'TIMESTAMP',sortDirection:'DESC'})) activityUrl.searchParams.set(key,String(value));
      try {
        const activity = await fetchJson(activityUrl.toString(), {label:'Wallet activity check',timeout:12000});
        if (!Array.isArray(activity)) throw new Error('Unexpected wallet activity response');
        const activeInput = activity.some(row => row?.type === 'TRADE'
          && String(row.proxyWallet || '').toLowerCase() === address.toLowerCase()
          && normalizeTimestamp(row.timestamp) > 0);
        if (activeInput) proxyWallet = address;
      } catch (error) {
        if (error?.message === 'Report changed') throw error;
        proxyWallet = address;
        warning = 'Profile wallet mapping could not be verified. Analyzing the entered address; load its proxy address directly if needed.';
      }
    }
    return {
      proxyWallet,
      name: profile?.name || profile?.pseudonym || '',
      profile, warning
    };
  }

  function invalidFillReason(t, feeConfig = null) {
    if (!t || typeof t !== 'object') return 'Malformed fill';
    if (!['BUY','SELL'].includes(String(t.side || '').toUpperCase())) return 'Unknown trade side';
    if (!['Up','Down'].includes(normalizeOutcome(t.outcome))) return 'Unknown outcome';
    if (nullableNumber(t.price) == null || Number(t.price) <= 0 || Number(t.price) >= 1) return 'Invalid fill price';
    if (nullableNumber(t.size) == null || Number(t.size) <= 0) return 'Invalid fill size';
    if (!normalizeTimestamp(t.timestamp)) return 'Missing fill timestamp';
    if (!/^0x[a-f0-9]{64}$/i.test(String(t.conditionId || ''))) return 'Missing condition ID';
    if (t.usdcSize != null && (nullableNumber(t.usdcSize) == null || Number(t.usdcSize) < 0)) return 'Invalid fill notional';
    // Cash consistency depends on this market's schedule, which arrives after fill normalization.
    // A fallback estimate cannot prove that a historical cash amount is corrupt.
    if (feeConfig?.exact && !notionalEvidence(t, feeConfig).consistent) return 'Inconsistent fill notional';
    return '';
  }

  function notionalEvidence(trade, feeConfig = DEFAULT_CRYPTO_FEE) {
    const size = Math.max(0, asNumber(trade?.size));
    const price = Math.max(0, asNumber(trade?.price));
    const computed = size * price;
    const explicit = nullableNumber(trade?.usdcSize);
    const fee = feeForTrade({...trade, _isTaker:true}, feeConfig);
    const tolerance = Math.max(0.005, computed * 0.005);
    // Activity may expose bare notional or fee-inclusive cash. Only the side-correct
    // adjustment is valid: BUY adds the fee; SELL subtracts it.
    const cashWithFee = computed + (String(trade?.side || '').toUpperCase() === 'SELL' ? -fee : fee);
    const gap = explicit == null ? null : Math.min(Math.abs(explicit - computed), Math.abs(explicit - cashWithFee));
    return { computed, explicit, fee, tolerance, gap, consistent: gap == null || gap <= tolerance };
  }

  function normalizeTradeRecord(record) {
    return {
      ...record,
      _invalid: (record?._invalid && record._invalid !== 'Inconsistent fill notional' ? record._invalid : '') || invalidFillReason(record),
      timestamp: normalizeTimestamp(record.timestamp),
      size: asNumber(record.size),
      price: asNumber(record.price),
      usdcSize: nullableNumber(record.usdcSize) ?? undefined,
      side: String(record.side || 'BUY').toUpperCase(),
      outcome: normalizeOutcome(record.outcome),
      conditionId: String(record.conditionId || '').toLowerCase()
    };
  }

  function tradeNotional(trade) {
    const { computed, explicit, tolerance, consistent } = notionalEvidence(trade);
    if (explicit != null && explicit >= 0) {
      // Only usdcSize is available when size or price is missing; otherwise size x price is the
      // notional the settlement model expects, and usdcSize would double-count the modeled fee.
      if (!computed) return explicit;
      if (!consistent && Math.abs(explicit - computed) <= tolerance) return explicit;
    }
    return computed;
  }

  function explicitTradeId(trade) {
    const direct = trade?.id ?? trade?.tradeId ?? trade?.trade_id ?? trade?.activityId ?? trade?.activity_id;
    if (direct != null && String(direct)) return `id:${String(direct)}`;
    const logIndex = trade?.logIndex ?? trade?.log_index;
    if (trade?.transactionHash && logIndex != null) return `log:${trade.transactionHash}:${logIndex}`;
    return '';
  }

  function tradeFingerprint(trade) {
    return [
      trade.transactionHash || '', trade.conditionId || '', trade.asset || '',
      normalizeTimestamp(trade.timestamp), String(trade.side || '').toUpperCase(),
      normalizeOutcome(trade.outcome), asNumber(trade.size), asNumber(trade.price),
      Number.isFinite(Number(trade.usdcSize)) ? Number(trade.usdcSize) : ''
    ].join('|');
  }

  function tradeKey(trade) {
    return trade?._tradeKey || explicitTradeId(trade) || `${tradeFingerprint(trade)}|occ:0`;
  }

  // Не схлопываем два легитимных одинаковых fills в одной транзакции.
  // Для записей без уникального id сохраняется порядковый номер одинакового fingerprint.
  function prepareTradeBatch(rows) {
    const normalized = (rows || []).map((raw, index) => ({ ...normalizeTradeRecord(raw), _sourceIndex: index }));
    const explicitSeen = new Set();
    const filtered = normalized.filter(row => {
      const id = explicitTradeId(row);
      if (!id) return true;
      if (explicitSeen.has(id)) return false;
      explicitSeen.add(id);
      return true;
    });
    filtered.sort((a, b) => normalizeTimestamp(b.timestamp) - normalizeTimestamp(a.timestamp) || a._sourceIndex - b._sourceIndex);
    const occurrences = new Map();
    return filtered.map(row => {
      const explicit = explicitTradeId(row);
      let key = explicit;
      if (!key) {
        const fingerprint = tradeFingerprint(row);
        const occurrence = occurrences.get(fingerprint) || 0;
        occurrences.set(fingerprint, occurrence + 1);
        key = `${fingerprint}|occ:${occurrence}`;
      }
      const { _sourceIndex, ...clean } = row;
      return { ...clean, _tradeKey: key };
    });
  }

  function dedupeTrades(rows) {
    return prepareTradeBatch(rows);
  }

  async function fetchActivityPage(user, startSec, endSec, offset, limit = ACTIVITY_PAGE_SIZE) {
    const url = new URL(`${DATA_API}/activity`);
    url.searchParams.set('user', user);
    url.searchParams.append('type', 'TRADE');
    url.searchParams.set('start', String(Math.max(0, Math.floor(startSec))));
    url.searchParams.set('end', String(Math.max(0, Math.floor(endSec))));
    url.searchParams.set('sortBy', 'TIMESTAMP');
    url.searchParams.set('sortDirection', 'DESC');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));
    return fetchJson(url.toString(), { label: 'Лента сделок', timeout: 30000 });
  }

  async function fetchActivityWindow(user, sinceSec, endSec, types = ['TRADE']) {
    let requests = 0, complete = true;
    const all = [];
    async function visit(lo, hi) {
      if (++requests > 400) { complete = false; return; }
      const url = new URL(`${DATA_API}/activity`);
      for (const [key,value] of Object.entries({user,start:lo,end:hi,sortBy:'TIMESTAMP',sortDirection:'DESC',limit:ACTIVITY_PAGE_SIZE,offset:0})) url.searchParams.set(key,String(value));
      url.searchParams.set('type',types.join(','));
      const first = await fetchJson(url.toString(), {label:'Activity history',timeout:30000});
      if (!Array.isArray(first)) throw new Error('Activity API returned an invalid response');
      if (first.length === ACTIVITY_PAGE_SIZE && hi-lo > 300) {
        const mid = Math.floor((lo+hi)/2);
        await visit(mid+1,hi); await visit(lo,mid); return;
      }
      const rows = [...first];
      if (first.length === ACTIVITY_PAGE_SIZE) {
        for (let offset=ACTIVITY_PAGE_SIZE;offset<=ACTIVITY_MAX_OFFSET;offset+=ACTIVITY_PAGE_SIZE) {
          if (++requests > 400) { complete=false; break; }
          url.searchParams.set('offset',String(offset));
          const page = await fetchJson(url.toString(), {label:'Activity history',timeout:30000});
          if (!Array.isArray(page)) throw new Error('Activity API returned an invalid response');
          rows.push(...page);
          if (page.length < ACTIVITY_PAGE_SIZE) break;
          if (offset === ACTIVITY_MAX_OFFSET) {
            if (lo < hi) { const mid=Math.floor((lo+hi)/2); await visit(mid+1,hi); await visit(lo,mid); return; }
            complete=false;
          }
        }
      }
      all.push(...rows);
    }
    await visit(Math.floor(sinceSec),Math.floor(endSec));
    return {rows:all,complete};
  }

  async function fetchActivityHistory(user, sinceSec, endSec) {
    const result=await fetchActivityWindow(user,sinceSec,endSec);
    state.truncatedTrades = state.truncatedTrades || !result.complete;
    return dedupeTrades(result.rows).filter(row=>row.timestamp>=sinceSec && row.timestamp<=endSec && isBtcMarket(row));
  }

  async function fetchRecentActivity(user, sinceSec, endSec) {
    return fetchActivityHistory(user,sinceSec,endSec);
  }

  async function fetchTradesFallback(user, sinceSec) {
    const all = [];
    for (let offset = 0; offset <= 1000; offset += 500) {
      const url = new URL(`${DATA_API}/trades`);
      url.searchParams.set('user', user);
      url.searchParams.set('limit', '500');
      url.searchParams.set('offset', String(offset));
      url.searchParams.set('takerOnly', 'false');
      url.searchParams.set('start', String(sinceSec));
      url.searchParams.set('end', String(Math.floor(Date.now()/1000)));
      const page = await fetchJson(url.toString(), { label: 'История сделок', timeout: 30000 });
      if (!Array.isArray(page)) throw new Error('История сделок: неожиданный ответ API');
      all.push(...page);
      if (page.length < 500) break;
      const oldest = page.reduce((min, item) => Math.min(min, normalizeTimestamp(item.timestamp) || Infinity), Infinity);
      if (oldest <= sinceSec) break;
      if (offset === 1000) state.truncatedTrades = true;
    }
    return dedupeTrades(all).filter(row => normalizeTimestamp(row.timestamp) >= sinceSec && isBtcMarket(row));
  }

  async function fetchTradeHistory(user, sinceSec, endSec) {
    try {
      return await fetchActivityHistory(user, sinceSec, endSec);
    } catch (error) {
      if (error?.message === 'Report changed') throw error;
      console.warn('Activity endpoint failed, falling back to /trades:', error);
      toast('Основная лента недоступна — использую резервный endpoint /trades.');
      state.truncatedTrades = true;
      return fetchTradesFallback(user, sinceSec);
    }
  }


  async function fetchTakerTradeHistory(user, sinceSec, maxOffset = TAKER_MAX_OFFSET) {
    const all = [];
    let complete = false;
    const coverageEnd = Math.floor(Date.now()/1000);
    for (let offset = 0; offset <= maxOffset; offset += TAKER_PAGE_SIZE) {
      const url = new URL(`${DATA_API}/trades`);
      url.searchParams.set('user', user);
      url.searchParams.set('limit', String(TAKER_PAGE_SIZE));
      url.searchParams.set('offset', String(offset));
      url.searchParams.set('takerOnly', 'true');
      url.searchParams.set('start', String(sinceSec));
      url.searchParams.set('end', String(coverageEnd));
      const page = await fetchJson(url.toString(), { label: 'Taker fills', timeout: 30000 });
      if (!Array.isArray(page)) throw new Error('Taker fills: неожиданный ответ API');
      all.push(...page);
      const timestamps = page.map(row => normalizeTimestamp(row.timestamp)).filter(Boolean);
      const oldest = timestamps.length ? Math.min(...timestamps) : Infinity;
      if (page.length < TAKER_PAGE_SIZE) {
        complete = true;
        break;
      }
    }
    return {
      trades: prepareTradeBatch(all).filter(row => normalizeTimestamp(row.timestamp) >= sinceSec && isBtcMarket(row)),
      complete, coverageEnd
    };
  }

  function takerFingerprint(trade, includeTimestamp = true) {
    const fixed = value => asNumber(value).toFixed(8);
    return [
      String(trade?.transactionHash || '').toLowerCase(),
      String(trade?.conditionId || '').toLowerCase(),
      String(trade?.asset || ''),
      String(trade?.side || 'BUY').toUpperCase(),
      normalizeOutcome(trade?.outcome),
      fixed(trade?.size), fixed(trade?.price),
      includeTimestamp ? normalizeTimestamp(trade?.timestamp) : ''
    ].join('|');
  }

  function countFingerprints(rows, includeTimestamp) {
    const counts = new Map();
    for (const row of rows || []) {
      const key = takerFingerprint(row, includeTimestamp);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }

  function consumeFingerprint(counts, key) {
    const count = counts.get(key) || 0;
    if (!count) return false;
    if (count === 1) counts.delete(key); else counts.set(key, count - 1);
    return true;
  }

  function classifyTakerTrades() {
    const buckets = new Map();
    for (const t of state.takerTrades || []) {
      const key=takerFingerprint(t,false);
      if (!buckets.has(key)) buckets.set(key,[]);
      buckets.get(key).push(t);
    }
    let classified=0, assumed=0;
    state.allTrades=(state.allTrades || []).map(trade=>{
      const pool=buckets.get(takerFingerprint(trade,false)) || [];
      const exactIndex=pool.findIndex(t=>takerFingerprint(t,true)===takerFingerprint(trade,true));
      let isTaker=null, source='Unknown role · conservative taker estimate';
      if (pool.length) { pool.splice(exactIndex<0 ? 0 : exactIndex,1); isTaker=true; source=exactIndex<0?'takerOnly API · timestamp mismatch':'takerOnly API'; classified++; }
      else if (state.takerHistoryComplete && trade.timestamp<=state.takerCoverageEnd) { isTaker=false; source='Maker · absent from complete taker snapshot'; classified++; }
      else assumed++;
      return {...trade,_isTaker:isTaker,_takerSource:source};
    });
    state.takerClassifiedCount=classified; state.takerAssumedCount=assumed;
  }

  function mergeTakerTrades(existing, incoming) {
    const map=new Map();
    for (const rows of [existing,incoming]) for (const row of prepareTradeBatch(rows || [])) map.set(tradeKey(row),row);
    return [...map.values()].filter(isBtcMarket);
  }

  async function fetchCurrentPositions(user) {
    const all = [];

    async function fetchPositionSlice(redeemableOnly) {
      const rows = [];
      for (let offset = 0; offset <= 10000; offset += 500) {
        const url = new URL(`${DATA_API}/positions`);
        url.searchParams.set('user', user);
        url.searchParams.set('sizeThreshold', '0');
        if (redeemableOnly) url.searchParams.set('redeemable', 'true');
        url.searchParams.set('limit', '500');
        url.searchParams.set('offset', String(offset));
        url.searchParams.set('sortBy', 'RESOLVING');
        url.searchParams.set('sortDirection', 'DESC');
        const page = await fetchJson(url.toString(), {
          label: redeemableOnly ? 'Позиции для claim' : 'Открытые позиции'
        });
        if (!Array.isArray(page)) throw new Error('Открытые позиции: неожиданный ответ API');
        rows.push(...page);
        if (page.length < 500) break;
      }
      return rows;
    }

    const results = await Promise.allSettled([
      fetchPositionSlice(false),
      fetchPositionSlice(true)
    ]);
    for (const result of results) {
      if (result.status === 'fulfilled') all.push(...result.value);
      else console.warn('Positions slice failed:', result.reason);
    }
    if (!all.length && results.every(result => result.status === 'rejected')) {
      throw results[0].reason;
    }
    return mergePositionRows([], all);
  }

  async function fetchClosedPositions(user, sinceSec, maxPages = 32) {
    const all = [];
    for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
      const url = new URL(`${DATA_API}/closed-positions`);
      url.searchParams.set('user', user);
      url.searchParams.set('limit', '50');
      url.searchParams.set('offset', String(pageIndex * 50));
      url.searchParams.set('sortBy', 'TIMESTAMP');
      url.searchParams.set('sortDirection', 'DESC');
      const page = await fetchJson(url.toString(), { label: 'Закрытые позиции' });
      if (!Array.isArray(page)) throw new Error('Закрытые позиции: неожиданный ответ API');
      all.push(...page);
      if (page.length < 50) break;
      const timestamps = page.map(item => normalizeTimestamp(item.timestamp)).filter(Boolean);
      if (timestamps.length && Math.min(...timestamps) < sinceSec - 3600) break;
    }
    return mergePositionRows([], all);
  }

  function addMarketToMap(map, market, fallbackId = '') {
    if (!market || typeof market !== 'object') return;
    const id = String(market.conditionId || market.condition_id || fallbackId || '').toLowerCase();
    if (id) map.set(id, market);
  }

  async function fetchGammaMarketsBatch(ids, closed) {
    if (!ids.length) return [];
    const url = new URL(`${GAMMA_API}/markets`);
    url.searchParams.set('condition_ids', ids.join(','));
    url.searchParams.set('closed', String(Boolean(closed)));
    url.searchParams.set('limit', String(Math.max(50, ids.length + 5)));
    const result = await fetchJson(url.toString(), {
      label: closed ? 'Завершённые рынки' : 'Активные рынки',
      timeout: 30000
    });
    return Array.isArray(result) ? result : [];
  }

  async function fetchMarketBySlug(slug) {
    if (!slug) return null;
    const url = `${GAMMA_API}/markets/slug/${encodeURIComponent(slug)}`;
    const result = await fetchJson(url, { label: 'Рынок по slug', allow404: true, timeout: 22000 });
    return result && typeof result === 'object' && !Array.isArray(result) ? result : null;
  }

  async function fetchMarketFromEventSlug(slug, conditionId) {
    if (!slug) return null;
    const url = `${GAMMA_API}/events/slug/${encodeURIComponent(slug)}`;
    const event = await fetchJson(url, { label: 'Событие по slug', allow404: true, timeout: 22000 });
    const markets = Array.isArray(event?.markets) ? event.markets : [];
    return markets.find(market => String(market.conditionId || market.condition_id || '').toLowerCase() === conditionId)
      || markets[0]
      || null;
  }

  async function fetchMarkets(records) {
    const map = new Map();
    const hintsById = new Map();

    for (const record of records || []) {
      const hint = typeof record === 'string'
        ? { conditionId: record, slug: '', eventSlug: '' }
        : {
            conditionId: record?.conditionId || record?.condition_id || '',
            slug: record?.slug || '',
            eventSlug: record?.eventSlug || record?.event_slug || ''
          };
      const id = String(hint.conditionId || '').toLowerCase();
      if (!id) continue;
      const previous = hintsById.get(id) || { conditionId: id, slug: '', eventSlug: '' };
      hintsById.set(id, {
        conditionId: id,
        slug: previous.slug || hint.slug || '',
        eventSlug: previous.eventSlug || hint.eventSlug || ''
      });
    }

    const ids = [...hintsById.keys()];
    const chunks = [];
    for (let i = 0; i < ids.length; i += 35) chunks.push(ids.slice(i, i + 35));

    // В Gamma API closed по умолчанию равен false. Поэтому исторические и активные
    // рынки запрашиваются отдельно, иначе завершённые BTC окна не попадают в ответ.
    for (const chunk of chunks) {
      const results = await Promise.allSettled([
        fetchGammaMarketsBatch(chunk, false),
        fetchGammaMarketsBatch(chunk, true)
      ]);
      for (const result of results) {
        if (result.status !== 'fulfilled') {
          if (result.reason?.message === 'Report changed') throw result.reason;
          console.warn('Market batch failed:', result.reason);
          continue;
        }
        result.value.forEach(market => addMarketToMap(map, market));
      }
    }

    // Надёжный fallback: прямой endpoint по slug возвращает и закрытые рынки.
    const missing = [...hintsById.values()].filter(hint => !map.has(hint.conditionId));
    const concurrency = 8;
    for (let i = 0; i < missing.length; i += concurrency) {
      const part = missing.slice(i, i + concurrency);
      const results = await Promise.all(part.map(async hint => {
        const slugs = [...new Set([hint.slug, hint.eventSlug].filter(Boolean))];
        for (const slug of slugs) {
          try {
            const market = await fetchMarketBySlug(slug);
            if (market) return { market, fallbackId: hint.conditionId };
          } catch (error) {
            if (error?.message === 'Report changed') throw error;
            console.warn(`Slug market fetch failed for ${slug}:`, error);
          }
        }
        if (hint.eventSlug) {
          try {
            const market = await fetchMarketFromEventSlug(hint.eventSlug, hint.conditionId);
            if (market) return { market, fallbackId: hint.conditionId };
          } catch (error) {
            if (error?.message === 'Report changed') throw error;
            console.warn(`Event market fetch failed for ${hint.eventSlug}:`, error);
          }
        }

        // Последний fallback для записей без slug.
        for (const closed of [true, false]) {
          try {
            const rows = await fetchGammaMarketsBatch([hint.conditionId], closed);
            const market = rows.find(row => String(row.conditionId || row.condition_id || '').toLowerCase() === hint.conditionId);
            if (market) return { market, fallbackId: hint.conditionId };
          } catch (_) {}
        }
        return null;
      }));
      results.forEach(result => {
        if (result?.market) addMarketToMap(map, result.market, result.fallbackId);
      });
    }

    return map;
  }

  function mergeMarketMaps(target, source) {
    const merged = new Map(target || []);
    for (const [key, value] of source || []) merged.set(String(key).toLowerCase(), value);
    return merged;
  }


  async function fetchClobMarketInfo(conditionId) {
    const id = String(conditionId || '').toLowerCase();
    if (!/^0x[a-f0-9]{64}$/.test(id)) return null;
    return fetchJson(`${CLOB_API}/clob-markets/${encodeURIComponent(id)}`, {
      label: 'Fee parameters', allow404: true, timeout: 22000
    });
  }

  async function fetchClobMarketInfos(records) {
    const ids = [...new Set((records || []).map(record =>
      String(typeof record === 'string' ? record : record?.conditionId || '').toLowerCase()
    ).filter(id => /^0x[a-f0-9]{64}$/.test(id)))];
    const result = new Map();
    let cursor = 0;
    const worker = async () => {
      while (cursor < ids.length) {
        const id = ids[cursor++];
        try {
          result.set(id, await fetchClobMarketInfo(id));
        } catch (error) {
          if (error?.message === 'Report changed') throw error;
          console.warn(`Fee info failed for ${id}:`, error);
          result.set(id, null);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(10, ids.length || 1) }, worker));
    return result;
  }

  function positionKey(row) {
    const condition = String(row?.conditionId || '').toLowerCase();
    const asset = String(row?.asset || row?.token || '');
    const outcome = normalizeOutcome(row?.outcome || '');
    return `${condition}|${asset || outcome}`;
  }

  function positionField(row, camel, snake) {
    const direct = nullableNumber(row?.[camel]);
    if (direct != null) return direct;
    return nullableNumber(row?.[snake]);
  }

  function positionTotalPnl(row, closedOnly = false) {
    const direct = positionField(row, 'totalPnl', 'total_pnl');
    if (direct != null) return direct;
    const realized = positionField(row, 'realizedPnl', 'realized_pnl');
    if (closedOnly) return realized;
    const cash = positionField(row, 'cashPnl', 'cash_pnl');
    if (cash == null && realized == null) return null;
    return (cash ?? 0) + (realized ?? 0);
  }

  function positionPnlEvidence(row) {
    return {
      total: positionField(row, 'totalPnl', 'total_pnl'),
      cash: positionField(row, 'cashPnl', 'cash_pnl'),
      realized: positionField(row, 'realizedPnl', 'realized_pnl')
    };
  }

  function mergePositionRows(existing, incoming) {
    const map = new Map();
    for (const row of [...(existing || []), ...(incoming || [])]) {
      const key = positionKey(row);
      if (key === '|Unknown') continue;
      const previous = map.get(key);
      if (!previous) {
        map.set(key, row);
        continue;
      }
      const prevTs = normalizeTimestamp(previous.timestamp) || Date.parse(previous.endDate || '') / 1000 || 0;
      const nextTs = normalizeTimestamp(row.timestamp) || Date.parse(row.endDate || '') / 1000 || 0;
      if (nextTs >= prevTs) map.set(key, row);
    }
    return [...map.values()];
  }

  function flattenMarketPositionResponse(payload, user) {
    const wallet = String(user || '').toLowerCase();
    const rows = [];
    for (const bucket of Array.isArray(payload) ? payload : []) {
      for (const raw of Array.isArray(bucket?.positions) ? bucket.positions : []) {
        const proxy = String(raw?.proxyWallet || '').toLowerCase();
        if (wallet && proxy && proxy !== wallet) continue;
        const total = positionTotalPnl(raw);
        const normalized = {
          ...raw,
          asset: String(raw.asset || bucket.token || ''),
          conditionId: String(raw.conditionId || '').toLowerCase(),
          curPrice: nullableNumber(raw.curPrice) ?? nullableNumber(raw.currPrice),
          currPrice: nullableNumber(raw.currPrice)
        };
        // Never manufacture totalPnl=0 when all PnL fields are absent.
        if (total != null && positionField(raw, 'totalPnl', 'total_pnl') == null) normalized.totalPnl = total;
        rows.push(normalized);
      }
    }
    return mergePositionRows([], rows);
  }

  async function fetchExactMarketPnl(user, conditionId) {
    const url = new URL(`${DATA_API}/v1/market-positions`);
    url.searchParams.set('market', conditionId);
    url.searchParams.set('user', user);
    url.searchParams.set('status', 'ALL');
    url.searchParams.set('sortBy', 'TOTAL_PNL');
    url.searchParams.set('sortDirection', 'DESC');
    url.searchParams.set('limit', '500');
    url.searchParams.set('offset', '0');
    const payload = await fetchJson(url.toString(), { label: 'Точная сверка P&L', timeout: 30000 });
    const rows = flattenMarketPositionResponse(payload, user);
    const explicit = rows.map(row => positionTotalPnl(row)).filter(value => value != null && Number.isFinite(value));
    if (!rows.length || !explicit.length) {
      return { ok: false, finalized: false, winner: '', pnl: null, rows, reason: 'PnL fields ещё не заполнены', fetchedAt: Date.now() };
    }
    const pnl = roundTo(explicit.reduce((sum, value) => sum + value, 0), 8);
    const winner = inferWinnerFromPositions(rows, true);
    const evidence = rows.map(positionPnlEvidence);
    const allPnlFieldsZero = explicit.every(value => Math.abs(value) < 1e-9);
    return {
      ok: true,
      finalized: Boolean(winner),
      winner,
      pnl,
      rows,
      evidence,
      allPnlFieldsZero,
      reason: '',
      fetchedAt: Date.now(),
      source: 'market-positions totalPnl'
    };
  }

  async function verifyMarketPnls(groups, { force = false, silent = false, recentOnly = false } = {}) {
    if (state.demo || !state.proxyWallet || state.auditLoading) return;
    const nowSec = Math.floor(Date.now() / 1000);
    const generation=state.generation, wallet=state.proxyWallet;
    const unique = new Map();
    for (const group of groups || []) {
      const conditionId = String(group.conditionId || '').toLowerCase();
      if (!/^0x[a-f0-9]{64}$/.test(conditionId)) continue;
      const endSec = (group.startSec || 0) + getTimeframe().seconds;
      if (!group.startSec || endSec > nowSec - 5) continue;
      if (recentOnly && endSec < nowSec - 1800) continue;
      const cached = state.marketPnlCache.get(conditionId);
      const fresh = cached && Date.now() - asNumber(cached.fetchedAt) < (recentOnly ? 30000 : 10 * 60 * 1000);
      if (!force && fresh && cached.ok && cached.finalized) continue;
      unique.set(conditionId, group);
    }
    const targets = [...unique.values()];
    if (!targets.length) return;

    state.auditLoading = true;
    state.auditCompleted = 0;
    state.auditFailed = 0;
    els.audit.disabled = true;
    els.audit.textContent = 'Сверяю…';
    let cursor = 0;

    const updateProgress = () => {
      if (generation!==state.generation) return;
      if (!silent) setStatus(`Сверка P&L по каждому рынку: ${state.auditCompleted}/${targets.length}…`, 'loading');
      refreshRowsFromCache();
      renderMetrics();
      renderRows();
      renderChart();
    };

    const worker = async () => {
      while (generation===state.generation && cursor < targets.length) {
        const index = cursor++;
        const group = targets[index];
        const conditionId = String(group.conditionId).toLowerCase();
        try {
          const result = await fetchExactMarketPnl(wallet, conditionId);
          if (generation!==state.generation) return;
          state.marketPnlCache.set(conditionId, result);
          if (!result.ok) state.auditFailed++;
        } catch (error) {
          if (generation!==state.generation) return;
          state.marketPnlCache.set(conditionId, { ok: false, finalized: false, winner: '', pnl: null, rows: [], reason: error?.message || 'API error', fetchedAt: Date.now() });
          state.auditFailed++;
          console.warn(`Exact P&L audit failed for ${conditionId}:`, error);
        } finally {
          if (generation!==state.generation) return;
          state.auditCompleted++;
          if (state.auditCompleted === targets.length || state.auditCompleted % 4 === 0) updateProgress();
        }
      }
    };

    try {
      await Promise.all(Array.from({ length: Math.min(MARKET_PNL_CONCURRENCY, targets.length) }, worker));
    } finally {
      if (generation!==state.generation) return;
      state.auditLoading = false;
      els.audit.disabled = !state.proxyWallet || state.demo;
      els.audit.textContent = 'Перепроверить P&L';
      refreshRowsFromCache();
      renderMetrics();
      renderRows();
      renderChart();
      renderReportStatus();
    }
  }

  function buildGroups(trades, sinceSec) {
    const groups = new Map();
    for (const trade of trades) {
      const ts = normalizeTimestamp(trade.timestamp);
      if (!ts || ts < sinceSec - getTimeframe().seconds || !isBtcMarket(trade)) continue;
      const conditionId = String(trade.conditionId || '').toLowerCase();
      const eventSlug = trade.eventSlug || trade.slug || '';
      const key = conditionId || eventSlug;
      if (!key) continue;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          conditionId,
          eventSlug,
          slug: trade.slug || eventSlug,
          title: trade.title || `Bitcoin Up or Down — ${state.timeframe}`,
          startSec: getStartSec(trade),
          trades: []
        });
      }
      const group = groups.get(key);
      group.trades.push(trade);
      if (!group.startSec) group.startSec = getStartSec(trade);
      if (!group.title && trade.title) group.title = trade.title;
    }
    return [...groups.values()].filter(group => group.startSec && group.startSec + getTimeframe().seconds >= sinceSec);
  }

  function indexRows(rows) {
    const byAsset = new Map();
    const byCondition = new Map();
    const byOutcome = new Map();
    for (const row of rows || []) {
      const condition = String(row.conditionId || '').toLowerCase();
      const asset = String(row.asset || '');
      const outcome = normalizeOutcome(row.outcome);
      if (!condition) continue;
      if (asset) {
        const assetKey = `${condition}|${asset}`;
        if (!byAsset.has(assetKey)) byAsset.set(assetKey, []);
        byAsset.get(assetKey).push(row);
      }
      if (outcome === 'Up' || outcome === 'Down') {
        const outcomeKey = `${condition}|${outcome}`;
        if (!byOutcome.has(outcomeKey)) byOutcome.set(outcomeKey, []);
        byOutcome.get(outcomeKey).push(row);
      }
      if (!byCondition.has(condition)) byCondition.set(condition, []);
      byCondition.get(condition).push(row);
    }
    return { byAsset, byCondition, byOutcome };
  }

  function aggregateSide(group, desiredOutcome) {
    const rows = group.trades.filter(t => normalizeOutcome(t.outcome) === desiredOutcome);
    const buys = rows.filter(t => String(t.side || 'BUY').toUpperCase() === 'BUY');
    const sells = rows.filter(t => String(t.side || '').toUpperCase() === 'SELL');
    const buyShares = buys.reduce((sum, t) => sum + asNumber(t.size), 0);
    const sellShares = sells.reduce((sum, t) => sum + asNumber(t.size), 0);
    const buyNotional = buys.reduce((sum, t) => sum + tradeNotional(t), 0);
    const sellNotional = sells.reduce((sum, t) => sum + tradeNotional(t), 0);
    const buyOps = new Set(buys.map((t, i) => t.transactionHash || `${tradeKey(t)}-${i}`));
    const sellOps = new Set(sells.map((t, i) => t.transactionHash || `${tradeKey(t)}-${i}`));
    return {
      rows, buys, sells,
      fills: rows.length,
      buyFills: buys.length,
      sellFills: sells.length,
      buyOps: buyOps.size,
      sellOps: sellOps.size,
      buyShares, sellShares,
      netShares: buyShares - sellShares,
      buyNotional, sellNotional,
      avgBuy: buyShares > 0 ? buyNotional / buyShares : 0,
      avgSell: sellShares > 0 ? sellNotional / sellShares : 0,
      lastTradeSec: rows.reduce((max, t) => Math.max(max, normalizeTimestamp(t.timestamp)), 0)
    };
  }

  function marketResolutionEvidence(market) {
    if (!market) return {winner:'', conflict:false};
    const candidates = [];
    for (const value of [market.winner,market.resolution,market.result,market.resolvedOutcome,market.resolutionOutcome,market.winningOutcome]) {
      const outcome=normalizeOutcome(value); if (['Up','Down'].includes(outcome)) candidates.push(outcome);
    }
    for (const token of parseJsonArray(market.tokens)) if (asBool(token?.winner)) candidates.push(normalizeOutcome(token.outcome));
    const prices=readOutcomePriceMap(market);
    const finalPair=(prices.Up===1 && prices.Down===0) || (prices.Up===0 && prices.Down===1);
    const finalStatus=asBool(market.resolved) || String(market.umaResolutionStatus || market.resolutionStatus || '').toLowerCase()==='resolved';
    // Preserve contradictions as evidence; an empty winner must not make a conflict
    // disappear when another endpoint supplies a redeemable position.
    if (finalPair && (finalStatus || candidates.length)) candidates.push(prices.Up===1?'Up':'Down');
    const valid=[...new Set(candidates.filter(outcome=>['Up','Down'].includes(outcome)))];
    return {winner:valid.length===1?valid[0]:'', conflict:valid.length>1};
  }

  function marketWinner(market) {
    return marketResolutionEvidence(market).winner;
  }

  function readOutcomePriceMap(market) {
    const map = { Up: null, Down: null };
    if (!market) return map;
    const outcomes = parseJsonArray(market.outcomes).map(normalizeOutcome);
    const prices = parseJsonArray(market.outcomePrices).map(value => nullableNumber(value));
    if (outcomes.length && outcomes.length === prices.length) {
      outcomes.forEach((outcome, index) => {
        if ((outcome === 'Up' || outcome === 'Down') && prices[index] != null) map[outcome] = prices[index];
      });
    }
    const tokens = Array.isArray(market.tokens) ? market.tokens : parseJsonArray(market.tokens);
    for (const token of tokens || []) {
      const outcome = normalizeOutcome(token?.outcome || token?.name || token?.label || '');
      const price = nullableNumber(token?.price ?? token?.lastPrice ?? token?.last_price);
      if ((outcome === 'Up' || outcome === 'Down') && map[outcome] == null && price != null) map[outcome] = price;
    }
    return map;
  }

  function positionResolutionEvidence(positionRows) {
    const winners = new Set();
    for (const row of positionRows || []) {
      if (!asBool(row.redeemable)) continue;
      const price=nullableNumber(row.curPrice) ?? nullableNumber(row.currPrice);
      const outcome=normalizeOutcome(row.outcome);
      if (!['Up','Down'].includes(outcome)) continue;
      if (price===1) winners.add(outcome);
      else if (price===0) winners.add(outcome==='Up'?'Down':'Up');
    }
    return {winner:winners.size===1?[...winners][0]:'', conflict:winners.size>1};
  }

  function inferWinnerFromPositions(positionRows) {
    return positionResolutionEvidence(positionRows).winner;
  }

  function nullableNumber(value) {
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function roundTo(value, decimals = 8) {
    const scale = 10 ** decimals;
    return Math.round((asNumber(value) + Number.EPSILON) * scale) / scale;
  }

  function feeConfigForMarket(conditionId, market) {
    const id = String(conditionId || '').toLowerCase();
    const info = state.clobMarkets.get(id);
    const fs = market?.feeSchedule;
    const fd = fs ? {r:fs.rate,e:fs.exponent,to:fs.takerOnly} : info?.fd;
    const rate = nullableNumber(fd?.r);
    const exponent = nullableNumber(fd?.e);
    if (rate != null && rate >= 0 && rate <= 1 && exponent != null && exponent >= 0 && exponent <= 5) {
      return {
        rate: Math.max(0, rate), exponent: Math.max(0, exponent),
        takerOnly: fd?.to !== false, source: fs ? 'Gamma feeSchedule' : 'CLOB fd', exact: true
      };
    }
    if (fd && (rate == null || exponent == null || rate<0 || rate>1 || exponent<0 || exponent>5)) return {...DEFAULT_CRYPTO_FEE, exact:false, invalid:true, source:'Invalid fee metadata'};
    const feeFlag = market?.feesEnabled ?? market?.fees_enabled;
    if (feeFlag !== undefined && !asBool(feeFlag)) {
      return { rate: 0, exponent: 1, takerOnly: true, source: 'Gamma: fees disabled', exact: true };
    }
    return { ...DEFAULT_CRYPTO_FEE, exact: false, source: 'BTC crypto fallback' };
  }

  function feeForTrade(trade, feeConfig) {
    if (trade?._isTaker === false && feeConfig?.takerOnly !== false) return 0;
    const rate = Math.max(0, asNumber(feeConfig?.rate));
    const exponent = Math.max(0, asNumber(feeConfig?.exponent, 1));
    const size = Math.max(0, asNumber(trade?.size));
    const p = asNumber(trade?.price, NaN);
    if (!Number.isFinite(p) || p <= 0 || p >= 1 || size <= 0 || rate <= 0) return 0;
    const raw = size * rate * Math.pow(p * (1 - p), exponent);
    return Math.round((raw + Number.EPSILON) * 100000) / 100000;
  }

  function calculateRoundSettlement(trades, winner, feeConfig) {
    const shares = { Up: 0, Down: 0 };
    let rawBuyNotional = 0;
    let rawSellNotional = 0;
    let buyCash = 0;
    let sellCash = 0;
    let totalFee = 0;
    let takerCount = 0;
    let makerCount = 0;
    let assumedTakerCount = 0;
    const fillBreakdown = [];
    let pathInventoryGap=false;
    const chronological=(trades || []).slice().sort((a,b)=>a.timestamp-b.timestamp || (a.side==='BUY'?-1:1));

    for (const trade of chronological) {
      const outcome = normalizeOutcome(trade.outcome);
      const side = String(trade.side || 'BUY').toUpperCase();
      const size = Math.max(0, asNumber(trade.size));
      const notional = Math.max(0, tradeNotional(trade));
      const fee = feeForTrade(trade, feeConfig);
      const isAssumed = trade._isTaker == null && feeConfig.rate > 0;
      if (trade._isTaker === true) takerCount++;
      else if (trade._isTaker === false) makerCount++;
      else assumedTakerCount++;

      let cashFlow = 0;
      if (side === 'SELL') {
        rawSellNotional += notional;
        sellCash += notional - fee;
        cashFlow = notional - fee;
        if (outcome === 'Up' || outcome === 'Down') shares[outcome] -= size;
      } else {
        rawBuyNotional += notional;
        buyCash += notional + fee;
        cashFlow = -(notional + fee);
        if (outcome === 'Up' || outcome === 'Down') shares[outcome] += size;
      }
      pathInventoryGap ||= shares.Up < -0.00001 || shares.Down < -0.00001;
      totalFee += fee;
      fillBreakdown.push({
        key: tradeKey(trade), trade, side, outcome, size,
        notional: roundTo(notional, 8), fee, cashFlow: roundTo(cashFlow, 8),
        role: trade._isTaker === true ? 'taker' : trade._isTaker === false ? 'maker' : 'assumed taker',
        assumed: isAssumed
      });
    }

    shares.Up = roundTo(shares.Up, 8);
    shares.Down = roundTo(shares.Down, 8);
    const inventoryGap = pathInventoryGap || shares.Up < -0.00001 || shares.Down < -0.00001;
    const winningShares = winner === 'Up' ? Math.max(0, shares.Up) : winner === 'Down' ? Math.max(0, shares.Down) : 0;
    const payout = roundTo(winningShares, 8);
    const cashFlow = roundTo(sellCash - buyCash, 8);
    const pnlWithoutFees = roundTo(rawSellNotional - rawBuyNotional + payout, 8);
    const pnl = roundTo(cashFlow + payout, 8);
    return {
      pnl, pnlWithoutFees, payout, winningShares,
      shares, inventoryGap, fillBreakdown,
      fee: roundTo(totalFee, 8), buyCash: roundTo(buyCash, 8), sellCash: roundTo(sellCash, 8), cashFlow,
      rawBuyNotional: roundTo(rawBuyNotional, 8), rawSellNotional: roundTo(rawSellNotional, 8),
      takerCount, makerCount, assumedTakerCount
    };
  }

  function estimateFee(trades, feeConfig = DEFAULT_CRYPTO_FEE) {
    return roundTo((trades || []).reduce((sum, trade) => sum + feeForTrade(trade, feeConfig), 0), 8);
  }

  function buildCumulativeSeries(rows, startSec) {
    const sorted = (rows || []).slice().sort((a, b) => a.endSec - b.endSec);
    const points = [{ row: null, timestamp: startSec, value: 0, roundPnl: 0, initial: true }];
    let total = 0;
    for (const row of sorted) {
      total = roundTo(total + asNumber(row.pnl), 8);
      points.push({ row, timestamp: row.endSec, value: total, roundPnl: asNumber(row.pnl), initial: false });
    }
    return points;
  }

  function runCalculationSelfTest() {
    const config = { rate: 0.07, exponent: 1, takerOnly: true, exact: true };
    const buy = { size: 10, price: 0.4, side: 'BUY', outcome: 'Up', _isTaker: true, timestamp: 1 };
    const sell = { size: 4, price: 0.6, side: 'SELL', outcome: 'Up', _isTaker: true, timestamp: 2 };
    const one = calculateRoundSettlement([buy], 'Up', config);
    const two = calculateRoundSettlement([buy, sell], 'Up', config);
    const series = buildCumulativeSeries([{ endSec: 1, pnl: 2 }, { endSec: 2, pnl: -1 }, { endSec: 3, pnl: 3 }], 0);
    const checks = [
      Math.abs(feeForTrade(buy, config) - 0.168) < 1e-9,
      Math.abs(one.pnl - 5.832) < 1e-9,
      Math.abs(two.pnl - 4.1648) < 1e-9,
      Math.abs((series.at(-1)?.value ?? NaN) - 4) < 1e-9
    ];
    if (checks.some(value => !value)) throw new Error('Внутренняя проверка формулы P&L не пройдена');
    return { ok: true, message: 'fee, settlement и cumulative: OK' };
  }

  function payoutClaimInfo(positionRows, winner, fallbackPayout) {
    if (!winner) return { status: 'none', label: 'ожидаем финальную цену 1/0', redeemableShares: 0, redeemableValue: 0 };
    const winningRows = (positionRows || []).filter(row => normalizeOutcome(row.outcome) === winner);
    const redeemableRows = winningRows.filter(row => asBool(row.redeemable));
    const redeemableShares = redeemableRows.reduce((sum, row) => sum + Math.max(0, asNumber(row.size)), 0);
    const redeemableValue = redeemableRows.reduce((sum, row) => {
      const currentValue = nullableNumber(row.currentValue);
      if (currentValue != null) return sum + Math.max(0, currentValue);
      return sum + Math.max(0, asNumber(row.size));
    }, 0);
    if (redeemableShares > 0.000001 || redeemableValue > 0.000001) {
      return {
        status: 'unclaimed',
        label: `не забрано · ${fmtShares(redeemableShares)} winning sh; payout уже учтён`,
        redeemableShares, redeemableValue: roundTo(redeemableValue, 8)
      };
    }
    return {
      status: 'included',
      label: fallbackPayout > 0 ? 'claim/redeem не меняет P&L; payout 1/0 учтён' : 'winning payout = $0',
      redeemableShares: 0, redeemableValue: 0
    };
  }

  function choosePositionRow(rows) {
    if (!rows?.length) return null;
    return rows.slice().sort((a, b) => {
      const aDirect = Number.isFinite(Number(a.totalPnl)) ? 1 : 0;
      const bDirect = Number.isFinite(Number(b.totalPnl)) ? 1 : 0;
      if (aDirect !== bDirect) return bDirect - aDirect;
      return normalizeTimestamp(b.timestamp) - normalizeTimestamp(a.timestamp);
    })[0];
  }

  function pickBestPositionRow(rows) {
    if (!rows?.length) return null;
    return rows.slice().sort((a, b) => {
      const totalDiff = asNumber(b.totalBought, -1) - asNumber(a.totalBought, -1);
      if (Math.abs(totalDiff) > 1e-9) return totalDiff;
      return normalizeTimestamp(b.timestamp) - normalizeTimestamp(a.timestamp);
    })[0] || null;
  }

  function positionPnlComponent(row, kind) {
    if (!row) return { valid: false, pnl: 0, unrealized: null, realized: null, consistencyGap: null };
    const realized = nullableNumber(row.realizedPnl) ?? 0;
    if (kind === 'closed') {
      const value = nullableNumber(row.realizedPnl);
      return { valid: value != null, pnl: value ?? 0, unrealized: 0, realized: value, consistencyGap: null };
    }

    const cash = nullableNumber(row.cashPnl);
    const currentValue = nullableNumber(row.currentValue);
    const initialValue = nullableNumber(row.initialValue);
    const derivedCash = currentValue != null && initialValue != null ? currentValue - initialValue : null;
    const unrealized = cash ?? derivedCash;
    const consistencyGap = cash != null && derivedCash != null ? cash - derivedCash : null;
    return {
      valid: unrealized != null,
      pnl: unrealized == null ? 0 : unrealized + realized,
      unrealized,
      realized,
      consistencyGap
    };
  }

  function rowsForLeg(index, conditionId, asset, outcome) {
    const exact = asset ? index.byAsset.get(`${conditionId}|${asset}`) || [] : [];
    if (exact.length) return exact;
    if (outcome === 'Up' || outcome === 'Down') {
      return index.byOutcome.get(`${conditionId}|${outcome}`) || [];
    }
    return [];
  }

  function apiPnlForGroup(group, currentIndex, closedIndex) {
    const legsMap = new Map();
    for (const trade of group.trades || []) {
      const asset = String(trade.asset || '');
      const outcome = normalizeOutcome(trade.outcome);
      const key = asset || `outcome:${outcome}`;
      if (!key || key === 'outcome:Unknown') continue;
      if (!legsMap.has(key)) legsMap.set(key, { asset, outcome });
    }
    const legs = [...legsMap.values()];
    let pnl = 0;
    let found = 0;
    let currentCount = 0;
    let closedCount = 0;
    let consistencyGap = 0;
    const usedRows = [];
    const missingLegs = [];
    const components = [];

    for (const leg of legs) {
      const currentRow = pickBestPositionRow(rowsForLeg(currentIndex, group.conditionId, leg.asset, leg.outcome));
      const closedRow = pickBestPositionRow(rowsForLeg(closedIndex, group.conditionId, leg.asset, leg.outcome));
      let chosen = null;
      let kind = '';
      let component = null;

      if (currentRow) {
        const value = positionPnlComponent(currentRow, 'current');
        if (value.valid) { chosen = currentRow; kind = 'current'; component = value; }
      }
      if (!chosen && closedRow) {
        const value = positionPnlComponent(closedRow, 'closed');
        if (value.valid) { chosen = closedRow; kind = 'closed'; component = value; }
      }

      if (!chosen || !component) {
        missingLegs.push(leg);
        continue;
      }

      found++;
      if (kind === 'current') currentCount++; else closedCount++;
      pnl += component.pnl;
      if (component.consistencyGap != null) consistencyGap += component.consistencyGap;
      usedRows.push(chosen);
      components.push({ ...leg, kind, row: chosen, ...component });
    }

    const complete = legs.length > 0 && found === legs.length;
    const source = currentCount && closedCount
      ? 'positions + closed-positions'
      : currentCount ? 'positions' : closedCount ? 'closed-positions' : '';
    return {
      pnl: roundTo(pnl, 8),
      complete,
      foundAssets: found,
      totalAssets: legs.length,
      source,
      usedRows,
      components,
      missingLegs,
      consistencyGap: roundTo(consistencyGap, 8)
    };
  }

  function enrichGroups(groups, currentPositions, closedPositions, markets) {
    const currentIndex = indexRows(mergePositionRows([], currentPositions || []));
    const closedIndex = indexRows(mergePositionRows([], closedPositions || []));
    const nowSec = Math.floor(Date.now() / 1000);

    return (groups || []).map(group => {
      const conditionId = String(group.conditionId || '').toLowerCase();
      const up = aggregateSide(group, 'Up');
      const down = aggregateSide(group, 'Down');
      const market = markets.get(conditionId) || null;
      const currentConditionRows = currentIndex.byCondition.get(conditionId) || [];
      const closedConditionRows = closedIndex.byCondition.get(conditionId) || [];
      const verified = state.marketPnlCache.get(conditionId) || null;
      const verifiedRows = verified?.ok ? (verified.rows || []) : [];
      const conditionPositionRows = [...currentConditionRows, ...closedConditionRows, ...verifiedRows];
      const endSec = group.startSec + getTimeframe().seconds;
      const isPastEnd = nowSec >= endSec;

      const closePrices = readOutcomePriceMap(market);
      const pairFinal = (closePrices.Up === 1 && closePrices.Down === 0)
        || (closePrices.Up === 0 && closePrices.Down === 1);
      const marketEvidence = marketResolutionEvidence(market);
      const verifiedEvidence = positionResolutionEvidence(verifiedRows);
      const positionEvidence = positionResolutionEvidence([...currentConditionRows, ...closedConditionRows]);
      const winnerFromMarket = marketEvidence.winner;
      const winnerFromVerified = verified?.winner || verifiedEvidence.winner;
      const winnerFromPositions = positionEvidence.winner;
      const winnerEvidence = [...new Set([winnerFromMarket,winnerFromVerified,verifiedEvidence.winner,winnerFromPositions].filter(Boolean))];
      const resolutionConflict = marketEvidence.conflict || verifiedEvidence.conflict || positionEvidence.conflict || winnerEvidence.length > 1;
      const winner = resolutionConflict ? '' : winnerEvidence[0] || '';
      const resolved = Boolean(isPastEnd && (winner === 'Up' || winner === 'Down')
        && (winnerFromMarket || winnerFromVerified || winnerFromPositions || pairFinal));
      const marketClosed = market ? asBool(market.closed) || market.active === false : false;
      const closeUpPrice = resolved ? (winner === 'Up' ? 1 : 0) : closePrices.Up;
      const closeDownPrice = resolved ? (winner === 'Down' ? 1 : 0) : closePrices.Down;

      const feeConfig = feeConfigForMarket(conditionId, market);
      // Fill fees and cash are known before resolution; an unknown winner must
      // leave payout and settled P&L pending instead of displaying false zeros.
      const fillAccounting = calculateRoundSettlement(group.trades, resolved ? winner : '', feeConfig);
      const settlement = resolved ? fillAccounting : {
        ...fillAccounting, pnl: null, pnlWithoutFees: null, payout: null, winningShares: null
      };
      const qualityIssues=[];
      if (Object.values(closePrices).some(p=>p!=null && (p<0 || p>1))) qualityIssues.push('Invalid outcome price evidence');
      if (feeConfig.invalid) qualityIssues.push('Invalid fee metadata');
      if (resolutionConflict) qualityIssues.push('Conflicting resolution evidence');
      const fillIssue=group.trades.map(t=>(t._invalid && t._invalid !== 'Inconsistent fill notional' ? t._invalid : invalidFillReason(t, feeConfig))).find(Boolean);
      if (fillIssue) qualityIssues.push(fillIssue);
      if (settlement?.inventoryGap) qualityIssues.push('Missing opening inventory');
      if (state.truncatedTrades) qualityIssues.push('Incomplete trade history');
      if (group.startSec < state.historySinceSec) qualityIssues.push('Start date cuts this round');
      if (state.ledgerEvents.some(e=>String(e.conditionId || '').toLowerCase()===conditionId && ['SPLIT','MERGE','CONVERSION'].includes(e.type))) qualityIssues.push('Non-trade inventory event');
      const excluded=qualityIssues.length>0;
      const pnl = excluded ? null : settlement?.pnl ?? null;

      const aggregateApi = apiPnlForGroup(group, currentIndex, closedIndex);
      const expectedLegs = [];
      const seenLegs = new Set();
      for (const trade of group.trades || []) {
        const asset = String(trade.asset || '');
        const outcome = normalizeOutcome(trade.outcome);
        const key = asset || `outcome:${outcome}`;
        if (!key || key === 'outcome:Unknown' || seenLegs.has(key)) continue;
        seenLegs.add(key);
        expectedLegs.push({ asset, outcome });
      }
      const verifiedFound = expectedLegs.filter(leg => verifiedRows.some(row => {
        if (positionTotalPnl(row)==null) return false;
        if (leg.asset && String(row.asset || '') === leg.asset) return true;
        return !leg.asset && normalizeOutcome(row.outcome) === leg.outcome;
      })).length;
      const verifiedComplete = Boolean(verified?.ok && verifiedRows.length
        && (expectedLegs.length === 0 || verifiedFound === expectedLegs.length));
      const apiCandidate = verifiedComplete
        ? roundTo(verified.pnl, 8)
        : aggregateApi.complete ? roundTo(aggregateApi.pnl, 8) : null;
      const exact = verifiedComplete
        ? {
            pnl: apiCandidate, complete: true, verified: true,
            foundAssets: verifiedFound || verifiedRows.length,
            totalAssets: expectedLegs.length || verifiedRows.length,
            source: 'market-positions: totalPnl',
            usedRows: verifiedRows.map(row => ({ ...row, _pnlSource: 'market-positions' }))
          }
        : { ...aggregateApi, verified: false };

      const tolerance = Math.max(0.03, ((settlement?.rawBuyNotional || 0) + (settlement?.rawSellNotional || 0)) * 0.0005);
      const reconciliationDelta = apiCandidate != null && pnl != null ? roundTo(apiCandidate - pnl, 8) : null;
      const apiLooksStale = Boolean(apiCandidate != null && pnl != null && Math.abs(apiCandidate) <= 0.005 && Math.abs(pnl) > tolerance);
      let auditStatus = 'no-api';
      if (reconciliationDelta != null) {
        if (apiLooksStale) auditStatus = 'mismatch';
        else if (Math.abs(reconciliationDelta) <= tolerance) auditStatus = 'verified';
        else auditStatus = 'mismatch';
      }

      const classificationExact = !settlement || feeConfig.rate <= 0 || settlement.assumedTakerCount === 0;
      const calculationExact = Boolean(resolved && !excluded && (state.demo || (state.ledgerComplete && state.ledgerCoverageEnd >= endSec)) && feeConfig.exact && classificationExact && !settlement?.inventoryGap);
      const approximate = Boolean(resolved && !calculationExact);
      const pnlSource = !resolved
        ? ''
        : `закрытие ${winner}=1 · fills · ${feeConfig.source}${settlement?.assumedTakerCount ? ' · assumed taker' : ''}`;
      const claimInfo = payoutClaimInfo(currentConditionRows, winner, settlement?.payout || 0);
      const resolutionSource = pairFinal && winnerFromMarket
        ? 'Gamma outcomePrices 1/0'
        : winnerFromMarket ? 'Gamma resolved winner'
          : winnerFromVerified ? 'market-positions final prices'
            : winnerFromPositions ? 'positions final prices' : '';

      return {
        ...group,
        up, down, market, winner, resolved, isPastEnd, endSec, marketClosed, qualityIssues, excluded,
        closeUpPrice, closeDownPrice, rawCloseUpPrice: closePrices.Up, rawCloseDownPrice: closePrices.Down,
        resolutionSource,
        pnl, pnlSource, pnlMethod: 'close-settlement-v2', pnlQuality: calculationExact ? 'calculated' : 'provisional',
        approximate, calculationExact,
        feeConfig, estimatedFee: settlement?.fee || 0, feeTotal: settlement?.fee || 0,
        settlement, payout: settlement.payout,
        winningShares: settlement.winningShares,
        netSharesUp: settlement?.shares?.Up ?? up.netShares,
        netSharesDown: settlement?.shares?.Down ?? down.netShares,
        grossFallback: settlement?.pnlWithoutFees ?? null,
        grossSettlementPnl: settlement?.pnlWithoutFees ?? null,
        settlementPnl: pnl,
        claimInfo, reconciliationDelta, apiDifference: reconciliationDelta,
        auditStatus, auditTolerance: tolerance, apiLooksStale,
        api: exact, exact, apiPnl: apiCandidate,
        serverPnl: aggregateApi.complete ? aggregateApi.pnl : null,
        verifiedPnl: verifiedComplete ? apiCandidate : null,
        verifiedFinalized: Boolean(verified?.finalized),
        totalBuyNotional: up.buyNotional + down.buyNotional,
        totalSellNotional: up.sellNotional + down.sellNotional,
        buyCashWithFees: settlement?.buyCash ?? 0,
        sellCashAfterFees: settlement?.sellCash ?? 0,
        netCashBeforePayout: settlement?.cashFlow ?? ((up.sellNotional + down.sellNotional) - (up.buyNotional + down.buyNotional)),
        bothSides: up.buyShares > 0 && down.buyShares > 0,
        positionRows: conditionPositionRows,
        currentPositionRows: currentConditionRows,
        totalBuyOps: up.buyOps + down.buyOps,
        totalSellOps: up.sellOps + down.sellOps,
        totalFills: group.trades.length,
        lastTradeSec: group.trades.reduce((max, trade) => Math.max(max, normalizeTimestamp(trade.timestamp)), 0)
      };
    });
  }

  function refreshRowsFromCache() {
    const groups = buildGroups(state.allTrades, state.historySinceSec);
    state.rows = enrichGroups(groups, state.currentPositions, state.closedPositions, state.markets)
      .filter(row => row.endSec >= state.historySinceSec)
      .sort((a, b) => b.startSec - a.startSec);
  }

  function getPeriodRows() {
    if (els.lookback.value === 'all') return state.rows.slice();
    const hours = Number(els.lookback.value) || HISTORY_HOURS;
    const since = Math.floor(Date.now() / 1000) - hours * 3600;
    return state.rows.filter(row => row.endSec >= since);
  }

  function getVisibleRows() {
    let rows = getPeriodRows();
    if (els.resolvedOnly.checked) rows = rows.filter(row => row.resolved);
    if (els.bothOnly.checked) rows = rows.filter(row => row.bothSides);
    const sort = els.sort.value;
    if (sort === 'pnlDesc') rows.sort((a, b) => (b.pnl ?? -Infinity) - (a.pnl ?? -Infinity));
    else if (sort === 'pnlAsc') rows.sort((a, b) => (a.pnl ?? Infinity) - (b.pnl ?? Infinity));
    else rows.sort((a, b) => b.startSec - a.startSec);
    return rows;
  }

  function resultBadge(row) {
    if (row.winner === 'Up') return '<span class="badge up">UP</span>';
    if (row.winner === 'Down') return '<span class="badge down">DOWN</span>';
    if (!row.isPastEnd) {
      const remain = Math.max(0, row.endSec - Math.floor(Date.now() / 1000));
      return `<span class="badge live live-countdown" data-end-sec="${row.endSec}">LIVE ${formatDuration(remain)}</span>`;
    }
    return '<span class="badge wait">РАСЧЁТ</span>';
  }

  function sideCell(side, cls) {
    if (!side.buyFills && !side.sellFills) return '<span class="source">Нет сделок</span>';
    const buyText = side.buyFills
      ? `<div class="side-main ${cls}">BUY ${side.buyOps} tx · ${fmtMoney(side.buyNotional)}</div>
         <div class="side-sub">${side.buyFills} fills · ${fmtShares(side.buyShares)} sh · avg ${fmtPrice(side.avgBuy)}</div>`
      : '<div class="side-sub">Покупок нет</div>';
    const sellText = side.sellFills
      ? `<div class="side-sub sell-line">SELL ${side.sellOps} tx · ${side.sellFills} fills · ${fmtMoney(side.sellNotional)} · avg ${fmtPrice(side.avgSell)}</div>`
      : '';
    return buyText + sellText;
  }

  function renderRows() {
    const visible = getVisibleRows();
    els.export.disabled = visible.length === 0;
    if (!visible.length) {
      const reason = state.rows.length ? 'Измените фильтры: данные загружены, но строки скрыты.' : `Для выбранного адреса в загруженном периоде BTC ${state.timeframe} сделки не найдены.`;
      els.body.innerHTML = `<tr><td colspan="10" class="empty"><strong>Нет строк для отображения</strong>${escapeHtml(reason)}</td></tr>`;
      return;
    }

    els.body.innerHTML = visible.map(row => {
      const pnlClass = row.pnl > 0 ? 'positive' : row.pnl < 0 ? 'negative' : 'neutral';
      const pnlText = row.pnl == null ? '—' : `${row.approximate ? '≈ ' : ''}${fmtMoney(row.pnl, true)}`;
      const slug = row.eventSlug || row.slug;
      const marketUrl = slug ? `https://polymarket.com/event/${encodeURIComponent(slug)}` : '#';
      const claimClass = row.claimInfo?.status === 'unclaimed' ? 'claim-pending' : 'claim-included';
      const delta = row.reconciliationDelta;
      const deltaClass = delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral';
      let auditBadge = '<span class="badge live">расчёт по закрытию</span>';
      if (row.auditStatus === 'verified') auditBadge = `<span class="badge exact" title="Within modeled P&amp;L tolerance: ${fmtMoney(row.auditTolerance)}">API ✓</span>`;
      else if (row.auditStatus === 'stale-zero') auditBadge = '<span class="badge wait">0 API отклонён</span>';
      else if (row.auditStatus === 'mismatch') auditBadge = '<span class="badge down">расхождение</span>';
      if (row.excluded) auditBadge = '<span class="badge down">Excluded from equity</span>';
      if (row.approximate && !row.excluded) auditBadge += '<span class="badge approx" style="margin-left:4px">fee/taker fallback</span>';
      const settlementPrimary = row.resolved ? fmtMoney(row.payout) : '—';
      const closeText = row.resolved ? `${row.winner}=1 · loser=0` : 'ожидаем final 1/0';
      return `
        <tr>
          <td>
            <div class="market-title" title="${escapeHtml(row.title)}">${escapeHtml(row.title)}</div>
            <div class="market-time">${escapeHtml(formatRange(row.startSec))} · <a class="link-btn" href="${marketUrl}" target="_blank" rel="noopener noreferrer">рынок ↗</a></div>
            <div class="source">${row.totalBuyOps} buy tx · ${row.totalFills} fills</div>
          </td>
          <td>${resultBadge(row)}<div class="source">${escapeHtml(closeText)}</div></td>
          <td>${sideCell(row.up, 'up-text')}</td>
          <td>${sideCell(row.down, 'down-text')}</td>
          <td><div class="side-main">${fmtMoney(row.totalBuyNotional)}</div><div class="side-sub">с fee: ${fmtMoney(row.buyCashWithFees)}</div></td>
          <td><div class="side-main">${fmtMoney(row.totalSellNotional)}</div><div class="side-sub">после fee: ${fmtMoney(row.sellCashAfterFees)}</div></td>
          <td><div class="side-main">payout ${settlementPrimary}</div><div class="source ${claimClass}">${escapeHtml(row.resolved ? row.claimInfo?.label || 'claim не влияет' : 'ожидаем resolution')}</div><div class="source">fee ${fmtMoney(row.feeTotal)}</div></td>
          <td><div class="audit-delta ${deltaClass}">${delta == null ? '—' : fmtMoney(delta, true)}</div><div class="source">официальный API − close calc</div></td>
          <td>
            <div class="pnl ${pnlClass}">${pnlText}</div>
            <div class="source">${escapeHtml(row.qualityIssues?.join(' · ') || row.pnlSource || (row.isPastEnd ? 'ожидаем финальную цену' : 'текущий раунд'))}</div>
            <div style="margin-top:5px">${auditBadge}</div>
          </td>
          <td><button class="btn small detail-btn" type="button" data-key="${escapeHtml(row.key)}">Детали</button></td>
        </tr>`;
    }).join('');

    els.body.querySelectorAll('.detail-btn').forEach(button => button.addEventListener('click', () => openDetails(button.dataset.key)));
    updateLiveBadges();
  }

  function renderMetrics() {
    const all = getVisibleRows();
    const resolved = all.filter(row => row.resolved && row.pnl != null);
    const exactCalc = resolved.filter(row => row.calculationExact);
    const provisional = resolved.filter(row => !row.calculationExact);
    const apiVerified = resolved.filter(row => row.auditStatus === 'verified').length;
    const staleZeros = resolved.filter(row => row.auditStatus === 'stale-zero').length;
    const mismatches = resolved.filter(row => row.auditStatus === 'mismatch').length;
    const totalPnl = roundTo(resolved.reduce((sum, row) => sum + asNumber(row.pnl), 0), 8);
    const upVolume = all.reduce((sum, row) => sum + row.up.buyNotional, 0);
    const downVolume = all.reduce((sum, row) => sum + row.down.buyNotional, 0);
    const upOps = all.reduce((sum, row) => sum + row.up.buyOps, 0);
    const downOps = all.reduce((sum, row) => sum + row.down.buyOps, 0);
    const both = all.filter(row => row.bothSides).length;
    const unclaimed = resolved.filter(row => row.claimInfo?.status === 'unclaimed').length;

    els.totalPnl.textContent = resolved.length ? `${provisional.length ? '≈ ' : ''}${fmtMoney(totalPnl, true)}` : '—';
    els.totalPnl.className = `metric-value ${totalPnl > 0 ? 'positive' : totalPnl < 0 ? 'negative' : 'neutral'}`;
    els.pnlNote.textContent = resolved.length
      ? `${exactCalc.length} model complete${provisional.length ? ` · ${provisional.length} fallback` : ''} · API✓ ${apiVerified}${staleZeros ? ` · 0 API× ${staleZeros}` : ''}${mismatches ? ` · Δ ${mismatches}` : ''}${unclaimed ? ` · ${unclaimed} unclaimed` : ''}`
      : 'нет завершённых раундов';
    els.roundCount.textContent = all.length ? `${all.length} / ${resolved.length}` : '—';
    els.roundNote.textContent = all.some(r=>r.excluded) ? `${all.filter(r=>r.excluded).length} excluded · inspect row reasons` : state.truncatedTrades ? 'часть старых fills могла не загрузиться' : `${periodLabel()}: найдено / рассчитано`;
    els.upVolume.textContent = all.length ? fmtCompactMoney(upVolume) : '—';
    els.upNote.textContent = `${upOps} buy tx`;
    els.downVolume.textContent = all.length ? fmtCompactMoney(downVolume) : '—';
    els.downNote.textContent = `${downOps} buy tx`;
    els.bothCount.textContent = all.length ? String(both) : '—';
    els.bothNote.textContent = all.length ? `${((both / all.length) * 100).toFixed(0)}% от найденных` : 'Up + Down в одном окне';
  }

  function renderCurrentRound() {
    const nowSec = Math.floor(Date.now() / 1000);
    const currentStart = Math.floor(nowSec / getTimeframe().seconds) * getTimeframe().seconds;
    const row = state.rows.find(item => item.startSec === currentStart) || null;
    const remaining = currentStart + getTimeframe().seconds - nowSec;
    const up = row?.up || { buyOps: 0, buyFills: 0, buyNotional: 0, buyShares: 0, avgBuy: 0 };
    const down = row?.down || { buyOps: 0, buyFills: 0, buyNotional: 0, buyShares: 0, avgBuy: 0 };
    const total = (row?.totalBuyNotional || 0) - (row?.totalSellNotional || 0);

    els.currentRoundSummary.innerHTML = `
      <div class="current-round-head">
        <div>
          <div class="current-kicker">Текущий BTC ${state.timeframe} раунд</div>
          <div class="current-title">${escapeHtml(formatRange(currentStart))}</div>
        </div>
        <span class="badge live">${formatDuration(remaining)}</span>
      </div>
      <div class="current-grid">
        <div class="current-box"><span>Up</span><strong class="up-text">${fmtMoney(up.buyNotional)}</strong><small>${up.buyOps} tx · ${up.buyFills} fills · ${fmtShares(up.buyShares)} sh${up.buyShares ? ` · ${fmtPrice(up.avgBuy)}` : ''}</small></div>
        <div class="current-box"><span>Down</span><strong class="down-text">${fmtMoney(down.buyNotional)}</strong><small>${down.buyOps} tx · ${down.buyFills} fills · ${fmtShares(down.buyShares)} sh${down.buyShares ? ` · ${fmtPrice(down.avgBuy)}` : ''}</small></div>
        <div class="current-box"><span>Чисто вложено</span><strong>${fmtMoney(total)}</strong><small>покупки − продажи, без payout</small></div>
        <div class="current-box"><span>Последняя сделка</span><strong>${row?.lastTradeSec ? timeFmt.format(new Date(row.lastTradeSec * 1000)) : '—'}</strong><small>${row ? `${row.totalFills} fills в окне` : 'в этом окне сделок пока нет'}</small></div>
      </div>`;
  }

  function cleanupNewTradeKeys() {
    const now = Date.now();
    for (const [key, expires] of state.newTradeKeys) {
      if (expires <= now) state.newTradeKeys.delete(key);
    }
  }

  function renderLiveFeed() {
    cleanupNewTradeKeys();
    const countValue = els.liveCount.value;
    const maxRows = countValue === 'all' ? Infinity : Number(countValue) || 50;
    const trades = state.allTrades
      .filter(isBtcMarket)
      .slice()
      .sort((a, b) => normalizeTimestamp(b.timestamp) - normalizeTimestamp(a.timestamp))
      .slice(0, maxRows);

    if (!trades.length) {
      els.liveBody.innerHTML = '<tr><td colspan="8" class="empty"><strong>Сделок пока нет</strong>После загрузки адреса новые fills появятся здесь автоматически.</td></tr>';
      return;
    }

    els.liveBody.innerHTML = trades.map(trade => {
      const key = tradeKey(trade);
      const isNew = state.newTradeKeys.has(key);
      const outcome = normalizeOutcome(trade.outcome);
      const side = String(trade.side || 'BUY').toUpperCase();
      const ts = normalizeTimestamp(trade.timestamp);
      const start = getStartSec(trade);
      const hash = trade.transactionHash || '';
      const tx = hash
        ? `<a class="link-btn" href="https://polygonscan.com/tx/${encodeURIComponent(hash)}" target="_blank" rel="noopener noreferrer">${escapeHtml(shortAddress(hash))} ↗</a>`
        : '—';
      return `<tr class="${isNew ? 'new-trade' : ''}">
        <td><strong>${escapeHtml(ts ? timeFmt.format(new Date(ts * 1000)) : '—')}</strong></td>
        <td><span class="live-round-time">${escapeHtml(start ? `${shortTimeFmt.format(new Date(start * 1000))}–${shortTimeFmt.format(new Date((start + getTimeframe().seconds) * 1000))}` : '—')}</span></td>
        <td><span class="badge ${side === 'BUY' ? 'buy-badge' : 'sell-badge'}">${escapeHtml(side)}</span></td>
        <td class="${outcome === 'Up' ? 'up-text' : outcome === 'Down' ? 'down-text' : ''}"><strong>${escapeHtml(outcome)}</strong></td>
        <td>${fmtShares(trade.size)}</td>
        <td>${fmtPrice(trade.price)}</td>
        <td><strong>${fmtMoney(tradeNotional(trade))}</strong></td>
        <td>${tx}</td>
      </tr>`;
    }).join('');
  }

  function setLiveUi(kind = '') {
    const enabled = els.autoRefresh.checked && !state.demo && Boolean(state.proxyWallet);
    els.liveToggle.textContent = enabled ? 'Пауза' : state.demo ? 'Демо' : 'Продолжить';
    els.liveToggle.disabled = state.demo || !state.proxyWallet;
    els.livePulse.className = `live-pulse${kind ? ` ${kind}` : enabled ? ' ok' : ' paused'}`;
    if (state.demo) {
      els.liveStatus.textContent = 'Демо-режим · сетевой поток отключён';
    } else if (!state.proxyWallet) {
      els.liveStatus.textContent = 'Введите адрес, чтобы запустить live-ленту';
    } else if (!els.autoRefresh.checked) {
      els.liveStatus.textContent = 'Live-лента на паузе';
    } else if (state.lastLiveAt) {
      els.liveStatus.textContent = `Public Data API · опрос 2,5 с · ответ ${timeFmt.format(new Date(state.lastLiveAt))}`;
    } else {
      els.liveStatus.textContent = 'Public Data API · опрос каждые 2,5 секунды';
    }
  }

  function getDailyChartRows() {
    return getVisibleRows()
      .filter(row => row.resolved && row.pnl != null)
      .sort((a, b) => a.endSec - b.endSec);
  }

  function getEquityChartStartSec() {
    if (els.lookback.value === 'all') return state.historySinceSec || getHistorySinceSec();
    const hours = Number(els.lookback.value) || HISTORY_HOURS;
    const visibleSince = Math.floor(Date.now() / 1000) - hours * 3600;
    return Math.max(state.historySinceSec || 0, visibleSince);
  }

  function axisTickLabel(sec, spanSec) {
    if (spanSec >= 36 * 3600) return axisDateTimeFmt.format(new Date(sec * 1000));
    return shortTimeFmt.format(new Date(sec * 1000));
  }

  function calculateMaxDrawdownFromPoints(points) {
    let peak = 0;
    let maxDrawdown = 0;
    for (const point of points || []) {
      const value = asNumber(point.value);
      peak = Math.max(peak, value);
      maxDrawdown = Math.max(maxDrawdown, peak - value);
    }
    return maxDrawdown;
  }

  function renderChartStats(allRows) {
    const total = roundTo(allRows.reduce((sum, row) => sum + asNumber(row.pnl), 0), 8);
    const wins = allRows.filter(row => asNumber(row.pnl) > 0).length;
    const winRate = allRows.length ? wins / allRows.length * 100 : 0;
    const average = allRows.length ? total / allRows.length : 0;
    const cumulative = buildCumulativeSeries(allRows, getEquityChartStartSec());
    const endpoint = cumulative.at(-1)?.value ?? 0;
    const auditDelta = roundTo(endpoint - total, 8);
    const verified = allRows.filter(row => row.auditStatus === 'verified').length;

    els.dayPnl.textContent = allRows.length ? fmtMoney(total, true) : '—';
    els.dayPnl.className = `chart-stat-value ${total > 0 ? 'positive' : total < 0 ? 'negative' : ''}`;
    els.dayRounds.textContent = allRows.length ? `${allRows.length} · API✓ ${verified}` : '0';
    els.dayAverage.textContent = allRows.length ? fmtMoney(average, true) : '—';
    els.dayAverage.className = `chart-stat-value ${average > 0 ? 'positive' : average < 0 ? 'negative' : ''}`;
    els.dayWinRate.textContent = allRows.length ? `${winRate.toFixed(1)}%` : '—';
    els.dayAudit.textContent = allRows.length ? `${verified}/${allRows.length} API ✓` : '—';
    els.dayAudit.className = `chart-stat-value ${verified===allRows.length && verified ? 'positive' : 'neutral'}`;
    els.dayAudit.title = allRows.length ? `Within per-round tolerance: max($0.03, 0.05% of buy + sell notional). Σ points ${fmtMoney(total, true)} · cumulative endpoint ${fmtMoney(endpoint, true)}. Dollar differences are in Trader diagnostics.` : '';
  }

  function drawChartMessage(canvas, empty, message, stateKey) {
    empty.textContent = message;
    empty.hidden = false;
    canvas.style.opacity = '.22';
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    state[stateKey] = [];
  }

  function drawSeriesCanvas({ canvas, wrap, empty, points, valueOf, timeOf, stateKey, rectKey, pointColorMode = 'sign' }) {
    if (!points.length) {
      drawChartMessage(canvas, empty, 'Нет данных для графика', stateKey);
      return;
    }
    empty.hidden = true;
    canvas.style.opacity = '1';
    const wrapRect = wrap.getBoundingClientRect();
    const width = Math.max(220, Math.floor(wrapRect.width - 24));
    const height = Math.max(280, Math.min(370, Math.floor(width * 0.34)));
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const css = getComputedStyle(document.documentElement);
    const lineColor = css.getPropertyValue('--blue-2').trim() || '#7aa2ff';
    const gridColor = 'rgba(151,170,205,.14)';
    const textColor = css.getPropertyValue('--muted').trim() || '#94a6c7';
    const green = css.getPropertyValue('--green').trim() || '#40d89a';
    const red = css.getPropertyValue('--red').trim() || '#ff7185';
    const panel = css.getPropertyValue('--panel').trim() || '#101b30';
    const margin = { left: 62, right: 20, top: 22, bottom: 42 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const values = points.map(valueOf);
    let min = Math.min(0, ...values);
    let max = Math.max(0, ...values);
    if (min === max) { min -= 1; max += 1; }
    const pad = Math.max((max - min) * 0.12, 0.35);
    min -= pad; max += pad;
    const firstTime = timeOf(points[0]), lastTime = timeOf(points.at(-1));
    const xFor = index => lastTime===firstTime ? margin.left+plotW/2 : margin.left+(timeOf(points[index])-firstTime)/(lastTime-firstTime)*plotW;
    const yFor = value => margin.top + (max - value) / (max - min) * plotH;

    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = gridColor;
    ctx.fillStyle = textColor;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const value = max - (max - min) * i / 5;
      const y = margin.top + plotH * i / 5;
      ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(width - margin.right, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(fmtAxisMoney(value), margin.left - 9, y);
    }
    const zeroY = yFor(0);
    ctx.strokeStyle = 'rgba(238,244,255,.38)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(margin.left, zeroY); ctx.lineTo(width - margin.right, zeroY); ctx.stroke();

    if (points.length > 1) {
      ctx.beginPath();
      values.forEach((value, index) => {
        const x = xFor(index), y = yFor(value);
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = points.length > 160 ? 1.5 : 2.2;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
    }

    const hitPoints = [];
    const radius = points.length > 200 ? 1.7 : points.length > 100 ? 2.1 : points.length > 50 ? 2.5 : 3.2;
    values.forEach((value, index) => {
      const x = xFor(index), y = yFor(value);
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
      const point = points[index];
      const signValue = pointColorMode === 'round' ? asNumber(point.roundPnl) : value;
      ctx.fillStyle = signValue >= 0 ? green : red; ctx.fill();
      ctx.strokeStyle = panel; ctx.lineWidth = 1.2; ctx.stroke();
      hitPoints.push({ x, y, point, value, index });
    });

    const labelIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
    const times = points.map(point => timeOf(point)).filter(value => Number.isFinite(value));
    const spanSec = times.length ? Math.max(...times) - Math.min(...times) : 0;
    ctx.fillStyle = textColor; ctx.textBaseline = 'top';
    labelIndexes.forEach((index, pos) => {
      const x = xFor(index);
      ctx.textAlign = pos === 0 ? 'left' : pos === labelIndexes.length - 1 ? 'right' : 'center';
      ctx.fillText(axisTickLabel(timeOf(points[index]), spanSec), x, height - margin.bottom + 13);
    });
    state[stateKey] = hitPoints;
    state[rectKey] = { width, height, margin, plotW, plotH };
  }

  function drawPnlChart() {
    const allRows = getDailyChartRows();
    renderChartStats(allRows);
    state.chartRows = allRows;
    state.chartHitPoints = [];

    if (!allRows.length) {
      els.chartCaption.textContent = `No resolved BTC ${state.timeframe} markets with final 1/0 prices in the selected period.`;
      drawChartMessage(els.balanceChart, els.balanceChartEmpty, 'No cumulative equity yet for the selected period', 'balanceHitPoints');
      return;
    }

    const cumulative = buildCumulativeSeries(allRows, getEquityChartStartSec());
    state.balanceRows = cumulative;
    drawSeriesCanvas({
      canvas: els.balanceChart, wrap: els.balanceChartWrap, empty: els.balanceChartEmpty,
      points: cumulative, valueOf: point => asNumber(point.value), timeOf: point => point.timestamp,
      stateKey: 'balanceHitPoints', rectKey: 'balanceRect', pointColorMode: 'round'
    });

    const total = roundTo(allRows.reduce((sum, row) => sum + asNumber(row.pnl), 0), 8);
    const endpoint = cumulative.at(-1)?.value ?? 0;
    const auditDelta = roundTo(endpoint - total, 8);
    const best = allRows.reduce((a, b) => asNumber(a.pnl) > asNumber(b.pnl) ? a : b);
    const worst = allRows.reduce((a, b) => asNumber(a.pnl) < asNumber(b.pnl) ? a : b);
    const apiVerified = allRows.filter(row => row.auditStatus === 'verified').length;
    const stale = allRows.filter(row => row.auditStatus === 'stale-zero').length;
    const mismatch = allRows.filter(row => row.auditStatus === 'mismatch').length;
    const provisional = allRows.filter(row => !row.calculationExact).length;
    const maxDrawdown = calculateMaxDrawdownFromPoints(cumulative);
    const startLabel = axisDateTimeFmt.format(new Date(getEquityChartStartSec() * 1000));
    const endLabel = axisDateTimeFmt.format(new Date((cumulative.at(-1)?.timestamp || Math.floor(Date.now() / 1000)) * 1000));
    els.chartCaption.textContent = `Settled BTC ${state.timeframe} trading P&L from $0, not wallet balance. Equity curve uses all ${allRows.length} resolved rounds in ${periodLabel()} (${startLabel} → ${endLabel}) · Σ P&L ${provisional ? '≈ ' : ''}${fmtMoney(total, true)} · endpoint ${fmtMoney(endpoint, true)} · control ${Math.abs(auditDelta) < 0.000001 ? '✓ matched' : fmtMoney(auditDelta, true)} · API✓ ${apiVerified}${stale ? ` · stale 0 rejected ${stale}` : ''}${mismatch ? ` · mismatches ${mismatch}` : ''} · max drawdown ${fmtMoney(maxDrawdown)} · best ${fmtMoney(best.pnl, true)} · worst ${fmtMoney(worst.pnl, true)}.`;
  }

  function renderChart() {
    window.requestAnimationFrame(drawPnlChart);
  }

  function positionTooltip(tooltip, rect, nearest, html) {
    tooltip.innerHTML = html;
    const tipWidth = 238;
    const left = Math.max(8, Math.min(rect.width - tipWidth - 8, nearest.x + 12));
    const top = Math.max(8, Math.min(rect.height - 124, nearest.y - 58));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.hidden = false;
  }

  function nearestPoint(event, canvas, points) {
    if (!points.length) return null;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    let nearest = points[0];
    let bestDistance = Math.abs(nearest.x - x);
    for (const point of points) {
      const distance = Math.abs(point.x - x);
      if (distance < bestDistance) { bestDistance = distance; nearest = point; }
    }
    return { nearest, rect };
  }

  function handleChartPointer(event, kind = 'pnl') {
    if (kind === 'balance') {
      const found = nearestPoint(event, els.balanceChart, state.balanceHitPoints);
      if (!found) return;
      const { nearest, rect } = found;
      const point = nearest.point;
      if (point.initial) {
        positionTooltip(els.balanceChartTooltip, rect, nearest, `<strong>Старт расчёта</strong><span>Накопительный P&amp;L: <b>$0.00</b></span><span>${escapeHtml(dateFmt.format(new Date(point.timestamp * 1000)))}</span>`);
        return;
      }
      const row = point.row;
      positionTooltip(els.balanceChartTooltip, rect, nearest, `
        <strong>${escapeHtml(formatRange(row.startSec))}</strong>
        <span>Баланс P&amp;L: <b class="${point.value >= 0 ? 'positive' : 'negative'}">${fmtMoney(point.value, true)}</b></span>
        <span>Этот раунд: <b class="${row.pnl >= 0 ? 'positive' : 'negative'}">${row.approximate ? '≈ ' : ''}${fmtMoney(row.pnl, true)}</b></span>
        <span>Результат: ${escapeHtml(row.winner || '—')} · fee ${fmtMoney(row.feeTotal)}</span>`);
      return;
    }
    const found = nearestPoint(event, els.chart, state.chartHitPoints);
    if (!found) return;
    const { nearest, rect } = found;
    const row = nearest.point;
    const audit = row.auditStatus === 'verified' ? 'API совпал' : row.auditStatus === 'stale-zero' ? 'нулевой API отклонён' : row.auditStatus === 'mismatch' ? 'есть расхождение API' : 'API ещё не заполнен';
    positionTooltip(els.chartTooltip, rect, nearest, `
      <strong>${escapeHtml(formatRange(row.startSec))}</strong>
      <span>P&amp;L: <b class="${row.pnl >= 0 ? 'positive' : 'negative'}">${row.approximate ? '≈ ' : ''}${fmtMoney(row.pnl, true)}</b></span>
      <span>Закрытие: ${escapeHtml(row.winner || '—')}=1 · payout ${fmtMoney(row.payout)}</span>
      <span>Fee: ${fmtMoney(row.feeTotal)} · ${escapeHtml(audit)}</span>`);
  }

  function updateLiveBadges() {
    const nowSec = Math.floor(Date.now() / 1000);
    document.querySelectorAll('.live-countdown[data-end-sec]').forEach(node => {
      const end = Number(node.dataset.endSec);
      const remaining = end - nowSec;
      node.textContent = remaining > 0 ? `LIVE ${formatDuration(remaining)}` : 'РАСЧЁТ';
      if (remaining <= 0) {
        node.classList.remove('live');
        node.classList.add('wait');
      }
    });
  }

  function render() {
    renderDiagnostics();
    renderMetrics();
    renderRows();
    renderCurrentRound();
    renderLiveFeed();
    renderChart();
    setLiveUi();
    renderReportStatus();
  }

  function openDetails(key) {
    const row = state.rows.find(item => item.key === key);
    if (!row) return;
    const slug = row.eventSlug || row.slug;
    const pnlClass = row.pnl > 0 ? 'positive' : row.pnl < 0 ? 'negative' : 'neutral';
    els.modalTitle.textContent = row.title;
    els.modalSub.textContent = `${formatRange(row.startSec)} · ${row.conditionId || 'conditionId отсутствует'}`;

    const breakdownByKey = new Map((row.settlement?.fillBreakdown || []).map(item => [item.key, item]));
    const fills = row.trades.slice().sort((a, b) => normalizeTimestamp(a.timestamp) - normalizeTimestamp(b.timestamp));
    const fillRows = fills.map(fill => {
      const item = breakdownByKey.get(tradeKey(fill)) || {};
      const side = String(fill.side || 'BUY').toUpperCase();
      const outcome = normalizeOutcome(fill.outcome);
      const ts = normalizeTimestamp(fill.timestamp);
      const hash = fill.transactionHash || '';
      const tx = hash ? `<a class="link-btn" href="https://polygonscan.com/tx/${encodeURIComponent(hash)}" target="_blank" rel="noopener noreferrer">${escapeHtml(shortAddress(hash))} ↗</a>` : '—';
      return `<tr>
        <td>${escapeHtml(ts ? dateFmt.format(new Date(ts * 1000)) : '—')}</td>
        <td>${escapeHtml(side)}</td>
        <td class="${outcome === 'Up' ? 'up-text' : outcome === 'Down' ? 'down-text' : ''}">${escapeHtml(outcome)}</td>
        <td>${fmtShares(fill.size)}</td><td>${fmtPrice(fill.price)}</td>
        <td>${fmtMoney(item.notional ?? tradeNotional(fill))}</td>
        <td>${fmtMoney(item.fee || 0)}</td>
        <td>${escapeHtml(item.role || fill._takerSource || '—')}</td>
        <td class="${asNumber(item.cashFlow) >= 0 ? 'positive' : 'negative'}">${fmtMoney(item.cashFlow || 0, true)}</td>
        <td>${tx}</td>
      </tr>`;
    }).join('');

    const exactRows = mergePositionRows([], row.exact?.usedRows || []);
    const positionRowsHtml = exactRows.map(position => {
      const total = positionTotalPnl(position, position._pnlSource === 'closed-positions');
      const cash = positionField(position, 'cashPnl', 'cash_pnl');
      const realized = positionField(position, 'realizedPnl', 'realized_pnl');
      return `<tr>
        <td>${escapeHtml(normalizeOutcome(position.outcome))}</td><td>${escapeHtml(position._pnlSource || row.pnlSource || 'API')}</td>
        <td>${fmtShares(position.size)}</td><td>${cash == null ? '—' : fmtMoney(cash, true)}</td>
        <td>${realized == null ? '—' : fmtMoney(realized, true)}</td>
        <td class="${asNumber(total) > 0 ? 'positive' : asNumber(total) < 0 ? 'negative' : ''}"><strong>${total == null ? '—' : fmtMoney(total, true)}</strong></td>
      </tr>`;
    }).join('');

    const marketLink = slug ? `<a class="link-btn" href="https://polymarket.com/event/${encodeURIComponent(slug)}" target="_blank" rel="noopener noreferrer">Открыть рынок на Polymarket ↗</a>` : '';
    const p = row.pnl == null ? '—' : `${row.approximate ? '≈ ' : ''}${fmtMoney(row.pnl, true)}`;
    const claimText = row.resolved ? row.claimInfo?.label || 'claim не влияет' : 'ожидаем resolution';
    const deltaText = row.reconciliationDelta == null ? '—' : fmtMoney(row.reconciliationDelta, true);
    const auditText = row.auditStatus === 'verified' ? 'API совпал в пределах допуска'
      : row.auditStatus === 'stale-zero' ? 'нулевой API признан запаздывающим и не использован'
        : row.auditStatus === 'mismatch' ? 'есть расхождение — смотрите API − расчёт'
          : 'официальный P&L ещё не заполнен';

    els.modalBody.innerHTML = `
      ${row.excluded ? `<div class="formula negative">Excluded from equity: ${escapeHtml(row.qualityIssues.join(" · "))}. Raw fills remain below.</div>` : ""}
      <div class="detail-grid detail-grid-wide">
        <div class="detail-box"><div class="detail-label">Финальный исход</div><div class="detail-value">${resultBadge(row)}</div><div class="source">Up ${row.closeUpPrice ?? '—'} · Down ${row.closeDownPrice ?? '—'}</div></div>
        <div class="detail-box"><div class="detail-label">P&amp;L по закрытию</div><div class="detail-value ${pnlClass}">${p}</div></div>
        <div class="detail-box"><div class="detail-label">Payout</div><div class="detail-value">${row.resolved ? fmtMoney(row.payout) : '—'}</div><div class="source">${row.resolved ? `${fmtShares(row.winningShares)} winning sh × $1` : 'Pending resolution'}</div></div>
        <div class="detail-box"><div class="detail-label">Modeled taker fee</div><div class="detail-value">${fmtMoney(row.feeTotal)}</div><div class="source">${escapeHtml(row.feeConfig?.source || '—')}</div></div>
        <div class="detail-box"><div class="detail-label">BUY cash out</div><div class="detail-value">${fmtMoney(row.buyCashWithFees)}</div><div class="source">notional + fee</div></div>
        <div class="detail-box"><div class="detail-label">SELL cash in</div><div class="detail-value">${fmtMoney(row.sellCashAfterFees)}</div><div class="source">notional − fee</div></div>
        <div class="detail-box"><div class="detail-label">Claim</div><div class="detail-value" style="font-size:13px">${escapeHtml(claimText)}</div></div>
        <div class="detail-box"><div class="detail-label">API − расчёт</div><div class="detail-value">${deltaText}</div><div class="source">${escapeHtml(auditText)} · tolerance ${fmtMoney(row.auditTolerance)}</div></div>
        <div class="detail-box"><div class="detail-label">Net shares Up</div><div class="detail-value up-text">${fmtShares(row.netSharesUp)}</div></div>
        <div class="detail-box"><div class="detail-label">Net shares Down</div><div class="detail-value down-text">${fmtShares(row.netSharesDown)}</div></div>
        <div class="detail-box"><div class="detail-label">Taker / maker</div><div class="detail-value">${row.settlement?.takerCount || 0} / ${row.settlement?.makerCount || 0}</div><div class="source">assumed ${row.settlement?.assumedTakerCount || 0}</div></div>
        <div class="detail-box"><div class="detail-label">Источник resolution</div><div class="detail-value" style="font-size:13px">${escapeHtml(row.resolutionSource || 'ожидаем')}</div></div>
      </div>
      <div style="overflow:auto; border:1px solid var(--line); border-radius:13px; margin-bottom:14px;">
        <table class="mini-table"><thead><tr><th>Outcome</th><th>Источник</th><th>Size</th><th>cashPnl</th><th>realizedPnl</th><th>totalPnl</th></tr></thead>
        <tbody>${positionRowsHtml || '<tr><td colspan="6">Официальные position rows пока не заполнены</td></tr>'}</tbody></table>
      </div>
      <div style="overflow:auto; border:1px solid var(--line); border-radius:13px;">
        <table class="mini-table" style="min-width:1080px"><thead><tr><th>Время</th><th>Side</th><th>Outcome</th><th>Shares</th><th>Цена</th><th>Notional</th><th>Fee</th><th>Роль</th><th>Cashflow</th><th>Tx</th></tr></thead>
        <tbody>${fillRows || '<tr><td colspan="10">Нет fills</td></tr>'}</tbody></table>
      </div>
      <div class="formula">
        <strong>Финальная формула:</strong> SELL после fee ${fmtMoney(row.sellCashAfterFees)} − BUY с fee ${fmtMoney(row.buyCashWithFees)} + payout ${row.resolved ? fmtMoney(row.payout) : 'pending'} = <strong class="${pnlClass}">${p}</strong>.<br>
        BUY taker fee списывается дополнительно в collateral; SELL fee вычитается из proceeds. Maker fills имеют fee $0. Комиссия округляется отдельно для каждого fill до 5 знаков.<br>
        <strong>Claim не меняет результат:</strong> winning shares уже оцениваются по $1 сразу после resolution; redeem только переводит их в pUSD. ${marketLink}
      </div>`;
    els.dialog.showModal();
  }

  function buildCsv(rows) {
    const headers = [
      'start_iso','event_slug','winner','resolved','resolution_source','close_up','close_down',
      'pnl_close_usdc','calculation_exact','payout_usdc','taker_fee_usdc','buy_cash_with_fees','sell_cash_after_fees',
      'api_pnl_usdc','api_minus_calculation_usdc','audit_status','claim_status','redeemable_winning_shares',
      'up_buy_ops','up_buy_fills','up_buy_usdc','up_buy_shares','up_sell_ops','up_sell_usdc','net_up_shares',
      'down_buy_ops','down_buy_fills','down_buy_usdc','down_buy_shares','down_sell_ops','down_sell_usdc','net_down_shares',
      'taker_fills','maker_fills','assumed_taker_fills','condition_id','excluded','quality_issues'
    ];
    const lines = [headers];
    for (const row of rows) {
      lines.push([
        row.startSec ? new Date(row.startSec * 1000).toISOString() : '', row.eventSlug || row.slug || '', row.winner || '', row.resolved,
        row.resolutionSource || '', row.closeUpPrice ?? '', row.closeDownPrice ?? '', row.pnl ?? '', row.calculationExact,
        row.payout ?? '', row.feeTotal, row.buyCashWithFees, row.sellCashAfterFees, row.apiPnl ?? '', row.reconciliationDelta ?? '', row.auditStatus,
        row.claimInfo?.status || '', row.claimInfo?.redeemableShares || 0,
        row.up.buyOps, row.up.buyFills, row.up.buyNotional, row.up.buyShares, row.up.sellOps, row.up.sellNotional, row.netSharesUp,
        row.down.buyOps, row.down.buyFills, row.down.buyNotional, row.down.buyShares, row.down.sellOps, row.down.sellNotional, row.netSharesDown,
        row.settlement?.takerCount || 0, row.settlement?.makerCount || 0, row.settlement?.assumedTakerCount || 0, row.conditionId, row.excluded, row.qualityIssues.join('; ')
      ]);
    }
    return '\uFEFF' + lines.map(cols => cols.map(value => `"${(typeof value === 'string' && /^[\s]*[=+@\-]/.test(value) ? "'"+value : String(value)).replaceAll('"','""')}"`).join(',')).join('\r\n');
  }

  function exportCsv() {
    const rows = getVisibleRows();
    if (!rows.length) return;
    const blob = new Blob([buildCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `polymarket-btc${state.timeframe}-${state.proxyWallet || 'demo'}-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    const notice=document.createElement('div');
    notice.className='toast';
    notice.append('CSV ready. ');
    const link=document.createElement('a');
    link.href=url; link.download=a.download; link.textContent='Download CSV';
    notice.appendChild(link); els.toastWrap.appendChild(notice);
    window.setTimeout(()=>{URL.revokeObjectURL(url);notice.remove();},60000);
  }

  function setLoading(loading, silent = false) {
    state.loading = loading;
    els.load.disabled = loading;
    els.wallet.disabled = loading;
    els.demo.disabled = loading;
    els.audit.disabled = loading || state.demo || !state.proxyWallet;
    if (!silent) els.load.innerHTML = loading ? '<span class="spinner"></span>Загрузка…' : 'Load report';
  }

  function initializeTradeState(trades) {
    state.allTrades = prepareTradeBatch(trades).filter(isBtcMarket);
    classifyTakerTrades();
    state.tradeKeys = new Set(state.allTrades.map(tradeKey));
    state.newTradeKeys.clear();
    state.lastTradeTimestamp = state.allTrades.reduce((max, trade) => Math.max(max, normalizeTimestamp(trade.timestamp)), 0);
  }

  async function loadReport({ silent = false } = {}) {
    if (state.loading) return;
    const inputAddress = extractAddress(els.address.value);
    if (!inputAddress) {
      if (!silent) toast('Не найден корректный адрес формата 0x…', 'error');
      return;
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const requestedSince = getHistorySinceSec();
    if (!Number.isFinite(requestedSince) || requestedSince <= 0 || requestedSince >= nowSec) {
      if (!silent) toast('Start date must be before the current time.', 'error');
      return;
    }
    const generation = ++state.generation;
    els.dialog.close();
    invalidateRebates();
    state.livePolling=false; state.settlementLoading=false; state.auditLoading=false;
    setLoading(true, silent);
    state.demo = false;
    state.truncatedTrades=false;
    state.ledgerEvents=[]; state.ledgerComplete=false; state.ledgerCoverageEnd=0; state.qualityWarnings=[];
    state.rows=[]; state.allTrades=[]; state.currentPositions=[]; state.closedPositions=[]; state.markets=new Map();
    state.proxyWallet=''; state.lastTradeTimestamp=0; state.lastLiveAt=0;
    document.getElementById('rebateResult').textContent='Fetch a UTC day for the current visible markets.';
    els.resolvedAddress.textContent='—'; els.lastUpdated.textContent='Loading';
    render();
    state.marketPnlCache = new Map();
    state.clobMarkets = new Map();
    state.takerTrades = [];
    state.takerHistoryComplete = false;
    state.auditCompleted = 0;
    state.auditFailed = 0;
    const sinceSec = Math.floor(requestedSince / getTimeframe().seconds) * getTimeframe().seconds;
    if (!Number.isFinite(sinceSec) || sinceSec <= 0 || sinceSec >= nowSec) {
      if (!silent) toast('Start date must be before the current time.', 'error');
      setLoading(false, silent);
      return;
    }
    state.historySinceSec = sinceSec;
    try {
      if (!silent) setStatus('Определяю proxy wallet профиля Polymarket…', 'loading');
      const profile = await resolveProfile(inputAddress);
      if (generation !== state.generation) return;
      state.inputAddress = inputAddress;
      state.proxyWallet = profile.proxyWallet;
      els.resolvedAddress.textContent = `${profile.name ? profile.name + ' · ' : ''}${shortAddress(profile.proxyWallet)}${profile.warning ? ' · profile mapping unverified' : ''}`;
      if (profile.warning) {
        state.qualityWarnings.push(profile.warning);
        if (!silent) toast(profile.warning);
      }

      if (!silent) setStatus('Загружаю fills с выбранной даты, taker‑классификацию и позиции…', 'loading');
      const dataResults = await Promise.allSettled([
        fetchTradeHistory(profile.proxyWallet, sinceSec, nowSec),
        fetchTakerTradeHistory(profile.proxyWallet, sinceSec),
        fetchCurrentPositions(profile.proxyWallet),
        fetchClosedPositions(profile.proxyWallet, sinceSec, 200),
        fetchLedgerActivity(profile.proxyWallet,sinceSec,nowSec)
      ]);
      if (generation !== state.generation) return;
      if (dataResults[0].status !== 'fulfilled') throw dataResults[0].reason;
      const trades = dataResults[0].value;
      state.ledgerEvents=dataResults[4].status==='fulfilled' ? dataResults[4].value.rows : [];
      state.ledgerCoverageEnd=nowSec;
      state.ledgerComplete=dataResults[4].status==='fulfilled' && dataResults[4].value.complete;
      if (!state.ledgerComplete) state.qualityWarnings.push('Inventory-event / rebate history unavailable or incomplete');
      for (const [i,label] of [[1,'Maker/taker history'],[2,'Open positions'],[3,'Closed positions']]) if (dataResults[i].status==='rejected') state.qualityWarnings.push(`${label} unavailable`);
      const takerResult = dataResults[1].status === 'fulfilled' ? dataResults[1].value : { trades: [], complete: false };
      state.takerTrades = takerResult.trades;
      state.takerHistoryComplete = Boolean(takerResult.complete);
      state.takerCoverageEnd = takerResult.coverageEnd || 0;
      state.currentPositions = dataResults[2].status === 'fulfilled' ? dataResults[2].value : [];
      state.closedPositions = dataResults[3].status === 'fulfilled' ? dataResults[3].value : [];
      if (dataResults[1].status === 'rejected') console.warn('Taker classification unavailable; market orders will be treated as taker:', dataResults[1].reason);
      if (dataResults[2].status === 'rejected') console.warn('Positions unavailable:', dataResults[2].reason);
      if (dataResults[3].status === 'rejected') console.warn('Closed positions unavailable:', dataResults[3].reason);

      initializeTradeState(trades);
      const groups = buildGroups(state.allTrades, sinceSec);
      if (!silent) setStatus(`Найдено ${groups.length} BTC ${state.timeframe} раундов. Проверяю final 1/0 и fee‑параметры…`, 'loading');
      const marketResults = await Promise.allSettled([fetchMarkets(groups), fetchClobMarketInfos(groups)]);
      if (generation !== state.generation) return;
      state.markets = marketResults[0].status === 'fulfilled' ? marketResults[0].value : new Map();
      state.clobMarkets = marketResults[1].status === 'fulfilled' ? marketResults[1].value : new Map();
      if (marketResults[0].status === 'rejected') throw marketResults[0].reason;
      if (marketResults[1].status === 'rejected') console.warn('Fee config API unavailable; using crypto fallback:', marketResults[1].reason);

      refreshRowsFromCache();
      render();
      await verifyMarketPnls(groups, { force: true, silent });
      if (generation!==state.generation) return;
      refreshRowsFromCache();
      if (generation !== state.generation) return;
      state.lastLoadAt = Date.now();
      state.lastSettlementAt = Date.now();
      storageSet('pm-btc5m-address', inputAddress);
      storageSet('pm-btc5m-lookback', String(els.lookback.value));
      storageSet('pm-btc5m-start', String(els.start?.value || ''));

      els.lastUpdated.textContent = `История ${new Date().toLocaleTimeString('ru-RU')}`;
      els.audit.disabled = false;
      render();
      if (!silent && state.truncatedTrades) toast('На счёте очень много fills; часть самых старых записей могла не попасть в выбранный период.');
    } catch (error) {
      if (generation !== state.generation) return;
      state.proxyWallet=''; state.rows=[]; state.allTrades=[]; render();
      console.error(error);
      setStatus(error.message || 'Не удалось загрузить данные', 'error');
      if (!silent) toast(error.message || 'Ошибка загрузки', 'error');
      setLiveUi('error');
    } finally {
      if (generation!==state.generation) return;
      setLoading(false, silent);
      renderDiagnostics();
      renderReportStatus();
      els.load.innerHTML = 'Load report';
    }
  }

  function mergeLiveTrades(incoming) {
    const newRows = [];
    for (const trade of incoming) {
      if (!isBtcMarket(trade)) continue;
      const key = tradeKey(trade);
      if (!state.tradeKeys.has(key)) {
        state.tradeKeys.add(key);
        state.newTradeKeys.set(key, Date.now() + 9000);
        newRows.push(trade);
      }
    }
    if (!newRows.length) return [];
    state.allTrades = prepareTradeBatch([...newRows, ...state.allTrades])
      .filter(trade => normalizeTimestamp(trade.timestamp) >= state.historySinceSec - getTimeframe().seconds && isBtcMarket(trade))
      .sort((a, b) => normalizeTimestamp(b.timestamp) - normalizeTimestamp(a.timestamp));
    classifyTakerTrades();
    state.tradeKeys = new Set(state.allTrades.map(tradeKey));
    state.lastTradeTimestamp = state.allTrades.reduce((max, trade) => Math.max(max, normalizeTimestamp(trade.timestamp)), 0);
    return newRows;
  }

  async function pollLiveTrades() {
    if (!els.autoRefresh.checked || state.demo || !state.proxyWallet || state.loading || state.livePolling || document.visibilityState !== 'visible') return;
    state.livePolling = true;
    const generation=state.generation;
    try {
      const endSec = Math.floor(Date.now() / 1000);
      const startSec = Math.max(state.historySinceSec, (state.lastTradeTimestamp || endSec - getTimeframe().seconds) - 120);
      const recent = await fetchRecentActivity(state.proxyWallet, startSec, endSec);
      if (generation!==state.generation) return;
      const newRows = mergeLiveTrades(recent);
      state.lastLiveAt = Date.now();

      if (newRows.length) {
        const newMarketHints = newRows.filter(row => {
          const id = String(row.conditionId || '').toLowerCase();
          return id && !state.markets.has(id);
        });
        if (newMarketHints.length) {
          const updates = await Promise.allSettled([fetchMarkets(newMarketHints), fetchClobMarketInfos(newMarketHints)]);
          if (generation!==state.generation) return;
        if (updates[0].status === 'fulfilled') state.markets = mergeMarketMaps(state.markets, updates[0].value);
          if (updates[1].status === 'fulfilled') state.clobMarkets = mergeMarketMaps(state.clobMarkets, updates[1].value);
        }
        refreshRowsFromCache();
        render();
        const total = newRows.reduce((sum, row) => sum + tradeNotional(row), 0);
        toast(`Новые fills: ${newRows.length} · ${fmtMoney(total)}`);
      } else {
        renderLiveFeed();
        renderCurrentRound();
        setLiveUi('ok');
      }
    } catch (error) {
      if (generation!==state.generation) return;
      console.warn('Live poll failed:', error);
      setLiveUi('error');
      els.liveStatus.textContent = 'Ошибка live-ленты · повтор через 2,5 с';
    } finally {
      if (generation===state.generation) state.livePolling = false;
    }
  }

  async function refreshSettlementData() {
    if (!els.autoRefresh.checked || state.demo || !state.proxyWallet || state.loading || state.settlementLoading || document.visibilityState !== 'visible') return;
    state.settlementLoading = true;
    const generation=state.generation;
    try {
      const nowSec = Math.floor(Date.now() / 1000);
      const recentClosedSince = nowSec - 3 * 3600;
      const positionResults = await Promise.allSettled([
        fetchCurrentPositions(state.proxyWallet),
        fetchClosedPositions(state.proxyWallet, recentClosedSince, 10),
        fetchTakerTradeHistory(state.proxyWallet, state.historySinceSec, 9000),
        fetchLedgerActivity(state.proxyWallet,state.historySinceSec,nowSec)
      ]);
      if (generation!==state.generation) return;
      if (positionResults[0].status === 'fulfilled') state.currentPositions = positionResults[0].value;
      if (positionResults[1].status === 'fulfilled') state.closedPositions = mergePositionRows(state.closedPositions, positionResults[1].value);
      if (positionResults[2].status === 'fulfilled') {
        state.takerTrades = mergeTakerTrades(state.takerTrades, positionResults[2].value.trades);
        state.takerHistoryComplete=positionResults[2].value.complete;
        state.takerCoverageEnd=positionResults[2].value.coverageEnd;
        classifyTakerTrades();
      }
      if (positionResults[3].status==='fulfilled') {
        state.ledgerEvents=positionResults[3].value.complete ? positionResults[3].value.rows : mergeLedgerEvents(state.ledgerEvents,positionResults[3].value.rows);
        state.ledgerCoverageEnd=nowSec;
        state.ledgerComplete=positionResults[3].value.complete;
      } else { state.ledgerComplete=false; }

      const marketsToRefresh = state.rows.filter(row => !row.resolved || row.endSec >= nowSec - 1800);
      if (marketsToRefresh.length) {
        const updates = await Promise.allSettled([fetchMarkets(marketsToRefresh), fetchClobMarketInfos(marketsToRefresh)]);
        if (generation!==state.generation) return;
        if (updates[0].status === 'fulfilled') state.markets = mergeMarketMaps(state.markets, updates[0].value);
        if (updates[1].status === 'fulfilled') state.clobMarkets = mergeMarketMaps(state.clobMarkets, updates[1].value);
      }
      refreshRowsFromCache();
      await verifyMarketPnls(buildGroups(state.allTrades, state.historySinceSec), { silent: true, recentOnly: true });
      if (generation!==state.generation) return;
      refreshRowsFromCache();
      state.lastSettlementAt = Date.now();
      els.lastUpdated.textContent = `P&L ${new Date().toLocaleTimeString('ru-RU')}`;
      renderMetrics(); renderRows(); renderCurrentRound(); renderChart(); renderDiagnostics();
      renderReportStatus();
    } catch (error) {
      if (generation!==state.generation) return;
      console.warn('Settlement refresh failed:', error);
    } finally {
      if (generation===state.generation) state.settlementLoading = false;
    }
  }

  async function connectWallet() {
    if (!window.ethereum?.request) {
      toast('MetaMask не найден. Вставьте адрес профиля вручную или откройте страницу в браузере с кошельком.', 'error');
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts?.[0]) throw new Error('Кошелёк не вернул адрес');
      els.address.value = accounts[0];
      await loadReport();
    } catch (error) {
      toast(error?.message || 'Подключение отменено', 'error');
    }
  }

  function demoData() {
    const currentStart = Math.floor(Date.now() / (getTimeframe().seconds * 1000)) * getTimeframe().seconds;
    const trades = [];
    const markets = new Map();
    const clobMarkets = new Map();
    let seed = 9137;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const makeTrade = (roundStart, outcome, side, size, price, index) => ({
      proxyWallet: '0xDemo000000000000000000000000000000000000',
      asset: `${roundStart}-${outcome}`,
      conditionId: `0x${String(roundStart).padStart(64, '0')}`,
      size: roundTo(size, 5), price: roundTo(price, 4), usdcSize: roundTo(size * price, 8),
      timestamp: roundStart + 18 + (index % 10) * 13,
      title: `Bitcoin Up or Down — ${state.timeframe} demo ${shortTimeFmt.format(new Date(roundStart * 1000))}`,
      slug: `btc-updown-${state.timeframe}-${roundStart}`, eventSlug: `btc-updown-${state.timeframe}-${roundStart}`,
      outcome, side, transactionHash: `0x${String(roundStart + index).padStart(64, 'a')}`
    });

    for (let i = 1; i <= 42; i++) {
      const start = currentStart - i * getTimeframe().seconds;
      const winner = random() > .48 ? 'Up' : 'Down';
      const condition = `0x${String(start).padStart(64, '0')}`.toLowerCase();
      const upSize = 8 + Math.floor(random() * 26);
      const downSize = 8 + Math.floor(random() * 26);
      trades.push(makeTrade(start, 'Up', 'BUY', upSize, .22 + random() * .56, i * 10 + 1));
      trades.push(makeTrade(start, 'Down', 'BUY', downSize, .22 + random() * .56, i * 10 + 2));
      if (i % 4 === 0) {
        const outcome = random() > .5 ? 'Up' : 'Down';
        const bought = outcome === 'Up' ? upSize : downSize;
        trades.push(makeTrade(start, outcome, 'SELL', Math.max(1, bought * .25), .28 + random() * .58, i * 10 + 3));
      }
      markets.set(condition, {
        conditionId: condition, closed: true, resolved: true, active: false, feesEnabled: true,
        outcomes: '["Up","Down"]', outcomePrices: winner === 'Up' ? '["1","0"]' : '["0","1"]'
      });
      clobMarkets.set(condition, { fd: { r: 0.07, e: 1, to: true } });
    }
    trades.push(makeTrade(currentStart, 'Down', 'BUY', 18, .42, 1));
    trades.push(makeTrade(currentStart, 'Up', 'BUY', 12, .51, 2));
    const currentCondition = `0x${String(currentStart).padStart(64, '0')}`.toLowerCase();
    markets.set(currentCondition, { conditionId: currentCondition, closed: false, active: true, feesEnabled: true, outcomes: '["Up","Down"]', outcomePrices: '["0.49","0.51"]' });
    clobMarkets.set(currentCondition, { fd: { r: 0.07, e: 1, to: true } });
    return { trades, markets, clobMarkets };
  }

  function showDemo() {
    const demo = demoData();
    state.generation++;
    els.dialog.close();
    invalidateRebates();
    state.livePolling=false; state.settlementLoading=false; state.auditLoading=false;
    state.truncatedTrades=false;
    state.ledgerEvents=[];
    state.ledgerComplete=true;
    state.ledgerCoverageEnd=Infinity;
    state.qualityWarnings=[];
    state.takerCoverageEnd=Infinity;
    document.getElementById('rebateResult').textContent='Demo has no real rebate records.';
    state.demo = true;
    state.proxyWallet = 'demo';
    state.inputAddress = '';
    state.historySinceSec = Math.floor(getHistorySinceSec() / getTimeframe().seconds) * getTimeframe().seconds;
    state.currentPositions = [];
    state.closedPositions = [];
    state.markets = demo.markets;
    state.clobMarkets = demo.clobMarkets;
    state.takerTrades = prepareTradeBatch(demo.trades);
    state.takerHistoryComplete = true;
    state.marketPnlCache = new Map();
    initializeTradeState(demo.trades);
    refreshRowsFromCache();

    // Create deterministic audit cases: most match, some API zeros are intentionally stale,
    // and one row has a visible discrepancy. The close calculation always remains primary.
    for (const row of state.rows.filter(item => item.resolved && item.pnl != null)) {
      let apiPnl = row.pnl;
      if (Math.floor(row.startSec / getTimeframe().seconds) % 11 === 0 && Math.abs(row.pnl) > 0.05) apiPnl = 0;
      else if (Math.floor(row.startSec / getTimeframe().seconds) % 17 === 0) apiPnl = roundTo(row.pnl + 0.19, 8);
      const assets = [...new Map(row.trades.map(t => [String(t.asset), normalizeOutcome(t.outcome)])).entries()];
      const rows = assets.map(([asset, outcome], index) => ({
        conditionId: row.conditionId, asset, outcome,
        totalPnl: index === 0 ? apiPnl : 0,
        cashPnl: index === 0 ? apiPnl : 0,
        realizedPnl: 0,
        curPrice: outcome === row.winner ? 1 : 0,
        size: 0, _pnlSource: 'market-positions'
      }));
      state.marketPnlCache.set(row.conditionId, {
        ok: true, finalized: true, winner: row.winner, pnl: apiPnl, rows,
        allPnlFieldsZero: Math.abs(apiPnl) < 1e-9, fetchedAt: Date.now(), source: 'demo audit'
      });
      if (Math.floor(row.startSec / getTimeframe().seconds) % 6 === 0 && row.winningShares > 0) {
        const asset = row.trades.find(t => normalizeOutcome(t.outcome) === row.winner)?.asset || '';
        state.currentPositions.push({ conditionId: row.conditionId, asset, outcome: row.winner, size: row.winningShares, curPrice: 1, redeemable: true, currentValue: row.winningShares });
      }
    }
    refreshRowsFromCache();
    state.lastLoadAt = Date.now();
    state.lastSettlementAt = Date.now();
    els.audit.disabled = true;
    els.resolvedAddress.textContent = 'Демо-данные';
    els.lastUpdated.textContent = `Демо ${new Date().toLocaleTimeString('ru-RU')}`;
    render();
  }

  async function fetchLedgerActivity(user,startSec,endSec) {
    const result=await fetchActivityWindow(user,startSec,endSec,['SPLIT','MERGE','CONVERSION','MAKER_REBATE','TAKER_REBATE']);
    if (result.rows.some(r=>!r || !normalizeTimestamp(r.timestamp) || !['SPLIT','MERGE','CONVERSION','MAKER_REBATE','TAKER_REBATE'].includes(r.type) || (['MAKER_REBATE','TAKER_REBATE'].includes(r.type) && (nullableNumber(r.usdcSize)==null || Number(r.usdcSize)<0)))) throw new Error('Invalid inventory / rebate activity');
    return result;
  }

  function mergeLedgerEvents(existing,incoming) {
    const map=new Map();
    for (const e of [...existing,...incoming]) map.set([e.type,e.transactionHash,e.timestamp,e.conditionId,e.asset,e.usdcSize,e.size].join('|'),e);
    return [...map.values()];
  }

  function invalidateRebates() {
    state.rebateRequest++; state.rebateLoading=false; state.dailyRebateRows=[];
    document.getElementById('rebateResult').textContent='Fetch a UTC day for the current visible markets.';
  }

  function traderDiagnostics(rows) {
    const settled=rows.filter(r=>r.resolved && r.pnl!=null).sort((a,b)=>a.endSec-b.endSec);
    const wins=settled.filter(r=>r.pnl>0).reduce((n,r)=>n+r.pnl,0);
    const losses=-settled.filter(r=>r.pnl<0).reduce((n,r)=>n+r.pnl,0);
    const trades=rows.flatMap(r=>r.trades || []);
    return {
      count:settled.length, excluded:rows.filter(r=>r.excluded).length,
      pnl:settled.reduce((n,r)=>n+r.pnl,0),
      gross:settled.reduce((n,r)=>n+(r.grossSettlementPnl || 0),0),
      fees:settled.reduce((n,r)=>n+(r.feeTotal || 0),0),
      drawdown:calculateMaxDrawdownFromPoints(buildCumulativeSeries(settled,getEquityChartStartSec())),
      profitFactor:losses>0?wins/losses:wins>0?Infinity:null,
      makers:trades.filter(t=>t._isTaker===false).length,
      takers:trades.filter(t=>t._isTaker===true).length,
      unknown:trades.filter(t=>t._isTaker==null).length
    };
  }

  function renderDiagnostics() {
    const container=document.getElementById('diagnosticMetrics');
    if (!container) return;
    const rows=getVisibleRows(), d=traderDiagnostics(rows);
    const cards=[
      ['Max drawdown',d.count?fmtMoney(d.drawdown):'—','Peak-to-trough settled P&L; starts at $0'],
      ['Profit factor',d.count?(d.profitFactor===Infinity?'∞':d.profitFactor==null?'—':d.profitFactor.toFixed(2)):'—','Winning P&L ÷ absolute losing P&L'],
      ['Gross P&L',d.count?fmtMoney(d.gross,true):'—','Before modeled fees; included settled rounds'],
      ['Modeled fees',d.count?fmtMoney(d.fees):'—','Included settled rounds; already deducted from P&L'],
      ['Maker / taker',`${d.makers} / ${d.takers}`,`${d.unknown} unknown roles; conservative taker estimate`],
      ['Excluded rounds',String(d.excluded),'Excluded from curve, totals and profit factor']
    ];
    container.innerHTML=cards.map(([label,value,note])=>`<div class="metric"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></div>`).join('');
    document.getElementById('diagnosticSummary').textContent=state.rows.length?`${d.count} included · ${d.excluded} excluded`:'Risk, fees, coverage and rebates';
    const notes=[...state.qualityWarnings];
    if (state.truncatedTrades) notes.push('Trade history hit a limit: equity withheld until a complete shorter range is loaded.');
    if (state.proxyWallet && !state.ledgerComplete) notes.push('Inventory events are unverified; model results remain provisional.');
    if (state.rows.length) notes.push(`${state.demo?'Demo':'Loaded'}: ${loadedRangeLabel()}. Filters apply to the chart, summary and market export.`);
    if (d.count) {
      const compared=rows.filter(row=>row.resolved && row.pnl!=null && nullableNumber(row.reconciliationDelta)!=null);
      const net=compared.reduce((sum,row)=>sum+row.reconciliationDelta,0);
      const absolute=compared.reduce((sum,row)=>sum+Math.abs(row.reconciliationDelta),0);
      notes.push(`API ✓ means within per-round tolerance: max($0.03, 0.05% of buy + sell notional). ${compared.length}/${d.count} compared; net API − calc ${fmtMoney(net,true)}; sum of absolute gaps ${fmtMoney(absolute)}. This is reconciliation, not receipt verification.`);
    }
    notes.push(`This is settled BTC ${state.timeframe} trading P&L from zero, not wallet balance or return on capital. Deposits, withdrawals, open-position marks and external token transfers are not reconstructed. Fee schedules and public maker/taker matching are model inputs, not transaction receipt proof.`);
    document.getElementById('coverageNote').textContent=notes.join(' ');
    const credits=state.ledgerEvents.filter(e=>['MAKER_REBATE','TAKER_REBATE'].includes(e.type));
    const sum=credits.reduce((n,e)=>n+Math.max(0,nullableNumber(e.usdcSize) || 0),0);
    document.getElementById('rebatePayouts').textContent=state.demo?'Demo — no payout evidence':!state.proxyWallet?'No wallet loaded':state.ledgerComplete?`${fmtMoney(sum)} observed wallet-wide rebate payouts · ${credits.length} records`:'Rebate payout coverage incomplete';
    document.getElementById('rebateLoad').disabled=!state.proxyWallet || state.demo || state.loading || state.rebateLoading;
  }

  async function loadDailyRebates() {
    const generation=state.generation, button=document.getElementById('rebateLoad'), output=document.getElementById('rebateResult');
    const day=document.getElementById('rebateDate').value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !state.proxyWallet || state.demo) return;
    const request=++state.rebateRequest; state.rebateLoading=true;
    button.disabled=true; output.textContent='Loading reported rebates…';
    try {
      const url=new URL(`${CLOB_API}/rebates/current`);
      url.searchParams.set('date',day); url.searchParams.set('maker_address',state.proxyWallet);
      const payload=await fetchJson(url.toString(),{label:'Daily maker rebates'});
      if (generation!==state.generation || request!==state.rebateRequest) return;
      if (payload === null) {
        state.dailyRebateRows=[];
        output.textContent=`No rebate records returned for ${day}; no amount confirmed.`;
        return;
      }
      if (!Array.isArray(payload)) throw new Error('Unexpected rebate response');
      const eligible=payload.filter(r=>String(r.maker_address || '').toLowerCase()===state.proxyWallet.toLowerCase() && r.date===day);
      if (eligible.some(r=>nullableNumber(r.rebated_fees_usdc)==null || Number(r.rebated_fees_usdc)<0)) throw new Error('Invalid rebate amount returned');
      const ids=new Set(getVisibleRows().map(r=>r.conditionId));
      const matched=eligible.filter(r=>ids.has(String(r.condition_id || '').toLowerCase()));
      const total=matched.reduce((n,r)=>n+Number(r.rebated_fees_usdc),0);
      output.textContent=`${fmtMoney(total)} reported for visible BTC ${state.timeframe} markets on ${day} UTC · ${matched.length} records. Daily accrual, not proof of payment; excluded from the equity curve and wallet payout total.`;
      state.dailyRebateRows=matched;
    } catch(error) { if (generation===state.generation && request===state.rebateRequest) output.textContent=`Rebates unavailable: ${error.message}`; }
    finally { if (generation===state.generation && request===state.rebateRequest) {state.rebateLoading=false;button.disabled=false;} }
  }

  function handleAutoRefreshChange() {
    setLiveUi();
    if (els.autoRefresh.checked && state.proxyWallet && !state.demo) {
      pollLiveTrades();
      refreshSettlementData();
    }
  }

  els.load.addEventListener('click', () => loadReport());
  els.timeframe.addEventListener('change', handleTimeframeChange);
  document.getElementById('rebateDate').value=new Date().toISOString().slice(0,10);
  document.getElementById('rebateDate').addEventListener('change',()=>{invalidateRebates();renderDiagnostics();});
  document.getElementById('rebateLoad').addEventListener('click',loadDailyRebates);
  els.balanceChart.addEventListener('pointerdown',event=>handleChartPointer(event,'balance'));
  els.wallet.addEventListener('click', connectWallet);
  els.demo.addEventListener('click', showDemo);
  els.export.addEventListener('click', exportCsv);
  els.resolvedOnly.addEventListener('change', () => {invalidateRebates();render();});
  els.bothOnly.addEventListener('change', () => {invalidateRebates();render();});
  els.sort.addEventListener('change', renderRows);
  els.audit.addEventListener('click', async () => {
    const generation=state.generation;
    await verifyMarketPnls(buildGroups(state.allTrades, state.historySinceSec), { force: true, silent: false });
    if (generation!==state.generation) return;
    refreshRowsFromCache();
    render();
    const rows = getVisibleRows().filter(row => row.resolved && row.pnl != null);
    const verified = rows.filter(row => row.auditStatus === 'verified').length;
    const stale = rows.filter(row => row.auditStatus === 'stale-zero').length;
    const mismatch = rows.filter(row => row.auditStatus === 'mismatch').length;
    toast(`Перепроверено: API✓ ${verified}, stale 0: ${stale}, расхождения: ${mismatch}.`);
  });
  els.autoRefresh.addEventListener('change', handleAutoRefreshChange);
  els.liveToggle.addEventListener('click', () => {
    if (state.demo || !state.proxyWallet) return;
    els.autoRefresh.checked = !els.autoRefresh.checked;
    handleAutoRefreshChange();
  });
  els.liveCount.addEventListener('change', () => {
    storageSet('pm-btc5m-live-count', els.liveCount.value);
    renderLiveFeed();
  });
  if (els.chartCount) els.chartCount.addEventListener('change', () => {
    storageSet('pm-btc5m-chart-count-v2', 'all');
    renderChart();
  });
  els.lookback.addEventListener('change', () => {
    invalidateRebates();
    storageSet('pm-btc5m-lookback', els.lookback.value);
    renderMetrics();
    renderRows();
    renderChart();
    renderDiagnostics();
    document.getElementById('rebateResult').textContent='Fetch a UTC day for the current visible markets.';
    renderReportStatus();
  });
  els.start.addEventListener('change', () => {
    storageSet('pm-btc5m-start', els.start.value || '');
  });
  els.address.addEventListener('keydown', event => {
    if (event.key === 'Enter') loadReport();
  });
  els.closeModal.addEventListener('click', () => els.dialog.close());
  els.dialog.addEventListener('click', event => {
    const rect = els.dialog.getBoundingClientRect();
    const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    if (outside) els.dialog.close();
  });
  els.chart.addEventListener('mousemove', event => handleChartPointer(event, 'pnl'));
  els.chart.addEventListener('mouseleave', () => { els.chartTooltip.hidden = true; });
  els.balanceChart.addEventListener('mousemove', event => handleChartPointer(event, 'balance'));
  els.balanceChart.addEventListener('mouseleave', () => { els.balanceChartTooltip.hidden = true; });

  window.setInterval(pollLiveTrades, LIVE_POLL_MS);
  window.setInterval(refreshSettlementData, SETTLEMENT_REFRESH_MS);
  window.setInterval(() => {
    renderCurrentRound();
    updateLiveBadges();
    cleanupNewTradeKeys();
  }, 1000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !els.autoRefresh.checked || !state.proxyWallet || state.demo) return;
    pollLiveTrades();
    if (Date.now() - state.lastSettlementAt > SETTLEMENT_REFRESH_MS) refreshSettlementData();
  });

  window.addEventListener('resize', () => {
    clearTimeout(state.chartResizeTimer);
    state.chartResizeTimer = window.setTimeout(renderChart, 120);
  });

  state.timeframe = normalizeTimeframe(new URLSearchParams(location.search).get('timeframe') || storageGet('pm-btc-timeframe'));
  syncTimeframeLabels();
  const savedAddress = storageGet('pm-btc5m-address');
  const savedLookback = storageGet('pm-btc5m-lookback');
  const savedStart = storageGet('pm-btc5m-start');
  const savedChartCount = storageGet('pm-btc5m-chart-count-v2');
  const savedLiveCount = storageGet('pm-btc5m-live-count');
  if (savedAddress) els.address.value = savedAddress;
  if (savedLookback && ['1','6','24','all'].includes(savedLookback)) els.lookback.value = savedLookback;
  if (savedStart) els.start.value = savedStart;
  if (!els.start.value) els.start.value = datetimeLocalFromSec(Math.floor(Date.now() / 1000) - HISTORY_HOURS * 3600);
  if (els.chartCount) els.chartCount.value = 'all';
  if (savedLiveCount && ['20','50','100','200','all'].includes(savedLiveCount)) els.liveCount.value = savedLiveCount;

  els.audit.disabled = true;
  try { state.calculationSelfTest = runCalculationSelfTest(); }
  catch (error) { state.calculationSelfTest = { ok: false, message: error.message }; console.error(error); setStatus(error.message, 'error'); }
  setLiveUi();
  renderDiagnostics();
  renderCurrentRound();
  renderChart();

  const params = new URLSearchParams(location.search);
  if (params.get('demo') === '1') window.setTimeout(showDemo, 80);
  const queryStart = params.get('start');
  if (queryStart) {
    const ms = Date.parse(queryStart);
    if (Number.isFinite(ms)) els.start.value = datetimeLocalFromSec(Math.floor(ms / 1000));
  }
  const queryAddress = extractAddress(new URLSearchParams(location.search).get('wallet') || '');
  if (queryAddress) {
    els.address.value = queryAddress;
    window.setTimeout(() => loadReport(), 100);
  }
})();
