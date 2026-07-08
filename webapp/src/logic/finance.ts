import type { Transaction, TransactionCategory, Position, RoiRecord, ChartPoint } from "./types";

export function categorizeTransaction(tx: Transaction): TransactionCategory {
    if (["CARD_TRANSACTION", "CARD_TRANSACTION_INTERNATIONAL"].includes(tx.type)) {
        return tx.mcc_code === "6011" ? "ATM_WITHDRAWAL" : "DAILY_SPENDING";
    }
    if (["DIVIDEND", "INTEREST_PAYMENT", "BENEFITS_SAVEBACK", "PEA_MARKETING", "BONUS", "GIFT"].includes(tx.type)) {
        return "INCOME_AND_REWARDS";
    }
    if (tx.category === "TRADING" || ["PRIVATE_MARKET_BUY", "IPO_SUBSCRIPTION"].includes(tx.type)) {
        if (tx.asset_class === "CRYPTO") return "TRADING_CRYPTO";
        if (tx.asset_class === "PRIVATE_FUND" || tx.type === "PRIVATE_MARKET_BUY") return "PRIVATE_EQUITY";
        if (tx.account_type === "PEA") return "TRADING_PEA";
        return "TRADING_CTO";
    }
    if (["TRANSFER_INSTANT_INBOUND", "TRANSFER_INBOUND", "CUSTOMER_INBOUND", "MANUAL_CASH_TRANSFER"].includes(tx.type)) {
        return "CASH_IN_OUT";
    }
    if (["TRANSFER_IN", "TRANSFER_OUT"].includes(tx.type)) return "INTERNAL_TRANSFERS";
    if (["SPLIT", "FREE_RECEIPT"].includes(tx.type)) return "CORPORATE_ACTIONS";
    if (["CARD_ORDERING_FEE", "TAX_OPTIMIZATION"].includes(tx.type)) return "FEES_AND_TAXES";

    return "UNCLASSIFIED";
}

function getPositionCategory(tx: Transaction): string {
    if (tx.asset_class === "CRYPTO" || tx.symbol === "BTC" || tx.symbol === "ETH") return "CRYPTO";
    if (tx.asset_class === "BOND") return "BOND";
    if (tx.asset_class === "PRIVATE_FUND") return "PRIVATE_EQUITY";
    return tx.account_type;
}

export function calculatePositions(transactions: Transaction[]): Position[] {
    const map: Record<string, Position> = {};

    for (const tx of transactions) {
        const posCategory = getPositionCategory(tx);
        const key = `${posCategory}_${tx.symbol || tx.name}`;

        if (!map[key]) {
            map[key] = {
                Name: tx.name, Symbol: tx.symbol || "-", Account: posCategory,
                Quantity: 0, Price: 0, TotalValue: 0, PendingCash: 0
            };
        }

        if (tx.category === "CASH" && tx.type === "PRIVATE_MARKET_BUY" && tx.amount) {
            map[key].PendingCash += Math.abs(Number(tx.amount));
            continue;
        }

        if (tx.category === "CASH" || !tx.shares) continue;

        const qty = Number(tx.shares);
        map[key].Quantity = Math.round((map[key].Quantity + qty) * 1000000) / 1000000;

        if (tx.type === "BUY" && tx.price) {
            map[key].PendingCash -= (qty * Number(tx.price));
        }

        if (tx.price && Number(tx.price) > 0) {
            map[key].Price = Number(tx.price);
        }
    }

    return Object.values(map)
        .map(p => {
            p.PendingCash = Math.max(0, Math.round(p.PendingCash * 100) / 100);
            p.TotalValue = Math.round(((p.Quantity * p.Price) + p.PendingCash) * 100) / 100;
            return p;
        })
        .filter(p => p.Quantity > 0.000001 || p.PendingCash > 0.01)
        .sort((a, b) => a.Name.localeCompare(b.Name));
}

export function calculateAssetROI(transactions: Transaction[], symbol: string, currentPrice: number): RoiRecord[] {
    const assetTxs = transactions.filter(t =>
        (t.symbol === symbol) &&
        ["BUY", "PRIVATE_MARKET_BUY", "SELL"].includes(t.type) &&
        t.price && t.shares
    );

    const now = new Date().getTime();

    return assetTxs.map(tx => {
        const buyPrice = Number(tx.price);
        const txDate = new Date(tx.date).getTime();
        const daysHeld = Math.max(1, (now - txDate) / (1000 * 60 * 60 * 24));
        const yearsHeld = daysHeld / 365.25;

        const absoluteReturn = (currentPrice - buyPrice) / buyPrice;
        const annualizedROI = (Math.pow(currentPrice / buyPrice, 1 / yearsHeld) - 1);

        return {
            Date: tx.date.split('T')[0]!,
            Name: tx.name,
            Symbol: symbol,
            Invested: Math.abs(Number(tx.amount)),
            BuyPrice: buyPrice,
            CurrentPrice: currentPrice,
            DaysHeld: Math.round(daysHeld),
            RoiAbs: absoluteReturn,
            RoiAnn: annualizedROI,
            Type: tx.type
        };
    }).sort((a, b) => new Date(a.Date).getTime() - new Date(b.Date).getTime());
}

export function generateFallbackChart(symbol: string, transactions: Transaction[], startDateStr: string): ChartPoint[] {
    // Filter to only transactions with prices for this specific asset
    const assetTxs = transactions
        .filter(t => t.symbol === symbol && t.price && t.date)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (assetTxs.length === 0) return [];

    const startDate = new Date(startDateStr);
    const endDate = new Date();
    const history: ChartPoint[] = [];

    let currentPrice = Number(assetTxs[0]!.price); // Default to the first known price
    let txIndex = 0;

    // Step through time day-by-day
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0]!;

        // If we hit a transaction on or before this day, update the current known price
        while (txIndex < assetTxs.length && assetTxs[txIndex]!.date.split('T')[0]! <= dateStr) {
            currentPrice = Number(assetTxs[txIndex]!.price);
            txIndex++;
        }

        history.push({ date: dateStr, price: currentPrice });
    }

    return history;
}