
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LogEntry, TradeConfig, ArbitrageRound, DashboardStats, Order } from './types';
import StatsHeader from './components/StatsHeader';
import ScannerConfig from './components/ScannerConfig';
import Terminal from './components/Terminal';
import MarketTable from './components/MarketTable';
import OrderHistory from './components/OrderHistory';

const App: React.FC = () => {
  const [isServerActive, setIsServerActive] = useState(false);
  
  // 后端驱动的数据状态
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalTrades: 0, wonTrades: 0, totalVolume: 0, netProfit: 0, balance: 5000, winRate: 0
  });
  const [rounds, setRounds] = useState<ArbitrageRound[]>([]);
  const [config, setConfig] = useState<TradeConfig>({
    scanIntervalMs: 2000,
    dropThreshold: 3,
    sumTarget: 0.985,
    betAmount: 10,
    autoBet: true,
    privateKey: '',
    rpcUrl: 'https://polygon-rpc.com'
  });

  // --- 核心同步逻辑：从后端拉取全量状态 ---
  const syncWithServer = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:3001/sync');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setOrders(data.orders);
        setStats(data.stats);
        setRounds(data.rounds);
        // 如果是首次连接，同步一下配置
        if (!isServerActive) {
          setConfig(data.config);
          setIsServerActive(true);
        }
      } else {
        setIsServerActive(false);
      }
    } catch (e) {
      setIsServerActive(false);
    }
  }, [isServerActive]);

  useEffect(() => {
    const interval = setInterval(syncWithServer, 1000); // 1秒同步一次
    return () => clearInterval(interval);
  }, [syncWithServer]);

  // --- 控制逻辑：将配置更改推送给后端 ---
  const handleConfigUpdate = async (newConfig: TradeConfig) => {
    setConfig(newConfig);
    if (isServerActive) {
      try {
        await fetch('http://localhost:3001/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newConfig)
        });
      } catch (e) {
        console.error("Failed to push config to server");
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-200 p-4 lg:p-6 flex flex-col max-w-[1600px] mx-auto font-sans selection:bg-blue-500/30">
      <header className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 ${isServerActive ? 'bg-green-600 shadow-[0_0_30px_rgba(34,197,94,0.3)]' : 'bg-red-600 animate-pulse shadow-[0_0_30px_rgba(239,68,68,0.2)]'} rounded-2xl flex items-center justify-center border border-white/10 transition-all duration-500`}>
             <i className={`fa-solid ${isServerActive ? 'fa-server' : 'fa-triangle-exclamation'} text-white text-3xl`}></i>
          </div>
          <div>
            <h1 className="text-3xl font-black italic text-white tracking-tighter uppercase">Poly<span className="text-blue-500">Edge</span> <span className="text-slate-600">v2.5</span></h1>
            <div className="flex items-center gap-2 mt-1">
               <div className={`w-1.5 h-1.5 rounded-full ${isServerActive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
               <p className="text-[9px] text-slate-500 font-bold tracking-[0.2em] uppercase">
                 {isServerActive ? '后端同步中 - 24/7 LIVE' : '等待后端启动 (PORT: 3001)'}
               </p>
            </div>
          </div>
        </div>
        
        <div className="flex gap-4 items-center">
          <div className="hidden md:flex flex-col items-end">
             <span className="text-[9px] font-black text-slate-600 uppercase">System Latency</span>
             <span className="text-[10px] font-bold text-blue-500 uppercase">API: REAL-TIME</span>
          </div>
          {/* 这里只起展示作用，真正的逻辑在后端跑 */}
          <div className={`px-8 py-3 rounded-xl border font-black text-xs uppercase tracking-widest ${
            isServerActive ? 'bg-green-500/10 text-green-500 border-green-500/30' : 'bg-red-500/10 text-red-500 border-red-500/30'
          }`}>
             {isServerActive ? '机器人运行中' : '后端未响应'}
          </div>
        </div>
      </header>

      <StatsHeader stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-4">
           {/* 配置组件：每次修改都会同步到后端 */}
           <ScannerConfig 
              config={config} 
              setConfig={(newConfig: any) => handleConfigUpdate(typeof newConfig === 'function' ? newConfig(config) : newConfig)} 
              isScanning={isServerActive} 
              onToggleScan={() => {}} 
           />
           {!isServerActive && (
              <div className="mt-4 p-5 bg-red-500/5 border border-red-500/20 rounded-xl">
                 <h4 className="text-xs font-black text-red-500 uppercase mb-2">连接中断</h4>
                 <p className="text-[10px] text-slate-500 leading-relaxed">
                    请在您的服务器或本地终端执行 <code className="text-white">node server.js</code> 以启动量化引擎。
                 </p>
              </div>
           )}
        </div>
        
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="h-[280px]">
            <Terminal logs={logs} />
          </div>
          <div className="flex-1">
            <MarketTable rounds={rounds} sumTarget={config.sumTarget} />
          </div>
        </div>
      </div>

      <OrderHistory orders={orders} />

      <footer className="mt-8 pt-6 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 text-[9px] text-slate-600 font-bold uppercase tracking-widest">
        <div className="flex items-center gap-6">
           <span>Control: REST API v1.0</span>
           <span>Data: Polymarket CLOB Real-time</span>
        </div>
        <div className="flex items-center gap-3">
           <span className="text-slate-400">© 2024 ALPHA ENGINE</span>
           <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_10px_#3b82f6]"></div>
        </div>
      </footer>
    </div>
  );
};

export default App;
