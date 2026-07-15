import { fetchYahooChart } from './api';
import {
    generateFallbackChart,
    getNetAmount,
    getPositionCategory,
    getTradeQuantityDelta,
    isIncomeTransaction,
    normalizeTransactionType
} from './finance';
import type { Position, Transaction, PortfolioChartPoint, PortfolioHistoryResult, YearlyRoiData } from './types';

interface CashFlow {
    date: string;
    amount: number;
}

function getDate(tx: Transaction): string {
    return String(tx.date || tx.datetime || '').split('T')[0] || '';
}

function getAbsoluteAmount(tx: Transaction): number {
    const amount = Number(tx.amount);
    return Number.isFinite(amount) ? Math.abs(amount) : 0;
}

function getFallbackTradeValue(tx: Transaction, quantity: number): number {
    const amount = getAbsoluteAmount(tx);
    if (amount > 0) {
        return amount;
    }

    const price = Number(tx.price);
    return Number.isFinite(price) && price > 0 ? quantity * price : 0;
}

function getUnitPrice(tx: Transaction, fallbackPrice: number): number {
    const price = Number(tx.price);
    return Number.isFinite(price) && price > 0 ? price : fallbackPrice;
}

function matchesAccountFilter(tx: Transaction, accountFilter: string) {
    return accountFilter === 'ALL' || getPositionCategory(tx) === accountFilter;
}

function hasSecurityQuantity(tx: Transaction) {
    return Boolean(tx.symbol && getDate(tx) && getTradeQuantityDelta(tx) !== null);
}

function isBuyLike(type: string) {
    return type.includes('BUY') || type.includes('SUBSCRIPTION');
}

function isSellLike(type: string) {
    return type.includes('SELL');
}

function isTransferInLike(type: string) {
    return type.includes('TRANSFER_IN') || type.includes('FREE_RECEIPT') || type.includes('INBOUND') || type.includes('RECEIPT');
}

function isTransferOutLike(type: string) {
    return type.includes('TRANSFER_OUT') || type.includes('OUTBOUND') || type.includes('BOOK_OUT') || type.includes('AUSBUCH');
}

function isRedemptionLike(type: string) {
    return type.includes('REDEMPTION') || type.includes('TILGUNG') || type.includes('MATURITY');
}

function isWorthlessLike(type: string) {
    return type.includes('EXPIR') || type.includes('WORTHLESS') || type.includes('DELIST');
}

function isRatioChangeLike(type: string) {
    return type.includes('SPLIT') || type.includes('MERGER') || type.includes('FUSION');
}

function isStandaloneCashAdjustment(type: string) {
    return type.includes('FEE') || type.includes('TAX');
}

function getSignedAmount(tx: Transaction): number | null {
    const amount = Number(tx.amount);
    return Number.isFinite(amount) ? amount : null;
}

