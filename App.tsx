
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LogEntry, TradeConfig, Order } from './types';
import StatsHeader from './components/StatsHeader';
import ScannerConfig from './components/ScannerConfig';
import Terminal from './components/Terminal';
import OrderHistory from './components/OrderHistory';

const App: React.FC = () => {
  const [isServerActive, setIsServerActive] = useState(false);
  const syncTimer = useRef<number | null>(null);
  
  const getBackendUrl = useCallback(() => {
    return `http://${window.location.hostname || 'localhost'}:3001`;
  }, []);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<any>({ 
    totalTrades: 0, wonTrades: 0, totalVolume: 0, netProfit: 0, balance: 5000, winRate: 0 
  });
  const [rounds, setRounds] = useState<any[]>([]);
  const [config, setConfig] = useState<any>({
    engineActive: false, scanIntervalMs: 1, windowMin: 2, movePct: 0.15, sumTarget: 0.95, betAmount: 20, autoBet: true, engineLanguage: 'Rust'
  });

  const syncWithServer = useCallback(async () => {
    try {
      const res = await fetch(`${getBackendUrl()}/sync`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setOrders(data.orders || []);
        setStats(data.stats);
        setRounds(data.rounds || []);
        setConfig(data.config);
        setIsServerActive(true);
      } else { setIsServerActive(false); }
    } catch (e) { setIsServerActive(false); }
  }, [getBackendUrl]);

  useEffect(() => {
    syncTimer.current = window.setInterval(syncWithServer, 800);
    return () => { if (syncTimer.current) clearInterval(syncTimer.current); };
  }, [syncWithServer]);

  return (
    <div className="min-h-screen bg-[#050608] text-slate-300 flex flex-col font-mono selection:bg-red-500/30">
      {/* 顶部导航 - Rust 风格 */}
      <nav className="h-14 border-b border-red-500/10 flex items-center px-6 justify-between bg-[#0a0c10] sticky top-0 z-50">
        <div className="flex items-center gap-6">
           <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-red-600 rounded flex items-center justify-center shadow-xl shadow-red-900/40 border border-red-400/30">
                <i className="fa-solid fa-microchip text-white text-sm"></i>
             </div>
             <div>
                <h1 className="text-xs font-black tracking-[0.2em] uppercase text-white leading-none">PolyEdge <span className="text-red-500 underline underline-offset-4 decoration-2">v7.0</span></h1>
                <div className="text-[7px] text-red-500 font-black mt-1 uppercase tracking-tighter">High Performance Rust Engine</div>
             </div>
           </div>
           <div className="h-6 w-[1px] bg-white/5"></div>
           <div className="flex gap-6 text-[9px] font-black uppercase tracking-[0.15em]">
             <div className="flex items-center gap-2">
                <span className="text-slate-600">Scan Frequency:</span>
                <span className="text-green-500">1ms (Real-time)</span>
             </div>
             <div className="flex items-center gap-2">
                <span className="text-slate-600">Safety:</span>
                <span className="text-blue-500">FOK Protocol Enforced</span>
             </div>
           </div>
        </div>
        <div className="flex items-center gap-4">
           <div className="flex flex-col items-end">
              <div className="flex items-center gap-2">
                 <div className={`w-2 h-2 rounded-full ${isServerActive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                 <span className="text-[9px] font-black uppercase text-white">System Heartbeat</span>
              </div>
              <div className="text-[8px] text-slate-600 font-bold uppercase mt-1">
                 Latency: <span className="text-green-500">&lt;1ms</span>
              </div>
           </div>
        </div>
      </nav>

      <div className="flex-1 p-6 space-y-6 max-w-[1800px] mx-auto w-full">
        <StatsHeader stats={stats} />
        
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          <div className="xl:col-span-1">
             <ScannerConfig config={config} setConfig={setConfig} onSave={() => {}} onToggle={async () => fetch(`${getBackendUrl()}/toggle`, {method:'POST'})} />
          </div>

          <div className="xl:col-span-3 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {rounds.map((r: any) => {
                const isSnipeWindow = r.isEligible;
                const dropLevel = (r.volatility3s * 100);
                return (
                  <div key={r.id} className={`bg-[#0d1117] border-2 rounded-xl p-5 transition-all relative overflow-hidden group ${
                    r.status === 'HEDGING' ? 'border-blue-500 shadow-2xl shadow-blue-500/10' : 'border-white/5 hover:border-red-500/20'
                  }`}>
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded bg-[#161b22] border-2 flex items-center justify-center transition-all ${dropLevel > 5 ? 'border-red-500 scale-110 shadow-lg shadow-red-500/20' : 'border-white/5'}`}>
                           <i className={`fa-brands ${r.asset === 'BTC' ? 'fa-bitcoin text-orange-500' : 'fa-ethereum text-blue-400'} text-2xl`}></i>
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-white uppercase tracking-wider">{r.asset} <span className="text-red-500 italic">High-Freq</span></h3>
                          <div className="flex gap-2 mt-1">
                             <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${isSnipeWindow ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-500'}`}>
                               {isSnipeWindow ? 'SNIPER: ARMED' : 'SNIPER: STANDBY'}
                             </span>
                             <span className="text-[8px] font-black text-slate-600 uppercase border border-white/10 px-1 rounded flex items-center">
                               {r.status}
                             </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-2xl font-black italic ${dropLevel > 10 ? 'text-red-500' : 'text-slate-400'}`}>
                          {dropLevel.toFixed(2)}%
                        </div>
                        <div className="text-[8px] font-black text-slate-600 uppercase">3S Delta (Buffered)</div>
                      </div>
                    </div>

                    {/* 下单腿监控 */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                       <div className={`p-4 rounded border-2 transition-all ${r.leg1Price ? 'bg-green-500/10 border-green-500/50' : 'bg-black/40 border-white/5'}`}>
                          <div className="text-[8px] font-black uppercase mb-1 flex justify-between">
                            <span>Leg 1: Sniper</span>
                            {r.leg1Price && <i className="fa-solid fa-check-circle text-green-500"></i>}
                          </div>
                          <div className={`text-lg font-black ${r.leg1Price ? 'text-white' : 'text-slate-700'}`}>
                            {r.leg1Price ? `$${r.leg1Price.toFixed(4)}` : 'WAITING...'}
                          </div>
                       </div>
                       <div className={`p-4 rounded border-2 transition-all ${r.status === 'HEDGING' ? 'bg-blue-500/10 border-blue-500/50 animate-pulse' : 'bg-black/40 border-white/5'}`}>
                          <div className="text-[8px] font-black uppercase mb-1 flex justify-between">
                            <span>Leg 2: Hedge</span>
                            {r.status === 'HEDGING' && <i className="fa-solid fa-sync fa-spin text-blue-400"></i>}
                          </div>
                          <div className={`text-lg font-black ${r.status === 'HEDGING' ? 'text-white' : 'text-slate-700'}`}>
                            {r.status === 'HEDGING' ? 'SEEKING...' : 'LOCKED'}
                          </div>
                       </div>
                    </div>

                    {/* 实时波动光带 */}
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden flex">
                       <div className="bg-red-500 transition-all duration-300 shadow-[0_0_10px_#ef4444]" style={{ width: `${Math.min(dropLevel * 5, 100)}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[450px]">
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
