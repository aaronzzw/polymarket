
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LogEntry, TradeConfig, ArbitrageRound, DashboardStats, Order } from './types';
import StatsHeader from './components/StatsHeader';
import ScannerConfig from './components/ScannerConfig';
import Terminal from './components/Terminal';
import OrderHistory from './components/OrderHistory';

const App: React.FC = () => {
  const [isServerActive, setIsServerActive] = useState(false);
  const syncTimer = useRef<number | null>(null);
  
  const getBackendUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const hostname = window.location.hostname || 'localhost';
    return `${protocol}//${hostname}:3001`;
  }, []);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<any>({
    totalTrades: 0, wonTrades: 0, totalVolume: 0, netProfit: 0, balance: 5000, winRate: 0, scannedCount: 0
  });
  const [rounds, setRounds] = useState<any[]>([]);
  const [config, setConfig] = useState<any>({
    engineActive: false, scanIntervalMs: 2000, profitThreshold: 0.008, betAmount: 10, autoBet: true, maxSettleMinutes: 1440
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
      await fetch(`${getBackendUrl()}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
    } catch (e) {}
  };

  const toggleEngine = async () => {
    try {
      const res = await fetch(`${getBackendUrl()}/toggle`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) await syncWithServer();
    } catch (e) {
      alert("无法切换引擎状态，请检查后端服务。");
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
             <span className="hover:text-white cursor-pointer transition-colors opacity-50">v5.3.0 (Asset Pairing Mode)</span>
           </div>
        </div>
        <div className="flex items-center gap-6">
           <div className="flex items-center gap-2">
              <span className="text-[9px] font-black text-slate-600 uppercase">Scanned Markets:</span>
              <span className="text-[10px] font-mono text-blue-400 font-bold">{stats.scannedCount || 0}</span>
           </div>
           <div className={`flex items-center gap-2 px-3 py-1 rounded-full border transition-all ${isServerActive ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isServerActive ? (config.engineActive ? 'bg-green-500 animate-pulse' : 'bg-yellow-500') : 'bg-red-500'}`}></div>
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
                 <h2 className="text-red-500 font-black uppercase tracking-widest">后端引擎未就绪</h2>
                 <p className="text-slate-400 text-xs mt-2 font-mono">请确保 `node server.js` 正在运行。监听端口: 3001</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rounds.length === 0 && isServerActive ? (
                <div className="col-span-2 h-64 border-2 border-dashed border-slate-800 rounded-3xl flex flex-col items-center justify-center bg-[#151921]/30 p-12 text-center">
                  <i className="fa-solid fa-radar text-4xl mb-4 text-slate-700 animate-pulse"></i>
                  <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-500 mb-2">正在深度匹配 BTC/ETH/SOL 互补市场...</p>
                  <p className="text-[10px] text-slate-600 max-w-sm leading-relaxed font-bold">引擎会持续扫描 Gamma API 寻找同一价格锚点的 Above/Below 市场。如果没有显示，可能是当前无此类活动市场或已超过结算时间窗口。</p>
                </div>
              ) : (
                rounds.map((r: any) => {
                  const isArb = r.sumYES < (1 - config.profitThreshold);
                  return (
                    <div key={r.id} className={`bg-[#151921] rounded-2xl border p-6 transition-all relative overflow-hidden group ${
                      isArb ? 'border-green-500/50 shadow-2xl shadow-green-500/10 bg-[#1a2521]' : 'border-slate-800 hover:border-slate-700'
                    }`}>
                      <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg border flex items-center justify-center transition-colors ${isArb ? 'bg-green-500/20 border-green-500/30' : 'bg-[#0d1117] border-slate-800'}`}>
                            <i className={`fa-brands ${r.asset === 'BTC' ? 'fa-bitcoin text-orange-500' : (r.asset === 'ETH' ? 'fa-ethereum text-indigo-400' : 'fa-solid fa-s text-green-500')} text-xl`}></i>
                          </div>
                          <div>
                            <h3 className="text-sm font-black text-white group-hover:text-blue-400 transition-colors">{r.symbol}</h3>
                            <span className="text-[10px] text-slate-500 font-bold uppercase">{r.countdown > 0 ? `T-Minus ${Math.floor(r.countdown/3600)}h` : 'Settling'}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-2xl font-black transition-colors ${isArb ? 'text-green-400 animate-pulse' : 'text-slate-500'}`}>
                            {(r.sumYES * 100).toFixed(2)}%
                          </div>
                          <div className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Total Probability</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-[#0d1117] p-3 rounded-xl border border-slate-800/50">
                          <div className="text-[9px] text-slate-500 font-black uppercase mb-1">Leg A (Above)</div>
                          <div className="text-lg font-mono font-bold text-blue-100">${r.askYes.toFixed(3)}</div>
                        </div>
                        <div className="bg-[#0d1117] p-3 rounded-xl border border-slate-800/50">
                          <div className="text-[9px] text-slate-500 font-black uppercase mb-1">Leg B (Below)</div>
                          <div className="text-lg font-mono font-bold text-blue-100">${r.askNo.toFixed(3)}</div>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                         <span className="text-slate-600">Deviation</span>
                         <span className={isArb ? 'text-green-400' : 'text-slate-400'}>
                            {((1 - r.sumYES) * 100).toFixed(2)}%
                         </span>
                      </div>

                      {isArb && (
                        <div className="mt-4 bg-green-500/20 border border-green-500/30 rounded-lg p-2.5 flex items-center justify-center gap-3">
                          <i className="fa-solid fa-fire-flame-curved text-green-400 text-xs animate-bounce"></i>
                          <span className="text-[10px] text-green-400 font-black uppercase tracking-widest">Arbitrage Detected: Profit Potential</span>
                        </div>
                      )}
                    </div>
                  );
                })
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
