
import React, { useState } from 'react';
import { TradeConfig } from '../types';

interface ScannerConfigProps {
  config: TradeConfig & { engineActive?: boolean, maxSettleMinutes?: number };
  setConfig: React.Dispatch<React.SetStateAction<any>>;
  onSave: () => void;
  onToggle: () => void;
}

const ScannerConfig: React.FC<ScannerConfigProps> = ({ config, setConfig, onSave, onToggle }) => {
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setConfig((prev: any) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? parseFloat(value) || 0 : value)
    }));
  };

  const handleSaveClick = async () => {
    setIsSaving(true);
    await onSave();
    setTimeout(() => setIsSaving(false), 800);
  };

  const InputField = ({ label, name, value, suffix, icon, type = "number" }: { label: string, name: string, value: any, suffix?: string, icon?: string, type?: string }) => (
    <div className="flex flex-col gap-1 mb-3">
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
          className="w-full bg-[#0d1117] border border-slate-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-all font-mono text-blue-100"
        />
        {suffix && <span className="absolute right-4 top-2.5 text-[10px] text-slate-600 font-black italic">{suffix}</span>}
      </div>
    </div>
  );

  return (
    <div className="bg-[#151921] rounded-2xl border border-slate-800 h-full flex flex-col shadow-xl overflow-hidden">
      <div className="p-5 border-b border-slate-800 bg-[#0d1117]/50 flex justify-between items-center">
        <span className="text-[10px] font-black tracking-widest text-white uppercase italic">引擎核心控制台</span>
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${config.engineActive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
          <span className="text-[9px] font-black text-slate-500 uppercase">{config.engineActive ? 'Active' : 'Standby'}</span>
        </div>
      </div>
      
      <div className="p-6 flex-grow space-y-2 overflow-y-auto">
        <button 
          onClick={onToggle}
          className={`w-full py-4 rounded-xl font-black uppercase tracking-[0.2em] text-xs mb-6 transition-all shadow-lg flex items-center justify-center gap-3 ${
            config.engineActive 
            ? 'bg-red-600/20 border border-red-600/50 text-red-500 hover:bg-red-600/30' 
            : 'bg-blue-600 border border-blue-400 text-white hover:bg-blue-500 shadow-blue-500/20'
          }`}
        >
          <i className={`fa-solid ${config.engineActive ? 'fa-stop' : 'fa-play'}`}></i>
          {config.engineActive ? '停止扫描引擎' : '启动扫描引擎'}
        </button>

        <InputField label="扫描频率" name="scanIntervalMs" value={config.scanIntervalMs} suffix="MS" icon="fa-solid fa-microchip" />
        <InputField label="最大结算周期" name="maxSettleMinutes" value={config.maxSettleMinutes || 1440} suffix="MINS" icon="fa-solid fa-hourglass-half" />
        <InputField label="获利触发阈值" name="profitThreshold" value={(config as any).profitThreshold || 0.008} suffix="%" icon="fa-solid fa-bolt" />
        <InputField label="单笔下注" name="betAmount" value={config.betAmount} suffix="SHARES" icon="fa-solid fa-coins" />
        
        <div className="pt-4 border-t border-slate-800/50 mt-4">
          <InputField label="RPC 节点 (Polygon)" name="rpcUrl" value={(config as any).rpcUrl || ''} suffix="NODE" icon="fa-solid fa-network-wired" type="text" />
          <div className="flex flex-col gap-1 mb-4">
            <label className="text-[10px] text-slate-600 uppercase font-black tracking-widest flex justify-between">
              <span>账户私钥</span>
              <button onClick={() => setShowKey(!showKey)} className="text-blue-500 hover:underline">{showKey ? '隐藏' : '显示'}</button>
            </label>
            <input 
              type={showKey ? 'text' : 'password'}
              name="privateKey"
              value={(config as any).privateKey || ''}
              onChange={handleChange}
              placeholder="0x..."
              className="w-full bg-[#0d1117] border border-slate-800 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-red-500/50 transition-all font-mono text-red-200"
            />
          </div>
        </div>

        <div className="pt-2">
          <div className="flex items-center justify-between p-4 bg-[#0d1117] rounded-xl border border-slate-800/50">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-300 uppercase">自动交易</span>
              <span className="text-[8px] text-slate-600 font-bold uppercase tracking-tighter">BOT EXECUTION</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" name="autoBet" checked={config.autoBet} onChange={handleChange} className="sr-only peer" />
              <div className="w-10 h-5 bg-slate-800 rounded-full peer peer-checked:bg-blue-600 transition-all after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-5 shadow-inner"></div>
            </label>
          </div>
        </div>
      </div>

      <div className="p-4 bg-[#0d1117] border-t border-slate-800">
        <button 
          onClick={handleSaveClick}
          disabled={isSaving}
          className="w-full bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-slate-700 flex items-center justify-center gap-2"
        >
          {isSaving ? (
            <i className="fa-solid fa-circle-notch animate-spin"></i>
          ) : (
            <i className="fa-solid fa-floppy-disk text-blue-400"></i>
          )}
          {isSaving ? '正在保存...' : '保存并应用配置'}
        </button>
      </div>
    </div>
  );
};

export default ScannerConfig;
