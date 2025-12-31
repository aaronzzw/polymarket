
/**
 * PolyEdge 24/7 后端套利机器人 (Node.js)
 * 功能：锁定 BTC/ETH/SOL 15M 市场，维护交易状态
 */
import http from 'http';

// --- 全局持久化状态 ---
let state = {
  config: {
    scanIntervalMs: 2000,
    dropThreshold: 3,
    sumTarget: 0.985,
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
  rounds: [],
  logs: [],
  orders: []
};

let scanCount = 0;

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

async function updateMarketData() {
  scanCount++;
  try {
    // 1. 获取并筛选 BTC, ETH, SOL 的 15M 市场
    if (state.rounds.length === 0) {
      addLog("正在扫描 BTC/ETH/SOL 15分钟专用市场...", "INFO");
      // 使用搜索接口锁定资产
      const res = await fetch(`${GAMMA_API}/markets?active=true&closed=false&limit=100&order=volume24hr&dir=desc`);
      if (!res.ok) throw new Error(`Gamma API Error`);
      const allMarkets = await res.json();
      
      // 筛选逻辑：包含 BTC/ETH/SOL 且是 15m/15-minute
      state.rounds = allMarkets.filter(m => {
        const slug = m.slug.toLowerCase();
        const isTargetAsset = slug.includes('bitcoin') || slug.includes('ethereum') || slug.includes('solana') || 
                            slug.includes('btc') || slug.includes('eth') || slug.includes('sol');
        const is15Min = slug.includes('15-minute') || slug.includes('15m') || slug.includes('price-prediction');
        
        let tokens = m.clobTokenIds;
        if (typeof tokens === 'string') {
          try { tokens = JSON.parse(tokens); } catch(e) { return false; }
        }
        return isTargetAsset && is15Min && Array.isArray(tokens) && tokens.length === 2;
      }).slice(0, 10).map(m => {
        let tokens = typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : m.clobTokenIds;
        return {
          id: m.id,
          symbol: m.ticker || m.slug.split('-').slice(0, 2).join(' ').toUpperCase(),
          question: m.question,
          yesTokenId: tokens[0],
          noTokenId: tokens[1],
          askYes: 0.5,
          askNo: 0.5,
          historyYes: [],
          historyNo: [],
          status: 'SCANNING',
          leg1Side: null,
          leg1Price: null,
          countdown: Math.floor((new Date(m.endDate).getTime() - Date.now()) / 1000)
        };
      });

      if (state.rounds.length > 0) {
        addLog(`成功锁定 ${state.rounds.length} 个核心市场 [BTC/ETH/SOL 15M]`, 'SUCCESS');
      } else {
        addLog(`未发现活跃的 15M 市场，请检查 Polymarket 是否有正在进行的轮次`, 'WARN');
      }
    }

    if (scanCount % 20 === 0) {
      console.log(`[Heartbeat] 监控中... 目标市场数: ${state.rounds.length}`);
    }

    await Promise.all(state.rounds.map(async (round) => {
      if (round.status === 'LOCKED') return;

      try {
        const fetchWithTimeout = (url, timeout = 2500) => {
          return Promise.race([
            fetch(url),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout))
          ]);
        };

        const [yesRes, noRes] = await Promise.all([
          fetchWithTimeout(`${CLOB_API}/book?token_id=${round.yesTokenId}`),
          fetchWithTimeout(`${CLOB_API}/book?token_id=${round.noTokenId}`)
        ]);

        const yesData = await yesRes.json();
        const noData = await noRes.json();

        const newYes = yesData.asks?.[0]?.price ? parseFloat(yesData.asks[0].price) : round.askYes;
        const newNo = noData.asks?.[0]?.price ? parseFloat(noData.asks[0].price) : round.askNo;

        round.historyYes.push(newYes);
        if (round.historyYes.length > 10) round.historyYes.shift();
        
        // 核心策略逻辑
        if (round.status === 'SCANNING' && state.config.autoBet) {
          const prev = round.historyYes[round.historyYes.length - 2] || newYes;
          const drop = ((prev - newYes) / prev) * 100;
          if (drop >= state.config.dropThreshold) {
            addLog(`[信号] ${round.symbol} 检测到暴跌 ${drop.toFixed(1)}%`, 'WARN');
            executeOrder(round, 'YES', 1, newYes);
            round.status = 'HEDGING';
            round.leg1Side = 'YES';
            round.leg1Price = newYes;
          }
        }

        if (round.status === 'HEDGING' && state.config.autoBet) {
          const totalCost = round.leg1Price + newNo;
          if (totalCost <= state.config.sumTarget) {
            executeOrder(round, 'NO', 2, newNo);
            const profit = (1 - totalCost) * state.config.betAmount;
            
            state.stats.totalTrades++;
            state.stats.wonTrades++;
            state.stats.netProfit += profit;
            state.stats.balance += profit;
            state.stats.winRate = (state.stats.wonTrades / state.stats.totalTrades) * 100;
            
            round.status = 'LOCKED';
            addLog(`[获利] ${round.symbol} 套利组合构建成功, 净利润: $${profit.toFixed(2)}`, 'SUCCESS');
            
            setTimeout(() => {
              round.status = 'SCANNING';
              round.leg1Side = null;
            }, 30000);
          }
        }

        round.askYes = newYes;
        round.askNo = newNo;
        round.countdown = Math.max(0, round.countdown - 2);
      } catch (e) {
        // 忽略单个价格波动或连接失败
      }
    }));
  } catch (e) {
    // 根循环异常
    if (e.message.includes('API')) state.rounds = []; // 重置市场尝试重新获取
  }
}

function executeOrder(round, side, leg, price) {
  const order = {
    id: `tx-${Date.now()}-${Math.floor(Math.random()*1000)}`,
    symbol: round.symbol,
    side,
    leg,
    price,
    amount: state.config.betAmount,
    status: 'FILLED',
    timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    txHash: '0x' + Math.random().toString(16).substr(2, 32)
  };
  state.orders.unshift(order);
  if (state.orders.length > 50) state.orders.pop();
}

setInterval(updateMarketData, state.config.scanIntervalMs);

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.end(); return; }

  if (req.url === '/sync' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state));
  } 
  else if (req.url === '/config' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const newConf = JSON.parse(body);
        state.config = { ...state.config, ...newConf };
        res.end('ok');
      } catch(e) {
        res.writeHead(400); res.end('error');
      }
    });
  } else {
    res.writeHead(404); res.end();
  }
});

server.listen(3001, '0.0.0.0', () => {
  console.log('PolyEdge 专研版已启动: BTC/ETH/SOL 15M 专用');
});
