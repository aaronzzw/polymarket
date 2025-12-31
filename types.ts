
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
  symbol: string; // 市场名称
  question: string;
  yesTokenId: string;
  noTokenId: string;
  askYes: number; 
  askNo: number; 
  historyYes: number[];
  historyNo: number[];
  countdown: number;
  leg1Side: 'YES' | 'NO' | null;
  leg1Price: number | null;
  leg2Done: boolean;
  status: 'SCANNING' | 'HEDGING' | 'LOCKED' | 'SETTLED';
  resetTimer?: number;
}

export interface DashboardStats {
  totalTrades: number; 
  wonTrades: number; 
  totalVolume: number;
  netProfit: number;
  balance: number;
  winRate: number;
}
