
const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';

// 公共 CORS 代理列表，用于本地预览模式绕过浏览器限制
const CORS_PROXIES = [
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url='
];

async function fetchWithProxy(url: string) {
  // 首先尝试直接请求
  try {
    const response = await fetch(url);
    if (response.ok) return await response.json();
  } catch (e) {
    console.warn(`Direct fetch failed for ${url}, trying proxy...`);
  }

  // 尝试代理请求
  for (const proxy of CORS_PROXIES) {
    try {
      const proxiedUrl = `${proxy}${encodeURIComponent(url)}`;
      const response = await fetch(proxiedUrl);
      if (response.ok) return await response.json();
    } catch (e) {
      console.error(`Proxy ${proxy} failed:`, e);
    }
  }
  throw new Error('All fetch attempts failed');
}

export const fetchActiveMarkets = async () => {
  try {
    const url = `${GAMMA_API}/markets?active=true&closed=false&limit=15&order=volume24hr&dir=desc`;
    const data = await fetchWithProxy(url);
    
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
    const url = `${CLOB_API}/book?token_id=${tokenId}`;
    const data = await fetchWithProxy(url);
    if (data.asks && data.asks.length > 0) {
      return parseFloat(data.asks[0].price);
    }
    return 0.5;
  } catch (error) {
    return 0.5;
  }
};
