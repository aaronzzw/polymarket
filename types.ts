
export interface TradeConfig {
  scanIntervalMs: number; 
  dropThreshold: number; 
  sumTarget: number; 
  betAmount: number; 
  autoBet: boolean;
  privateKey?: string;
  rpcUrl?: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  message: string;
}

export interface Order {
  id: string;
  roundId: string;
  symbol: string;
  side: 'UP' | 'DOWN';
  leg: 1 | 2;
  price: number;
  amount: number;
  status: 'PENDING' | 'FILLED' | 'FAILED';
  timestamp: string;
  txHash: string;
}

export interface ArbitrageRound {
  id: string;
  symbol: string;
  askUp: number; 
  askDown: number; 
  historyUp: number[];
  historyDown: number[];
  countdown: number;
  leg1Side: 'UP' | 'DOWN' | null;
  leg1Price: number | null;
  leg2Done: boolean;
  status: 'SCANNING' | 'HEDGING' | 'LOCKED' | 'SETTLED';
  resetTimer?: number; // 新增：锁定利润后的重置倒计时（秒）
}

export interface DashboardStats {
  totalTrades: number; 
  wonTrades: number; 
  totalVolume: number;
  netProfit: number;
  balance: number;
  winRate: number;
}
