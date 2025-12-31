
import React, { useRef, useEffect, useState } from 'react';
import { LogEntry } from '../types';

interface TerminalProps {
  logs: LogEntry[];
}

const Terminal: React.FC<TerminalProps> = ({ logs }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const isAutoScrollActive = useRef(true); // 使用 Ref 实时控制，不受 React 状态渲染周期影响
  const [uiLocked, setUiLocked] = useState(false); // 仅用于 UI 状态反馈

  // 核心逻辑：日志更新时，仅在允许时滚动
  useEffect(() => {
    const el = terminalRef.current;
    if (el && isAutoScrollActive.current) {
      // 使用原生 API 瞬间到底，不产生平滑过渡
      el.scrollTop = el.scrollHeight;
    }
  }, [logs]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    // 判定逻辑：离底部的距离大于 60px 就认为是用户想看历史
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    
    // 如果用户滑开了
    if (!isAtBottom && isAutoScrollActive.current) {
      isAutoScrollActive.current = false;
      setUiLocked(true);
    } 
    // 如果用户又滑到底了
    else if (isAtBottom && !isAutoScrollActive.current) {
      isAutoScrollActive.current = true;
      setUiLocked(false);
    }
  };

  const forceReset = () => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
      isAutoScrollActive.current = true;
      setUiLocked(false);
    }
  };

  const getLevelStyle = (level: string) => {
    switch (level) {
      case 'SUCCESS': return 'text-green-400 bg-green-400/10 border-green-500/20';
      case 'WARN': return 'text-yellow-400 bg-yellow-400/10 border-yellow-500/20';
      case 'ERROR': return 'text-red-400 bg-red-400/10 border-red-500/20';
      default: return 'text-blue-400 bg-blue-400/10 border-blue-500/20';
    }
  };

  return (
    <div className="bg-[#151921] rounded-2xl border border-slate-800 h-full flex flex-col font-mono text-[11px] overflow-hidden shadow-2xl relative">
      {/* Header */}
      <div className="px-5 py-3 border-b border-slate-800 flex justify-between items-center bg-[#0d1117] z-20">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Master Strategy Monitor</span>
          {uiLocked && (
             <span className="bg-red-500/20 text-red-400 text-[8px] px-2 py-0.5 rounded-full border border-red-500/20 font-black animate-pulse">
               SCROLL LOCKED: 查看历史中
             </span>
          )}
        </div>
        <div className="flex gap-4 text-[9px] font-bold text-slate-600">
           <span>LOGS: {logs.length}</span>
           <span className={uiLocked ? "text-red-500" : "text-green-600"}>
             {uiLocked ? "MANUAL" : "SYNCING"}
           </span>
        </div>
      </div>
      
      {/* Scrollable Area - Forced scrollBehavior: 'auto' to prevent recoil */}
      <div 
        ref={terminalRef}
        onScroll={handleScroll}
        className="p-4 flex-grow overflow-y-auto space-y-1 relative"
        style={{ scrollBehavior: 'auto' }} 
      >
        {logs.map((log) => (
          <div key={log.id} className="flex gap-3 hover:bg-white/5 p-1 rounded transition-all group">
            <span className="text-slate-600 shrink-0 font-bold w-16">[{log.timestamp}]</span>
            <span className={`px-1.5 rounded text-[8px] font-black border h-fit ${getLevelStyle(log.level)}`}>
              {log.level}
            </span>
            <span className="text-slate-300 break-all group-hover:text-white transition-colors">{log.message}</span>
          </div>
        ))}
        {logs.length === 0 && (
           <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-800">
              <i className="fa-solid fa-spinner animate-spin text-3xl"></i>
              <span className="text-[9px] font-black uppercase tracking-widest">等候策略市场数据流...</span>
           </div>
        )}
      </div>

      {/* Floating Action Bar */}
      {uiLocked && (
        <div className="absolute bottom-16 left-0 right-0 flex justify-center z-30 pointer-events-none">
          <button 
            onClick={forceReset}
            className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] px-8 py-2.5 rounded-full shadow-[0_10px_30px_rgba(37,99,235,0.4)] font-black uppercase tracking-widest border border-blue-400/50 flex items-center gap-3 transition-all active:scale-90 pointer-events-auto"
          >
            <i className="fa-solid fa-arrow-down-long"></i> 恢复实时滚动
          </button>
        </div>
      )}

      {/* Footer Info */}
      <div className="p-3 bg-[#0d1117] border-t border-slate-800 flex justify-between items-center px-6">
          <div className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">
             Alpha Arbitrage v5.5 <span className="mx-2 opacity-30">|</span> 
             {uiLocked ? '自动同步暂停' : '正在监听短期结清市场'}
          </div>
          <div className="flex gap-1">
             <div className={`w-1 h-3 rounded-full ${uiLocked ? 'bg-slate-800' : 'bg-blue-500 animate-bounce'}`} style={{animationDelay: '0s'}}></div>
             <div className={`w-1 h-3 rounded-full ${uiLocked ? 'bg-slate-800' : 'bg-blue-500 animate-bounce'}`} style={{animationDelay: '0.2s'}}></div>
             <div className={`w-1 h-3 rounded-full ${uiLocked ? 'bg-slate-800' : 'bg-blue-500 animate-bounce'}`} style={{animationDelay: '0.4s'}}></div>
          </div>
      </div>
    </div>
  );
};

export default Terminal;
