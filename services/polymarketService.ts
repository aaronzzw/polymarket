
const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';

export const fetchActiveMarkets = async () => {
  try {
    const response = await fetch(`${GAMMA_API}/markets?active=true&closed=false&limit=15&order=volume24hr&dir=desc`);
    const data = await response.json();
    
    return data.filter((m: any) => {
      let tokens = m.clobTokenIds;
      if (typeof tokens === 'string') {
        try { tokens = JSON.parse(tokens); } catch(e) { return false; }
      }
      return Array.isArray(tokens) && tokens.length === 2;
    }).map((m: any) => {
      let tokens = typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : m.clobTokenIds;
      return {
        id: m.id,
        question: m.question,
        symbol: m.ticker || m.slug.split('-').slice(0,2).join(' ').toUpperCase(),
        yesTokenId: tokens[0],
        noTokenId: tokens[1],
        endTimestamp: new Date(m.endDate).getTime()
      };
    });
  } catch (error) {
    console.error('Failed to fetch Polymarket markets:', error);
    return [];
  }
};

export const fetchTokenPrice = async (tokenId: string) => {
  try {
    const response = await fetch(`${CLOB_API}/book?token_id=${tokenId}`);
    const data = await response.json();
    if (data.asks && data.asks.length > 0) {
      return parseFloat(data.asks[0].price);
    }
    return 0.5;
  } catch (error) {
    return 0.5;
  }
};
