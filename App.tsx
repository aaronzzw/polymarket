
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LogEntry, TradeConfig, ArbitrageRound, DashboardStats, Order } from './types';
import StatsHeader from './components/StatsHeader';
import ScannerConfig from './components/ScannerConfig';
import Terminal from './components/Terminal';
import OrderHistory from './components/OrderHistory';

const App: React.FC = () => {
  const [isServerActive, setIsServerActive] = useState(false);
  const [activeTab, setActiveTab] = useState('All Pairs');
  const syncTimer = useRef<number | null>(null);
  
  // 改进的后端地址检测
  const getBackendUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const hostname = window.location.hostname || 'localhost';
    // 注意：如果是云端预览，可能需要特殊的端口映射处理，这里默认本地 3001
    return `${protocol}//${hostname}:3001`;
  }, []);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalTrades: 0, wonTrades: 0, totalVolume: 0, netProfit: 0, balance: 5000, winRate: 0
  });
  const [rounds, setRounds] = useState<any[]>([]);
  const [config, setConfig] = useState<any>({
    engineActive: false, scanIntervalMs: 2000, profitThreshold: 0.008, betAmount: 10, autoBet: true
  });

  const syncWithServer = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      
      const res = await fetch(`${getBackendUrl()}/sync`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setOrders(data.orders || []);
        setStats(data.stats);
        setRounds(data.rounds || []);
        setConfig(data.config);
        setIsServerActive(true);
      } else {
        setIsServerActive(false);
      }
    } catch (e) {
      setIsServerActive(false);
    }
  }, [getBackendUrl]);

  const saveConfig = async () => {
    try {
      const res = await fetch(`${getBackendUrl()}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (res.ok) await syncWithServer();
    } catch (e) {
      console.error("Failed to save config", e);
    }
  };

  const toggleEngine = async () => {
    try {
      const res = await fetch(`${getBackendUrl()}/toggle`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        await syncWithServer();
      } else {
        throw new Error(`Server responded with ${res.status}`);
      }
    } catch (e) {
      console.error("Failed to toggle engine:", e);
      alert("无法连接到后端引擎，请确保 server.js 正在运行且端口 3001 已开放。");
    }
  };

  useEffect(() => {
    syncWithServer();
    syncTimer.current = window.setInterval(syncWithServer, 1000);
    return () => {
      if (syncTimer.current) clearInterval(syncTimer.current);
    };
  }, [syncWithServer]);

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-200 flex flex-col font-sans selection:bg-blue-500/30">
      <nav className="h-14 border-b border-slate-800 flex items-center px-6 justify-between bg-[#0b0e14]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-8">
           <div className="flex items-center gap-2">
             <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center rotate-3 shadow-lg shadow-blue-500/20">
                <i className="fa-solid fa-bolt text-white text-sm"></i>
             </div>
             <h1 className="text-xl font-black italic tracking-tighter uppercase text-white">Poly<span className="text-blue-500">Edge</span></h1>
           </div>
           <div className="hidden lg:flex gap-6 text-[10px] font-black uppercase tracking-widest text-slate-500">
             <span className="text-white border-b-2 border-blue-500 pb-4 mt-4">Smart Ape Pair Monitor</span>
             <span className="hover:text-white cursor-pointer transition-colors opacity-50">v5.2.0-STABLE</span>
           </div>
        </div>
        <div className="flex items-center gap-4">
           <div className={`flex items-center gap-2 px-3 py-1 rounded-full border transition-all ${isServerActive ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isServerActive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
              <span className={`text-[9px] font-black uppercase ${isServerActive ? 'text-green-400' : 'text-red-400'}`}>
                {isServerActive ? (config.engineActive ? 'Engine Active' : 'Standby') : 'Engine Offline'}
              </span>
           </div>
        </div>
      </nav>

      <div className="flex-1 overflow-y-auto p-8 max-w-[1600px] mx-auto w-full">
        <StatsHeader stats={stats} />
        
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 mb-8">
          <div className="xl:col-span-1 h-full">
             <ScannerConfig config={config} setConfig={setConfig} onSave={saveConfig} onToggle={toggleEngine} />
          </div>

          <div className="xl:col-span-3 space-y-6">
            {!isServerActive && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center">
                 <i className="fa-solid fa-triangle-exclamation text-red-500 text-3xl mb-3"></i>
                 <h2 className="text-red-500 font-black uppercase tracking-widest">后端连接断开</h2>
                 <p className="text-slate-400 text-xs mt-2 font-mono">无法连接到 {getBackendUrl()}。请检查服务端是否运行并处于可访问状态。</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rounds.length === 0 && isServerActive ? (
                <div className="col-span-2 h-64 border-2 border-dashed border-slate-800 rounded-3xl flex flex-col items-center justify-center bg-[#151921]/30">
                  <i className="fa-solid fa-magnifying-glass-chart text-4xl mb-4 text-slate-700"></i>
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                    {config.engineActive ? '正在深度配对资产套利对 (BTC/ETH/SOL)...' : '引擎已停止，点击左侧按钮启动扫描'}
                  </p>
                </div>
              ) : (
                rounds.map((r: any) => (
                  <div key={r.id} className={`bg-[#151921] rounded-2xl border p-6 transition-all relative overflow-hidden ${
                    r.sumYES < (1 - config.profitThreshold) ? 'border-green-500/50 shadow-2xl shadow-green-500/10 bg-[#1a2521]' : 'border-slate-800'
                  }`}>
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-[#0d1117] rounded-lg border border-slate-800 flex items-center justify-center">
                          <i className={`fa-brands ${r.asset === 'BTC' ? 'fa-bitcoin text-orange-500' : (r.asset === 'ETH' ? 'fa-ethereum text-indigo-400' : 'fa-solid fa-s text-green-500')} text-xl`}></i>
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-white">{r.symbol}</h3>
                          <span className="text-[10px] text-slate-500 font-bold uppercase">{r.countdown > 0 ? `T-Minus ${Math.floor(r.countdown/3600)}h` : 'Settling'}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-xl font-black ${(r.sumYES < (1 - config.profitThreshold)) ? 'text-green-400 animate-pulse' : 'text-slate-400'}`}>
                          {(r.sumYES * 100).toFixed(2)}%
                        </div>
                        <div className="text-[8px] font-black text-slate-600 uppercase tracking-tighter">Combined Odds</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-[#0d1117] p-3 rounded-xl border border-slate-800/50">
                        <div className="text-[9px] text-slate-500 font-black uppercase mb-1">Leg A (Above)</div>
                        <div className="text-lg font-mono font-bold text-white">${r.askYes.toFixed(3)}</div>
                      </div>
                      <div className="bg-[#0d1117] p-3 rounded-xl border border-slate-800/50">
                        <div className="text-[9px] text-slate-500 font-black uppercase mb-1">Leg B (Below)</div>
                        <div className="text-lg font-mono font-bold text-white">${r.askNo.toFixed(3)}</div>
                      </div>
                    </div>

                    {r.sumYES < (1 - config.profitThreshold) && (
                      <div className="mt-4 bg-green-500/10 border border-green-500/20 rounded-lg p-2 flex items-center justify-center gap-2">
                        <i className="fa-solid fa-triangle-exclamation text-green-400 text-[10px]"></i>
                        <span className="text-[10px] text-green-400 font-black uppercase tracking-widest">Arbitrage Detected: {((1-r.sumYES)*100).toFixed(2)}% P&L</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="grid grid-cols-1 h-[450px] gap-6">
              <Terminal logs={logs} />
              <OrderHistory orders={orders} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
