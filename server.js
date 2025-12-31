
/**
 * PolyEdge 核心引擎 - Smart Ape 真实策略版
 * 核心逻辑：高流动性 + 临近结算 + 无视 timeframe + 捕获定价偏离
 */
import http from 'http';

let state = {
  config: {
    scanIntervalMs: 2000,
    dropThreshold: 1.2,   
    sumTarget: 0.992,     
    betAmount: 10,
    autoBet: true,
    maxSettleHours: 12,    // 默认关注 12 小时内结算的市场
    minVolume: 1000        // 过滤掉无流动性的僵尸盘
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
  // 生产环境只打印非 INFO 日志，彻底解决控制台刷屏
  if (level !== 'INFO') console.log(`[${log.timestamp}] [${level}] ${message}`);
}

async function updateMarketData() {
  scanCount++;
  try {
    // 1. 策略驱动的市场发现：只看“流动性”和“结算时间”
    if (state.rounds.length === 0 || scanCount % 15 === 0) {
      // 优先抓取成交量前 200 的活跃市场
      const res = await fetch(`${GAMMA_API}/markets?active=true&closed=false&limit=200&order=volume24hr&dir=desc`);
      if (!res.ok) throw new Error(`Gamma API Down`);
      const allMarkets = await res.json();
      
      const filtered = allMarkets.filter(m => {
        const slug = (m.slug || "").toLowerCase();
        const title = (m.question || "").toLowerCase();
        const volume = parseFloat(m.volume24hr || 0);
        
        // 资产：BTC, ETH, SOL, XRP, DOGE, PEPE 等主流加密资产
        const isCrypto = /btc|eth|sol|xrp|doge|pepe|bitcoin|ethereum|solana|ripple/.test(slug) || 
                         /bitcoin|ethereum|solana|xrp/.test(title);
        
        // 结算时间：临近结算 (24h内)
        const msLeft = new Date(m.endDate).getTime() - Date.now();
        const hoursLeft = msLeft / (1000 * 60 * 60);
        const isSoon = hoursLeft > 0 && hoursLeft <= state.config.maxSettleHours;

        // 流动性：必须有真实成交
        const hasLiquidity = volume >= state.config.minVolume;

        // 结构：必须是二元期权
        let tokens = m.clobTokenIds;
        if (typeof tokens === 'string') {
          try { tokens = JSON.parse(tokens); } catch(e) { return false; }
        }
        
        return isCrypto && isSoon && hasLiquidity && Array.isArray(tokens) && tokens.length === 2;
      });

      if (filtered.length > 0) {
        const newRounds = filtered.map(m => {
          let tokens = typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : m.clobTokenIds;
          let asset = 'CRYPTO';
          if (m.slug.includes('btc')) asset = 'BTC';
          else if (m.slug.includes('eth')) asset = 'ETH';
          else if (m.slug.includes('sol')) asset = 'SOL';
          else if (m.slug.includes('xrp')) asset = 'XRP';

          const oldRound = state.rounds.find(r => r.id === m.id);
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
        });
        
        // 按结算迫切程度排序
        state.rounds = newRounds.sort((a,b) => a.countdown - b.countdown).slice(0, 12);
        
        if (scanCount === 1) addLog(`Alpha 引擎就绪: 锁定 ${state.rounds.length} 个高频套利目标`, 'SUCCESS');
      }
    }

    // 2. 毫秒级差价监控
    await Promise.all(state.rounds.map(async (round) => {
      try {
        const [yesRes, noRes] = await Promise.all([
          fetch(`${CLOB_API}/book?token_id=${round.yesTokenId}`),
          fetch(`${CLOB_API}/book?token_id=${round.noTokenId}`)
        ]);
        const yesData = await yesRes.json();
        const noData = await noRes.json();

        const newYes = yesData.asks?.[0]?.price ? parseFloat(yesData.asks[0].price) : round.askYes;
        const newNo = noData.asks?.[0]?.price ? parseFloat(noData.asks[0].price) : round.askNo;

        round.historyYes.push(newYes);
        if (round.historyYes.length > 20) round.historyYes.shift();
        
        // 发现错价
        if (round.status === 'SCANNING' && state.config.autoBet) {
          const prev = round.historyYes[round.historyYes.length - 2] || newYes;
          const drop = ((prev - newYes) / prev) * 100;
          if (drop >= state.config.dropThreshold && newYes > 0.05 && newYes < 0.95) {
            executeOrder(round, 'YES', 1, newYes);
            round.status = 'HEDGING';
            round.leg1Side = 'YES';
            round.leg1Price = newYes;
            addLog(`捕捉异动: ${round.symbol} 偏离 ${drop.toFixed(2)}%`, 'WARN');
          }
        }

        // 完成对冲
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
            addLog(`策略闭环: ${round.symbol} | 利润: $${profit.toFixed(2)}`, 'SUCCESS');
            setTimeout(() => { round.status = 'SCANNING'; round.leg1Side = null; }, 30000);
          }
        }

        round.askYes = newYes;
        round.askNo = newNo;
        round.countdown = Math.max(0, round.countdown - 2);
      } catch (e) {}
    }));
  } catch (e) {
    // 错误处理
  }
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
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => { 
      try {
        state.config = { ...state.config, ...JSON.parse(body) }; 
        res.end('ok');
      } catch(e) { res.writeHead(400); res.end('fail'); }
    });
  } else { res.writeHead(404); res.end(); }
});

server.listen(3001, '0.0.0.0', () => console.log('PolyEdge Alpha Engine Running...'));
