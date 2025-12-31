
import React, { useState, useEffect, useCallback } from 'react';
import { LogEntry, TradeConfig, ArbitrageRound, DashboardStats, Order } from './types';
import StatsHeader from './components/StatsHeader';
import ScannerConfig from './components/ScannerConfig';
import Terminal from './components/Terminal';
import MarketTable from './components/MarketTable';
import OrderHistory from './components/OrderHistory';

const App: React.FC = () => {
  const [isServerActive, setIsServerActive] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalTrades: 0, wonTrades: 0, totalVolume: 0, netProfit: 0, balance: 5000, winRate: 0
  });
  const [rounds, setRounds] = useState<ArbitrageRound[]>([]);
  const [config, setConfig] = useState<TradeConfig>({
    scanIntervalMs: 2000,
    dropThreshold: 3,
    sumTarget: 0.98,
    betAmount: 10,
    autoBet: true,
    privateKey: '',
    rpcUrl: 'https://polygon-rpc.com'
  });

  // 后端数据同步逻辑
  const syncWithServer = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:3001/sync');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setOrders(data.orders);
        setStats(data.stats);
        setRounds(data.rounds);
        if (!isServerActive) setIsServerActive(true);
      }
    } catch (e) {
      if (isServerActive) setIsServerActive(false);
    }
  }, [isServerActive]);

  useEffect(() => {
    const interval = setInterval(syncWithServer, 1000);
    return () => clearInterval(interval);
  }, [syncWithServer]);

  // 修改配置同步到后端
  const updateConfig = async (newConfig: TradeConfig) => {
    setConfig(newConfig);
    if (isServerActive) {
      try {
        await fetch('http://localhost:3001/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newConfig)
        });
      } catch (e) {
        console.error('Failed to update server config');
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-200 p-4 lg:p-6 flex flex-col max-w-[1600px] mx-auto font-sans selection:bg-blue-500/30">
      <header className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 ${isServerActive ? 'bg-green-600' : 'bg-blue-600'} rounded-2xl flex items-center justify-center shadow-2xl transition-all duration-500`}>
             <i className={`fa-solid ${isServerActive ? 'fa-server' : 'fa-bolt-lightning'} text-white text-3xl`}></i>
          </div>
          <div>
            <h1 className="text-3xl font-black italic text-white tracking-tighter uppercase">Poly<span className="text-blue-500">Edge</span> <span className="text-slate-600">v2.0</span></h1>
            <div className="flex items-center gap-2 mt-1">
               <div className={`w-1.5 h-1.5 rounded-full ${isServerActive ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></div>
               <p className="text-[9px] text-slate-500 font-bold tracking-[0.2em] uppercase">
                 {isServerActive ? '后端机器人已连接 (24/7 常驻)' : '未检测到后端，运行 UI 预览模式'}
               </p>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="hidden md:flex flex-col items-end justify-center mr-4">
             <span className="text-[9px] font-black text-slate-600 uppercase">Engine Status</span>
             <span className={`text-[10px] font-bold uppercase ${isServerActive ? 'text-green-500' : 'text-blue-500'}`}>
                {isServerActive ? 'NODE.JS REMOTE' : 'BROWSER LOCAL'}
             </span>
          </div>
          <button 
            disabled={isServerActive}
            onClick={() => setIsScanning(!isScanning)}
            className={`px-10 py-4 rounded-xl font-black text-sm uppercase tracking-widest transition-all ${
              isServerActive ? 'bg-slate-800 text-slate-500 border border-slate-700' :
              isScanning ? 'bg-red-500/10 text-red-500 border border-red-500/30' : 'bg-blue-600 text-white shadow-blue-500/40 shadow-2xl hover:bg-blue-500'
            }`}
          >
            {isServerActive ? '机器人已启动' : isScanning ? '停止扫描' : '启动模拟引擎'}
          </button>
        </div>
      </header>

      <StatsHeader stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-4">
           <ScannerConfig config={config} setConfig={updateConfig} isScanning={isScanning || isServerActive} onToggleScan={() => {}} />
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
           <span>BACKEND: localhost:3001</span>
           <span>STRATEGY: POLY-ARBITRAGE-V2</span>
        </div>
        <div className="flex items-center gap-4">
           <span className="text-blue-500">
             提示：在阿里云服务器运行 "node server.js" 即可实现真正的 24/7 下单
           </span>
        </div>
      </footer>
    </div>
  );
};

export default App;
