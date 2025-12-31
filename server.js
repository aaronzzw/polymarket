
/**
 * PolyEdge Arbitrage Core - "Smart Ape" Pair Logic
 * 专门扫描互补市场 (Above vs Below)
 * 优化了配对鲁棒性与 UI 反馈
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
    scannedCount: 0 // 新增：已扫描的市场总数
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
 * 核心配对算法：深度寻找互补对
 */
async function discoverPairs() {
  if (!state.config.engineActive) return;
  
  try {
    const markets = await safeFetch(`${GAMMA_API}/markets?category=Crypto&active=true&closed=false&limit=250`);
    if (!markets) return;
    
    state.stats.scannedCount = markets.length;

    const targets = markets.filter(m => {
        const slug = (m.slug || "").toLowerCase();
        const title = (m.question || "").toLowerCase();
        
        const isTargetAsset = slug.includes('btc') || slug.includes('eth') || slug.includes('sol') || 
                              slug.includes('bitcoin') || slug.includes('ethereum') || slug.includes('solana');
        
        // 排除 15M, 5M, 1H 等固定高频滚动市场，这些市场通常没有 Above/Below 对
        const isHighFreq = /\d+m|\d+h|price-at-/.test(slug) || /minute|hourly/i.test(title);
        
        const msLeft = new Date(m.endDate).getTime() - Date.now();
        const minsLeft = msLeft / (1000 * 60);
        const isWithinWindow = minsLeft > 0 && minsLeft <= state.config.maxSettleMinutes;

        return isTargetAsset && !isHighFreq && isWithinWindow && m.clobTokenIds;
    });

    let newPairs = [];
    const processedIds = new Set();

    for (let i = 0; i < targets.length; i++) {
        for (let j = 0; j < targets.length; j++) {
            if (i === j) continue;
            const m1 = targets[i];
            const m2 = targets[j];

            if (processedIds.has(m1.id) || processedIds.has(m2.id)) continue;

            const m1Slug = m1.slug.toLowerCase();
            const m2Slug = m2.slug.toLowerCase();

            // 1. 时间容差检查：同一事件的 Above/Below 对通常结算时间一致，允许 60 秒误差
            const timeDiff = Math.abs(new Date(m1.endDate).getTime() - new Date(m2.endDate).getTime());
            if (timeDiff > 60000) continue;

            // 2. 资产识别
            let asset = null;
            if ((m1Slug.includes('btc') || m1Slug.includes('bitcoin')) && (m2Slug.includes('btc') || m2Slug.includes('bitcoin'))) asset = 'BTC';
            else if ((m1Slug.includes('eth') || m1Slug.includes('ethereum')) && (m2Slug.includes('eth') || m2Slug.includes('ethereum'))) asset = 'ETH';
            else if ((m1Slug.includes('sol') || m1Slug.includes('solana')) && (m2Slug.includes('sol') || m2Slug.includes('solana'))) asset = 'SOL';

            if (!asset) continue;

            // 3. 价格锚点提取 (增强型：支持带小数的价格)
            const extractPrice = (s) => {
              const match = s.match(/\d+(\.\d+)?/g);
              if (!match) return null;
              // 寻找最像价格的数字（通常是几万或几千）
              return match.find(n => parseFloat(n) > 100); 
            };

            const p1 = extractPrice(m1Slug);
            const p2 = extractPrice(m2Slug);

            if (!p1 || p1 !== p2) continue;

            // 4. 方向相反校验
            const isM1Above = m1Slug.includes('above') || m1Slug.includes('higher');
            const isM2Below = m2Slug.includes('below') || m2Slug.includes('lower');
            const isM1Below = m1Slug.includes('below') || m1Slug.includes('lower');
            const isM2Above = m2Slug.includes('above') || m2Slug.includes('higher');

            if ((isM1Above && isM2Below) || (isM1Below && isM2Above)) {
                const p1Tokens = parseTokens(m1.clobTokenIds);
                const p2Tokens = parseTokens(m2.clobTokenIds);

                if (p1Tokens && p2Tokens) {
                    const legA = isM1Above ? m1 : m2;
                    const legB = isM1Above ? m2 : m1;
                    const tokensA = isM1Above ? p1Tokens : p2Tokens;
                    const tokensB = isM1Above ? p2Tokens : p1Tokens;

                    newPairs.push({
                        id: `${legA.id}-${legB.id}`,
                        asset,
                        targetPrice: p1,
                        endDate: legA.endDate,
                        legA: { id: legA.id, symbol: legA.ticker, yesId: tokensA[0], price: 0.5 },
                        legB: { id: legB.id, symbol: legB.ticker, yesId: tokensB[0], price: 0.5 },
                        sumYES: 1.0,
                        status: 'MONITORING'
                    });
                    processedIds.add(m1.id);
                    processedIds.add(m2.id);
                }
            }
        }
    }

    if (newPairs.length !== state.pairs.length) {
      addLog(`配对引擎状态: 扫描 ${markets.length} 市场, 锁定 ${newPairs.length} 组互补对`, 'INFO');
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

      // 只有当符合套利空间时才触发
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
    
    addLog(`[ARB] 利润触发! ${pair.asset} @ ${pair.targetPrice} | 合计价格: ${cost.toFixed(3)} | 预估收益: $${profit.toFixed(2)}`, 'SUCCESS');
    
    setTimeout(() => { pair.status = 'MONITORING'; }, 60000);
}

// 启动循环
setInterval(() => discoverPairs().catch(console.error), 10000);
setInterval(() => scanPrices().catch(console.error), 2000);

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
        question: `Pair: Above/Below ${p.targetPrice}`,
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
        res.end('fail'); 
      }
    });
  } else if (req.url === '/toggle' && req.method === 'POST') {
    state.config.engineActive = !state.config.engineActive;
    if (!state.config.engineActive) {
      state.pairs = [];
      addLog(`扫描引擎已进入待机模式`, 'WARN');
    } else {
      addLog(`启动深度配对引擎...`, 'SUCCESS');
    }
    res.writeHead(200);
    res.end('ok');
  } else { 
    res.writeHead(404);
    res.end(); 
  }
});

server.listen(3001, '0.0.0.0', () => {
    console.log('PolyEdge Smart Ape Engine (Stable Mode) Online');
});
