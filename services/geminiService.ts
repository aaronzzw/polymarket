
/**
 * 模拟本地策略引擎，不再请求外部 AI
 * 根据盘口数据返回模拟的策略预测值
 */
export const calculateStrategyEdge = (markets: any[]) => {
  return markets.map(m => {
    // 模拟某种“技术指标”得出的胜率预测
    // 在真实场景中，这里可能是 RSI、MACD 或量价分析逻辑
    const baseWinRate = 50;
    const volatility = Math.random() * 30 - 15; // 模拟波动
    const simulatedWinRate = Math.floor(baseWinRate + volatility);
    
    return {
      id: m.id,
      strategyWinRate: simulatedWinRate,
      reasoning: "基于本地波动率模型计算"
    };
  });
};
