
/**
 * PolyEdge 24/7 后端套利机器人 (Node.js)
 * 策略优化：捕捉临近结算的高频错价市场 (15m/30m/1h)
 */
import http from 'http';

let state = {
  config: {
    scanIntervalMs: 1500, // 提升采集频率
    dropThreshold: 1.5,   // 灵敏触发
    sumTarget: 0.992,     // 提高盈利空间
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
  if (state.logs.length > 100) state.logs.shift();
  // 仅在关键状态变更时打印控制台，减少回弹压力
  if (level !== 'INFO' || scanCount % 20 === 0) {
    console.log(`[${log.timestamp}] [${level}] ${message}`);
  }
}

async function updateMarketData() {
  scanCount++;
  try {
    // 1. 动态全量扫描：捕捉 15m/30m/1h 等快速结算市场
    if (state.rounds.length === 0 || scanCount % 10 === 0) {
      const res = await fetch(`${GAMMA_API}/markets?active=true&closed=false&limit=300&order=endDate&dir=asc`);
      if (!res.ok) throw new Error(`API Connection Failed`);
      const allMarkets = await res.json();
      
      const filtered = allMarkets.filter(m => {
        const title = (m.question || "").toLowerCase();
        const slug = (m.slug || "").toLowerCase();
        
        // 资产匹配：BTC/ETH/SOL/XRP/DOGE 等主流预测资产
        const isAsset = /\b(bitcoin|btc|ethereum|eth|solana|sol|ripple|xrp|doge)\b/.test(slug) || 
                        /\b(bitcoin|ethereum|solana|xrp)\b/i.test(title);
        
        // 时间框架匹配：捕捉 15m, 30m, 1h, 15 minute, hourly, daily 等
        const isHighFreq = /(15[ -]?min|30[ -]?min|1[ -]?h|hourly|daily|price-prediction)/.test(slug) || 
                           /(15[ -]?min|30[ -]?min|1[ -]?h|hourly|daily|prediction)/.test(title);

        // 核心条件：临近结算（24小时内）
        const timeToSettlement = (new Date(m.endDate).getTime() - Date.now());
        const isSoon = timeToSettlement > 0 && timeToSettlement < 86400000;

        let tokens = m.clobTokenIds;
        if (typeof tokens === 'string') {
          try { tokens = JSON.parse(tokens); } catch(e) { return false; }
        }
        return isAsset && isHighFreq && isSoon && Array.isArray(tokens) && tokens.length === 2;
      });

      if (filtered.length > 0) {
        const newRounds = filtered.map(m => {
          let tokens = typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : m.clobTokenIds;
          let asset = 'CRYPTO';
          const s = m.slug.toLowerCase();
          if (s.includes('btc')) asset = 'BTC';
          else if (s.includes('eth')) asset = 'ETH';
          else if (s.includes('sol')) asset = 'SOL';
          else if (s.includes('xrp')) asset = 'XRP';

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
        
        // 优先展示最早结算的市场
        state.rounds = newRounds.sort((a,b) => a.countdown - b.countdown).slice(0, 15);
        
        if (scanCount % 50 === 1) {
           addLog(`[策略引擎] 深度匹配完成: 锁定 ${state.rounds.length} 个临近结算市场`, 'SUCCESS');
        }
      }
    }

    // 2. 毫秒级价格套利监控
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
        
        // 套利逻辑：Leg 1 捕捉超跌
        if (round.status === 'SCANNING' && state.config.autoBet) {
          const prev = round.historyYes[round.historyYes.length - 2] || newYes;
          const drop = ((prev - newYes) / prev) * 100;
          if (drop >= state.config.dropThreshold && newYes > 0.1 && newYes < 0.9) {
            executeOrder(round, 'YES', 1, newYes);
            round.status = 'HEDGING';
            round.leg1Side = 'YES';
            round.leg1Price = newYes;
            addLog(`[SIGNAL] ${round.asset} 跌幅 ${drop.toFixed(2)}% | 价格: ${newYes}`, 'WARN');
          }
        }

        // 套利逻辑：Leg 2 完成对冲
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
            addLog(`[SUCCESS] ${round.asset} 套利闭环 | 预估利润: $${profit.toFixed(2)}`, 'SUCCESS');
            setTimeout(() => { round.status = 'SCANNING'; round.leg1Side = null; }, 60000);
          }
        }

        round.askYes = newYes;
        round.askNo = newNo;
        round.countdown = Math.max(0, round.countdown - 2);
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
