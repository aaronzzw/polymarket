
import React, { useRef, useEffect, useState } from 'react';
import { LogEntry } from '../types';

interface TerminalProps {
  logs: LogEntry[];
}

const Terminal: React.FC<TerminalProps> = ({ logs }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const isAutoScrollEnabled = useRef(true); // 使用 Ref 避免状态延迟导致的回弹
  const [uiAutoScroll, setUiAutoScroll] = useState(true); // 仅用于 UI 显示提示

  // 每次日志更新时尝试滚动
  useEffect(() => {
    if (terminalRef.current && isAutoScrollEnabled.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    // 计算是否处于底部：总高度 - 已滚动高度 - 视窗高度
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    
    // 关键逻辑：更新 Ref 决定下一次日志进来时是否滚动
    isAutoScrollEnabled.current = isAtBottom;
    
    // 同时更新 UI 状态显示气泡
    if (uiAutoScroll !== isAtBottom) {
      setUiAutoScroll(isAtBottom);
    }
  };

  const forceScrollToBottom = () => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
      isAutoScrollEnabled.current = true;
      setUiAutoScroll(true);
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
          {!uiAutoScroll && (
             <span className="text-[8px] bg-yellow-500/20 text-yellow-500 border border-yellow-500/20 px-2 py-0.5 rounded-full animate-pulse font-black uppercase">
               PAUSED: 手动查看模式
             </span>
          )}
        </div>
        <div className="flex gap-4 text-[9px] font-bold text-slate-600">
           <span>TOTAL: {logs.length}</span>
           <span className={uiAutoScroll ? "text-green-600" : "text-yellow-600"}>
             {uiAutoScroll ? "● SYNCING" : "○ MANUAL"}
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
            <span className="text-slate-600 shrink-0 font-bold w-16">[{log.timestamp}]</span>
            <span className={`px-1.5 rounded text-[8px] font-black border h-fit ${getLevelStyle(log.level)}`}>
              {log.level}
            </span>
            <span className="text-slate-300 break-all group-hover:text-white transition-colors">{log.message}</span>
          </div>
        ))}
        {logs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-700 gap-3 opacity-50">
             <i className="fa-solid fa-circle-notch animate-spin text-2xl"></i>
             <span className="italic uppercase text-[10px] tracking-widest">正在建立数据流通道...</span>
          </div>
        )}
      </div>

      <div className="p-3 bg-[#0d1117] border-t border-slate-800 flex justify-center relative">
         {!uiAutoScroll && (
            <button 
              onClick={forceScrollToBottom}
              className="absolute -top-12 bg-blue-600 hover:bg-blue-500 text-white text-[10px] px-6 py-2 rounded-full shadow-2xl font-black uppercase tracking-widest border border-blue-400/50 flex items-center gap-2 transition-all active:scale-95"
            >
              <i className="fa-solid fa-arrow-down-long"></i> 返回最新日志
            </button>
         )}
         <div className="h-1 w-24 bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full bg-blue-500 ${uiAutoScroll ? 'animate-progress' : 'opacity-20'}`}></div>
         </div>
      </div>
    </div>
  );
};

export default Terminal;
