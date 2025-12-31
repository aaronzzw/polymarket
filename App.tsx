
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
    engineActive: false, scanIntervalMs: 2000, profitThreshold: 0.005, betAmount: 10, autoBet: true, maxSettleMinutes: 120
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
      alert("无法切换引擎状态。");
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
             <span className="text-white border-b-2 border-blue-500 pb-4 mt-4">15M High-Frequency Terminal</span>
             <span className="hover:text-white cursor-pointer transition-colors opacity-50">v5.5.0-ALPHA</span>
           </div>
        </div>
        <div className="flex items-center gap-6">
           <div className="flex items-center gap-2">
              <span className="text-[9px] font-black text-slate-600 uppercase">Live Index:</span>
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
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center animate-pulse">
                 <i className="fa-solid fa-server text-red-500 text-3xl mb-3"></i>
                 <h2 className="text-red-500 font-black uppercase tracking-widest italic">Waiting for Backend Engine (3001)</h2>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rounds.length === 0 && isServerActive ? (
                <div className="col-span-2 h-64 border-2 border-dashed border-slate-800 rounded-3xl flex flex-col items-center justify-center bg-[#151921]/30 p-12 text-center">
                  <i className="fa-solid fa-radar text-4xl mb-4 text-blue-500/30 animate-spin-slow"></i>
                  <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-500 mb-2 italic underline decoration-blue-500/50 underline-offset-8">Synchronizing Bitcoin 15-Minute Markets...</p>
                  <p className="text-[10px] text-slate-600 max-w-sm leading-relaxed font-bold uppercase tracking-tighter mt-4">Engine is prioritizing 15M "Up or Down" binary options. Please ensure "Engine Active" is toggled on.</p>
                </div>
              ) : (
                rounds.map((r: any) => {
                  const isArb = !r.isInternal && r.sumYES < (1 - config.profitThreshold);
                  const is15M = r.is15M;
                  return (
                    <div key={r.id} className={`bg-[#151921] rounded-2xl border p-6 transition-all relative overflow-hidden group ${
                      isArb ? 'border-blue-500 bg-[#0e1624] shadow-2xl shadow-blue-500/10' : 'border-slate-800 hover:border-slate-700'
                    }`}>
                      {is15M && (
                        <div className="absolute top-0 right-0">
                           <div className="bg-blue-600 text-[8px] font-black text-white px-3 py-1 uppercase tracking-widest rounded-bl-lg italic shadow-lg">15M High Frequency</div>
                        </div>
                      )}
                      
                      <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 rounded-xl border flex items-center justify-center transition-all ${isArb ? 'bg-blue-500 border-blue-400 rotate-6 scale-110 shadow-lg shadow-blue-500/20' : 'bg-[#0d1117] border-slate-800'}`}>
                            <i className={`fa-brands ${r.asset === 'BTC' ? 'fa-bitcoin text-orange-500' : (r.asset === 'ETH' ? 'fa-ethereum text-indigo-400' : 'fa-solid fa-s text-green-500')} text-2xl ${isArb ? 'text-white' : ''}`}></i>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                                <h3 className="text-base font-black text-white group-hover:text-blue-400 transition-colors uppercase italic">{r.symbol}</h3>
                            </div>
                            <div className="flex items-center gap-2">
                               <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-black uppercase border border-slate-700">{r.isInternal ? 'Direct Market' : 'Cross Arbitrage'}</span>
                               <span className={`text-[10px] font-black uppercase ${r.countdown < 300 ? 'text-red-500 animate-pulse' : 'text-slate-500'}`}>
                                 {r.countdown > 0 ? `${Math.floor(r.countdown/60)}m ${r.countdown%60}s` : 'Settled'}
                               </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-2xl font-black transition-colors ${isArb ? 'text-blue-400' : 'text-slate-500'}`}>
                            {(r.sumYES * 100).toFixed(2)}%
                          </div>
                          <div className="text-[8px] font-black text-slate-600 uppercase tracking-widest italic">Probability Sum</div>
                        </div>
                      </div>

                      <div className="mb-4">
                         <p className="text-[10px] font-bold text-slate-400 bg-[#0d1117] p-2 rounded-lg border border-slate-800/50 uppercase tracking-tighter">
                            <i className="fa-solid fa-location-dot text-blue-500 mr-2"></i>
                            {r.question}
                         </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-[#0d1117] p-4 rounded-xl border border-slate-800/50 group-hover:border-blue-500/30 transition-all">
                          <div className="text-[9px] text-slate-500 font-black uppercase mb-1 flex justify-between">
                             <span>Above YES</span>
                             <i className="fa-solid fa-arrow-trend-up text-green-500/50"></i>
                          </div>
                          <div className="text-xl font-mono font-bold text-white tracking-tighter">${r.askYes.toFixed(3)}</div>
                        </div>
                        <div className="bg-[#0d1117] p-4 rounded-xl border border-slate-800/50 group-hover:border-blue-500/30 transition-all">
                          <div className="text-[9px] text-slate-500 font-black uppercase mb-1 flex justify-between">
                             <span>{r.isInternal ? 'Above NO' : 'Below YES'}</span>
                             <i className="fa-solid fa-arrow-trend-down text-red-500/50"></i>
                          </div>
                          <div className="text-xl font-mono font-bold text-white tracking-tighter">${r.askNo.toFixed(3)}</div>
                        </div>
                      </div>

                      {isArb && (
                        <div className="mt-4 bg-blue-500/20 border border-blue-500/30 rounded-lg p-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                             <div className="w-2 h-2 bg-blue-400 rounded-full animate-ping"></div>
                             <span className="text-[10px] text-blue-400 font-black uppercase tracking-widest italic">Opportunity Found</span>
                          </div>
                          <span className="text-xs font-black text-blue-300">+{((1-r.sumYES)*100).toFixed(2)}%</span>
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