function yearsBetween(startDate: Date, date: Date) {
    return (date.getTime() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
}

function calculateXirr(cashFlows: CashFlow[]): number | null {
    if (cashFlows.length < 2) {
        return null;
    }

    const hasPositive = cashFlows.some(flow => flow.amount > 0);
    const hasNegative = cashFlows.some(flow => flow.amount < 0);
    if (!hasPositive || !hasNegative) {
        return null;
    }

    const startDate = new Date(cashFlows[0]!.date);
    const npv = (rate: number) => cashFlows.reduce((sum, flow) => {
        const years = yearsBetween(startDate, new Date(flow.date));
        return sum + flow.amount / Math.pow(1 + rate, years);
    }, 0);

    let low = -0.9999;
    let high = 10;
    let lowValue = npv(low);
    let highValue = npv(high);

    if (lowValue * highValue > 0) {
        high = 100;
        highValue = npv(high);
        if (lowValue * highValue > 0) {
            return null;
        }
    }

    for (let i = 0; i < 100; i++) {
        const mid = (low + high) / 2;
        const midValue = npv(mid);

        if (Math.abs(midValue) < 0.000001) {
            return mid;
        }

        if (lowValue * midValue < 0) {
            high = mid;
            highValue = midValue;
        } else {
            low = mid;
            lowValue = midValue;
        }
    }

    return (low + high) / 2;
}

function buildYearlyTwrReturns(history: PortfolioChartPoint[]): YearlyRoiData[] {
    const yearlyRois: YearlyRoiData[] = [];
    const years = Array.from(new Set(history.map(point => point.date.substring(0, 4))));

    years.forEach(year => {
        const firstIndex = history.findIndex(point => point.date.startsWith(year));
        if (firstIndex < 0) {
            return;
        }

        const yearPoints = history.filter(point => point.date.startsWith(year));
        const lastPoint = yearPoints[yearPoints.length - 1]!;
        const previousPoint = firstIndex > 0 ? history[firstIndex - 1] : null;
        const startFactor = previousPoint ? 1 + (Number(previousPoint.relativeReturn) / 100) : 1;
        const endFactor = 1 + (Number(lastPoint.relativeReturn) / 100);

        yearlyRois.push({
            year,
            portfolioRoi: startFactor !== 0 ? (endFactor / startFactor) - 1 : 0,
            assetRois: {}
        });
    });

    return yearlyRois;
}

export async function buildPortfolioHistory(
    visiblePositions: Position[],
    allTransactions: Transaction[],
    useExternalMarketData = true,
    accountFilter = 'ALL'
): Promise<PortfolioHistoryResult> {
    const relevantTransactions = allTransactions
        .filter(tx => getDate(tx) && matchesAccountFilter(tx, accountFilter))
        .sort((a, b) => new Date(getDate(a)).getTime() - new Date(getDate(b)).getTime());

    const securityTransactions = relevantTransactions.filter(hasSecurityQuantity);
    const symbols = new Set(securityTransactions.map(tx => tx.symbol).filter(symbol => symbol && symbol !== '-'));

    visiblePositions
        .filter(position => position.Symbol !== '-')
        .forEach(position => symbols.add(position.Symbol));

    if (symbols.size === 0 || securityTransactions.length === 0) {
        const cashBalance = relevantTransactions.reduce((sum, tx) => {
            if (isIncomeTransaction(tx)) {
                return sum + getNetAmount(tx);
            }

            if (!tx.symbol) {
                return sum + (getSignedAmount(tx) ?? 0);
            }

            return sum;
        }, 0);

        return { history: [], yearlyRois: [], symbols: [], symbolNames: {}, xirr: null, cashBalance };
    }

    const symbolNames = Array.from(symbols).reduce((map, symbol) => {
        const position = visiblePositions.find(pos => pos.Symbol === symbol);
        const transaction = securityTransactions.find(tx => tx.symbol === symbol);
        map[symbol] = position?.Name || transaction?.name || symbol;
        return map;
    }, {} as Record<string, string>);

    const earliestDateStr = securityTransactions[0]!.date.split('T')[0]!;

    const chartPromises = Array.from(symbols).map(async (sym) => {
        const data = useExternalMarketData
            ? await fetchYahooChart(sym, earliestDateStr, { useExternalMarketData })
            : [];
        return { sym, data };
    });

    const charts = await Promise.all(chartPromises);

    charts.forEach(chart => {
        if (chart.data.length === 0) {
            chart.data = generateFallbackChart(chart.sym, securityTransactions, earliestDateStr);
        }
    });

    const priceLookup: Record<string, Record<string, number>> = {};
    charts.forEach(({ sym, data }) => {
        priceLookup[sym] = {};
        data.forEach(point => {
            priceLookup[sym]![point.date] = point.price;
        });
    });

    const startDate = new Date(earliestDateStr);
    const endDate = new Date();
    const dateRange: string[] = [];
    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
        dateRange.push(date.toISOString().split('T')[0]!);
    }

    const history: PortfolioChartPoint[] = [];
    const currentShares: Record<string, number> = {};
    const averageCost: Record<string, number> = {};
    const lastKnownPrices: Record<string, number> = {};
    const cashFlows: CashFlow[] = [];
    let cashBalance = 0;
    let txIndex = 0;
    let cumulativeReturnFactor = 1;
    let previousHoldingsValue = 0;

    for (const dateStr of dateRange) {
        let externalFlowToday = 0;
        let incomeToday = 0;

        while (txIndex < relevantTransactions.length && getDate(relevantTransactions[txIndex]!) <= dateStr) {
            const tx = relevantTransactions[txIndex]!;
            const type = normalizeTransactionType(tx.type);
            const sym = tx.symbol;
            const quantityDelta = getTradeQuantityDelta(tx);

            if (isIncomeTransaction(tx)) {
                const netIncome = getNetAmount(tx);
                cashBalance += netIncome;
                incomeToday += netIncome;
                if (netIncome > 0) {
                    cashFlows.push({ date: getDate(tx), amount: netIncome });
                }
                txIndex++;
                continue;
            }

            if (!sym && isStandaloneCashAdjustment(type)) {
                cashBalance += getSignedAmount(tx) ?? 0;
                txIndex++;
                continue;
            }

            if (!sym && getSignedAmount(tx) !== null) {
                cashBalance += getSignedAmount(tx)!;
                txIndex++;
                continue;
            }

            if (sym && quantityDelta !== null && symbols.has(sym)) {
                if (!currentShares[sym]) {
                    currentShares[sym] = 0;
                    averageCost[sym] = 0;
                }

                const currentPrice = getUnitPrice(tx, lastKnownPrices[sym] || averageCost[sym] || 0);
                if (currentPrice > 0) {
                    lastKnownPrices[sym] = currentPrice;
                }

                if (isRatioChangeLike(type)) {
                    const previousCostBasis = currentShares[sym]! * averageCost[sym]!;
                    currentShares[sym] = Math.max(0, currentShares[sym]! + quantityDelta);
                    averageCost[sym] = currentShares[sym]! > 0 ? previousCostBasis / currentShares[sym]! : 0;
                    txIndex++;
                    continue;
                }

                if (quantityDelta > 0) {
                    const quantity = quantityDelta;
                    const contributionValue = getFallbackTradeValue(tx, quantity);
                    const previousCostBasis = currentShares[sym]! * averageCost[sym]!;

                    currentShares[sym] += quantity;
                    averageCost[sym] = currentShares[sym]! > 0
                        ? (previousCostBasis + contributionValue) / currentShares[sym]!
                        : 0;

                    if (isBuyLike(type)) {
                        externalFlowToday += contributionValue;
                        cashBalance -= contributionValue;
                        if (contributionValue > 0) {
                            cashFlows.push({ date: getDate(tx), amount: -contributionValue });
                        }
                    } else if (isTransferInLike(type)) {
                        externalFlowToday += contributionValue;
                        if (contributionValue > 0) {
                            cashFlows.push({ date: getDate(tx), amount: -contributionValue });
                        }
                    }
                } else if (quantityDelta < 0) {
                    const quantity = Math.abs(quantityDelta);
                    const heldBeforeDebit = currentShares[sym]!;
                    const debitedQuantity = Math.min(quantity, heldBeforeDebit);
                    const debitValue = debitedQuantity * (currentPrice || averageCost[sym] || 0);
                    const netCashAmount = getNetAmount(tx);
                    const cashWithdrawal = netCashAmount > 0 ? netCashAmount : debitValue;

                    currentShares[sym] = Math.max(0, heldBeforeDebit - quantity);

                    if (currentShares[sym]! === 0) {
                        averageCost[sym] = 0;
                    }

                    if (isSellLike(type) || isRedemptionLike(type)) {
                        externalFlowToday -= cashWithdrawal;
                        cashBalance += cashWithdrawal;
                        if (cashWithdrawal > 0) {
                            cashFlows.push({ date: getDate(tx), amount: cashWithdrawal });
                        }
                    } else if (isTransferOutLike(type)) {
                        externalFlowToday -= debitValue;
                        if (debitValue > 0) {
                            cashFlows.push({ date: getDate(tx), amount: debitValue });
                        }
                    } else if (isWorthlessLike(type)) {
                        // No external flow: the value loss remains in performance.
                    }
                }
            }

            txIndex++;
        }

        let dailyHoldingsValue = 0;
        const dataPoint: PortfolioChartPoint = {
            date: dateStr,
            absoluteValue: 0,
            relativeReturn: 0,
            cashBalance
        };

        for (const sym of symbols) {
            const shares = currentShares[sym] || 0;
            const avgCost = averageCost[sym] || 0;

            if (shares > 0) {
                const priceToday = priceLookup[sym]?.[dateStr];
                if (priceToday !== undefined) {
                    lastKnownPrices[sym] = priceToday;
                }

                const currentPrice = lastKnownPrices[sym] || avgCost;
                const assetAbsolute = shares * currentPrice;

                dailyHoldingsValue += assetAbsolute;
                dataPoint[`${sym}_absolute`] = assetAbsolute;
                dataPoint[`${sym}_relative`] = avgCost > 0 ? ((currentPrice / avgCost) - 1) * 100 : 0;
            } else {
                dataPoint[`${sym}_absolute`] = 0;
                dataPoint[`${sym}_relative`] = 0;
            }
        }

        if (previousHoldingsValue > 0) {
            const dailyReturn = ((dailyHoldingsValue + incomeToday - externalFlowToday) / previousHoldingsValue) - 1;
            if (Number.isFinite(dailyReturn) && dailyReturn > -1) {
                cumulativeReturnFactor *= (1 + dailyReturn);
            }
        }

        dataPoint.absoluteValue = dailyHoldingsValue;
        dataPoint.relativeReturn = (cumulativeReturnFactor - 1) * 100;
        history.push(dataPoint);
        previousHoldingsValue = dailyHoldingsValue;
    }

    const finalValue = Number(history[history.length - 1]?.absoluteValue || 0);
    if (finalValue > 0) {
        cashFlows.push({ date: history[history.length - 1]!.date, amount: finalValue });
    }

    return {
        history,
        yearlyRois: buildYearlyTwrReturns(history),
        symbols: Array.from(symbols),
        symbolNames,
        xirr: calculateXirr(cashFlows),
        cashBalance
    };
}
