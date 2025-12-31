
import React, { useRef, useEffect, useState } from 'react';
import { LogEntry } from '../types';

interface TerminalProps {
  logs: LogEntry[];
}

const Terminal: React.FC<TerminalProps> = ({ logs }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const lastLogsLength = useRef(0);

  // 核心逻辑：监听日志变化
  useEffect(() => {
    if (!terminalRef.current) return;

    // 如果日志增加了，且用户处于自动滚动模式，强制滚到底部
    if (logs.length !== lastLogsLength.current) {
      if (shouldAutoScroll) {
        terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
      }
      lastLogsLength.current = logs.length;
    }
  }, [logs, shouldAutoScroll]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 15;
    
    // 如果用户滑到了最底部，重新激活自动滚动
    if (isAtBottom) {
      if (!shouldAutoScroll) setShouldAutoScroll(true);
    } else {
      // 只要离开底部，立刻锁定，不再回弹
      if (shouldAutoScroll) setShouldAutoScroll(false);
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
    <div className="bg-[#151921] rounded-2xl border border-slate-800 h-full flex flex-col font-mono text-[11px] overflow-hidden shadow-xl">
      <div className="px-5 py-3 border-b border-slate-800 flex justify-between items-center bg-[#0d1117]">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-terminal text-blue-500"></i>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">引擎监控终端</span>
          {!shouldAutoScroll && (
             <span className="text-[8px] bg-yellow-500/20 text-yellow-500 border border-yellow-500/20 px-2 py-0.5 rounded animate-pulse">
               历史查看模式 (自动滚动已锁定)
             </span>
          )}
        </div>
        <div className="flex gap-4 text-[9px] font-bold text-slate-600">
           <span>LOGS: {logs.length}</span>
           <span className={shouldAutoScroll ? "text-green-600" : "text-yellow-600"}>
             {shouldAutoScroll ? "LIVE_TRACKING" : "PAUSED"}
           </span>
        </div>
      </div>
      
      <div 
        ref={terminalRef}
        onScroll={handleScroll}
        className="p-4 flex-grow overflow-y-auto space-y-1.5 scroll-smooth relative"
      >
        {logs.map((log) => (
          <div key={log.id} className="flex gap-3 hover:bg-white/5 p-1 rounded transition-all group">
            <span className="text-slate-600 shrink-0 font-bold">[{log.timestamp}]</span>
            <span className={`px-1.5 rounded text-[8px] font-black border self-start ${getLevelStyle(log.level)}`}>
              {log.level}
            </span>
            <span className="text-slate-300 break-all group-hover:text-white transition-colors">{log.message}</span>
          </div>
        ))}
        {logs.length === 0 && <div className="text-slate-700 italic px-2">等待数据流同步...</div>}
      </div>

      <div className="p-2 bg-[#0d1117] border-t border-slate-800 flex justify-center relative">
         {!shouldAutoScroll && (
            <button 
              onClick={() => {
                if (terminalRef.current) {
                  terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
                  setShouldAutoScroll(true);
                }
              }}
              className="absolute -top-12 bg-blue-600 hover:bg-blue-500 text-white text-[10px] px-6 py-2 rounded-full shadow-2xl font-black uppercase tracking-widest border border-blue-400/50 flex items-center gap-2"
            >
              <i className="fa-solid fa-arrow-down"></i> 恢复实时追踪
            </button>
         )}
         <div className="h-1 w-24 bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full bg-blue-500 ${shouldAutoScroll ? 'animate-progress' : ''}`}></div>
         </div>
      </div>
    </div>
  );
};

export default Terminal;
