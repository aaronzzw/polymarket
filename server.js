
/**
 * PolyEdge 24/7 后端套利机器人 (Node.js) - 专研修复版
 * 修复：无法抓取市场、XRP 支持、15M 高频轮次锁定
 */
import http from 'http';

let state = {
  config: {
    scanIntervalMs: 2000,
    dropThreshold: 2.0, // 降低阈值以提高灵敏度
    sumTarget: 0.988,   // 提高入场机会
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
    // 1. 高频市场发现 (每 10 次扫描全量刷新一次库)
    if (state.rounds.length === 0 || scanCount % 50 === 0) {
      // 策略：直接拉取最新的 Price Prediction 相关市场
      // 增加 query 关键字提升命中率
      const searchUrls = [
        `${GAMMA_API}/markets?active=true&closed=false&limit=100&tag=Price%20Prediction`,
        `${GAMMA_API}/markets?active=true&closed=false&limit=100&query=15-minute`
      ];

      let allFound = [];
      for (const url of searchUrls) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            allFound = [...allFound, ...data];
          }
        } catch(e) {}
      }

      // 去重并过滤
      const uniqueMarkets = Array.from(new Map(allFound.map(m => [m.id, m])).values());
      
      const filtered = uniqueMarkets.filter(m => {
        const title = (m.question || "").toLowerCase();
        const slug = (m.slug || "").toLowerCase();
        
        // 核心资产：BTC, ETH, SOL, XRP
        const isTargetAsset = /bitcoin|btc|ethereum|eth|solana|sol|ripple|xrp/.test(slug) || 
                             /bitcoin|ethereum|solana|xrp|ripple/.test(title);
        
        // 核心时间：15分钟
        const is15Min = /15[ -]?min/.test(slug) || /15[ -]?min/.test(title) || slug.includes('price-prediction');
        
        let tokens = m.clobTokenIds;
        if (typeof tokens === 'string') {
          try { tokens = JSON.parse(tokens); } catch(e) { return false; }
        }
        return isTargetAsset && is15Min && Array.isArray(tokens) && tokens.length === 2;
      });

      if (filtered.length > 0) {
        const newRounds = filtered.slice(0, 12).map(m => {
          let tokens = typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : m.clobTokenIds;
          let asset = 'BTC';
          if (m.slug.includes('eth')) asset = 'ETH';
          else if (m.slug.includes('sol')) asset = 'SOL';
          else if (m.slug.includes('xrp') || m.slug.includes('ripple')) asset = 'XRP';

          // 继承旧状态的价格历史
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
        
        if (state.rounds.length === 0) {
          addLog(`引擎初始化成功: 锁定 ${newRounds.length} 个 15M 专用盘口`, 'SUCCESS');
        }
        state.rounds = newRounds;
      } else if (scanCount % 5 === 0) {
        addLog("正在通过 Tag 和 Query 深度搜索 15M 轮次...", "INFO");
      }
    }

    // 2. 实时价格轮询
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
        if (round.historyYes.length > 15) round.historyYes.shift();
        
        // 策略触发
        if (round.status === 'SCANNING' && state.config.autoBet) {
          const prev = round.historyYes[round.historyYes.length - 2] || newYes;
          const drop = ((prev - newYes) / prev) * 100;
          if (drop >= state.config.dropThreshold && newYes > 0.1 && newYes < 0.9) {
            executeOrder(round, 'YES', 1, newYes);
            round.status = 'HEDGING';
            round.leg1Side = 'YES';
            round.leg1Price = newYes;
            addLog(`[SIGNAL] ${round.asset} 跌幅 ${drop.toFixed(2)}%, 已入场 Leg1`, 'WARN');
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
            addLog(`[PROFIT] ${round.asset} 套利闭环, 获利: $${profit.toFixed(2)}`, 'SUCCESS');
            setTimeout(() => { round.status = 'SCANNING'; round.leg1Side = null; }, 45000);
          }
        }

        round.askYes = newYes;
        round.askNo = newNo;
        round.countdown = Math.max(0, round.countdown - 2);
      } catch (e) {}
    }));
  } catch (e) {
    console.error("Critical Loop Error:", e);
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

server.listen(3001, '0.0.0.0', () => console.log('PolyEdge Master API Running on 0.0.0.0:3001'));
