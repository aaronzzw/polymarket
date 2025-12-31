
/**
 * PolyEdge Arbitrage Core - "Smart Ape" Pair Logic
 * 专门扫描互补市场 (Above vs Below)
 * 优化了配对算法，排除了短时限 (15M) 市场干扰
 */
import http from 'http';

let state = {
  config: {
    engineActive: false,
    scanIntervalMs: 2000,
    profitThreshold: 0.008, 
    betAmount: 10,
    autoBet: true,
    maxSettleMinutes: 1440 // 默认扫描 24 小时内结算的市场
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
 * 核心配对算法：寻找互补对
 */
async function discoverPairs() {
  if (!state.config.engineActive) return;
  
  try {
    // 获取活跃的 Crypto 市场，增加 limit 确保覆盖面
    const markets = await safeFetch(`${GAMMA_API}/markets?category=Crypto&active=true&closed=false&limit=200`);
    if (!markets) return;
    
    const targets = markets.filter(m => {
        const slug = (m.slug || "").toLowerCase();
        const title = (m.question || "").toLowerCase();
        
        // 1. 资产过滤
        const isTargetAsset = slug.includes('btc') || slug.includes('eth') || slug.includes('sol') || 
                              slug.includes('bitcoin') || slug.includes('ethereum') || slug.includes('solana');
        
        // 2. 排除固定短时限市场 (如 15m, 1h 价格带)
        const isFixedTimeframe = /15m|5m|1h|30m|price-at-/.test(slug) || /15-minute|hourly/i.test(title);
        
        // 3. 时间窗口过滤
        const msLeft = new Date(m.endDate).getTime() - Date.now();
        const minsLeft = msLeft / (1000 * 60);
        const isWithinWindow = minsLeft > 0 && minsLeft <= state.config.maxSettleMinutes;

        return isTargetAsset && !isFixedTimeframe && isWithinWindow && m.clobTokenIds;
    });

    let newPairs = [];
    const processedIds = new Set();

    for (let i = 0; i < targets.length; i++) {
        for (let j = i + 1; j < targets.length; j++) {
            const m1 = targets[i];
            const m2 = targets[j];

            if (processedIds.has(m1.id) || processedIds.has(m2.id)) continue;

            const m1Slug = m1.slug.toLowerCase();
            const m2Slug = m2.slug.toLowerCase();

            // 匹配条件：
            // A. 结束时间必须完全一致（通常互补对在同一秒结算）
            const isSameTime = m1.endDate === m2.endDate;
            
            // B. 资产类型识别
            let asset = null;
            if ((m1Slug.includes('btc') || m1Slug.includes('bitcoin')) && (m2Slug.includes('btc') || m2Slug.includes('bitcoin'))) asset = 'BTC';
            else if ((m1Slug.includes('eth') || m1Slug.includes('ethereum')) && (m2Slug.includes('eth') || m2Slug.includes('ethereum'))) asset = 'ETH';
            else if ((m1Slug.includes('sol') || m1Slug.includes('solana')) && (m2Slug.includes('sol') || m2Slug.includes('solana'))) asset = 'SOL';

            if (!asset || !isSameTime) continue;

            // C. 价格锚点提取逻辑优化
            // 从 slug 中提取可能的金额（通常是几万或几千的整数）
            const getPriceAnchor = (slug) => {
                const matches = slug.match(/\d{3,}/g); // 寻找至少3位数的数字，过滤掉日期中的小数字
                return matches ? matches.sort((a, b) => b.length - a.length)[0] : null; // 取最长的数字作为价格锚点
            };

            const p1Anchor = getPriceAnchor(m1Slug);
            const p2Anchor = getPriceAnchor(m2Slug);

            // D. 方向相反校验
            const isOpposite = (m1Slug.includes('above') && m2Slug.includes('below')) ||
                               (m1Slug.includes('below') && m1Slug.includes('above')) ||
                               (m1Slug.includes('higher') && m2Slug.includes('lower')) ||
                               (m1Slug.includes('lower') && m2Slug.includes('higher'));

            if (p1Anchor && p1Anchor === p2Anchor && isOpposite) {
                const p1Tokens = parseTokens(m1.clobTokenIds);
                const p2Tokens = parseTokens(m2.clobTokenIds);

                if (p1Tokens && p2Tokens) {
                    const legA_is_Above = m1Slug.includes('above') || m1Slug.includes('higher');
                    
                    newPairs.push({
                        id: `${m1.id}-${m2.id}`,
                        asset,
                        targetPrice: p1Anchor,
                        endDate: m1.endDate,
                        // 逻辑：legA 始终设为 Above 市场以便 UI 展示一致性
                        legA: { 
                          id: legA_is_Above ? m1.id : m2.id, 
                          symbol: legA_is_Above ? m1.ticker : m2.ticker, 
                          yesId: legA_is_Above ? p1Tokens[0] : p2Tokens[0], 
                          price: 0.5 
                        },
                        legB: { 
                          id: legA_is_Above ? m2.id : m1.id, 
                          symbol: legA_is_Above ? m2.ticker : m1.ticker, 
                          yesId: legA_is_Above ? p2Tokens[0] : p1Tokens[0], 
                          price: 0.5 
                        },
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
        addLog(`成功锁定 ${newPairs.length} 组资产互补对 (${state.config.maxSettleMinutes}min 窗口)`, 'SUCCESS');
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

      // 核心套利逻辑：总概率偏离
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
    
    addLog(`[ARB] 执行套利指令: ${pair.asset} @ ${pair.targetPrice} | 成本: ${cost.toFixed(3)} | 预估利润: $${profit.toFixed(2)}`, 'SUCCESS');
    
    setTimeout(() => { pair.status = 'MONITORING'; }, 120000); // 锁定2分钟，防止重复下单
}

// 启动任务循环
setInterval(() => discoverPairs().catch(console.error), 20000);
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
        question: `${p.asset} 价格互补套利对`,
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
        addLog(`策略配置已实时更新`, 'INFO');
        res.writeHead(200);
        res.end('ok'); 
      } catch(e) { 
        res.writeHead(400);
        res.end('invalid json'); 
      }
    });
  } else if (req.url === '/toggle' && req.method === 'POST') {
    state.config.engineActive = !state.config.engineActive;
    if (!state.config.engineActive) state.pairs = []; 
    addLog(`量化引擎状态 -> ${state.config.engineActive ? 'RUNNING' : 'STOPPED'}`, 'WARN');
    res.writeHead(200);
    res.end('ok');
  } else { 
    res.writeHead(404);
    res.end(); 
  }
});

server.listen(3001, '0.0.0.0', () => {
    console.log('PolyEdge Alpha Engine v5.2 (Pair Optimized) Running on Port 3001');
});
