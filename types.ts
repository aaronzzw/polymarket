
export interface TradeConfig {
  scanIntervalMs: number; 
  windowMin: number;      // 狙击窗口（周期前N分钟）
  movePct: number;        // 3秒跌幅阈值（如 0.15）
  sumTarget: number;      // 对冲总成本阈值（如 0.95）
  betAmount: number;      // 单笔下注股数
  autoBet: boolean;
  engineActive: boolean;
  rpcUrl?: string;
  privateKey?: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' | 'CRITICAL';
  message: string;
}

export interface Order {
  id: string;
  symbol: string;
  side: 'YES' | 'NO';
  leg: 1 | 2;
  price: number;
  amount: number;
  status: 'PENDING' | 'FILLED' | 'FAILED';
  timestamp: string;
  txHash: string;
}

export interface ArbitrageRound {
  id: string;
  asset: string;
  symbol: string;
  targetPrice: string;
  status: 'IDLE' | 'SNIPING' | 'HEDGING' | 'LOCKED';
  currentPrice: number;
  prevPrice3s: number;
  volatility3s: number;
  sumCost: number;
  cycleTime: string; // 当前 15m 周期的时间戳
  isEligible: boolean; // 是否在狙击窗口内
  leg1Price?: number;
}

/**
 * Added DashboardStats interface to fix import error in components/StatsHeader.tsx
 */
export interface DashboardStats {
  totalTrades: number;
  wonTrades: number;
  totalVolume: number;
  netProfit: number;
  balance: number;
  winRate: number;
  scannedCount?: number;
}
