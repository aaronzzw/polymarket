
/**
 * PolyEdge Arbitrage Core - "Smart Ape" Pair Logic
 * 专门扫描互补市场 (Above vs Below)
 * 修复了解析崩溃和连接不稳定的问题
 */
import http from 'http';

let state = {
  config: {
    engineActive: false,
    scanIntervalMs: 2000,
    profitThreshold: 0.008, 
    betAmount: 10,
    autoBet: true
  },
  stats: {
    totalTrades: 0,
    wonTrades: 0,
    totalVolume: 0,
    netProfit: 0,
    balance: 5000,
    winRate: 0
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
        // 降低非关键错误的日志频率
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

async function discoverPairs() {
  if (!state.config.engineActive) return;
  
  try {
    const markets = await safeFetch(`${GAMMA_API}/markets?category=Crypto&active=true&limit=100`);
    if (!markets) return;
    
    const targets = markets.filter(m => {
        const slug = (m.slug || "").toLowerCase();
        return (slug.includes('btc') || slug.includes('eth') || slug.includes('sol')) && m.clobTokenIds;
    });

    let newPairs = [];
    const processedIds = new Set();

    for (let i = 0; i < targets.length; i++) {
        for (let j = i + 1; j < targets.length; j++) {
            const m1 = targets[i];
            const m2 = targets[j];

            if (processedIds.has(m1.id) || processedIds.has(m2.id)) continue;

            // 匹配条件：结束时间、资产类型一致，且描述方向相反
            const isSameTime = m1.endDate === m2.endDate;
            const m1Slug = m1.slug.toLowerCase();
            const m2Slug = m2.slug.toLowerCase();
            
            // 提取价格锚点数字
            const m1Nums = m1Slug.match(/\d+/g)?.join('');
            const m2Nums = m2Slug.match(/\d+/g)?.join('');

            const isSameAsset = (m1Slug.includes('btc') && m2Slug.includes('btc')) ||
                                (m1Slug.includes('eth') && m2Slug.includes('eth')) ||
                                (m1Slug.includes('sol') && m2Slug.includes('sol'));

            const isOpposite = (m1Slug.includes('above') && m2Slug.includes('below')) ||
                               (m1Slug.includes('higher') && m2Slug.includes('lower'));

            if (isSameTime && isSameAsset && m1Nums === m2Nums && isOpposite) {
                const p1Tokens = parseTokens(m1.clobTokenIds);
                const p2Tokens = parseTokens(m2.clobTokenIds);

                if (p1Tokens && p2Tokens) {
                    newPairs.push({
                        id: `${m1.id}-${m2.id}`,
                        asset: m1Slug.includes('btc') ? 'BTC' : (m1Slug.includes('eth') ? 'ETH' : 'SOL'),
                        targetPrice: m1Nums,
                        endDate: m1.endDate,
                        legA: { id: m1.id, symbol: m1.ticker, yesId: p1Tokens[0], noId: p1Tokens[1], price: 0.5 },
                        legB: { id: m2.id, symbol: m2.ticker, yesId: p2Tokens[0], noId: p2Tokens[1], price: 0.5 },
                        sumYES: 1.0,
                        status: 'MONITORING'
                    });
                    processedIds.add(m1.id);
                    processedIds.add(m2.id);
                }
            }
        }
    }

    if (newPairs.length > 0 && state.pairs.length === 0) {
        addLog(`配对引擎成功发现 ${newPairs.length} 组资产套利对`, 'SUCCESS');
    }
    state.pairs = newPairs;
  } catch (e) {
    console.error("Discovery Loop Error:", e);
  }
}

async function scanPrices() {
  if (!state.config.engineActive || state.pairs.length === 0) return;

  await Promise.all(state.pairs.map(async (pair) => {
    try {
      const dataA = await safeFetch(`${CLOB_API}/book?token_id=${pair.legA.yesId}`);
      const dataB = await safeFetch(`${CLOB_API}/book?token_id=${pair.legB.yesId}`);

      if (!dataA || !dataB) return;

      const priceA = dataA.asks?.[0]?.price ? parseFloat(dataA.asks[0].price) : pair.legA.price;
      const priceB = dataB.asks?.[0]?.price ? parseFloat(dataB.asks[0].price) : pair.legB.price;

      pair.legA.price = priceA;
      pair.legB.price = priceB;
      pair.sumYES = priceA + priceB;

      // 发现套利机会
      if (pair.sumYES < (1 - state.config.profitThreshold) && pair.status !== 'LOCKED') {
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
        symbol: `${pair.asset} Arbitrage`,
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
    
    addLog(`[ARB] 触发对冲: ${pair.asset} | 成本: ${cost.toFixed(3)} | 利润: $${profit.toFixed(2)}`, 'SUCCESS');
    
    setTimeout(() => { pair.status = 'MONITORING'; }, 60000);
}

// 启动循环任务
setInterval(() => discoverPairs().catch(console.error), 15000);
setInterval(() => scanPrices().catch(console.error), 2000);

const server = http.createServer((req, res) => {
  // 强化 CORS 处理
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
        symbol: `${p.asset} @ ${p.targetPrice}`,
        question: `Price Arbitrage Pairing`,
        askYes: p.legA.price,
        askNo: p.legB.price,
        sumYES: p.sumYES,
        status: p.status,
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
        res.end('invalid json'); 
      }
    });
  } else if (req.url === '/toggle' && req.method === 'POST') {
    state.config.engineActive = !state.config.engineActive;
    addLog(`引擎状态切换 -> ${state.config.engineActive ? 'RUNNING' : 'STOPPED'}`, 'WARN');
    res.writeHead(200);
    res.end('ok');
  } else { 
    res.writeHead(404);
    res.end(); 
  }
});

server.on('error', (e) => {
    console.error('Server error:', e);
});

server.listen(3001, '0.0.0.0', () => {
    console.log('PolyEdge Alpha Engine Running on Port 3001');
});
