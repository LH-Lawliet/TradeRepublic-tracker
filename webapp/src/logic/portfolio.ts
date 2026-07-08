import { fetchYahooChart } from './api';
import { generateFallbackChart } from './finance';
import type { Position, Transaction, PortfolioChartPoint, PortfolioHistoryResult, YearlyRoiData } from './types';

export async function buildPortfolioHistory(
    visiblePositions: Position[],
    allTransactions: Transaction[]
): Promise<PortfolioHistoryResult> {
    if (visiblePositions.length === 0) return { history: [], yearlyRois: [] };

    // 1. Isolate the symbols currently visible (filtered)
    const symbols = new Set(visiblePositions.map(p => p.Symbol).filter(s => s !== '-'));

    // 2. Filter and sort transactions relevant only to these symbols
    const txs = allTransactions
        .filter(t => symbols.has(t.symbol) && t.date && t.price && t.shares)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (txs.length === 0) return { history: [], yearlyRois: [] };

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

    // Store a snapshot for our Annual ROI calculation
    const dailySnapshots: Record<string, { shares: Record<string, number>, prices: Record<string, number> }> = {};

    for (const dateStr of dateRange) {
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

                const investedExtraction = shares * averageCost[sym]!;
                totalInvested -= investedExtraction;
            }
            txIndex++;
        }

        let dailyAbsoluteValue = 0;
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
                if (priceToday !== undefined) lastKnownPrices[sym] = priceToday;

                const currentPrice = lastKnownPrices[sym] || avgCost;
                const assetAbsolute = shares * currentPrice;
                const assetInvested = shares * avgCost;

                dailyAbsoluteValue += assetAbsolute;
                dataPoint[`${sym}_absolute`] = assetAbsolute;
                dataPoint[`${sym}_relative`] = totalInvested > 0
                    ? ((assetAbsolute - assetInvested) / totalInvested) * 100
                    : 0;
            } else {
                dataPoint[`${sym}_absolute`] = 0;
                dataPoint[`${sym}_relative`] = 0;
            }
        }

        dataPoint.absoluteValue = dailyAbsoluteValue;
        if (totalInvested > 0 && dailyAbsoluteValue > 0) {
            dataPoint.relativeReturn = ((dailyAbsoluteValue / totalInvested) - 1) * 100;
        }

        history.push(dataPoint);
        dailySnapshots[dateStr] = {
            shares: { ...currentShares },
            prices: { ...lastKnownPrices }
        };
    }

    // 6. Post-process the Snapshots to isolate true YoY Performance (Ignoring Intrayear DCA)
    const yearlyRois: YearlyRoiData[] = [];
    const years = Array.from(new Set(dateRange.map(d => d.substring(0, 4))));

    for (let i = 0; i < years.length; i++) {
        const year = years[i]!;
        const daysInYear = dateRange.filter(d => d.startsWith(year));
        if (daysInYear.length === 0) continue;

        const firstDayOfYear = daysInYear[0]!;
        const lastDayOfYear = daysInYear[daysInYear.length - 1]!;

        // Snapshot of shares taken on the last day of the PREVIOUS year (or very first day for Year 1)
        let startShares: Record<string, number>;
        if (i > 0) {
            const prevYearDays = dateRange.filter(d => d.startsWith(years[i - 1]!));
            const lastDayOfPrevYear = prevYearDays[prevYearDays.length - 1]!;
            startShares = dailySnapshots[lastDayOfPrevYear]!.shares;
        } else {
            startShares = dailySnapshots[firstDayOfYear]!.shares;
        }

        const startPrices = dailySnapshots[firstDayOfYear]!.prices;
        const endPrices = dailySnapshots[lastDayOfYear]!.prices;

        let portfolioStartValue = 0;
        let portfolioEndValue = 0;
        const assetRois: Record<string, number> = {};

        for (const sym of symbols) {
            const shares = startShares[sym] || 0;

            // Only calculate if we held the asset going into the year
            if (shares > 0.0001) {
                const pStart = startPrices[sym] || averageCost[sym] || 0;
                const pEnd = endPrices[sym] || pStart;

                if (pStart > 0) {
                    const valStart = shares * pStart;
                    const valEnd = shares * pEnd;

                    portfolioStartValue += valStart;
                    portfolioEndValue += valEnd;
                    assetRois[sym] = (pEnd / pStart) - 1;
                }
            }
        }

        let portfolioRoi = 0;
        if (portfolioStartValue > 0) {
            portfolioRoi = (portfolioEndValue / portfolioStartValue) - 1;
        }

        if (portfolioStartValue > 0 || Object.keys(assetRois).length > 0) {
            yearlyRois.push({ year, portfolioRoi, assetRois });
        }
    }

    return { history, yearlyRois };
}