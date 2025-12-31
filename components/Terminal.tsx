
import React, { useRef, useEffect, useState } from 'react';
import { LogEntry } from '../types';

interface TerminalProps {
  logs: LogEntry[];
}

const Terminal: React.FC<TerminalProps> = ({ logs }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const userIsScrolling = useRef(false);
  const [isLocked, setIsLocked] = useState(false);

  // 核心逻辑：精准控制滚动，不依赖 React 的 state 驱动 scrollTop
  useEffect(() => {
    const el = terminalRef.current;
    if (!el) return;

    // 只有当用户没有滑上去（在底部 50px 范围内）时，才允许自动滚动
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    
    if (isNearBottom && !isLocked) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs, isLocked]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    // 检测是否偏离底部
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    
    // 如果不在底部，标记为“已锁定”，禁止自动回滚
    if (!isAtBottom) {
      if (!isLocked) setIsLocked(true);
    } else {
      if (isLocked) setIsLocked(false);
    }
  };

  const resetScroll = () => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
      setIsLocked(false);
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
      {/* 状态顶栏 */}
      <div className="px-5 py-3 border-b border-slate-800 flex justify-between items-center bg-[#0d1117]">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-terminal text-blue-500 text-xs"></i>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">终端实时监控</span>
          {isLocked && (
             <span className="bg-orange-500/20 text-orange-400 text-[8px] px-2 py-0.5 rounded-full border border-orange-500/20 animate-pulse font-black uppercase">
               滚动已锁定
             </span>
          )}
        </div>
        <div className="flex gap-4 text-[9px] font-bold text-slate-600">
           <span>LOGS: {logs.length}</span>
           <span className={isLocked ? "text-orange-500" : "text-green-600"}>
             {isLocked ? "MANUAL_PAUSE" : "LIVE_STREAM"}
           </span>
        </div>
      </div>
      
      {/* 日志内容容器 - 彻底禁用 scroll-smooth 防止抖动回弹 */}
      <div 
        ref={terminalRef}
        onScroll={handleScroll}
        className="p-4 flex-grow overflow-y-auto space-y-1.5 relative selection:bg-blue-500/40"
        style={{ scrollBehavior: 'auto' }} 
      >
        {logs.map((log) => (
          <div key={log.id} className="flex gap-3 hover:bg-white/5 p-1 rounded transition-all group">
            <span className="text-slate-600 shrink-0 font-bold w-16">[{log.timestamp}]</span>
            <span className={`px-1.5 rounded text-[8px] font-black border h-fit ${getLevelStyle(log.level)}`}>
              {log.level}
            </span>
            <span className="text-slate-300 break-all group-hover:text-white transition-colors leading-relaxed tracking-tight">{log.message}</span>
          </div>
        ))}
        {logs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-700 gap-4 opacity-40">
             <i className="fa-solid fa-satellite animate-pulse text-3xl"></i>
             <span className="italic uppercase text-[9px] tracking-[0.3em] font-black">Syncing Market Stream...</span>
          </div>
        )}
      </div>

      {/* 底部功能条 */}
      <div className="p-3 bg-[#0d1117] border-t border-slate-800 flex justify-center items-center gap-4">
         {isLocked && (
            <button 
              onClick={resetScroll}
              className="absolute -top-14 bg-blue-600 hover:bg-blue-500 text-white text-[10px] px-8 py-2.5 rounded-full shadow-[0_0_25px_rgba(37,99,235,0.4)] font-black uppercase tracking-widest border border-blue-400/50 flex items-center gap-3 transition-all active:scale-90 z-20"
            >
              <i className="fa-solid fa-arrow-down-long animate-bounce"></i> 恢复实时追踪
            </button>
         )}
         <div className="flex items-center gap-4 w-full justify-between px-4">
            <div className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">
               PolyEdge V5.2 <span className="mx-2">|</span> 策略状态: {isLocked ? '锁定' : '活跃'}
            </div>
            <div className="h-1.5 w-32 bg-slate-800 rounded-full overflow-hidden">
               <div className={`h-full bg-blue-500 ${!isLocked ? 'animate-progress' : 'opacity-20 transition-opacity duration-500'}`}></div>
            </div>
         </div>
      </div>
    </div>
  );
};

export default Terminal;
