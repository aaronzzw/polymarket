
import React, { useState, useEffect, useCallback } from 'react';
import { LogEntry, TradeConfig, ArbitrageRound, DashboardStats, Order } from './types';
import StatsHeader from './components/StatsHeader';
import ScannerConfig from './components/ScannerConfig';
import Terminal from './components/Terminal';
import OrderHistory from './components/OrderHistory';

const App: React.FC = () => {
  const [isServerActive, setIsServerActive] = useState(false);
  const [activeTab, setActiveTab] = useState('15 Min');
  
  const getBackendUrl = () => {
    const hostname = window.location.hostname || 'localhost';
    return `http://${hostname}:3001`;
  };

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalTrades: 0, wonTrades: 0, totalVolume: 0, netProfit: 0, balance: 5000, winRate: 0
  });
  const [rounds, setRounds] = useState<any[]>([]);
  const [config, setConfig] = useState<TradeConfig>({
    scanIntervalMs: 2000, dropThreshold: 3, sumTarget: 0.985, betAmount: 10, autoBet: true
  });

  const syncWithServer = useCallback(async () => {
    try {
      const res = await fetch(`${getBackendUrl()}/sync`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setOrders(data.orders);
        setStats(data.stats);
        setRounds(data.rounds);
        if (!isServerActive) {
          setConfig(data.config);
          setIsServerActive(true);
        }
      } else { setIsServerActive(false); }
    } catch (e) { setIsServerActive(false); }
  }, [isServerActive]);

  useEffect(() => {
    const interval = setInterval(syncWithServer, 1000);
    return () => clearInterval(interval);
  }, [syncWithServer]);

  const SidebarItem = ({ icon, label, count }: any) => (
    <button 
      onClick={() => setActiveTab(label)}
      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${
        activeTab === label ? 'bg-[#1e293b] text-white shadow-inner' : 'text-slate-500 hover:bg-white/5'
      }`}
    >
      <div className="flex items-center gap-3">
        <i className={`fa-solid ${icon} text-sm ${activeTab === label ? 'text-blue-500' : ''}`}></i>
        <span className="text-xs font-bold tracking-tight">{label}</span>
      </div>
      {count && <span className="text-[10px] font-mono opacity-50 bg-slate-800 px-1.5 py-0.5 rounded">{count}</span>}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-200 flex flex-col font-sans selection:bg-blue-500/30">
      {/* Top Navbar */}
      <nav className="h-14 border-b border-slate-800 flex items-center px-6 justify-between bg-[#0b0e14]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-8">
           <div className="flex items-center gap-2">
             <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center rotate-3 shadow-lg shadow-blue-500/20">
                <i className="fa-solid fa-bolt text-white text-sm"></i>
             </div>
             <h1 className="text-xl font-black italic tracking-tighter uppercase text-white">Poly<span className="text-blue-500">Edge</span></h1>
           </div>
           <div className="hidden lg:flex gap-6 text-[10px] font-black uppercase tracking-widest text-slate-500">
             <span className="hover:text-white cursor-pointer transition-colors">Trending</span>
             <span className="text-white border-b-2 border-blue-500 pb-4 mt-4 cursor-default">Crypto</span>
             <span className="hover:text-white cursor-pointer transition-colors">Finance</span>
             <span className="hover:text-white cursor-pointer transition-colors">Politics</span>
           </div>
        </div>
        <div className="flex items-center gap-4">
           <div className={`flex items-center gap-2 px-3 py-1 rounded-full border transition-all ${isServerActive ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isServerActive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
              <span className={`text-[9px] font-black uppercase ${isServerActive ? 'text-green-400' : 'text-red-400'}`}>
                {isServerActive ? 'Market Stream Live' : 'Engine Disconnected'}
              </span>
           </div>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r border-slate-800 p-4 hidden md:flex flex-col gap-1 bg-[#0d1117]/50">
           <SidebarItem icon="fa-table-cells-large" label="All" count="211" />
           <SidebarItem icon="fa-clock" label="15 Min" count={rounds.length} />
           <SidebarItem icon="fa-rotate" label="Hourly" count="4" />
           <SidebarItem icon="fa-hourglass-half" label="4 Hour" count="4" />
           <SidebarItem icon="fa-calendar" label="Daily" count="4" />
           <SidebarItem icon="fa-calendar-week" label="Weekly" count="20" />
           <SidebarItem icon="fa-chart-line" label="Monthly" count="20" />
           <SidebarItem icon="fa-rocket" label="Pre-Market" count="94" />
           <SidebarItem icon="fa-coins" label="ETF" count="3" />
           <div className="flex-grow"></div>
           <div className="my-4 border-t border-slate-800 opacity-30"></div>
           <SidebarItem icon="fa-gears" label="Settings" />
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6 bg-[#0f121a]">
          <StatsHeader stats={stats} />
          
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
            {rounds.length === 0 ? (
               <div className="col-span-3 h-80 border-2 border-dashed border-slate-800/50 rounded-3xl flex flex-col items-center justify-center text-slate-600 gap-6 bg-[#151921]/20">
                  <div className="relative">
                    <i className="fa-solid fa-satellite-dish text-5xl animate-ping opacity-20 absolute"></i>
                    <i className="fa-solid fa-satellite-dish text-5xl relative"></i>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">正在匹配 Polymarket 15M 高频盘口...</p>
                    <p className="text-[10px] opacity-60 mt-2 uppercase italic font-mono max-w-xs mx-auto leading-relaxed">
                      扫描范围: BTC, ETH, SOL, XRP<br/>
                      模式: Price Prediction (15 Minute Intervals)
                    </p>
                  </div>
               </div>
            ) : (
              rounds.map((r: any) => (
                <div key={r.id} className="bg-[#151921] rounded-2xl border border-slate-800 p-5 shadow-2xl group hover:border-blue-500/30 hover:bg-[#1a202b] transition-all relative overflow-hidden">
                  {r.status === 'LOCKED' && (
                    <div className="absolute inset-0 bg-green-500/10 backdrop-blur-[2px] z-10 flex items-center justify-center border-2 border-green-500/30">
                      <div className="bg-green-600 text-white font-black text-[10px] px-6 py-2 rounded-full shadow-lg uppercase tracking-widest transform -rotate-2">
                        Arbitrage Completed
                      </div>
                    </div>
                  )}
                  
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-[#0d1117] rounded-xl border border-slate-800 flex items-center justify-center shadow-inner">
                        {r.asset === 'BTC' && <i className="fa-brands fa-bitcoin text-orange-500 text-2xl"></i>}
                        {r.asset === 'ETH' && <i className="fa-brands fa-ethereum text-indigo-400 text-2xl"></i>}
                        {r.asset === 'SOL' && <img src="https://cryptologos.cc/logos/solana-sol-logo.png" className="w-6 h-6 grayscale brightness-200" />}
                        {r.asset === 'XRP' && <img src="https://cryptologos.cc/logos/xrp-xrp-logo.png" className="w-7 h-7" />}
                      </div>
                      <div>
                        <h3 className="text-[13px] font-black text-white tracking-tight">{r.asset} Up or Down - 15 minute</h3>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse"></span>
                          <span className="text-[10px] font-black uppercase text-slate-500 tracking-tighter">Live • {Math.floor(r.countdown / 60)}m {r.countdown % 60}s Remaining</span>
                        </div>
                      </div>
                    </div>
                    <div className="relative w-14 h-14">
                       <svg className="w-full h-full transform -rotate-90">
                          <circle cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="3" fill="transparent" className="text-slate-800" />
                          <circle cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="3" fill="transparent" strokeDasharray={150.8} strokeDashoffset={150.8 * (1 - r.askYes)} className="text-green-500 transition-all duration-700 ease-out" strokeLinecap="round" />
                       </svg>
                       <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-[11px] font-black text-white">{(r.askYes * 100).toFixed(0)}%</span>
                          <span className="text-[7px] font-bold text-slate-500 uppercase">Up</span>
                       </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <div className={`p-4 rounded-xl border transition-all flex flex-col items-center justify-center gap-1 cursor-default ${
                       r.leg1Side === 'YES' ? 'bg-green-500/20 border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.1)]' : 'bg-[#222a35] border-transparent hover:border-slate-600'
                    }`}>
                       <span className={`text-[11px] font-black uppercase ${r.leg1Side === 'YES' ? 'text-green-400' : 'text-slate-300'}`}>Up</span>
                       <span className="text-[10px] font-mono font-bold opacity-60">${r.askYes.toFixed(3)}</span>
                    </div>
                    <div className={`p-4 rounded-xl border transition-all flex flex-col items-center justify-center gap-1 cursor-default ${
                       r.leg1Side === 'NO' ? 'bg-red-500/20 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 'bg-[#222a35] border-transparent hover:border-slate-600'
                    }`}>
                       <span className={`text-[11px] font-black uppercase ${r.leg1Side === 'NO' ? 'text-red-400' : 'text-slate-300'}`}>Down</span>
                       <span className="text-[10px] font-mono font-bold opacity-60">${r.askNo.toFixed(3)}</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-800/50 flex justify-between items-center group/card-footer">
                    <div className="flex items-center gap-2">
                       <div className="w-5 h-5 bg-blue-500/10 rounded flex items-center justify-center">
                          <i className="fa-solid fa-microchip text-[9px] text-blue-500"></i>
                       </div>
                       <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest group-hover/card-footer:text-blue-500/70 transition-colors">Edge Ratio: {(r.askYes + r.askNo).toFixed(3)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                       <i className="fa-regular fa-bookmark text-slate-600 cursor-pointer hover:text-white transition-colors"></i>
                       <i className="fa-solid fa-share-nodes text-slate-600 cursor-pointer hover:text-blue-400 text-[10px] transition-colors"></i>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
             <div className="lg:col-span-4">
                <ScannerConfig config={config} setConfig={setConfig as any} isScanning={isServerActive} onToggleScan={() => {}} />
             </div>
             <div className="lg:col-span-8 flex flex-col gap-6 h-[600px]">
                <Terminal logs={logs} />
                <OrderHistory orders={orders} />
             </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
