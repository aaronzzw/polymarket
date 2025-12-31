
/**
 * PolyEdge Arbitrage Core - "Smart Ape" Pair Logic
 * 深度优化：支持 15M 高频市场，确保面板始终显示数据
 */
import http from 'http';

let state = {
  config: {
    engineActive: false,
    scanIntervalMs: 2000,
    profitThreshold: 0.008, 
    betAmount: 10,
    autoBet: true,
    maxSettleMinutes: 1440 
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
 * 价格提取逻辑：识别 slug 中的关键价格
 */
const extractPrice = (s) => {
    // 匹配如 above-68000, below-68000, 68000-at 等格式
    const match = s.match(/(?:above|below|higher|lower)-(\d+(?:\.\d+)?)/i) || s.match(/(\d+(?:\.\d+)?)-at/i);
    if (match) return match[1];
    
    // 后备方案：寻找较大的数字
    const allNums = s.match(/\d+(?:\.\d+)?/g);
    if (allNums) {
        return allNums.find(n => parseFloat(n) > 50) || null;
    }
    return null;
};

/**
 * 核心配对算法：支持 15M 市场，确保即便没有完美对冲也显示
 */
async function discoverPairs() {
  if (!state.config.engineActive) return;
  
  try {
    // 增加 Limit 到 500，覆盖所有 15M 市场
    const markets = await safeFetch(`${GAMMA_API}/markets?category=Crypto&active=true&closed=false&limit=500`);
    if (!markets) {
        addLog("无法获取市场数据，请检查网络", "ERROR");
        return;
    }
    
    state.stats.scannedCount = markets.length;

    // 过滤目标资产，不再排除 15M
    const targets = markets.filter(m => {
        const slug = (m.slug || "").toLowerCase();
        const isTargetAsset = slug.includes('btc') || slug.includes('eth') || slug.includes('sol') || 
                              slug.includes('bitcoin') || slug.includes('ethereum') || slug.includes('solana');
        return isTargetAsset && m.clobTokenIds;
    });

    let newPairs = [];
    const usedMarketIds = new Set();

    // 第一步：寻找真正的互补对 (A市场: Above X, B市场: Below X)
    for (let i = 0; i < targets.length; i++) {
        for (let j = 0; j < targets.length; j++) {
            if (i === j) continue;
            const m1 = targets[i];
            const m2 = targets[j];

            if (usedMarketIds.has(m1.id) || usedMarketIds.has(m2.id)) continue;

            // 检查结算时间是否接近 (60秒内)
            const timeDiff = Math.abs(new Date(m1.endDate).getTime() - new Date(m2.endDate).getTime());
            if (timeDiff > 60000) continue;

            const p1 = extractPrice(m1.slug);
            const p2 = extractPrice(m2.slug);
            if (!p1 || p1 !== p2) continue;

            const m1Slug = m1.slug.toLowerCase();
            const m2Slug = m2.slug.toLowerCase();
            const isM1Above = m1Slug.includes('above') || m1Slug.includes('higher');
            const isM2Below = m2Slug.includes('below') || m2Slug.includes('lower');
            const isM1Below = m1Slug.includes('below') || m1Slug.includes('lower');
            const isM2Above = m2Slug.includes('above') || m2Slug.includes('higher');

            if ((isM1Above && isM2Below) || (isM1Below && isM2Above)) {
                const tokens1 = parseTokens(m1.clobTokenIds);
                const tokens2 = parseTokens(m2.clobTokenIds);

                if (tokens1 && tokens2) {
                    const legA = isM1Above ? m1 : m2;
                    const legB = isM1Above ? m2 : m1;
                    const tA = isM1Above ? tokens1 : tokens2;
                    const tB = isM1Above ? tokens2 : tokens1;

                    newPairs.push({
                        id: `${legA.id}-${legB.id}`,
                        asset: m1Slug.includes('btc') ? 'BTC' : (m1Slug.includes('eth') ? 'ETH' : 'SOL'),
                        targetPrice: p1,
                        endDate: legA.endDate,
                        isInternalPair: false, // 跨市场套利
                        legA: { id: legA.id, symbol: legA.ticker, yesId: tA[0], price: 0.5 },
                        legB: { id: legB.id, symbol: legB.ticker, yesId: tB[0], price: 0.5 },
                        sumYES: 1.0,
                        status: 'MONITORING'
                    });
                    usedMarketIds.add(m1.id);
                    usedMarketIds.add(m2.id);
                }
            }
        }
    }

    // 第二步：兜底逻辑 - 如果有 Above 市场但没有对应的 Below 市场，显示该市场的 YES/NO 对
    targets.forEach(m => {
        if (usedMarketIds.has(m.id)) return;
        const slug = m.slug.toLowerCase();
        const p = extractPrice(slug);
        if (!p) return;

        const tokens = parseTokens(m.clobTokenIds);
        if (tokens && tokens.length >= 2) {
            newPairs.push({
                id: `self-${m.id}`,
                asset: slug.includes('btc') ? 'BTC' : (slug.includes('eth') ? 'ETH' : 'SOL'),
                targetPrice: p,
                endDate: m.endDate,
                isInternalPair: true, // 单市场自对冲（YES + NO 恒等于 1）
                legA: { id: m.id, symbol: m.ticker, yesId: tokens[0], price: 0.5 },
                legB: { id: m.id, symbol: m.ticker, yesId: tokens[1], price: 0.5 }, // 使用 NO token 作为 Below 腿
                sumYES: 1.0,
                status: 'MONITORING'
            });
            usedMarketIds.add(m.id);
        }
    });

    if (newPairs.length > 0) {
        addLog(`配对引擎: 找到 ${targets.length} 个相关资产市场, 已生成 ${newPairs.length} 组监控对`, 'INFO');
    } else {
        addLog(`未发现可配对市场 (资产库: ${targets.length})`, 'WARN');
    }
    
    state.pairs = newPairs;
  } catch (e) {
    console.error("Discovery Loop Error:", e);
    addLog(`扫描异常: ${e.message}`, 'ERROR');
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

      // 只有跨市场套利才会有 sumYES < 1 的可能
      if (!pair.isInternalPair && pair.sumYES < (1 - state.config.profitThreshold) && pair.status !== 'LOCKED') {
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
        symbol: `${pair.asset} $${pair.targetPrice}`,
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
    
    addLog(`[ARB] 利润触发! ${pair.asset} @ ${pair.targetPrice} | 成本: ${cost.toFixed(3)} | 预估利润: $${profit.toFixed(2)}`, 'SUCCESS');
    
    setTimeout(() => { pair.status = 'MONITORING'; }, 60000);
}

// 任务循环：更频繁地同步 15M 市场
setInterval(() => discoverPairs().catch(console.error), 10000);
setInterval(() => scanPrices().catch(console.error), 1500);

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
        symbol: `${p.asset} $${p.targetPrice}`,
        question: p.isInternalPair ? `Internal: ${p.asset} Above ${p.targetPrice}` : `Pair: Above/Below ${p.targetPrice}`,
        askYes: p.legA.price,
        askNo: p.legB.price,
        sumYES: p.sumYES,
        status: p.status,
        isInternal: p.isInternalPair,
        countdown: Math.floor((new Date(p.endDate).getTime() - Date.now())/1000)
    }));
    res.end(JSON.stringify({ ...state, rounds }));
  } else if (req.url === '/config' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => { 
      try { 
        state.config = { ...state.config, ...JSON.parse(body) }; 
        res.writeHead(200);
        res.end('ok'); 
      } catch(e) { 
        res.writeHead(400);
        res.end('fail'); 
      }
    });
  } else if (req.url === '/toggle' && req.method === 'POST') {
    state.config.engineActive = !state.config.engineActive;
    if (!state.config.engineActive) {
      state.pairs = [];
      addLog(`配对引擎已挂起模式`, 'WARN');
    } else {
      addLog(`正在重启深度配对引擎 (扫描 15M/1H 市场)...`, 'SUCCESS');
      discoverPairs(); // 立即执行一次
    }
    res.writeHead(200);
    res.end('ok');
  } else { 
    res.writeHead(404);
    res.end(); 
  }
});

server.listen(3001, '0.0.0.0', () => {
    console.log('PolyEdge Smart Ape Engine v5.4 (15M Optimized) Online');
});
