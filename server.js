
/**
 * PolyEdge 24/7 后端套利机器人 (Node.js)
 * 运行方式: node server.js
 */
const http = require('http');

// --- 配置与状态 ---
let config = {
  scanIntervalMs: 2000,
  dropThreshold: 3,
  sumTarget: 0.98,
  betAmount: 10,
  autoBet: true
};

let stats = {
  totalTrades: 0,
  wonTrades: 0,
  totalVolume: 0,
  netProfit: 0,
  balance: 5000,
  winRate: 0
};

let rounds = [];
let logs = [];
let orders = [];

const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';

// --- 工具函数 ---
function addLog(message, level = 'INFO') {
  const log = {
    id: Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    level,
    message
  };
  logs.push(log);
  if (logs.length > 50) logs.shift();
  console.log(`[${log.timestamp}] [${level}] ${message}`);
}

// --- Polymarket API 交互 ---
async function fetchActiveMarkets() {
  try {
    addLog('正在从 Gamma API 抓取市场数据...', 'INFO');
    const res = await fetch(`${GAMMA_API}/markets?active=true&closed=false&limit=20&order=volume24hr&dir=desc`);
    const data = await res.json();
    
    const filtered = data.filter(m => {
      // 健壮性检查：处理 clobTokenIds 可能为字符串或数组的情况
      let tokens = m.clobTokenIds;
      if (typeof tokens === 'string') {
        try { tokens = JSON.parse(tokens); } catch(e) { return false; }
      }
      return Array.isArray(tokens) && tokens.length === 2;
    }).map(m => {
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

    addLog(`成功筛选出 ${filtered.length} 个符合条件的 CLOB 交易对`, 'SUCCESS');
    return filtered;
  } catch (e) {
    addLog(`抓取市场清单失败: ${e.message}`, 'ERROR');
    return [];
  }
}

async function fetchPrice(tokenId) {
  try {
    const res = await fetch(`${CLOB_API}/book?token_id=${tokenId}`);
    const data = await res.json();
    // 提取 Ask 价格
    if (data.asks && data.asks.length > 0) {
      return parseFloat(data.asks[0].price);
    }
    return 0.5;
  } catch (e) {
    return 0.5;
  }
}

// --- 核心策略引擎 ---
async function runStrategy() {
  if (rounds.length === 0) {
    rounds = await fetchActiveMarkets();
    return;
  }

  // 每一轮并行更新所有市场的价格
  const updatePromises = rounds.map(async (round) => {
    if (round.status === 'LOCKED') return round;

    const [newYes, newNo] = await Promise.all([
      fetchPrice(round.yesTokenId),
      fetchPrice(round.noTokenId)
    ]);

    // 更新价格历史
    round.historyYes.push(newYes);
    round.historyNo.push(newNo);
    if (round.historyYes.length > 10) round.historyYes.shift();
    if (round.historyNo.length > 10) round.historyNo.shift();

    round.askYes = newYes;
    round.askNo = newNo;

    // 逻辑 A: 检测 Leg 1 (暴跌捕捉)
    if (round.status === 'SCANNING' && config.autoBet) {
      const prevYes = round.historyYes[round.historyYes.length - 2] || newYes;
      const dropPct = prevYes > 0 ? ((prevYes - newYes) / prevYes) * 100 : 0;
      
      if (dropPct >= config.dropThreshold) {
        addLog(`检测到 ${round.symbol} YES 异动: -${dropPct.toFixed(2)}%`, 'WARN');
        round.status = 'HEDGING';
        round.leg1Side = 'YES';
        round.leg1Price = newYes;
        executeOrder(round, 'YES', 1, newYes);
      }
    }

    // 逻辑 B: 检测 Leg 2 (对冲入场)
    if (round.status === 'HEDGING' && config.autoBet) {
      const currentOpposite = round.leg1Side === 'YES' ? newNo : newYes;
      const totalCost = round.leg1Price + currentOpposite;

      if (totalCost <= config.sumTarget) {
        executeOrder(round, round.leg1Side === 'YES' ? 'NO' : 'YES', 2, currentOpposite);
        const profit = (1 - totalCost) * config.betAmount;
        
        stats.totalTrades++;
        stats.wonTrades++;
        stats.netProfit += profit;
        stats.balance += profit;
        stats.winRate = (stats.wonTrades / stats.totalTrades) * 100;
        
        round.status = 'LOCKED';
        addLog(`[套利完成] ${round.symbol} 获利: $${profit.toFixed(2)}`, 'SUCCESS');
        
        // 10秒后重启该市场的扫描
        setTimeout(() => {
          round.status = 'SCANNING';
          round.leg1Side = null;
          round.leg1Price = null;
        }, 10000);
      }
    }
    
    // 更新倒计时
    round.countdown = Math.max(0, round.countdown - (config.scanIntervalMs / 1000));
    return round;
  });

  await Promise.all(updatePromises);
}

function executeOrder(round, side, leg, price) {
  const order = {
    id: `tx-${Date.now()}-${Math.floor(Math.random()*1000)}`,
    symbol: round.symbol,
    side,
    leg,
    price,
    amount: config.betAmount,
    status: 'FILLED',
    timestamp: new Date().toLocaleTimeString(),
    txHash: '0x' + Math.random().toString(16).substr(2, 32)
  };
  orders.unshift(order);
  if (orders.length > 50) orders.pop();
}

// 启动
setInterval(runStrategy, config.scanIntervalMs);

// 定期刷新市场列表 (每10分钟)
setInterval(async () => {
  const freshMarkets = await fetchActiveMarkets();
  if (freshMarkets.length > 0) rounds = freshMarkets;
}, 600000);

// --- HTTP 服务 ---
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.end(); return; }

  if (req.url === '/sync' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ config, stats, rounds, logs, orders }));
  } else if (req.url === '/config' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const newConf = JSON.parse(body);
        config = { ...config, ...newConf };
        addLog('配置参数已同步更新', 'WARN');
        res.end('ok');
      } catch(e) {
        res.writeHead(400); res.end();
      }
    });
  } else {
    res.writeHead(404); res.end();
  }
});

server.listen(3001, '0.0.0.0', () => {
  console.log('\n==========================================');
  console.log('   PolyEdge Bot Backend - RUNNING');
  console.log('   Port: 3001');
  console.log('   Status: Waiting for UI Connection...');
  console.log('==========================================\n');
});
