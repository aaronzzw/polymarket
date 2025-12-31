
import React, { useRef, useEffect, useState } from 'react';
import { LogEntry } from '../types';

interface TerminalProps {
  logs: LogEntry[];
}

const Terminal: React.FC<TerminalProps> = ({ logs }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [isLocked, setIsLocked] = useState(false);
  const internalLogCount = useRef(logs.length);

  // 核心逻辑：严防死守，绝对不跳。
  useEffect(() => {
    const el = terminalRef.current;
    if (!el) return;

    // 只有当日志真的变多了，且没被锁定，才执行滚动
    if (logs.length > internalLogCount.current) {
      if (!isLocked) {
        // 瞬间执行，不使用平滑滚动，防止浏览器重绘产生的误差
        el.scrollTop = el.scrollHeight;
      }
      internalLogCount.current = logs.length;
    }
  }, [logs, isLocked]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    // 判定：离底部距离超过 10 像素就视为用户正在看历史
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < 10;
    
    if (!atBottom && !isLocked) {
      setIsLocked(true);
    } else if (atBottom && isLocked) {
      setIsLocked(false);
    }
  };

  const forceUnlock = () => {
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
      <div className="px-5 py-3 border-b border-slate-800 flex justify-between items-center bg-[#0d1117] z-30">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${isLocked ? 'bg-orange-500' : 'bg-green-500 animate-pulse'}`}></div>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alpha Monitor</span>
          {isLocked && (
            <span className="text-[8px] bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded border border-orange-500/30 font-black animate-pulse">
              滚动已锁定
            </span>
          )}
        </div>
        <div className="text-[9px] font-bold text-slate-600 uppercase">
          {isLocked ? "Manual View" : "Syncing"}
        </div>
      </div>
      
      <div 
        ref={terminalRef}
        onScroll={handleScroll}
        className="p-4 flex-grow overflow-y-auto space-y-1 relative selection:bg-blue-500/30"
        style={{ scrollBehavior: 'auto' }} 
      >
        {logs.map((log) => (
          <div key={log.id} className="flex gap-3 hover:bg-white/5 p-1 rounded transition-all group">
            <span className="text-slate-600 shrink-0 font-bold w-16">[{log.timestamp}]</span>
            <span className={`px-1.5 rounded text-[8px] font-black border h-fit ${getLevelStyle(log.level)}`}>
              {log.level}
            </span>
            <span className="text-slate-300 break-all group-hover:text-white transition-colors tracking-tight">{log.message}</span>
          </div>
        ))}
      </div>

      {isLocked && (
        <div className="absolute bottom-16 left-0 right-0 flex justify-center z-40 pointer-events-none">
          <button 
            onClick={forceUnlock}
            className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] px-8 py-2.5 rounded-full shadow-2xl font-black uppercase tracking-widest border border-blue-400/50 flex items-center gap-3 transition-all active:scale-95 pointer-events-auto"
          >
            <i className="fa-solid fa-arrow-down"></i> 恢复实时滚动
          </button>
        </div>
      )}

      <div className="p-3 bg-[#0d1117] border-t border-slate-800 flex justify-between items-center px-6">
          <div className="text-[9px] text-slate-600 font-bold uppercase tracking-widest">
             Smart Ape Strategy Core <span className="mx-2 opacity-30">|</span> 
             {isLocked ? 'PAUSED' : 'LIVE'}
          </div>
          <div className="flex gap-1">
             <div className={`w-1 h-3 rounded-full ${isLocked ? 'bg-slate-800' : 'bg-blue-500 animate-bounce'}`} style={{animationDelay: '0s'}}></div>
             <div className={`w-1 h-3 rounded-full ${isLocked ? 'bg-slate-800' : 'bg-blue-500 animate-bounce'}`} style={{animationDelay: '0.2s'}}></div>
          </div>
      </div>
    </div>
  );
};

export default Terminal;
