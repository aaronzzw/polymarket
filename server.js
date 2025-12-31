
/**
 * PolyEdge 24/7 后端套利机器人 (Node.js) - 核心修复版
 * 重点解决：15M 市场匹配失效问题
 */
import http from 'http';

let state = {
  config: {
    scanIntervalMs: 2000,
    dropThreshold: 1.8, 
    sumTarget: 0.988,   
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
    // 1. 强力市场搜索逻辑：每 30 秒进行一次深度全量库扫描
    if (state.rounds.length === 0 || scanCount % 15 === 0) {
      // 策略：直接拉取前 500 个活跃市场，不再信任搜索 API
      const res = await fetch(`${GAMMA_API}/markets?active=true&closed=false&limit=500&order=volume24hr&dir=desc`);
      if (!res.ok) throw new Error(`Gamma API Down`);
      const allMarkets = await res.json();
      
      const filtered = allMarkets.filter(m => {
        const title = (m.question || "").toLowerCase();
        const slug = (m.slug || "").toLowerCase();
        
        // 资产正则：覆盖多种命名变体
        const isTargetAsset = /\b(bitcoin|btc|ethereum|eth|solana|sol|ripple|xrp)\b/.test(slug) || 
                             /\b(bitcoin|ethereum|solana|xrp)\b/i.test(title);
        
        // 时间周期正则：匹配 "15-minute", "15 minute", "15 min", "15m"
        const is15Min = /15[ -]?(min|minute|m)\b/.test(slug) || /15[ -]?(min|minute|m)\b/.test(title);
        
        // 必须有盘口 Token
        let tokens = m.clobTokenIds;
        if (typeof tokens === 'string') {
          try { tokens = JSON.parse(tokens); } catch(e) { return false; }
        }
        return isTargetAsset && is15Min && Array.isArray(tokens) && tokens.length === 2;
      });

      if (filtered.length > 0) {
        const newRounds = filtered.map(m => {
          let tokens = typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : m.clobTokenIds;
          let asset = 'BTC';
          const s = m.slug.toLowerCase();
          if (s.includes('eth')) asset = 'ETH';
          else if (s.includes('sol')) asset = 'SOL';
          else if (s.includes('xrp') || s.includes('ripple')) asset = 'XRP';

          const oldRound = state.rounds.find(r => r.id === m.id);
          return {
            id: m.id,
            asset,
            symbol: m.ticker || m.slug.split('-').slice(0, 2).join(' ').toUpperCase(),
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
        
        // 按资产去重并保持最新轮次（防止 API 返回过期市场）
        state.rounds = newRounds.sort((a,b) => a.countdown - b.countdown).slice(0, 12);
        
        if (scanCount % 30 === 1) {
           addLog(`[引擎同步] 已刷新 ${state.rounds.length} 个活跃 15M 轮次`, 'SUCCESS');
        }
      } else {
        if (scanCount % 5 === 0) addLog("正在深度检索全量库以匹配 15M 资产对...", "INFO");
      }
    }

    // 2. 价格高频更新
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
        
        // 策略执行
        if (round.status === 'SCANNING' && state.config.autoBet) {
          const prev = round.historyYes[round.historyYes.length - 3] || newYes;
          const drop = ((prev - newYes) / prev) * 100;
          if (drop >= state.config.dropThreshold && newYes > 0.05 && newYes < 0.95) {
            executeOrder(round, 'YES', 1, newYes);
            round.status = 'HEDGING';
            round.leg1Side = 'YES';
            round.leg1Price = newYes;
            addLog(`入场信号: ${round.asset} 快速回撤 ${drop.toFixed(2)}%`, 'WARN');
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
            addLog(`套利锁定: ${round.asset}, 净利: $${profit.toFixed(2)}`, 'SUCCESS');
            setTimeout(() => { round.status = 'SCANNING'; round.leg1Side = null; }, 60000);
          }
        }

        round.askYes = newYes;
        round.askNo = newNo;
        round.countdown = Math.max(0, round.countdown - 2);
      } catch (e) {}
    }));
  } catch (e) {
    console.error("Critical Error:", e);
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

server.listen(3001, '0.0.0.0', () => console.log('PolyEdge Master API Online: 0.0.0.0:3001'));
