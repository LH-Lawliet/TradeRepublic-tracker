import type { Transaction } from "./types";
import { getFeeAmount, getNetAmount, getTaxAmount, isIncomeTransaction, normalizeTransactionType } from "./finance";
import { getCategoryFromMcc, getCategoryLogo } from "./mcc";

export interface ExpenseRecord {
    id: string;
    date: string;
    merchant: string;
    amount: number;
    category: string;
    color: string;
    logoUrl: string;
}

export interface MonthlyExpenseChartData {
    month: string;
    total: number;
    [category: string]: string | number;
}

export interface CashMovementRecord {
    id: string;
    date: string;
    label: string;
    category: string;
    amount: number;
    color: string;
}

export interface CashBalancePoint {
    date: string;
    balance: number;
}

function getTransactionDate(tx: Transaction): string {
    return String(tx.date || tx.datetime || "").split("T")[0] || "";
}

function getSignedCashAmount(tx: Transaction): number {
    const rawAmount = Number(tx.amount);
    if (!Number.isFinite(rawAmount) || rawAmount === 0) {
        return 0;
    }

    const deductions = getTaxAmount(tx) + getFeeAmount(tx);
    if (isIncomeTransaction(tx)) {
        return getNetAmount(tx);
    }

    if (rawAmount > 0) {
        return Math.max(0, rawAmount - deductions);
    }

    return rawAmount - deductions;
}

function isSecurityTransaction(tx: Transaction): boolean {
    const type = normalizeTransactionType(tx.type);
    return Boolean(tx.symbol && tx.shares) ||
        type.includes("BUY") ||
        type.includes("SELL") ||
        type.includes("SPLIT") ||
        type.includes("MERGER") ||
        type.includes("FUSION") ||
        type.includes("REDEMPTION") ||
        type.includes("TILGUNG") ||
        type.includes("MATURITY");
}

function classifyCashMovement(tx: Transaction, amount: number): { category: string; color: string } {
    const type = normalizeTransactionType(tx.type);

    if (isIncomeTransaction(tx)) {
        return { category: "Interest & Dividends", color: "#22c55e" };
    }

    if (type.includes("TRANSFER") || type.includes("INBOUND") || type.includes("CUSTOMER") || type.includes("MANUAL_CASH")) {
        return amount >= 0
            ? { category: "Deposits", color: "#10b981" }
            : { category: "Withdrawals", color: "#f97316" };
    }

    if (type.includes("FEE") || type.includes("TAX")) {
        return { category: "Fees & Taxes", color: "#ef4444" };
    }

    if (tx.mcc_code) {
        const category = getCategoryFromMcc(tx.mcc_code);
        return { category: category.label, color: category.color };
    }

    return amount >= 0
        ? { category: "Other Income", color: "#38bdf8" }
        : { category: "Other Outflows", color: "#cbd5e1" };
}

export function processCashTransactions(transactions: Transaction[]) {
    const expenseTxs = transactions.filter(t =>
        t.category === "CASH" &&
        ["CARD_TRANSACTION", "CARD_TRANSACTION_INTERNATIONAL", "TRANSFER_DIRECT_DEBIT_INBOUND"].includes(t.type) &&
        t.amount !== null && t.amount < 0
    );

    const expenses: ExpenseRecord[] = expenseTxs.map((t, index) => {
        const merchantName = t.name || "Unknown";

        const catInfo = getCategoryFromMcc(t.mcc_code);
        const logoUrl = getCategoryLogo(catInfo.label);

        return {
            // Generate a fallback ID using datetime and name since transaction_id doesn't exist
            id: `${getTransactionDate(t)}-${merchantName.replace(/\s+/g, '-')}-${index}`,
            date: getTransactionDate(t),
            merchant: merchantName,
            amount: Math.abs(Number(t.amount)),
            category: catInfo.label,
            color: catInfo.color,
            logoUrl
        };
    });

    // Sort chronologically (newest first)
    expenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Group by Month for the Chart
    const monthlyMap: Record<string, MonthlyExpenseChartData> = {};

    expenses.forEach(exp => {
        const month = exp.date.substring(0, 7);
        if (!monthlyMap[month]) {
            monthlyMap[month] = { month, total: 0 };
        }
        monthlyMap[month].total += exp.amount;
        monthlyMap[month][exp.category] = ((monthlyMap[month][exp.category] as number) || 0) + exp.amount;
    });

    const chartData = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));
    const uniqueCategories = Array.from(new Set(expenses.map(e => e.category)));

    const cashEffects = transactions
        .map((tx, index) => ({
            tx,
            index,
            date: getTransactionDate(tx),
            amount: getSignedCashAmount(tx)
        }))
        .filter(entry => entry.date && entry.amount !== 0)
        .sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index);

    let runningBalance = 0;
    const dailyBalances: Record<string, number> = {};

    cashEffects.forEach(entry => {
        runningBalance += entry.amount;
        dailyBalances[entry.date] = runningBalance;
    });

    const cashBalanceData: CashBalancePoint[] = Object.entries(dailyBalances)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, balance]) => ({ date, balance }));

    const cashMovements: CashMovementRecord[] = cashEffects
        .filter(entry => !isSecurityTransaction(entry.tx))
        .map(entry => {
            const movement = classifyCashMovement(entry.tx, entry.amount);
            return {
                id: `${entry.date}-${entry.index}`,
                date: entry.date,
                label: entry.tx.name || entry.tx.type || "Cash movement",
                category: movement.category,
                amount: entry.amount,
                color: movement.color
            };
        })
        .sort((a, b) => b.date.localeCompare(a.date));

    const currentCashBalance = cashBalanceData[cashBalanceData.length - 1]?.balance ?? 0;

    return { expenses, chartData, uniqueCategories, cashMovements, cashBalanceData, currentCashBalance };
}
