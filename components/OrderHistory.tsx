
import React from 'react';
import { Order } from '../types';

interface OrderHistoryProps {
  orders: Order[];
}

const OrderHistory: React.FC<OrderHistoryProps> = ({ orders }) => {
  return (
    <div className="bg-[#151921] rounded-2xl border border-slate-800 mt-6 overflow-hidden shadow-2xl flex flex-col max-h-[400px]">
      <div className="bg-[#0d1117] px-6 py-4 flex justify-between border-b border-slate-800">
         <div className="flex items-center gap-3">
            <i className="fa-solid fa-list-check text-blue-500"></i>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">执行流水账 (模拟/实盘)</h3>
         </div>
         <span className="text-[9px] text-slate-600 font-bold italic">显示最近 50 笔交易记录</span>
      </div>
      <div className="overflow-y-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-[#0d1117] z-10">
            <tr className="text-[9px] text-slate-500 font-black uppercase tracking-widest border-b border-slate-800/50">
              <th className="px-6 py-3">时间</th>
              <th className="px-6 py-3">资产</th>
              <th className="px-6 py-3">方向/阶段</th>
              <th className="px-6 py-3">成交价格</th>
              <th className="px-6 py-3">数量</th>
              <th className="px-6 py-3">交易哈希</th>
              <th className="px-6 py-3">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/30">
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-slate-800/20 transition-colors text-[11px]">
                <td className="px-6 py-3 font-mono text-slate-500">{o.timestamp}</td>
                <td className="px-6 py-3 font-black text-slate-300">{o.symbol}</td>
                <td className="px-6 py-3">
                   <div className="flex gap-2 items-center">
                      {/* Fix: Use 'YES' instead of 'UP' to match type definition */}
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${o.side === 'YES' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                        {o.side}
                      </span>
                      <span className="text-slate-600 font-bold">LEG {o.leg}</span>
                   </div>
                </td>
                <td className="px-6 py-3 font-mono text-blue-400 font-bold">${o.price.toFixed(3)}</td>
                <td className="px-6 py-3 text-slate-400">{o.amount} 股</td>
                <td className="px-6 py-3 font-mono text-slate-600 truncate max-w-[120px]">{o.txHash}</td>
                <td className="px-6 py-3">
                   <span className="flex items-center gap-1.5 text-green-500 font-black italic">
                      <i className="fa-solid fa-circle-check text-[9px]"></i> {o.status}
                   </span>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-slate-600 font-bold italic uppercase text-xs tracking-widest">
                  等待策略触发下单信号...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default OrderHistory;
