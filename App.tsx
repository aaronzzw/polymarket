
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LogEntry, TradeConfig, ArbitrageRound, DashboardStats, Order } from './types';
import StatsHeader from './components/StatsHeader';
import ScannerConfig from './components/ScannerConfig';
import Terminal from './components/Terminal';
import MarketTable from './components/MarketTable';
import OrderHistory from './components/OrderHistory';

const App: React.FC = () => {
  const [isScanning, setIsScanning] = useState(false);
  
  // 从本地存储初始化状态
  const [logs, setLogs] = useState<LogEntry[]>(() => {
    const saved = localStorage.getItem('alpha_logs');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [orders, setOrders] = useState<Order[]>(() => {
    const saved = localStorage.getItem('alpha_orders');
    return saved ? JSON.parse(saved) : [];
  });

  const [stats, setStats] = useState<DashboardStats>(() => {
    const saved = localStorage.getItem('alpha_stats');
    return saved ? JSON.parse(saved) : {
      totalTrades: 0,
      wonTrades: 0,
      totalVolume: 0,
      netProfit: 0,
      balance: 5000,
      winRate: 0
    };
  });

  const [config, setConfig] = useState<TradeConfig>({
    scanIntervalMs: 800,
    dropThreshold: 5,
    sumTarget: 0.98,
    betAmount: 100,
    autoBet: true,
    privateKey: '',
    rpcUrl: 'https://polygon-mainnet.g.alchemy.com/v2/...'
  });

  const [rounds, setRounds] = useState<ArbitrageRound[]>([]);
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  // 数据持久化副作用
  useEffect(() => {
    localStorage.setItem('alpha_logs', JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    localStorage.setItem('alpha_orders', JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem('alpha_stats', JSON.stringify(stats));
  }, [stats]);

  const addLog = useCallback((message: string, level: LogEntry['level'] = 'INFO') => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      level,
      message
    };
    setLogs(prev => [...prev.slice(-49), newLog]); // 增加日志保留条数
  }, []);

  const createOrder = useCallback((symbol: string, side: 'UP' | 'DOWN', leg: 1 | 2, price: number, roundId: string) => {
    const newOrder: Order = {
      id: `tx-${Math.random().toString(36).substr(2, 9)}`,
      roundId: roundId,
      symbol: symbol,
      side,
      leg,
      price,
      amount: configRef.current.betAmount,
      status: 'FILLED',
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      txHash: `0x${Math.random().toString(16).substr(2, 40)}...`
    };
    setOrders(prev => [newOrder, ...prev.slice(0, 99)]); // 增加订单保留条数
    return newOrder;
  }, []);

  const initSingleRound = (symbol: string, currentCountdown: number = 900): ArbitrageRound => ({
    id: `r-${symbol}-${Date.now()}`,
    symbol: symbol,
    askUp: 0.5,
    askDown: 0.5,
    historyUp: [],
    historyDown: [],
    countdown: currentCountdown,
    leg1Side: null,
    leg1Price: null,
    leg2Done: false,
    status: 'SCANNING',
    resetTimer: undefined
  });

  const fetchRealData = useCallback(async (symbol: string) => {
    try {
        const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`);
        const data = await res.json();
        const price = parseFloat(data.price);
        const seed = (price * 100) % 100;
        const up = 0.45 + (seed / 1000);
        const down = 1.0 - up + (Math.random() * 0.02 - 0.01);
        return { up, down };
    } catch (e) {
        const drift = (Math.random() * 0.01 - 0.005);
        return { up: 0.5 + drift, down: 0.5 - drift };
    }
  }, []);

  const processTicks = useCallback(async () => {
    const actions: (() => void)[] = [];
    
    const updatedRoundsPromises = rounds.map(async (round) => {
      if (round.status === 'LOCKED' && round.resetTimer !== undefined) return round;

      const { up: newUpRaw, down: newDownRaw } = await fetchRealData(round.symbol);
      
      let newUp = newUpRaw;
      let newDown = newDownRaw;
      const isPanic = Math.random() < 0.01; // 降低模拟故障频率
      if (isPanic && round.status === 'SCANNING') {
        if (Math.random() > 0.5) newUp *= (1 - configRef.current.dropThreshold/100);
        else newDown *= (1 - configRef.current.dropThreshold/100);
      }

      const nextHistoryUp = [...round.historyUp.slice(-9), newUp];
      const nextHistoryDown = [...round.historyDown.slice(-9), newDown];
      let nextRound = { ...round, askUp: newUp, askDown: newDown, historyUp: nextHistoryUp, historyDown: nextHistoryDown };

      if (round.status === 'SCANNING' && configRef.current.autoBet) {
        const checkDrop = (hist: number[], current: number) => {
          if (hist.length < 2) return false;
          const prev = hist[hist.length-1];
          return ((prev - current) / prev) * 100 >= configRef.current.dropThreshold;
        };

        if (checkDrop(round.historyUp, newUp)) {
          actions.push(() => {
            addLog(`[信号] ${round.symbol} 盘口暴跌，买入 Leg1 UP @ ${newUp.toFixed(3)}`, 'SUCCESS');
            createOrder(round.symbol, 'UP', 1, newUp, round.id);
          });
          nextRound.leg1Side = 'UP';
          nextRound.leg1Price = newUp;
          nextRound.status = 'HEDGING';
        } else if (checkDrop(round.historyDown, newDown)) {
          actions.push(() => {
            addLog(`[信号] ${round.symbol} 盘口暴跌，买入 Leg1 DOWN @ ${newDown.toFixed(3)}`, 'SUCCESS');
            createOrder(round.symbol, 'DOWN', 1, newDown, round.id);
          });
          nextRound.leg1Side = 'DOWN';
          nextRound.leg1Price = newDown;
          nextRound.status = 'HEDGING';
        }
      }

      if (round.status === 'HEDGING' && configRef.current.autoBet) {
        const currentOtherAsk = round.leg1Side === 'UP' ? newDown : newUp;
        const totalCost = (round.leg1Price || 0) + currentOtherAsk;

        if (totalCost <= configRef.current.sumTarget) {
          const side = round.leg1Side === 'UP' ? 'DOWN' : 'UP';
          actions.push(() => {
            addLog(`[套利成功] ${round.symbol} 锁定对冲利润！成本: ${totalCost.toFixed(3)}`, 'SUCCESS');
            createOrder(round.symbol, side, 2, currentOtherAsk, round.id);
            
            const profitValue = (1 - totalCost) * configRef.current.betAmount;
            setStats(s => {
                const newTotal = s.totalTrades + 1;
                const newWon = s.wonTrades + 1;
                return {
                    ...s,
                    totalTrades: newTotal,
                    wonTrades: newWon,
                    totalVolume: s.totalVolume + (totalCost * configRef.current.betAmount),
                    netProfit: s.netProfit + profitValue,
                    balance: s.balance + profitValue,
                    winRate: (newWon / newTotal) * 100
                }
            });
          });
          
          nextRound.leg2Done = true;
          nextRound.status = 'LOCKED';
          nextRound.resetTimer = 5; 
        }
      }
      return nextRound;
    });

    const nextRounds = await Promise.all(updatedRoundsPromises);
    actions.forEach(a => a());
    setRounds(nextRounds);
  }, [rounds, fetchRealData, addLog, createOrder]);

  useEffect(() => {
    if (!isScanning) return;
    const interval = setInterval(processTicks, config.scanIntervalMs);
    return () => clearInterval(interval);
  }, [isScanning, config.scanIntervalMs, processTicks]);

  useEffect(() => {
    const timer = setInterval(() => {
      setRounds(prev => prev.map(r => {
        if (r.status === 'LOCKED' && r.resetTimer !== undefined) {
          if (r.resetTimer <= 1) return initSingleRound(r.symbol, r.countdown);
          return { ...r, resetTimer: r.resetTimer - 1 };
        }
        const newCountdown = Math.max(0, r.countdown - 1);
        if (newCountdown === 0) return initSingleRound(r.symbol);
        return { ...r, countdown: newCountdown };
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setRounds(['BTC', 'ETH', 'SOL', 'POL', 'LINK'].map(s => initSingleRound(s)));
  }, []);

  const clearHistory = () => {
    if (window.confirm('确定要清除所有本地交易历史和统计吗？')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-200 p-4 lg:p-6 flex flex-col max-w-[1600px] mx-auto font-sans selection:bg-blue-500/30">
      <header className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center shadow-2xl border border-blue-400/20">
             <i className="fa-solid fa-robot text-white text-3xl"></i>
          </div>
          <div>
            <h1 className="text-3xl font-black italic text-white tracking-tighter uppercase">Alpha <span className="text-blue-500">Live-Bot</span></h1>
            <p className="text-[10px] text-slate-500 font-bold tracking-[0.3em] uppercase">Binance Real-Time Feed & Persistence Mode</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={clearHistory}
            className="px-4 py-3 rounded-xl font-bold text-[10px] uppercase text-slate-500 border border-slate-800 hover:bg-slate-800 transition-all"
          >
            重置统计
          </button>
          <button 
            onClick={() => setIsScanning(!isScanning)}
            className={`px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
              isScanning ? 'bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20' : 'bg-blue-600 text-white shadow-blue-500/30 shadow-2xl hover:bg-blue-500'
            }`}
          >
            {isScanning ? '停止扫描' : '启动引擎'}
          </button>
        </div>
      </header>

      <StatsHeader stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-4 flex flex-col">
           <ScannerConfig config={config} setConfig={setConfig} isScanning={isScanning} onToggleScan={() => setIsScanning(!isScanning)} />
        </div>
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="h-[300px]">
            <Terminal logs={logs} />
          </div>
          <div className="flex-1">
            <MarketTable rounds={rounds} sumTarget={config.sumTarget} />
          </div>
        </div>
      </div>

      <OrderHistory orders={orders} />

      <footer className="mt-8 pt-4 border-t border-slate-800 flex justify-between text-[9px] text-slate-600 font-bold uppercase tracking-widest">
        <span>STRATEGY: PERSISTENT ARBITRAGE BOT</span>
        <span className="flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-green-500"></div>
            DATA SYNC: LOCAL_STORAGE_ACTIVE
        </span>
      </footer>
    </div>
  );
};

export default App;
