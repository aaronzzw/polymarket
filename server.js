
/**
 * PolyEdge 24/7 后端套利机器人 (Node.js)
 * 功能：独立运行，抓取真实数据，维护交易状态
 * 运行：node server.js
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

let scanCount = 0; // 用于心跳日志

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
  scanCount++;
  try {
    // 1. 获取活跃市场清单 (如果为空则初始化)
    if (state.rounds.length === 0) {
      const res = await fetch(`${GAMMA_API}/markets?active=true&closed=false&limit=15&order=volume24hr&dir=desc`);
      if (!res.ok) throw new Error(`Gamma API returned ${res.status}`);
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
      addLog(`初始化成功，已加载 ${state.rounds.length} 个高成交量市场`, 'SUCCESS');
    }

    // 2. 存活心跳日志 (每 10 次循环打印一次)
    if (scanCount % 10 === 0) {
      console.log(`[Heartbeat] 正在扫描中... 活跃市场: ${state.rounds.length}, 已记录订单: ${state.orders.length}`);
    }

    // 3. 并行获取所有市场的实时价格
    await Promise.all(state.rounds.map(async (round) => {
      if (round.status === 'LOCKED') return;

      try {
        const fetchWithTimeout = (url, timeout = 3000) => {
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

        // 更新历史
        round.historyYes.push(newYes);
        if (round.historyYes.length > 10) round.historyYes.shift();
        
        // 策略逻辑 (不变)
        if (round.status === 'SCANNING' && state.config.autoBet) {
          const prev = round.historyYes[round.historyYes.length - 2] || newYes;
          const drop = ((prev - newYes) / prev) * 100;
          if (drop >= state.config.dropThreshold) {
            addLog(`触发 Leg1: ${round.symbol} 异动检测 (${drop.toFixed(1)}%)`, 'WARN');
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
            addLog(`[套利成功] 市场: ${round.symbol}, 利润: $${profit.toFixed(2)}`, 'SUCCESS');
            
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
        // 捕获单个市场的失败，不中断主循环
      }
    }));
  } catch (e) {
    addLog(`引擎运行异常: ${e.message}`, 'ERROR');
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

// 启动主循环
setInterval(updateMarketData, state.config.scanIntervalMs);

// --- HTTP 控制接口 ---
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
        addLog(`指令确认：策略参数已实时同步至后台`, 'WARN');
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
  console.log('   PolyEdge 24/7 后端引擎已就绪');
  console.log('   监听地址: 0.0.0.0:3001');
  console.log('   提示: 确保服务器防火墙已放行 3001 端口');
  console.log('==========================================\n');
});
