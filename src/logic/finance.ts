import type { Transaction, TransactionCategory, Position, RoiRecord, ChartPoint } from "./types";

export function normalizeTransactionType(type: string | null | undefined): string {
    return String(type || "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");
}

function absoluteNumber(value: number | null | undefined): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.abs(numeric) : 0;
}

export function getTaxAmount(tx: Transaction): number {
    return absoluteNumber(tx.tax);
}

export function getFeeAmount(tx: Transaction): number {
    return absoluteNumber(tx.fee);
}

export function getNetAmount(tx: Transaction): number {
    return Math.max(0, absoluteNumber(tx.amount) - getTaxAmount(tx) - getFeeAmount(tx));
}

export function isIncomeTransaction(tx: Transaction): boolean {
    const type = normalizeTransactionType(tx.type);
    return type === "DIVIDEND" || type === "INTEREST" || type === "INTEREST_PAYMENT";
}

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

export function getPositionCategory(tx: Transaction): string {
    if (tx.asset_class === "CRYPTO" || tx.symbol === "BTC" || tx.symbol === "ETH") return "CRYPTO";
    if (tx.asset_class === "BOND") return "BOND";
    if (tx.asset_class === "PRIVATE_FUND") return "PRIVATE_EQUITY";
    return tx.account_type;
}

export function getTradeQuantityDelta(tx: Transaction): number | null {
    const rawShares = Number(tx.shares);
    if (!Number.isFinite(rawShares) || rawShares === 0) {
        return null;
    }

    const quantity = Math.abs(rawShares);
    const type = normalizeTransactionType(tx.type);

    if (type.includes("BUY")) {
        return quantity;
    }

    if (type.includes("SELL")) {
        return -quantity;
    }

    if (
        type.includes("TRANSFER_IN") ||
        type.includes("FREE_RECEIPT") ||
        type.includes("INBOUND") ||
        type.includes("RECEIPT")
    ) {
        return quantity;
    }

    if (
        type.includes("TRANSFER_OUT") ||
        type.includes("OUTBOUND") ||
        type.includes("BOOK_OUT") ||
        type.includes("AUSBUCH") ||
        type.includes("REDEMPTION") ||
        type.includes("TILGUNG") ||
        type.includes("MATURITY") ||
        type.includes("EXPIR") ||
        type.includes("WORTHLESS") ||
        type.includes("DELIST")
    ) {
        return -quantity;
    }

    return rawShares;
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

        const quantityDelta = getTradeQuantityDelta(tx);
        if (quantityDelta === null) continue;

        map[key].Quantity = Math.round((map[key].Quantity + quantityDelta) * 1000000) / 1000000;
        if (map[key].Quantity < 0.000001) {
            map[key].Quantity = 0;
        }

        if (String(tx.type || "").toUpperCase().includes("BUY") && tx.price) {
            map[key].PendingCash -= (Math.abs(quantityDelta) * Number(tx.price));
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
