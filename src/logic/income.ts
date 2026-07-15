import type { Transaction } from "./types";
import { getFeeAmount, getNetAmount, getTaxAmount } from "./finance";

export type IncomeType = "dividend" | "interest";

export interface IncomeRecord {
    id: string;
    date: string;
    month: string;
    type: IncomeType;
    label: string;
    amount: number;
    grossAmount: number;
    tax: number;
    fee: number;
    asset: string;
}

export interface MonthlyIncomeChartData {
    month: string;
    dividend: number;
    interest: number;
    total: number;
    [key: string]: string | number;
}

export interface IncomeAnalysisResult {
    records: IncomeRecord[];
    chartData: MonthlyIncomeChartData[];
    totalDividend: number;
    totalInterest: number;
    totalIncome: number;
}

const DIVIDEND_TYPES = new Set(["dividend"]);
const INTEREST_TYPES = new Set(["interest", "interest_payment"]);

function normalizeType(type: string | null | undefined) {
    return String(type ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
}

function getIncomeType(type: string): IncomeType | null {
    if (DIVIDEND_TYPES.has(type)) {
        return "dividend";
    }

    if (INTEREST_TYPES.has(type)) {
        return "interest";
    }

    return null;
}

function getTransactionDate(transaction: Transaction) {
    return String(transaction.date || transaction.datetime || "").split("T")[0] || "";
}

export function processIncomeTransactions(transactions: Transaction[]): IncomeAnalysisResult {
    const records: IncomeRecord[] = [];

    transactions.forEach((transaction, index) => {
        const type = getIncomeType(normalizeType(transaction.type));
        const rawAmount = Number(transaction.amount);
        const date = getTransactionDate(transaction);
        const amount = getNetAmount(transaction);

        if (!type || !Number.isFinite(rawAmount) || rawAmount === 0 || amount === 0 || date.length < 7) {
            return;
        }

        const month = date.substring(0, 7);

        records.push({
            id: `${date}-${type}-${index}`,
            date,
            month,
            type,
            label: type === "dividend" ? "Dividend" : "Interest",
            amount,
            grossAmount: Math.abs(rawAmount),
            tax: getTaxAmount(transaction),
            fee: getFeeAmount(transaction),
            asset: transaction.name || transaction.symbol || "-"
        });
    });

    records.sort((a, b) => a.date.localeCompare(b.date));

    const monthlyMap: Record<string, MonthlyIncomeChartData> = {};

    records.forEach((record) => {
        let monthData = monthlyMap[record.month];
        if (!monthData) {
            monthData = { month: record.month, dividend: 0, interest: 0, total: 0 };
            monthlyMap[record.month] = monthData;
        }

        monthData[record.type] += record.amount;
        monthData.total += record.amount;
    });

    const chartData = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));
    const totalDividend = records
        .filter(record => record.type === "dividend")
        .reduce((sum, record) => sum + record.amount, 0);
    const totalInterest = records
        .filter(record => record.type === "interest")
        .reduce((sum, record) => sum + record.amount, 0);

    return {
        records,
        chartData,
        totalDividend,
        totalInterest,
        totalIncome: totalDividend + totalInterest
    };
}
