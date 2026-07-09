import type { Transaction } from "./types";
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

export function processCashTransactions(transactions: Transaction[]) {
    const expenseTxs = transactions.filter(t =>
        t.category === "CASH" &&
        ["CARD_TRANSACTION", "CARD_TRANSACTION_INTERNATIONAL", "TRANSFER_DIRECT_DEBIT_INBOUND"].includes(t.type) &&
        t.amount !== null && t.amount < 0
    );

    const expenses: ExpenseRecord[] = expenseTxs.map(t => {
        const merchantName = t.name || "Unknown";

        const catInfo = getCategoryFromMcc(t.mcc_code);
        const logoUrl = getCategoryLogo(catInfo.label);

        return {
            // Generate a fallback ID using datetime and name since transaction_id doesn't exist
            id: `${t.datetime}-${merchantName.replace(/\s+/g, '-')}-${Math.random().toString(36).substring(2, 7)}`,
            date: t.date.split('T')[0]!,
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

    return { expenses, chartData, uniqueCategories };
}