
import React from 'react';
import { ArbitrageRound } from '../types';

interface MarketTableProps {
  rounds: ArbitrageRound[];
  sumTarget: number;
}

const MarketTable: React.FC<MarketTableProps> = ({ rounds, sumTarget }) => {
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-[#151921] rounded-2xl border border-slate-800 overflow-hidden shadow-2xl h-full flex flex-col">
      <div className="bg-[#0d1117] px-6 py-4 flex justify-between border-b border-slate-800 shrink-0">
         <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest italic">15M 套利深度监控</h3>
         <span className="text-[10px] text-blue-500 font-bold">对冲目标: &lt; ${sumTarget.toFixed(3)}</span>
      </div>
      <div className="overflow-x-auto flex-grow">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-[#151921] z-10">
            <tr className="bg-[#0d1117]/50 text-[9px] text-slate-500 font-black uppercase tracking-widest border-b border-slate-800/50">
              <th className="px-6 py-4">对冲资产</th>
              <th className="px-6 py-4">UP ASK</th>
              <th className="px-6 py-4">DOWN ASK</th>
              <th className="px-6 py-4">当前对冲总成本</th>
              <th className="px-6 py-4">状态</th>
              <th className="px-6 py-4">倒计时</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/30">
            {rounds.map((r) => {
              let totalCost = r.askUp + r.askDown;
              let isLocked = r.status === 'LOCKED';
              let isHedging = r.status === 'HEDGING';

              if (isHedging && r.leg1Price !== null) {
                const otherPrice = r.leg1Side === 'UP' ? r.askDown : r.askUp;
                totalCost = r.leg1Price + otherPrice;
              }

              const costGap = totalCost - sumTarget;
              
              return (
                <tr key={r.id} className={`hover:bg-blue-500/5 transition-colors ${isHedging ? 'bg-yellow-500/5' : ''} ${isLocked ? 'bg-green-500/5' : ''}`}>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center font-black text-blue-500 text-xs border border-slate-700">
                        {r.symbol.charAt(0)}
                      </div>
                      <span className="text-sm font-black text-slate-200">{r.symbol}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 font-mono text-xs text-slate-400">
                    {isLocked ? <span className="text-slate-700">--</span> : `$${r.askUp.toFixed(3)}`}
                  </td>
                  <td className="px-6 py-5 font-mono text-xs text-slate-400">
                    {isLocked ? <span className="text-slate-700">--</span> : `$${r.askDown.toFixed(3)}`}
                  </td>
                  <td className="px-6 py-5">
                     <div className="flex flex-col gap-1">
                        <span className={`font-mono text-sm font-black ${totalCost <= sumTarget ? 'text-green-400' : 'text-slate-400'}`}>
                           {isLocked ? 'DONE' : `$${totalCost.toFixed(3)}`}
                        </span>
                        {isHedging && (
                           <div className="flex items-center gap-2">
                              <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                                 <div 
                                    className="h-full bg-yellow-500 transition-all duration-500" 
                                    style={{ width: `${Math.max(10, Math.min(100, (sumTarget / totalCost) * 100))}%` }}
                                 ></div>
                              </div>
                              <span className="text-[8px] font-bold text-yellow-600">差额: +${costGap.toFixed(3)}</span>
                           </div>
                        )}
                        {isLocked && (
                           <span className="text-[8px] font-bold text-green-500 uppercase animate-pulse">
                              获利展示中 | {r.resetTimer}s 后自动重启扫描
                           </span>
                        )}
                     </div>
                  </td>
                  <td className="px-6 py-5">
                     <div className="flex items-center gap-2">
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-black border flex items-center gap-1.5 ${
                          r.status === 'LOCKED' ? 'bg-green-500/20 text-green-400 border-green-500/40 shadow-[0_0_15px_rgba(34,197,94,0.1)]' : 
                          r.status === 'HEDGING' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20 shadow-[0_0_10px_rgba(234,179,8,0.1)]' :
                          'bg-blue-500/10 text-blue-500 border-blue-500/20'
                        }`}>
                          {isHedging && <i className="fa-solid fa-spinner animate-spin text-[8px]"></i>}
                          {isLocked ? 'WINNER / RESTARTING' : r.status}
                        </span>
                        {r.status === 'LOCKED' && <i className="fa-solid fa-check-double text-[10px] text-green-500"></i>}
                     </div>
                  </td>
                  <td className="px-6 py-5 font-mono text-sm text-blue-500 font-black">{formatTime(r.countdown)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MarketTable;
