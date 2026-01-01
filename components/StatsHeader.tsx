
import React from 'react';
import { DashboardStats } from '../types';

interface StatsHeaderProps {
  stats: DashboardStats;
}

const StatsHeader: React.FC<StatsHeaderProps> = ({ stats }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-[#151921] p-5 rounded-lg border border-slate-800 glow-cyan relative overflow-hidden">
        <div className="flex justify-between items-start mb-2">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">总交易次数</span>
          <div className="bg-[#1d232c] p-2 rounded-md">
            <i className="fa-solid fa-layer-group text-cyan-400"></i>
          </div>
        </div>
        <div className="text-3xl font-bold mb-1">{stats.totalTrades ?? 0}</div>
        <div className="text-[10px] text-cyan-500 font-medium">总胜场: {stats.wonTrades ?? 0}</div>
      </div>

      <div className="bg-[#151921] p-5 rounded-lg border border-slate-800 glow-purple">
        <div className="flex justify-between items-start mb-2">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">预测胜率</span>
          <div className="bg-[#1d232c] p-2 rounded-md">
            <i className="fa-solid fa-bullseye text-purple-400"></i>
          </div>
        </div>
        <div className="text-3xl font-bold mb-1">{(stats.winRate ?? 0).toFixed(1)}%</div>
        <div className="text-[10px] text-purple-500 font-medium uppercase">历史表现</div>
      </div>

      <div className="bg-[#151921] p-5 rounded-lg border border-slate-800 glow-green">
        <div className="flex justify-between items-start mb-2">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">净盈亏 (Net P&L)</span>
          <div className="bg-[#1d232c] p-2 rounded-md">
            <i className="fa-solid fa-money-bill-trend-up text-green-400"></i>
          </div>
        </div>
        <div className={`text-3xl font-bold mb-1 ${(stats.netProfit ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {(stats.netProfit ?? 0) >= 0 ? '+' : ''}${(stats.netProfit ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </div>
        <div className="text-[10px] text-green-500 font-medium">账户余额: ${(stats.balance ?? 0).toLocaleString()}</div>
      </div>

      <div className="bg-[#151921] p-5 rounded-lg border border-slate-800 glow-pink">
        <div className="flex justify-between items-start mb-2">
          <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">总下注量</span>
          <div className="bg-[#1d232c] p-2 rounded-md">
            <i className="fa-solid fa-gauge-high text-pink-400"></i>
          </div>
        </div>
        <div className="text-3xl font-bold mb-1">${(stats.totalVolume ?? 0).toLocaleString()}</div>
        <div className="text-[10px] text-pink-500 font-medium uppercase">流水统计</div>
      </div>
    </div>
  );
};

export default StatsHeader;
