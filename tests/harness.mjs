import vm from 'node:vm';
import fs from 'node:fs';
export function loadRadar(overrides={}) {
  const nodes = new Map();
  const document = { visibilityState:'visible', getElementById(id) { if (!nodes.has(id)) nodes.set(id,{value:id==='lookbackSelect'?'all':'',checked:false,style:{},dataset:{},innerHTML:'',textContent:'',querySelectorAll:()=>[],appendChild(){}});return nodes.get(id); },createElement:()=>({remove(){}}) };
  const context = vm.createContext({document,window:{location:{origin:'http://localhost'},localStorage:{getItem:()=>null,setItem(){}},setTimeout:()=>0},URL,URLSearchParams,AbortController,setTimeout,clearTimeout,console,Intl,Date,Map,Set,...overrides});
  const source=fs.readFileSync(new URL('../public/assets/radar.js',import.meta.url),'utf8');
  const names=['verifyMarketPnls','feeConfigForMarket','traderDiagnostics','state','els','feeForTrade','calculateRoundSettlement','marketWinner','inferWinnerFromPositions','enrichGroups','buildGroups','prepareTradeBatch','mergeTakerTrades','classifyTakerTrades','buildCumulativeSeries','calculateMaxDrawdownFromPoints','getVisibleRows','getDailyChartRows','buildCsv','fetchActivityHistory','fetchRecentActivity','fetchTakerTradeHistory','tradeFingerprint','normalizeTradeRecord','runCalculationSelfTest','demoData'];
  const api=vm.runInContext(source.slice(0,source.indexOf("  els.load.addEventListener"))+`return {${names.join(',')}};\n})();`,context);
  return api;
}
