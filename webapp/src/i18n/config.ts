/**
 * Centralized translation dictionary.
 * Expand this object for additional languages in the future.
 */
export const labels = {
    upload_prompt: "Upload CSV File",
    analyze_stocks: "Analyze Stocks",
    transactions_title: "Loaded Transactions",
    date: "Date",
    type: "Type",
    asset: "Asset",
    amount: "Amount",
    total_portfolio: "Total Portfolio Value",
    category_summary: "Category Summary",
    positions_title: "Positions",
    symbol: "Symbol",
    quantity: "Quantity",
    price: "Price",
    total_value: "Total Value",
    back_to_analysis: "Back to Analysis",
    trade_history: "Trade History",
    roi_abs: "ROI (Abs)",
    roi_ann: "ROI (Ann)",
    days_held: "Days Held",
    loading_chart: "Loading chart data...",
    no_chart_data: "No chart data available.",
    filter_all: "All Categories",
    sort_value_highest: "Highest Value",
    sort_value_lowest: "Lowest Value",
    portfolio_evolution: "Portfolio Evolution",
    portfolio_distribution: "Portfolio Distribution",
    mode_absolute: "Absolute Value (€)",
    mode_relative: "Relative Return (%)",
    chart_merged: "Merged",
    chart_separated: "Separated",
    chart_stacked: "Stacked",
    chart_overlapped: "Overlapped",
    annual_roi_title: "Annualized ROI",
    annual_roi_note: "Calculated by evaluating assets held on January 1st against their value on December 31st (or today). New purchases during the year are excluded to isolate true asset performance from DCA.",
    year: "Year",
    portfolio_roi: "Portfolio ROI",
    average_yearly_roi: "Avg Yearly ROI",
} as const;

export type TranslationKey = keyof typeof labels;

export function t(key: TranslationKey): string {
    return labels[key];
}