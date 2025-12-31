
/**
 * PolyEdge Arbitrage Core - "Smart Ape" 15M Engine
 * 针对 Bitcoin Up or Down - 15 minute 市场深度优化
 */
import http from 'http';

let state = {
  config: {
    engineActive: false,
    scanIntervalMs: 2000,
    profitThreshold: 0.005, 
    betAmount: 10,
    autoBet: true,
    maxSettleMinutes: 120 // 缩短默认窗口，专注于近期市场
  },
  stats: {
    totalTrades: 0,
    wonTrades: 0,
    totalVolume: 0,
    netProfit: 0,
    balance: 5000,
    winRate: 0,
    scannedCount: 0 
  },
  pairs: [],
  logs: [],
  orders: []
};

const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';

function addLog(message, level = 'INFO') {
  const log = {
    id: Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    level,
    message
  };
  state.logs.push(log);
  if (state.logs.length > 50) state.logs.shift();
  console.log(`[${log.timestamp}] [${level}] ${message}`);
}

async function safeFetch(url, options = {}) {
    try {
        const res = await fetch(url, { ...options, signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (e) {
        return null;
    }
}

function parseTokens(tokenIds) {
    if (!tokenIds) return null;
    if (Array.isArray(tokenIds)) return tokenIds;
    try {
        return JSON.parse(tokenIds);
    } catch (e) {
        return null;
    }
}

/**
 * 价格与时间提取逻辑：识别 15M 市场的关键信息
 * 示例 Slug: bitcoin-above-68000-at-1015pm-et
 */
const extractMarketInfo = (m) => {
    const slug = (m.slug || "").toLowerCase();
    const question = (m.question || "").toLowerCase();
    
    // 识别 15M 市场
    const is15M = slug.includes('15m') || slug.includes('15-minute') || question.includes('15 minute');
    
    // 匹配价格数字 (通常跟在 above/below 后面)
    const priceMatch = slug.match(/(?:above|below|higher|lower)-(\d+(?:\.\d+)?)/i);
    const price = priceMatch ? priceMatch[1] : null;
    
    // 匹配时间点 (如 1015pm)
    const timeMatch = slug.match(/(\d{3,4}(?:am|pm))/i);
    const timeAt = timeMatch ? timeMatch[1].toUpperCase() : "";

    return { is15M, price, timeAt };
};

/**
 * 核心配对算法：优先寻找 15M 高频市场
 */
async function discoverPairs() {
  if (!state.config.engineActive) return;
  
  try {
    // 增加 Limit 并指定排序，确保获取到最新的市场
    const markets = await safeFetch(`${GAMMA_API}/markets?category=Crypto&active=true&closed=false&limit=500&order=endDate&dir=asc`);
    if (!markets) return;
    
    state.stats.scannedCount = markets.length;

    const targets = markets.filter(m => {
        const slug = (m.slug || "").toLowerCase();
        const isTargetAsset = slug.includes('btc') || slug.includes('eth') || slug.includes('sol') || 
                              slug.includes('bitcoin') || slug.includes('ethereum') || slug.includes('solana');
        
        const msLeft = new Date(m.endDate).getTime() - Date.now();
        const minsLeft = msLeft / (1000 * 60);
        return isTargetAsset && minsLeft > -5 && minsLeft <= state.config.maxSettleMinutes && m.clobTokenIds;
    });

    let newPairs = [];
    const usedMarketIds = new Set();

    // 1. 寻找 15M 互补对
    for (let i = 0; i < targets.length; i++) {
        for (let j = 0; j < targets.length; j++) {
            if (i === j) continue;
            const m1 = targets[i];
            const m2 = targets[j];
            if (usedMarketIds.has(m1.id) || usedMarketIds.has(m2.id)) continue;

            const info1 = extractMarketInfo(m1);
            const info2 = extractMarketInfo(m2);

            // 必须是同一价格点和同一时间点
            if (info1.price && info1.price === info2.price && info1.timeAt === info2.timeAt) {
                const s1 = m1.slug.toLowerCase();
                const s2 = m2.slug.toLowerCase();
                const isM1Above = s1.includes('above') || s1.includes('higher');
                const isM2Below = s2.includes('below') || s2.includes('lower');
                const isM1Below = s1.includes('below') || s1.includes('lower');
                const isM2Above = s2.includes('above') || s2.includes('higher');

                if ((isM1Above && isM2Below) || (isM1Below && isM2Above)) {
                    const t1 = parseTokens(m1.clobTokenIds);
                    const t2 = parseTokens(m2.clobTokenIds);
                    if (t1 && t2) {
                        const legA = isM1Above ? m1 : m2;
                        const legB = isM1Above ? m2 : m1;
                        const tokA = isM1Above ? t1 : t2;
                        const tokB = isM1Above ? t2 : t1;

                        newPairs.push({
                            id: `${legA.id}-${legB.id}`,
                            asset: s1.includes('btc') ? 'BTC' : (s1.includes('eth') ? 'ETH' : 'SOL'),
                            targetPrice: info1.price,
                            timeAt: info1.timeAt,
                            is15M: info1.is15M,
                            endDate: legA.endDate,
                            isInternal: false,
                            legA: { id: legA.id, symbol: legA.ticker, yesId: tokA[0], price: 0.5 },
                            legB: { id: legB.id, symbol: legB.ticker, yesId: tokB[0], price: 0.5 },
                            sumYES: 1.0,
                            status: 'MONITORING'
                        });
                        usedMarketIds.add(m1.id);
                        usedMarketIds.add(m2.id);
                    }
                }
            }
        }
    }

    // 2. 补全逻辑：显示独立的 15M 市场（YES + NO 镜像）
    targets.forEach(m => {
        if (usedMarketIds.has(m.id)) return;
        const info = extractMarketInfo(m);
        if (!info.is15M && !m.question.toLowerCase().includes('15 minute')) return;

        const tokens = parseTokens(m.clobTokenIds);
        if (tokens && tokens.length >= 2) {
            const slug = m.slug.toLowerCase();
            const isAbove = slug.includes('above') || slug.includes('higher');
            
            newPairs.push({
                id: `self-${m.id}`,
                asset: slug.includes('btc') ? 'BTC' : (slug.includes('eth') ? 'ETH' : 'SOL'),
                targetPrice: info.price || "Spot",
                timeAt: info.timeAt,
                is15M: true,
                endDate: m.endDate,
                isInternal: true,
                legA: { id: m.id, symbol: m.ticker, yesId: tokens[0], price: 0.5 },
                legB: { id: m.id, symbol: m.ticker, yesId: tokens[1], price: 0.5 }, 
                sumYES: 1.0,
                status: 'MONITORING'
            });
            usedMarketIds.add(m.id);
        }
    });

    // 排序：15M 优先，且按结束时间从近到远
    newPairs.sort((a, b) => {
        if (a.is15M && !b.is15M) return -1;
        if (!a.is15M && b.is15M) return 1;
        return new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
    });

    state.pairs = newPairs;
    if (newPairs.length > 0) {
        const m15Count = newPairs.filter(p => p.is15M).length;
        addLog(`刷新完成: 监控中 ${newPairs.length} 组盘口 (其中 ${m15Count} 组为 15M 高频)`, 'INFO');
    }
  } catch (e) {
    console.error("Discovery Error:", e);
  }
}

async function scanPrices() {
  if (!state.config.engineActive || state.pairs.length === 0) return;

  await Promise.all(state.pairs.map(async (pair) => {
    try {
      const [dataA, dataB] = await Promise.all([
        safeFetch(`${CLOB_API}/book?token_id=${pair.legA.yesId}`),
        safeFetch(`${CLOB_API}/book?token_id=${pair.legB.yesId}`)
      ]);

      if (!dataA || !dataB) return;

      const priceA = dataA.asks?.[0]?.price ? parseFloat(dataA.asks[0].price) : pair.legA.price;
      const priceB = dataB.asks?.[0]?.price ? parseFloat(dataB.asks[0].price) : pair.legB.price;

      pair.legA.price = priceA;
      pair.legB.price = priceB;
      pair.sumYES = priceA + priceB;

      if (!pair.isInternal && pair.sumYES < (1 - state.config.profitThreshold) && pair.status !== 'LOCKED') {
        executeArbitrage(pair, 'YES_BASKET', pair.sumYES);
      }
    } catch (e) {}
  }));
}

function executeArbitrage(pair, type, cost) {
    const profit = (1 - cost) * state.config.betAmount;
    pair.status = 'LOCKED';
    
    const order = {
        id: `arb-${Date.now()}`,
        symbol: `${pair.asset} 15M $${pair.targetPrice}`,
        side: 'YES',
        leg: 1,
        price: cost,
        amount: state.config.betAmount,
        status: 'FILLED',
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        txHash: '0x' + Math.random().toString(16).substr(2, 32)
    };
    
    state.orders.unshift(order);
    state.stats.totalTrades++;
    state.stats.wonTrades++;
    state.stats.netProfit += profit;
    state.stats.balance += profit;
    state.stats.winRate = (state.stats.wonTrades / state.stats.totalTrades) * 100;
    
    addLog(`[ARB] 15M 套利触发! ${pair.asset} @ ${pair.targetPrice} | 盈亏比: ${((1-cost)*100).toFixed(2)}%`, 'SUCCESS');
    
    setTimeout(() => { pair.status = 'MONITORING'; }, 30000); // 15M 市场生命周期短，锁定期缩短至 30s
}

setInterval(() => discoverPairs().catch(console.error), 8000);
setInterval(() => scanPrices().catch(console.error), 1200);

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.url === '/sync') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const rounds = state.pairs.map(p => ({
        id: p.id,
        asset: p.asset,
        symbol: `${p.asset} Up/Down - 15m`,
        question: `${p.is15M ? '15M' : 'Pair'}: ${p.asset} @ $${p.targetPrice} ${p.timeAt}`,
        askYes: p.legA.price,
        askNo: p.legB.price,
        sumYES: p.sumYES,
        status: p.status,
        is15M: p.is15M,
        isInternal: p.isInternal,
        countdown: Math.floor((new Date(p.endDate).getTime() - Date.now())/1000)
    }));
    res.end(JSON.stringify({ ...state, rounds }));
  } else if (req.url === '/toggle' && req.method === 'POST') {
    state.config.engineActive = !state.config.engineActive;
    addLog(`引擎状态已切换: ${state.config.engineActive ? 'RUNNING' : 'STOPPED'}`, 'WARN');
    if (state.config.engineActive) discoverPairs();
    res.writeHead(200);
    res.end('ok');
  } else if (req.url === '/config' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      state.config = { ...state.config, ...JSON.parse(body) };
      res.writeHead(200);
      res.end('ok');
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(3001, '0.0.0.0', () => {
    console.log('PolyEdge Smart Ape Engine v5.5 (15M Core) Online');
});
