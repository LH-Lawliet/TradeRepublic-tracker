import type { Position, ChartPoint } from "./types";

// Public CORS proxy required for browser-based external API fetches
const CORS_PROXY = "https://corsproxy.io/?";

const SPECIAL_ROUTING: Record<string, { type: "CRYPTO" | "FUND" | "DERIVATIVE", query?: string }> = {
    "BTC": { type: "CRYPTO", query: "BTC-EUR" },
    "ETH": { type: "CRYPTO", query: "ETH-EUR" }
};

const GERMAN_EXCHANGES = [
    '.DE', // Xetra
    '.F',  // Frankfurt
    '.SG', // Stuttgart
    '.MU', // Munich
    '.DU', // Dusseldorf
    '.HM', // Hamburg
    '.HA', // Hanover
    '.BE', // Berlin
    '.BM'  // Bremen
];

// --- Caches ---
const PRICE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const priceCache = new Map<string, { price: number, timestamp: number }>();
const tickerCache = new Map<string, string | null>();
const chartCache = new Map<string, ChartPoint[]>();
// --------------

export async function fetchLivePrices(positions: Position[]): Promise<Position[]> {
    const now = Date.now();

    const updated = await Promise.all(positions.map(async (pos) => {
        if (pos.Symbol === "-") return pos;

        // 1. Return cached price if valid
        const cached = priceCache.get(pos.Symbol);
        if (cached && (now - cached.timestamp < PRICE_CACHE_TTL_MS)) {
            pos.Price = cached.price;
            pos.TotalValue = Math.round(((pos.Quantity * pos.Price) + pos.PendingCash) * 100) / 100;
            return pos;
        }

        const route = SPECIAL_ROUTING[pos.Symbol];
        try {
            if (route?.type === "CRYPTO") {
                const res = await fetch(`https://api.coinbase.com/v2/prices/${route.query}/spot`);
                const json = await res.json() as { data: { amount: string } };
                pos.Price = parseFloat(json.data.amount);
            } else {
                // Fetching via Proxy to bypass CORS for Tradegate
                const targetUrl = encodeURIComponent(`https://www.tradegate.de/orderbuch.php?isin=${pos.Symbol}`);
                const res = await fetch(`${CORS_PROXY}${targetUrl}`);
                const html = await res.text();

                const match = html.match(/id="last">([\d\s.,]+)<\//);
                if (match && match[1]) {
                    pos.Price = parseFloat(match[1].replace(/\s/g, '').replace(',', '.'));
                }
            }

            // Save to cache after a successful fetch
            if (pos.Price > 0) {
                priceCache.set(pos.Symbol, { price: pos.Price, timestamp: now });
            }

        } catch (e) {
            console.warn(`Price fetch failed for ${pos.Symbol}`, e);
        }

        pos.TotalValue = Math.round(((pos.Quantity * pos.Price) + pos.PendingCash) * 100) / 100;
        return pos;
    }));

    return updated;
}

/**
 * Scrapes Tradegate for the Kürzel and Price, then races Yahoo exchanges  
 * to find the ticker with the closest matching price.
 */
async function getTradegateTicker(isin: string): Promise<string | null> {
    if (tickerCache.has(isin)) {
        return tickerCache.get(isin)!;
    }

    try {
        const tgUrl = encodeURIComponent(`https://www.tradegate.de/orderbuch.php?isin=${isin}`);
        const tgRes = await fetch(`${CORS_PROXY}${tgUrl}`);
        const html = await tgRes.text();

        const isinRegex = new RegExp(`<td[^>]*>([^<]+)</td>\\s*<td[^>]*>${isin}</td>`, 'i');
        const match = html.match(isinRegex);

        const result = match && match[1] ? match[1].trim() : null;

        tickerCache.set(isin, result);
        return result;
    } catch (e) {
        console.warn(`Failed to fetch ticker from Tradegate for ${isin}`, e);
        return null;
    }
}

/**
 * Fetches historical data using Yahoo's timestamp query parameters.
 * Prioritizes Xetra (.DE) and Frankfurt (.F) for deep historical ETF depth.
 */
export async function fetchYahooChart(symbol: string, startDateStr?: string): Promise<ChartPoint[]> {
    const cacheKey = `${symbol}_${startDateStr || 'all'}`;

    if (chartCache.has(cacheKey)) {
        return chartCache.get(cacheKey)!;
    }

    try {
        let baseTicker = symbol;

        // 1. Resolve Crypto or ISIN
        if (symbol === "BTC" || symbol === "ETH") {
            baseTicker = `${symbol}-EUR`;
        } else if (/^[A-Z]{2}[A-Z0-9]{10}$/.test(symbol)) {
            const resolved = await getTradegateTicker(symbol);
            if (!resolved) return [];
            baseTicker = resolved;
        }

        // 2. Determine Timeframe (Unix timestamps)
        let timeParams = "range=2y"; // Fallback
        if (startDateStr) {
            const startTimestamp = Math.floor(new Date(startDateStr).getTime() / 1000);
            const endTimestamp = Math.floor(Date.now() / 1000);
            if (!isNaN(startTimestamp)) {
                timeParams = `period1=${startTimestamp}&period2=${endTimestamp}`;
            }
        }

        // 3. Fallback Exchange Chain Strategy
        // For ETFs/Stocks, try Xetra (.DE) first for historical depth, then Frankfurt (.F), then other places then asset default
        const candidateTickers = (symbol === "BTC" || symbol === "ETH")
            ? [baseTicker]
            : [...GERMAN_EXCHANGES.map(ext => `${baseTicker}${ext}`), baseTicker];

        for (const ticker of candidateTickers) {
            const targetUrl = encodeURIComponent(
                `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&${timeParams}`
            );

            const res = await fetch(`${CORS_PROXY}${targetUrl}`);
            const json = await res.json() as any;
            const result = json?.chart?.result?.[0];

            // If this exchange has historical candles, map and return them
            if (result?.timestamp && result?.indicators?.quote?.[0]?.close) {
                const timestamps = result.timestamp as number[];
                const closes = result.indicators.quote[0].close as (number | null)[];

                // Check if we actually got history back (more than 5 points)
                if (timestamps.length > 5) {
                    console.log(`Successfully fetched chart history using ticker: ${ticker}`);

                    const chartData = timestamps.map((ts, i) => ({
                        // Add the '!' at the end to satisfy noUncheckedIndexedAccess
                        date: new Date(ts * 1000).toISOString().split('T')[0]!,
                        price: closes[i] || 0
                    })).filter(p => p.price > 0);

                    chartCache.set(cacheKey, chartData);
                    return chartData;
                }
            }
        }

        // Cache empty results too, so we don't spam requests for completely broken tickers
        chartCache.set(cacheKey, []);
        return [];
    } catch (e) {
        console.warn(`Chart fetch failed for ${symbol}`, e);
        return [];
    }
}