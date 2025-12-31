
import React, { useState, useEffect, useCallback } from 'react';
import { LogEntry, TradeConfig, ArbitrageRound, DashboardStats, Order } from './types';
import StatsHeader from './components/StatsHeader';
import ScannerConfig from './components/ScannerConfig';
import Terminal from './components/Terminal';
import OrderHistory from './components/OrderHistory';

const App: React.FC = () => {
  const [isServerActive, setIsServerActive] = useState(false);
  const [activeTab, setActiveTab] = useState('Settling Soon');
  
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
  const [config, setConfig] = useState<any>({
    engineActive: false, scanIntervalMs: 2000, dropThreshold: 3, sumTarget: 0.985, betAmount: 10, autoBet: true
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
        setConfig(data.config);
        setIsServerActive(true);
      } else { setIsServerActive(false); }
    } catch (e) { setIsServerActive(false); }
  }, []);

  const saveConfig = async () => {
    try {
      await fetch(`${getBackendUrl()}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
    } catch (e) { console.error("Failed to save config", e); }
  };

  const toggleEngine = async () => {
    try {
      await fetch(`${getBackendUrl()}/toggle`, { method: 'POST' });
      await syncWithServer();
    } catch (e) { console.error("Failed to toggle engine", e); }
  };

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
      {count !== undefined && <span className="text-[10px] font-mono opacity-50 bg-slate-800 px-1.5 py-0.5 rounded">{count}</span>}
    </button>
  );

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
             <span className="text-white border-b-2 border-blue-500 pb-4 mt-4 cursor-default">Real-Time Markets</span>
             <span className="hover:text-white cursor-pointer transition-colors">Smart Ape Alpha</span>
             <span className="hover:text-white cursor-pointer transition-colors">Stats</span>
           </div>
        </div>
        <div className="flex items-center gap-4">
           <div className={`flex items-center gap-2 px-3 py-1 rounded-full border transition-all ${isServerActive ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isServerActive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
              <span className={`text-[9px] font-black uppercase ${isServerActive ? 'text-green-400' : 'text-red-400'}`}>
                {isServerActive ? (config.engineActive ? 'Running' : 'Standby') : 'Engine Offline'}
              </span>
           </div>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 border-r border-slate-800 p-4 hidden md:flex flex-col gap-1 bg-[#0d1117]/50">
           <SidebarItem icon="fa-table-cells-large" label="All Assets" count={rounds.length} />
           <SidebarItem icon="fa-clock" label="Settling Soon" count={rounds.filter(r => r.countdown < 7200).length} />
           <SidebarItem icon="fa-coins" label="Crypto Prediction" count={rounds.length} />
           <SidebarItem icon="fa-bolt" label="Arbitrage Ready" count={rounds.filter(r => r.status === 'HEDGING').length} />
           <div className="flex-grow"></div>
           <div className="my-4 border-t border-slate-800 opacity-30"></div>
           <SidebarItem icon="fa-gears" label="Settings" />
        </aside>

        <main className="flex-1 overflow-y-auto p-6 bg-[#0f121a]">
          <StatsHeader stats={stats} />
          
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
            {!config.engineActive ? (
               <div className="col-span-3 h-80 border-2 border-dashed border-slate-800/50 rounded-3xl flex flex-col items-center justify-center text-slate-600 gap-6 bg-[#151921]/20">
                  <div className="text-center">
                    <i className="fa-solid fa-power-off text-5xl mb-4 text-slate-800"></i>
                    <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">引擎当前处于待机状态</p>
                    <button onClick={toggleEngine} className="mt-6 bg-blue-600 text-white text-[10px] px-8 py-3 rounded-xl font-black uppercase tracking-widest shadow-xl shadow-blue-500/10 hover:bg-blue-500 transition-all">立即激活扫描引擎</button>
                  </div>
               </div>
            ) : rounds.length === 0 ? (
               <div className="col-span-3 h-80 border-2 border-dashed border-slate-800/50 rounded-3xl flex flex-col items-center justify-center text-slate-600 gap-6 bg-[#151921]/20">
                  <div className="relative">
                    <i className="fa-solid fa-satellite-dish text-5xl animate-ping opacity-20 absolute"></i>
                    <i className="fa-solid fa-satellite-dish text-5xl relative text-blue-500/40"></i>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">正在搜索目标资产 (BTC, ETH, SOL)...</p>
                    <p className="text-[10px] opacity-60 mt-2 uppercase italic font-mono max-w-xs mx-auto leading-relaxed">
                      请检查 pm2 logs 查看详细抓取进度
                    </p>
                  </div>
               </div>
            ) : (
              rounds.map((r: any) => (
                <div key={r.id} className="bg-[#151921] rounded-2xl border border-slate-800 p-5 shadow-2xl group hover:border-blue-500/30 hover:bg-[#1a202b] transition-all relative overflow-hidden">
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-[#0d1117] rounded-xl border border-slate-800 flex items-center justify-center">
                        {r.asset === 'BTC' && <i className="fa-brands fa-bitcoin text-orange-500 text-2xl"></i>}
                        {r.asset === 'ETH' && <i className="fa-brands fa-ethereum text-indigo-400 text-2xl"></i>}
                        {r.asset === 'SOL' && <i className="fa-solid fa-s text-green-500 text-2xl"></i>}
                        {r.asset === 'CRYPTO' && <i className="fa-solid fa-coins text-yellow-500 text-2xl"></i>}
                      </div>
                      <div>
                        <h3 className="text-[12px] font-black text-white uppercase">{r.symbol}</h3>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`w-2 h-2 rounded-full ${r.countdown < 3600 ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></span>
                          <span className="text-[10px] font-black uppercase text-slate-500">
                             {r.countdown > 3600 ? `${Math.floor(r.countdown/3600)}h ${Math.floor((r.countdown%3600)/60)}m` : `${Math.floor(r.countdown/60)}m ${r.countdown%60}s`}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                       <div className="text-[14px] font-black text-white">{(r.askYes * 100).toFixed(0)}%</div>
                       <div className="text-[8px] font-black text-slate-500 uppercase tracking-tighter">YES ODDS</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <div className={`p-4 rounded-xl border transition-all flex flex-col items-center justify-center gap-1 ${
                       r.leg1Side === 'YES' ? 'bg-green-500/20 border-green-500/50' : 'bg-[#222a35] border-transparent'
                    }`}>
                       <span className="text-[11px] font-black uppercase text-slate-300">Yes</span>
                       <span className="text-[10px] font-mono font-bold opacity-60">${r.askYes.toFixed(3)}</span>
                    </div>
                    <div className={`p-4 rounded-xl border transition-all flex flex-col items-center justify-center gap-1 ${
                       r.leg1Side === 'NO' ? 'bg-red-500/20 border-red-500/50' : 'bg-[#222a35] border-transparent'
                    }`}>
                       <span className="text-[11px] font-black uppercase text-slate-300">No</span>
                       <span className="text-[10px] font-mono font-bold opacity-60">${r.askNo.toFixed(3)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[700px]">
             <div className="lg:col-span-4 h-full">
                <ScannerConfig config={config} setConfig={setConfig} onSave={saveConfig} onToggle={toggleEngine} />
             </div>
             <div className="lg:col-span-8 flex flex-col gap-6 h-full">
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
