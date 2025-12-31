
import React, { useRef, useEffect, useState } from 'react';
import { LogEntry } from '../types';

interface TerminalProps {
  logs: LogEntry[];
}

const Terminal: React.FC<TerminalProps> = ({ logs }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const isAutoScrollEnabled = useRef(true); 
  const prevLogsLength = useRef(0);
  const [isLocked, setIsLocked] = useState(false);

  // 物理驱动：只有日志变多且未锁定，才执行滚动
  useEffect(() => {
    const el = terminalRef.current;
    if (!el) return;

    if (logs.length > prevLogsLength.current) {
      if (isAutoScrollEnabled.current) {
        el.scrollTop = el.scrollHeight;
      }
      prevLogsLength.current = logs.length;
    }
  }, [logs]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    // 精确判定：距离底部 30px 内视为“在底部”
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    
    // 如果不在底部，立刻切断 Ref，并更新 UI 提示
    if (!isAtBottom) {
      isAutoScrollEnabled.current = false;
      setIsLocked(true);
    } else {
      isAutoScrollActive();
    }
  };

  const isAutoScrollActive = () => {
    isAutoScrollEnabled.current = true;
    setIsLocked(false);
  };

  const forceUnlock = () => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
      isAutoScrollActive();
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
      <div className="px-5 py-3 border-b border-slate-800 flex justify-between items-center bg-[#0d1117] z-20">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-terminal text-blue-500"></i>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alpha Stream Terminal</span>
          {isLocked && (
             <span className="bg-orange-500/20 text-orange-400 text-[8px] px-2 py-0.5 rounded-full border border-orange-500/20 font-black animate-pulse">
               SCROLL LOCKED
             </span>
          )}
        </div>
        <div className="flex gap-4 text-[9px] font-bold text-slate-600 uppercase">
           <span>{isLocked ? "Manual Mode" : "Auto Syncing"}</span>
        </div>
      </div>
      
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
           <div className="flex flex-col items-center justify-center h-full opacity-30 gap-4">
              <i className="fa-solid fa-compass animate-spin text-3xl"></i>
              <span className="text-[9px] font-black uppercase tracking-[0.4em]">Awaiting Data Flow...</span>
           </div>
        )}
      </div>

      {isLocked && (
        <div className="absolute bottom-16 left-0 right-0 flex justify-center z-30 pointer-events-none">
          <button 
            onClick={forceUnlock}
            className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] px-8 py-2.5 rounded-full shadow-[0_10px_30px_rgba(37,99,235,0.4)] font-black uppercase tracking-widest border border-blue-400/50 flex items-center gap-3 transition-all active:scale-90 pointer-events-auto"
          >
            <i className="fa-solid fa-chevron-down"></i> 恢复实时追踪
          </button>
        </div>
      )}

      <div className="p-3 bg-[#0d1117] border-t border-slate-800 flex justify-between items-center px-6">
          <div className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">
             PolyEdge Engine <span className="mx-2 opacity-20">|</span> 
             {isLocked ? '历史查看模式' : '实时监听中'}
          </div>
          <div className="flex gap-1.5 h-3 items-end">
             <div className="w-1 bg-blue-500 rounded-full animate-pulse h-full" style={{animationDelay: '0s'}}></div>
             <div className="w-1 bg-blue-500 rounded-full animate-pulse h-[60%]" style={{animationDelay: '0.2s'}}></div>
             <div className="w-1 bg-blue-500 rounded-full animate-pulse h-[80%]" style={{animationDelay: '0.4s'}}></div>
          </div>
      </div>
    </div>
  );
};

export default Terminal;
