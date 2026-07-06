import type { Position, ChartPoint } from "./types";

// Public CORS proxy required for browser-based external API fetches
const CORS_PROXY = "https://corsproxy.io/?";

const SPECIAL_ROUTING: Record<string, { type: "CRYPTO" | "FUND" | "DERIVATIVE", query?: string }> = {
    "BTC": { type: "CRYPTO", query: "BTC-EUR" },
    "ETH": { type: "CRYPTO", query: "ETH-EUR" }
};

export async function fetchLivePrices(positions: Position[]): Promise<Position[]> {
    const updated = await Promise.all(positions.map(async (pos) => {
        if (pos.Symbol === "-") return pos;

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
        } catch (e) {
            console.warn(`Price fetch failed for ${pos.Symbol}`, e);
        }

        pos.TotalValue = Math.round(((pos.Quantity * pos.Price) + pos.PendingCash) * 100) / 100;
        return pos;
    }));
    return updated;
}

export async function fetchYahooChart(symbol: string): Promise<ChartPoint[]> {
    try {
        let ticker = symbol === "BTC" || symbol === "ETH" ? `${symbol}-EUR` : symbol;
        const targetUrl = encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2y`);

        const res = await fetch(`${CORS_PROXY}${targetUrl}`);
        const json = await res.json() as any;
        const result = json?.chart?.result?.[0];

        if (!result) return [];

        const timestamps = result.timestamp as number[];
        const closes = result.indicators.quote[0].close as (number | null)[];

        return timestamps.map((ts, i) => ({
            date: new Date(ts * 1000).toISOString().split('T')[0],
            price: closes[i] || 0
        })).filter(p => p.price > 0);
    } catch (e) {
        console.warn("Chart fetch failed", e);
        return [];
    }
}