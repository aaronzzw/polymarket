
import React from 'react';

const ScannerConfig: React.FC<any> = ({ config, setConfig, onSave, onToggle }) => {
  const handleChange = (e: any) => {
    const { name, value, type, checked } = e.target;
    setConfig((prev: any) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : parseFloat(value) || 0
    }));
  };

  const Input = ({ label, name, value, suffix }: any) => (
    <div className="mb-4">
       <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest block mb-1.5">{label}</label>
       <div className="relative group">
          <input 
            type="number" 
            name={name} 
            value={value} 
            onChange={handleChange}
            className="w-full bg-[#050608] border border-white/10 rounded-md p-2.5 text-xs font-black text-red-500 focus:outline-none focus:border-red-500/50 transition-all group-hover:border-white/20"
          />
          <span className="absolute right-3 top-2.5 text-[8px] font-black text-slate-700 uppercase italic">{suffix}</span>
       </div>
    </div>
  );

  return (
    <div className="bg-[#0a0c10] border border-white/5 rounded-xl flex flex-col h-full overflow-hidden shadow-2xl border-t-2 border-t-red-600">
      <div className="p-4 border-b border-white/5 bg-white/2 flex justify-between items-center">
         <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-widest text-white italic">Rust Engine Control</span>
            <span className="text-[7px] text-red-500 font-bold uppercase tracking-tighter">Low Latency Mode v7.0</span>
         </div>
         <div className={`w-2 h-2 rounded-full ${config.engineActive ? 'bg-red-500 animate-ping' : 'bg-slate-800'}`}></div>
      </div>

      <div className="p-5 flex-grow overflow-y-auto bg-[#0a0c10]">
         <button 
           onClick={onToggle}
           className={`w-full py-4 rounded-md text-[10px] font-black uppercase tracking-[0.2em] mb-8 transition-all border-2 ${
             config.engineActive ? 'bg-red-600/10 border-red-600/50 text-red-600 shadow-inner' : 'bg-red-600 border-red-400 text-white shadow-[0_10px_30px_rgba(220,38,38,0.3)] hover:scale-[1.02]'
           }`}
         >
           {config.engineActive ? 'Stop Rust Engine' : 'Ignite Rust Engine'}
         </button>

         <div className="space-y-2">
            <Input label="Snipe Window (15m start)" name="windowMin" value={config.windowMin} suffix="MINS" />
            <Input label="3S Crash Delta Threshold" name="movePct" value={config.movePct} suffix="PCT" />
            <Input label="Hedge Profit Target" name="sumTarget" value={config.sumTarget} suffix="COST" />
            <Input label="FOK Order Quantity" name="betAmount" value={config.betAmount} suffix="SHARES" />
         </div>

         <div className="mt-8 pt-8 border-t border-white/5">
            <div className="flex justify-between items-center mb-6">
               <div>
                  <div className="text-[10px] font-black text-white uppercase italic tracking-wider">Fast-Or-Kill (FOK)</div>
                  <div className="text-[7px] text-slate-600 uppercase font-bold">Strict execution only</div>
               </div>
               <div className="text-red-500 text-xs font-black italic">ACTIVE</div>
            </div>
            
            <div className="flex justify-between items-center">
               <div>
                  <div className="text-[10px] font-black text-white uppercase italic tracking-wider">Auto-Hedge Core</div>
                  <div className="text-[7px] text-slate-600 uppercase font-bold">Leg 2 Parallel Scanning</div>
               </div>
               <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" name="autoBet" checked={config.autoBet} onChange={handleChange} className="sr-only peer" />
                  <div className="w-10 h-5 bg-slate-800 rounded-full peer peer-checked:bg-red-600 transition-all after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-5 shadow-inner"></div>
               </label>
            </div>
         </div>
      </div>

      <div className="p-4 bg-white/2 border-t border-white/5">
         <div className="text-[7px] text-slate-700 font-black uppercase text-center mb-3 tracking-widest">
            Security Hash: 0X8F2...4E9A
         </div>
         <button onClick={onSave} className="w-full bg-slate-900 border border-white/10 hover:border-red-500/50 text-white text-[9px] py-3 rounded font-black uppercase tracking-widest transition-all">
           Synchronize Memory Buffer
         </button>
      </div>
    </div>
  );
};

export default ScannerConfig;
