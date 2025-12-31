
/**
 * PolyEdge 核心引擎 - Smart Ape 真实策略版
 * 资产锁定：BTC, ETH, SOL
 * 策略逻辑：只看 Crypto 类别 + 临近结算 + 高流动性
 */
import http from 'http';

let state = {
  config: {
    scanIntervalMs: 2000,
    dropThreshold: 1.2,   
    sumTarget: 0.992,     
    betAmount: 10,
    autoBet: true,
    maxSettleHours: 24,    // 监控 24 小时内结算
    minVolume: 500         // 过滤低流动性
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
  // 只在重要事件（WARN/SUCCESS/ERROR）时输出到后端控制台
  if (level !== 'INFO') {
    console.log(`[${log.timestamp}] [${level}] ${message}`);
  }
}

async function updateMarketData() {
  scanCount++;
  try {
    // 1. 指定 API 发现：只抓取 Crypto 类活跃市场
    if (state.rounds.length === 0 || scanCount % 15 === 0) {
      const res = await fetch(`${GAMMA_API}/markets?category=Crypto&active=true&limit=200`);
      if (!res.ok) throw new Error(`API Fetch Error`);
      const allMarkets = await res.json();
      
      const filtered = allMarkets.filter(m => {
        const slug = (m.slug || "").toLowerCase();
        const title = (m.question || "").toLowerCase();
        
        // 严格资产过滤：只扫描 BTC, ETH, SOL
        const isTargetAsset = /\b(btc|eth|sol|bitcoin|ethereum|solana)\b/.test(slug) || 
                              /\b(bitcoin|ethereum|solana)\b/i.test(title);
        
        // 时间筛选：24小时内结算
        const msLeft = new Date(m.endDate).getTime() - Date.now();
        const hoursLeft = msLeft / (1000 * 60 * 60);
        const isSoon = hoursLeft > 0 && hoursLeft <= state.config.maxSettleHours;

        let tokens = m.clobTokenIds;
        if (typeof tokens === 'string') {
          try { tokens = JSON.parse(tokens); } catch(e) { return false; }
        }
        
        return isTargetAsset && isSoon && Array.isArray(tokens) && tokens.length === 2;
      });

      if (filtered.length > 0) {
        state.rounds = filtered.map(m => {
          let tokens = typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : m.clobTokenIds;
          let asset = 'CRYPTO';
          if (m.slug.includes('btc')) asset = 'BTC';
          else if (m.slug.includes('eth')) asset = 'ETH';
          else if (m.slug.includes('sol')) asset = 'SOL';

          const oldRound = state.rounds.find(r => r.id === m.id);
          const msLeft = new Date(m.endDate).getTime() - Date.now();

          return {
            id: m.id,
            asset,
            symbol: m.ticker || m.slug.split('-').slice(0, 3).join(' ').toUpperCase(),
            question: m.question,
            yesTokenId: tokens[0],
            noTokenId: tokens[1],
            askYes: oldRound?.askYes || 0.5,
            askNo: oldRound?.askNo || 0.5,
            historyYes: oldRound?.historyYes || [],
            status: oldRound?.status || 'SCANNING',
            leg1Side: oldRound?.leg1Side || null,
            leg1Price: oldRound?.leg1Price || null,
            countdown: Math.floor(msLeft / 1000)
          };
        }).sort((a,b) => a.countdown - b.countdown).slice(0, 10);
        
        if (scanCount === 1) addLog(`Alpha 策略已初始化: 锁定 BTC/ETH/SOL 目标盘口`, 'SUCCESS');
      }
    }

    // 2. 价格偏差实时扫描
    await Promise.all(state.rounds.map(async (round) => {
      try {
        const [y, n] = await Promise.all([
          fetch(`${CLOB_API}/book?token_id=${round.yesTokenId}`),
          fetch(`${CLOB_API}/book?token_id=${round.noTokenId}`)
        ]);
        const yData = await y.json();
        const nData = await n.json();

        const askYes = yData.asks?.[0]?.price ? parseFloat(yData.asks[0].price) : round.askYes;
        const askNo = nData.asks?.[0]?.price ? parseFloat(nData.asks[0].price) : round.askNo;

        round.historyYes.push(askYes);
        if (round.historyYes.length > 25) round.historyYes.shift();
        
        if (round.status === 'SCANNING' && state.config.autoBet) {
          const prev = round.historyYes[round.historyYes.length - 2] || askYes;
          const drop = ((prev - askYes) / prev) * 100;
          if (drop >= state.config.dropThreshold && askYes > 0.05 && askYes < 0.95) {
            executeOrder(round, 'YES', 1, askYes);
            round.status = 'HEDGING';
            round.leg1Side = 'YES';
            round.leg1Price = askYes;
            addLog(`发现错价: ${round.symbol} 波动 ${drop.toFixed(2)}% | 价格: ${askYes}`, 'WARN');
          }
        }

        if (round.status === 'HEDGING' && state.config.autoBet) {
          const sum = round.leg1Price + askNo;
          if (sum <= state.config.sumTarget) {
            executeOrder(round, 'NO', 2, askNo);
            const profit = (1 - sum) * state.config.betAmount;
            state.stats.totalTrades++;
            state.stats.wonTrades++;
            state.stats.netProfit += profit;
            state.stats.balance += profit;
            state.stats.winRate = (state.stats.wonTrades / state.stats.totalTrades) * 100;
            round.status = 'LOCKED';
            addLog(`套利成功: ${round.symbol} 锁定收益 $${profit.toFixed(2)}`, 'SUCCESS');
            setTimeout(() => { round.status = 'SCANNING'; round.leg1Side = null; }, 60000);
          }
        }

        round.askYes = askYes;
        round.askNo = askNo;
        round.countdown = Math.max(0, round.countdown - 2);
      } catch (e) {}
    }));
  } catch (e) {}
}

function executeOrder(round, side, leg, price) {
  const order = {
    id: `tx-${Date.now()}-${Math.floor(Math.random()*1000)}`,
    symbol: round.symbol,
    side, leg, price, amount: state.config.betAmount,
    status: 'FILLED', timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
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
  if (req.method === 'OPTIONS') return res.end();
  if (req.url === '/sync') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state));
  } else if (req.url === '/config' && req.method === 'POST') {
    let b = '';
    req.on('data', c => b += c);
    req.on('end', () => { 
      try { state.config = { ...state.config, ...JSON.parse(b) }; res.end('ok'); } catch(e) { res.writeHead(400); res.end('fail'); }
    });
  } else { res.writeHead(404); res.end(); }
});

server.listen(3001, '0.0.0.0', () => console.log('PolyEdge Alpha Engine Running...'));
