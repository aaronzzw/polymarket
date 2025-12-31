
import React, { useRef, useEffect, useState } from 'react';
import { LogEntry } from '../types';

interface TerminalProps {
  logs: LogEntry[];
}

const Terminal: React.FC<TerminalProps> = ({ logs }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);

  // 核心逻辑：只有当用户没在往上翻时，才自动滚动到底部
  useEffect(() => {
    if (terminalRef.current && !isUserScrolling) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs, isUserScrolling]);

  const handleScroll = () => {
    if (!terminalRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = terminalRef.current;
    // 判断是否距离底部超过 50px
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    
    // 如果用户不在底部，则标记为“正在手动滚动”，停止自动追踪
    setIsUserScrolling(!isAtBottom);
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
          {isUserScrolling && (
             <span className="text-[8px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded animate-pulse">
               自动滚动已暂停 (查看历史中)
             </span>
          )}
        </div>
        <div className="flex gap-4 text-[9px] font-bold text-slate-600">
           <span>LOGS: {logs.length}</span>
           <span className="text-green-600">SYNC_OK</span>
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
         {isUserScrolling && (
            <button 
              onClick={() => setIsUserScrolling(false)}
              className="absolute -top-10 bg-blue-600 hover:bg-blue-500 text-white text-[10px] px-4 py-1.5 rounded-full shadow-lg font-black uppercase tracking-tighter"
            >
              返回底部 <i className="fa-solid fa-arrow-down ml-1"></i>
            </button>
         )}
         <div className="h-1 w-24 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 animate-progress"></div>
         </div>
      </div>
    </div>
  );
};

export default Terminal;
