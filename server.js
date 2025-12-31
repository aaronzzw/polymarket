
/**
 * PolyEdge 核心引擎 - Smart Ape 策略版
 * 策略：全频段监控即刻结算的 Crypto 市场 (无视 15m/1h 标签)
 */
import http from 'http';

let state = {
  config: {
    scanIntervalMs: 2000,
    dropThreshold: 1.2,   // 捕捉更细微的波动
    sumTarget: 0.994,     // 提高容错率
    betAmount: 10,
    autoBet: true,
    maxSettleHours: 24    // 监控未来 24 小时内结算的所有市场
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
  // 仅在关键时刻打印到后台控制台，不再打印扫描心跳
  if (level !== 'INFO') console.log(`[${log.timestamp}] [${level}] ${message}`);
}

async function updateMarketData() {
  scanCount++;
  try {
    // 1. 深度扫描：拉取 500 个市场，寻找“即将结算”的 Crypto 盘口
    if (state.rounds.length === 0 || scanCount % 15 === 0) {
      const res = await fetch(`${GAMMA_API}/markets?active=true&closed=false&limit=500&order=endDate&dir=asc`);
      if (!res.ok) throw new Error(`Gamma API Down`);
      const allMarkets = await res.json();
      
      const filtered = allMarkets.filter(m => {
        const slug = (m.slug || "").toLowerCase();
        const title = (m.question || "").toLowerCase();
        
        // 条件 A: 是加密货币资产
        const isAsset = /btc|eth|sol|xrp|doge|bitcoin|ethereum|solana|ripple/.test(slug) || 
                        /bitcoin|ethereum|solana|xrp/.test(title);
        
        // 条件 B: 临近结算 (24小时内)
        const timeToSettlement = (new Date(m.endDate).getTime() - Date.now());
        const hoursLeft = timeToSettlement / (1000 * 60 * 60);
        const isShortTerm = hoursLeft > 0 && hoursLeft <= state.config.maxSettleHours;

        // 条件 C: 必须是二元期权 (Yes/No)
        let tokens = m.clobTokenIds;
        if (typeof tokens === 'string') {
          try { tokens = JSON.parse(tokens); } catch(e) { return false; }
        }
        return isAsset && isShortTerm && Array.isArray(tokens) && tokens.length === 2;
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
            countdown: Math.floor((new Date(m.endDate).getTime() - Date.now()) / 1000)
          };
        });
        
        // 保持前 12 个最迫切需要结算的市场
        state.rounds = newRounds.sort((a,b) => a.countdown - b.countdown).slice(0, 12);
        
        if (scanCount === 1) addLog(`初始化成功: 锁定 ${state.rounds.length} 个临近结算市场`, 'SUCCESS');
      }
    }

    // 2. 实时价格获取与对冲触发
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
        if (round.historyYes.length > 30) round.historyYes.shift();
        
        if (round.status === 'SCANNING' && state.config.autoBet) {
          const prev = round.historyYes[round.historyYes.length - 2] || newYes;
          const drop = ((prev - newYes) / prev) * 100;
          if (drop >= state.config.dropThreshold && newYes > 0.1 && newYes < 0.9) {
            executeOrder(round, 'YES', 1, newYes);
            round.status = 'HEDGING';
            round.leg1Side = 'YES';
            round.leg1Price = newYes;
            addLog(`触发信号: ${round.symbol} 异动 ${drop.toFixed(2)}% | 价格: ${newYes}`, 'WARN');
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
            addLog(`套利成功: ${round.symbol} 已锁定盈余 $${profit.toFixed(2)}`, 'SUCCESS');
            setTimeout(() => { round.status = 'SCANNING'; round.leg1Side = null; }, 45000);
          }
        }

        round.askYes = newYes;
        round.askNo = newNo;
        round.countdown = Math.max(0, round.countdown - 1.5);
      } catch (e) {}
    }));
  } catch (e) {
    console.error("Critical Engine Error:", e);
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

server.listen(3001, '0.0.0.0', () => console.log('PolyEdge API Terminal Ready on 0.0.0.0:3001'));
