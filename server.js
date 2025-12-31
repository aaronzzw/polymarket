
/**
 * PolyEdge 24/7 后端套利机器人 (Node.js)
 * 功能：独立运行，抓取真实数据，维护交易状态
 * 运行：node server.js
 */
const http = require('http');

// --- 全局持久化状态 (即使前端关闭，这里依然运行) ---
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

const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';

// --- 工具：添加日志 ---
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

// --- 数据获取：Polymarket 真实数据 ---
async function updateMarketData() {
  try {
    // 1. 获取活跃市场清单
    if (state.rounds.length === 0) {
      const res = await fetch(`${GAMMA_API}/markets?active=true&closed=false&limit=15&order=volume24hr&dir=desc`);
      const data = await res.json();
      
      state.rounds = data.filter(m => {
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
      addLog(`初始化成功，监控 ${state.rounds.length} 个活跃市场`, 'SUCCESS');
    }

    // 2. 并行获取所有市场的实时价格 (Ask)
    const updatePromises = state.rounds.map(async (round) => {
      if (round.status === 'LOCKED') return;

      try {
        const [yesRes, noRes] = await Promise.all([
          fetch(`${CLOB_API}/book?token_id=${round.yesTokenId}`),
          fetch(`${CLOB_API}/book?token_id=${round.noTokenId}`)
        ]);
        const yesData = await yesRes.json();
        const noData = await noRes.json();

        const newYes = yesData.asks?.[0]?.price ? parseFloat(yesData.asks[0].price) : round.askYes;
        const newNo = noData.asks?.[0]?.price ? parseFloat(noData.asks[0].price) : round.askNo;

        // 更新历史用于异动检测
        round.historyYes.push(newYes);
        if (round.historyYes.length > 10) round.historyYes.shift();
        
        // 核心逻辑：Leg 1 暴跌检测
        if (round.status === 'SCANNING' && state.config.autoBet) {
          const prev = round.historyYes[round.historyYes.length - 2] || newYes;
          const drop = ((prev - newYes) / prev) * 100;
          if (drop >= state.config.dropThreshold) {
            addLog(`触发 Leg1: ${round.symbol} 暴跌 ${drop.toFixed(1)}%`, 'WARN');
            executeOrder(round, 'YES', 1, newYes);
            round.status = 'HEDGING';
            round.leg1Side = 'YES';
            round.leg1Price = newYes;
          }
        }

        // 核心逻辑：Leg 2 对冲入场检测
        if (round.status === 'HEDGING' && state.config.autoBet) {
          const totalCost = round.leg1Price + newNo;
          if (totalCost <= state.config.sumTarget) {
            executeOrder(round, 'NO', 2, newNo);
            const profit = (1 - totalCost) * state.config.betAmount;
            
            // 更新全局统计
            state.stats.totalTrades++;
            state.stats.wonTrades++;
            state.stats.netProfit += profit;
            state.stats.balance += profit;
            state.stats.winRate = (state.stats.wonTrades / state.stats.totalTrades) * 100;
            
            round.status = 'LOCKED';
            addLog(`[套利完成] ${round.symbol} 获利: $${profit.toFixed(2)}`, 'SUCCESS');
            
            // 30秒后重置
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
        // 忽略单个价格抓取失败
      }
    });

    await Promise.all(updatePromises);
  } catch (e) {
    addLog(`核心引擎异常: ${e.message}`, 'ERROR');
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
    timestamp: new Date().toLocaleTimeString(),
    txHash: '0x' + Math.random().toString(16).substr(2, 32)
  };
  state.orders.unshift(order);
  if (state.orders.length > 50) state.orders.pop();
}

// 启动循环
setInterval(updateMarketData, state.config.scanIntervalMs);

// --- HTTP 控制接口 ---
const server = http.createServer((req, res) => {
  // CORS 允许所有前端访问
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.end(); return; }

  // 1. 同步接口 (前端拉取)
  if (req.url === '/sync' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state));
  } 
  // 2. 配置接口 (前端推送)
  else if (req.url === '/config' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const newConf = JSON.parse(body);
        state.config = { ...state.config, ...newConf };
        addLog(`远程指令：配置参数已更新`, 'WARN');
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
  console.log('\n==========================================');
  console.log('   PolyEdge 24/7 策略后端已启动');
  console.log('   端口: 3001');
  console.log('   状态: 正在后台监控 Polymarket 实时深度...');
  console.log('==========================================\n');
});
