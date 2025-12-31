
import React, { useRef, useEffect } from 'react';
import { LogEntry } from '../types';

interface TerminalProps {
  logs: LogEntry[];
}

const Terminal: React.FC<TerminalProps> = ({ logs }) => {
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getLevelStyle = (level: string) => {
    switch (level) {
      case 'SUCCESS': return 'text-green-400 bg-green-400/10 border-green-500/20';
      case 'WARN': return 'text-yellow-400 bg-yellow-400/10 border-yellow-500/20';
      default: return 'text-blue-400 bg-blue-400/10 border-blue-500/20';
    }
  };

  return (
    <div className="bg-[#151921] rounded-2xl border border-slate-800 h-full flex flex-col font-mono text-[11px] overflow-hidden shadow-xl">
      <div className="px-5 py-3 border-b border-slate-800 flex justify-between items-center bg-[#0d1117]">
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-microchip text-blue-500 animate-pulse"></i>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">对冲执行终端 (最新20条)</span>
        </div>
        <div className="flex gap-4 text-[9px] font-bold text-slate-600">
           <span>POLYGON-SYNC</span>
           <span className="text-green-600">CONNECTED</span>
        </div>
      </div>
      <div className="p-4 flex-grow overflow-y-auto space-y-1.5 scroll-smooth">
        {logs.map((log) => (
          <div key={log.id} className="flex gap-3 hover:bg-slate-800/30 p-1 rounded-md transition-all border border-transparent hover:border-slate-700/50">
            <span className="text-slate-600 shrink-0 font-bold">[{log.timestamp}]</span>
            <span className={`px-1.5 rounded text-[8px] font-black border self-start ${getLevelStyle(log.level)}`}>
              {log.level}
            </span>
            <span className="text-slate-300 break-all">{log.message}</span>
          </div>
        ))}
        {logs.length === 0 && <div className="text-slate-700 italic px-2">等待引擎启动并探测市场偏移...</div>}
        <div ref={terminalEndRef} />
      </div>
      <div className="p-2 bg-[#0d1117] border-t border-slate-800 flex justify-center">
         <div className="h-1 w-24 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 animate-progress"></div>
         </div>
      </div>
    </div>
  );
};

export default Terminal;
