/**
 * Core Data Models
 */
export interface Transaction {
    datetime: string;
    date: string;
    account_type: string;
    category: string;
    type: string;
    asset_class: string;
    name: string;
    symbol: string;
    shares: number | null;
    price: number | null;
    amount: number | null;
    fee: number | null;
    tax: number | null;
    currency: string;
    mcc_code: string;
}

export type TransactionCategory =
    | "DAILY_SPENDING" | "ATM_WITHDRAWAL" | "INCOME_AND_REWARDS"
    | "TRADING_PEA" | "TRADING_CTO" | "TRADING_CRYPTO"
    | "PRIVATE_EQUITY" | "CASH_IN_OUT" | "INTERNAL_TRANSFERS"
    | "CORPORATE_ACTIONS" | "FEES_AND_TAXES" | "UNCLASSIFIED";

export interface Position {
    Name: string;
    Symbol: string;
    Account: string;
    Quantity: number;
    Price: number;
    TotalValue: number;
    PendingCash: number;
    TradegateTicker?: string;
    Currency?: string;
}

export interface RoiRecord {
    Date: string;
    Name: string;
    Symbol: string;
    Invested: number;
    BuyPrice: number;
    CurrentPrice: number;
    DaysHeld: number;
    RoiAbs: number;
    RoiAnn: number;
    Type: string;
}

export interface ChartPoint {
    date: string;
    price: number;
}

export interface PortfolioChartPoint {
    date: string;
    absoluteValue: number;
    relativeReturn: number;
    [key: string]: string | number;
}

export interface YearlyRoiData {
    year: string;
    portfolioRoi: number;
    assetRois: Record<string, number>;
}

export interface PortfolioHistoryResult {
    history: PortfolioChartPoint[];
    yearlyRois: YearlyRoiData[];
    symbols?: string[];
    symbolNames?: Record<string, string>;
    xirr?: number | null;
    cashBalance?: number;
}
