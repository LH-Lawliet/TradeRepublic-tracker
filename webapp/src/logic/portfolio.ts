import { fetchYahooChart } from './api';
import { generateFallbackChart } from './finance';
import type { Position, Transaction, PortfolioChartPoint } from './types';

export async function buildPortfolioHistory(
    visiblePositions: Position[],
    allTransactions: Transaction[]
): Promise<PortfolioChartPoint[]> {
    if (visiblePositions.length === 0) return [];

    // 1. Isolate the symbols currently visible (filtered)
    const symbols = new Set(visiblePositions.map(p => p.Symbol).filter(s => s !== '-'));

    // 2. Filter and sort transactions relevant only to these symbols
    const txs = allTransactions
        .filter(t => symbols.has(t.symbol) && t.date && t.price && t.shares)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (txs.length === 0) return [];

    const earliestDateStr = txs[0]!.date.split('T')[0]!;

    // 3. Fetch historical charts for all visible symbols simultaneously
    const chartPromises = Array.from(symbols).map(async (sym) => {
        const data = await fetchYahooChart(sym, earliestDateStr);
        return { sym, data };
    });

    const charts = await Promise.all(chartPromises);

    charts.forEach(chart => {
        if (chart.data.length === 0) {
            chart.data = generateFallbackChart(chart.sym, txs, earliestDateStr);
        }
    });

    // Create a fast lookup dictionary: priceLookup[symbol][date] = price
    const priceLookup: Record<string, Record<string, number>> = {};
    charts.forEach(({ sym, data }) => {
        priceLookup[sym] = {};
        data.forEach(pt => {
            priceLookup[sym]![pt.date] = pt.price;
        });
    });

    // 4. Generate a continuous daily timeline from the first trade to today
    const startDate = new Date(earliestDateStr);
    const endDate = new Date();
    const dateRange: string[] = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        dateRange.push(d.toISOString().split('T')[0]!);
    }

    // 5. Walk through time day-by-day to calculate portfolio states
    const history: PortfolioChartPoint[] = [];
    const currentShares: Record<string, number> = {};
    const averageCost: Record<string, number> = {};
    let totalInvested = 0;
    let txIndex = 0;

    const lastKnownPrices: Record<string, number> = {};

    for (const dateStr of dateRange) {
        // Apply any transactions that occurred on or before this day
        while (txIndex < txs.length && txs[txIndex]!.date.split('T')[0]! <= dateStr) {
            const tx = txs[txIndex]!;
            const sym = tx.symbol;
            const shares = Number(tx.shares);
            const amount = Math.abs(Number(tx.amount));

            if (!currentShares[sym]) {
                currentShares[sym] = 0;
                averageCost[sym] = 0;
            }

            if (tx.type.includes('BUY')) {
                const prevTotalValue = currentShares[sym]! * averageCost[sym]!;
                currentShares[sym] += shares;
                averageCost[sym] = (prevTotalValue + amount) / currentShares[sym]!;
                totalInvested += amount;
            } else if (tx.type.includes('SELL')) {
                currentShares[sym] -= shares;
                if (currentShares[sym]! <= 0.0001) currentShares[sym] = 0;

                // Proportionally reduce invested capital based on cost basis
                const investedExtraction = shares * averageCost[sym]!;
                totalInvested -= investedExtraction;
            }
            txIndex++;
        }

        // Calculate EOD (End of Day) values
        let dailyAbsoluteValue = 0;

        // Initialize the daily point with base aggregates
        const dataPoint: PortfolioChartPoint = {
            date: dateStr,
            absoluteValue: 0,
            relativeReturn: 0
        };

        for (const sym of symbols) {
            const shares = currentShares[sym] || 0;
            const avgCost = averageCost[sym] || 0;

            if (shares > 0) {
                const priceToday = priceLookup[sym]?.[dateStr];
                // Forward-fill prices for weekends/holidays
                if (priceToday !== undefined) lastKnownPrices[sym] = priceToday;

                const currentPrice = lastKnownPrices[sym] || avgCost;
                const assetAbsolute = shares * currentPrice;
                const assetInvested = shares * avgCost;

                dailyAbsoluteValue += assetAbsolute;

                // Assign individual asset data to the point
                dataPoint[`${sym}_absolute`] = assetAbsolute;
                dataPoint[`${sym}_relative`] = totalInvested > 0
                    ? ((assetAbsolute - assetInvested) / totalInvested) * 100
                    : 0;
            } else {
                // Asset is completely sold off by this date
                dataPoint[`${sym}_absolute`] = 0;
                dataPoint[`${sym}_relative`] = 0;
            }
        }

        dataPoint.absoluteValue = dailyAbsoluteValue;

        if (totalInvested > 0 && dailyAbsoluteValue > 0) {
            dataPoint.relativeReturn = ((dailyAbsoluteValue / totalInvested) - 1) * 100;
        }

        history.push(dataPoint);
    }

    return history;
}