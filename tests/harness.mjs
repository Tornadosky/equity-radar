import vm from 'node:vm';
import fs from 'node:fs';
export function loadRadar(overrides={}, {boot=false}={}) {
  const nodes = new Map();
  const canvasContext = new Proxy({}, {get: (target, key) => target[key] || (()=>{}), set: (target,key,value) => (target[key]=value,true)});
  const makeNode = (id='') => ({value:id==='lookbackSelect'?'all':id==='timeframeSelect'?'5m':'',checked:false,style:{},dataset:{},innerHTML:'',textContent:'',children:[],attributes:{},querySelectorAll:()=>[],addEventListener(){},appendChild(node){this.children.push(node);},append(){},remove(){},click(){this.clicked=true;},close(){this.open=false;},showModal(){this.open=true;},setAttribute(key,value){this.attributes[key]=value;},getBoundingClientRect:()=>({width:1000,height:370,left:0,top:0}),getContext:()=>canvasContext});
  const document = {visibilityState:'visible',documentElement:{},body:makeNode(),addEventListener(){},querySelectorAll:()=>[],getElementById(id){if(!nodes.has(id))nodes.set(id,makeNode(id));return nodes.get(id);},createElement:()=>makeNode()};
  const defaultWindow={location:{origin:'http://localhost'},localStorage:{getItem:()=>null,setItem(){}},setTimeout:()=>0,setInterval:()=>0,requestAnimationFrame:fn=>fn(),addEventListener(){}};
  const context=vm.createContext({document,location:{search:''},getComputedStyle:()=>({getPropertyValue:()=>''}),Blob,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,console,Intl,Date,Map,Set,...overrides,window:{...defaultWindow,...overrides.window}});
  const source=fs.readFileSync(new URL('../public/assets/radar.js',import.meta.url),'utf8');
  const names=['document','verifyMarketPnls','feeConfigForMarket','traderDiagnostics','state','els','feeForTrade','calculateRoundSettlement','marketWinner','inferWinnerFromPositions','enrichGroups','buildGroups','prepareTradeBatch','mergeTakerTrades','classifyTakerTrades','buildCumulativeSeries','calculateMaxDrawdownFromPoints','getVisibleRows','getDailyChartRows','buildCsv','fetchActivityHistory','fetchRecentActivity','fetchTakerTradeHistory','tradeFingerprint','normalizeTradeRecord','runCalculationSelfTest','demoData','isBtc5m','notionalEvidence','tradeNotional','normalizeTimeframe','getTimeframe','isBtcMarket','getStartSec','formatRange','renderCurrentRound','handleTimeframeChange','syncTimeframeLabels','showDemo','loadReport','initializeTradeState','mergeLiveTrades','exportCsv','loadDailyRebates','invalidateRebates','resolveProfile'];
  const end=boot?source.lastIndexOf("})();"):source.indexOf("  els.load.addEventListener");
  const api=vm.runInContext(source.slice(0,end)+`return {${names.join(',')}};\n})();`,context);
  return {...api, document};
}
