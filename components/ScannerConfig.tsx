
import React, { useState } from 'react';
import { TradeConfig } from '../types';

interface ScannerConfigProps {
  config: TradeConfig;
  setConfig: React.Dispatch<React.SetStateAction<TradeConfig>>;
  isScanning: boolean;
  onToggleScan: () => void;
}

const ScannerConfig: React.FC<ScannerConfigProps> = ({ config, setConfig, isScanning, onToggleScan }) => {
  const [showKey, setShowKey] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setConfig(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? parseFloat(value) || 0 : value)
    }));
  };

  const InputField = ({ label, name, value, suffix, icon, type = "number" }: { label: string, name: string, value: any, suffix?: string, icon?: string, type?: string }) => (
    <div className="flex flex-col gap-1 mb-4">
      <label className="text-[10px] text-slate-500 uppercase font-black tracking-widest flex items-center gap-2">
        {icon && <i className={`${icon} text-blue-500/50`}></i>}
        {label}
      </label>
      <div className="relative">
        <input 
          type={type} 
          name={name}
          value={value}
          onChange={handleChange}
          className="w-full bg-[#0d1117] border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 transition-all font-mono text-blue-100"
        />
        {suffix && <span className="absolute right-4 top-3 text-[10px] text-slate-600 font-black italic">{suffix}</span>}
      </div>
    </div>
  );

  return (
    <div className="bg-[#151921] rounded-2xl border border-slate-800 h-full flex flex-col shadow-xl overflow-hidden">
      <div className="p-5 border-b border-slate-800 bg-[#0d1117]/50 flex justify-between items-center">
        <span className="text-[10px] font-black tracking-widest text-white uppercase italic">核心引擎配置</span>
        <div className="flex gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500"></div>
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
        </div>
      </div>
      
      <div className="p-6 flex-grow space-y-2 overflow-y-auto">
        <InputField label="扫描间隔 (Scanning Speed)" name="scanIntervalMs" value={config.scanIntervalMs} suffix="MS" icon="fa-solid fa-microchip" />
        <InputField label="快速下跌阈值 (Leg1)" name="dropThreshold" value={config.dropThreshold} suffix="%" icon="fa-solid fa-bolt" />
        <InputField label="对冲入场总价 (Leg2)" name="sumTarget" value={config.sumTarget} suffix="USD" icon="fa-solid fa-plus-minus" />
        <InputField label="单边下注数量" name="betAmount" value={config.betAmount} suffix="SHARES" icon="fa-solid fa-coins" />
        
        <div className="pt-4 border-t border-slate-800/50 mt-4">
          <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-4 block italic">实盘执行配置 (Private)</span>
          
          <div className="flex flex-col gap-1 mb-4">
            <label className="text-[10px] text-slate-600 uppercase font-black tracking-widest flex justify-between">
              <span>账户私钥 (EVM Private Key)</span>
              <button onClick={() => setShowKey(!showKey)} className="text-blue-500 hover:underline">{showKey ? '隐藏' : '显示'}</button>
            </label>
            <input 
              type={showKey ? 'text' : 'password'}
              name="privateKey"
              value={config.privateKey}
              onChange={handleChange}
              placeholder="0x..."
              className="w-full bg-[#0d1117] border border-slate-800 rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-red-500/50 transition-all font-mono text-red-200"
            />
          </div>

          <InputField label="RPC 节点 (Polygon)" name="rpcUrl" value={config.rpcUrl} suffix="NODE" icon="fa-solid fa-network-wired" type="text" />
        </div>

        <div className="pt-2">
          <div className="flex items-center justify-between p-4 bg-[#0d1117] rounded-xl border border-slate-800/50">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-300 uppercase">自动执行模式</span>
              <span className="text-[8px] text-slate-600 font-bold">AUTO-BOT MODE</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" name="autoBet" checked={config.autoBet} onChange={handleChange} className="sr-only peer" />
              <div className="w-10 h-5 bg-slate-800 rounded-full peer peer-checked:bg-blue-600 transition-all after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-5 shadow-inner"></div>
            </label>
          </div>
        </div>
      </div>

      <div className="p-4 bg-red-950/20 border-t border-red-900/20 text-[8px] text-red-500/70 px-6 font-bold uppercase leading-tight">
        ⚠️ 警告: 实盘开启后将直接通过 RPC 发送交易，请确保私钥安全及余额充足。目前为模拟记录模式。
      </div>
    </div>
  );
};

export default ScannerConfig;
