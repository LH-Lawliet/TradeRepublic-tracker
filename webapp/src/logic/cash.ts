import type { Transaction } from "./types";
import { getCategoryFromMcc, guessLogoUrl } from "./mcc";

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

export async function processCashTransactions(transactions: Transaction[]) {
    const expenseTxs = transactions.filter(t =>
        t.category === "CASH" &&
        ["CARD_TRANSACTION", "CARD_TRANSACTION_INTERNATIONAL", "TRANSFER_DIRECT_DEBIT_INBOUND"].includes(t.type) &&
        t.amount !== null && t.amount < 0
    );

    // Run all API fetches in parallel for speed
    const expenses: ExpenseRecord[] = await Promise.all(expenseTxs.map(async t => {
        const merchantName = t.counterparty_name || t.description || "Unknown";

        // Fetch Category and Logo concurrently
        const [catInfo, logoUrl] = await Promise.all([
            getCategoryFromMcc(t.mcc_code),
            guessLogoUrl(merchantName)
        ]);

        return {
            id: t.transaction_id || Math.random().toString(),
            date: t.date.split('T')[0]!,
            merchant: merchantName,
            amount: Math.abs(Number(t.amount)),
            category: catInfo.label,
            color: catInfo.color,
            logoUrl
        };
    }));

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