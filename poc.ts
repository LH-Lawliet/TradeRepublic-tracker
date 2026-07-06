import { parse } from "papaparse";
import * as asciichart from 'asciichart';

// Core Interfaces & Types
export interface Transaction {
    datetime: string;
    date: string;
    account_type: string;
    category: string;
    type: string;
    asset_class: string;
    name: string;
    symbol: string;
    shares: number | string | null;
    price: number | string | null;
    amount: number | null;
    fee: number | string | null;
    tax: number | string | null;
    currency: string;
    original_amount: number | string | null;
    original_currency: string;
    fx_rate: number | string | null;
    description: string;
    transaction_id: string;
    counterparty_name: string;
    counterparty_iban: string;
    payment_reference: string;
    mcc_code: string;
}

// Expanded financial buckets
export type TransactionCategory =
    | "DAILY_SPENDING"
    | "ATM_WITHDRAWAL"
    | "INCOME_AND_REWARDS"
    | "TRADING_PEA"
    | "TRADING_CTO"
    | "TRADING_CRYPTO"
    | "PRIVATE_EQUITY"
    | "CASH_IN_OUT"
    | "INTERNAL_TRANSFERS"
    | "CORPORATE_ACTIONS"
    | "FEES_AND_TAXES"
    | "UNCLASSIFIED";

export interface Position {
    Name: string;
    Symbol: string;
    Account: string;
    Quantity: number;
    Price?: number;
    TotalValue?: number;
    PendingCash?: number;
}

// Add a routing map for assets that Tradegate can't handle
const SPECIAL_ROUTING: Record<string, { type: "CRYPTO" | "FUND" | "DERIVATIVE", query?: string }> = {
    "BTC": { type: "CRYPTO", query: "BTC-EUR" },
    "ETH": { type: "CRYPTO", query: "ETH-EUR" },
    // Private Equity ELTIFs (Apollo & EQT)
    "LU3170240538": { type: "FUND" },
    "LU3176111881": { type: "FUND" },
    // Société Générale Derivative
    "DE000SQ4SUP9": { type: "DERIVATIVE" }
};

// The updated routing function
export function categorizeTransaction(tx: Transaction): TransactionCategory {
    if (["CARD_TRANSACTION", "CARD_TRANSACTION_INTERNATIONAL"].includes(tx.type)) {
        if (tx.mcc_code === "6011") return "ATM_WITHDRAWAL";
        return "DAILY_SPENDING";
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
    if ([
        "TRANSFER_INSTANT_INBOUND", "TRANSFER_INBOUND", "TRANSFER_DIRECT_DEBIT_INBOUND",
        "CUSTOMER_INBOUND", "TRANSFER_INSTANT_OUTBOUND", "MANUAL_CASH_TRANSFER"
    ].includes(tx.type)) {
        return "CASH_IN_OUT";
    }
    if (["TRANSFER_IN", "TRANSFER_OUT"].includes(tx.type)) {
        return "INTERNAL_TRANSFERS";
    }
    if (["SPLIT", "FREE_RECEIPT"].includes(tx.type)) {
        return "CORPORATE_ACTIONS";
    }
    if (["CARD_ORDERING_FEE", "TAX_OPTIMIZATION"].includes(tx.type)) {
        return "FEES_AND_TAXES";
    }
    return "UNCLASSIFIED";
}

// Helper to relabel the "Account" column based on asset types
function getPositionCategory(tx: Transaction): string {
    if (tx.asset_class === "CRYPTO" || tx.symbol === "BTC" || tx.symbol === "ETH") return "CRYPTO";
    if (tx.asset_class === "BOND") return "BOND";
    if (tx.asset_class === "PRIVATE_FUND") return "PRIVATE_EQUITY";

    return tx.account_type; // Keeps it as "DEFAULT" or "PEA" for regular stocks/ETFs
}

function calculatePositions(transactions: Transaction[]): Position[] {
    const map: Record<string, Position> = {};

    for (const tx of transactions) {
        const posCategory = getPositionCategory(tx);
        const key = `${posCategory}_${tx.symbol || tx.name}`;

        if (!map[key]) {
            map[key] = {
                Name: tx.name,
                Symbol: tx.symbol || "-",
                Account: posCategory,
                Quantity: 0,
                Price: 0,
                PendingCash: 0 // Initialize
            };
        }

        // --- Intercept Private Equity Pre-payments ---
        if (tx.category === "CASH" && tx.type === "PRIVATE_MARKET_BUY" && tx.amount) {
            // Add the locked cash to PendingCash (amount is negative, so use Math.abs)
            map[key].PendingCash! += Math.abs(Number(tx.amount));
            continue;
        }

        // Ignore all other CASH events (like standard dividends)
        if (tx.category === "CASH") continue;

        if (!tx.shares) continue;

        let qty = Number(tx.shares);
        map[key].Quantity = Math.round((map[key].Quantity + qty) * 1000000) / 1000000;

        // --- Resolve Pending Cash on Execution ---
        if (tx.type === "BUY" && tx.price) {
            // Subtract the exact cost of the executed trade from the pending balance
            const executionCost = qty * Number(tx.price);
            map[key].PendingCash! -= executionCost;
        }

        if (tx.price && Number(tx.price) > 0) {
            map[key].Price = Number(tx.price);
        }
    }

    return Object.values(map)
        .map(p => {
            // Clean up any weird floating point math dust (e.g., 0.000000001)
            p.PendingCash = Math.max(0, Math.round(p.PendingCash! * 100) / 100);
            return p;
        })
        // Keep positions if they have shares OR if they have pending cash waiting to execute
        .filter(p => p.Quantity > 0.000001 || p.PendingCash! > 0.01)
        .sort((a, b) => a.Name.localeCompare(b.Name));
}

async function fetchAndEnrichPositions(positions: Position[]): Promise<Position[]> {
    try {
        const results = await Promise.all(
            positions.map(async (pos) => {
                const isinOrSymbol = pos.Symbol;

                if (isinOrSymbol === "-") {
                    return { symbol: isinOrSymbol, price: 0 };
                }

                const routingConfig = SPECIAL_ROUTING[isinOrSymbol];

                try {
                    // --- STRATEGY 1: CRYPTO (Coinbase API) ---
                    if (routingConfig?.type === "CRYPTO") {
                        const ticker = routingConfig.query!;
                        const response = await fetch(`https://api.coinbase.com/v2/prices/${ticker}/spot`);
                        if (!response.ok) throw new Error(`Coinbase HTTP ${response.status}`);

                        const json = (await response.json()) as { data: { amount: string } };
                        return {
                            symbol: isinOrSymbol,
                            price: parseFloat(json.data.amount)
                        };
                    }

                    // --- STRATEGY 2: FUNDS & DERIVATIVES (Scraping Aggregator) ---
                    if (routingConfig?.type === "FUND" || routingConfig?.type === "DERIVATIVE") {
                        // Ariva.de is reliable for European ISINs and has a predictable HTML structure
                        const response = await fetch(`https://www.ariva.de/${isinOrSymbol}`, {
                            headers: {
                                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                            }
                        });
                        if (!response.ok) throw new Error(`Ariva HTTP ${response.status}`);

                        const html = await response.text();

                        // Look for the standard schema.org price tag Ariva uses
                        const priceMatch = html.match(/itemprop="price" content="([\d.]+)"/);
                        if (priceMatch && priceMatch[1]) {
                            return { symbol: isinOrSymbol, price: parseFloat(priceMatch[1]) };
                        } else {
                            console.warn(`⚠️ No price found on Aggregator for: ${pos.Name} (${isinOrSymbol})`);
                            return { symbol: isinOrSymbol, price: 0 };
                        }
                    }

                    // --- STRATEGY 3: REGULAR STOCKS/ETFs (Tradegate) ---
                    const response = await fetch(`https://www.tradegate.de/orderbuch.php?isin=${isinOrSymbol}`);
                    if (!response.ok) throw new Error(`Tradegate HTTP ${response.status}`);

                    const html = await response.text();
                    const lastPriceMatch = html.match(/id="last">([\d\s.,]+)<\//);

                    if (lastPriceMatch && lastPriceMatch[1]) {
                        const rawPriceStr = lastPriceMatch[1].replace(/\s/g, '').replace(',', '.');
                        const price = parseFloat(rawPriceStr);
                        return { symbol: isinOrSymbol, price };
                    } else {
                        console.warn(`⚠️ No price found on Tradegate for: ${pos.Name} (${isinOrSymbol})`);
                        return { symbol: isinOrSymbol, price: 0 };
                    }

                } catch (innerErr) {
                    console.warn(`⚠️ Error fetching data for ${pos.Name} (${isinOrSymbol}):`, (innerErr as Error).message);
                    return { symbol: isinOrSymbol, price: 0 };
                }
            })
        );

        return positions.map(pos => {
            const found = results.find(r => r.symbol === pos.Symbol);

            const marketPrice = (found?.price && found.price > 0) ? found.price : pos.Price;
            const finalPrice = marketPrice ?? 0;

            // --- Add PendingCash to the Total Value ---
            const shareValue = pos.Quantity * finalPrice;
            const pending = pos.PendingCash || 0;

            return {
                ...pos,
                Price: finalPrice,
                TotalValue: Math.round((shareValue + pending) * 100) / 100
            };
        });

    } catch (err) {
        console.error("⚠️ Global market fetch failed:", err);
        return positions;
    }
}

function calculateInvestmentsOverTime(transactions: Transaction[]) {
    const monthly: Record<string, number> = {};
    const yearly: Record<string, number> = {};

    // Filter for actual buy events (ignoring savings plan cash transfers, etc.)
    const buyTxs = transactions.filter(t =>
        ["BUY", "PRIVATE_MARKET_BUY", "IPO_SUBSCRIPTION"].includes(t.type) && t.amount
    );

    for (const tx of buyTxs) {
        if (!tx.date) continue; // Safeguard against empty CSV rows

        // The || "" ensures it is always a string, never undefined
        const dateStr = tx.date.split('T')[0] || "";
        if (!dateStr) continue;

        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(0, 7); // Extracts YYYY-MM

        // Buy amounts in TR exports are usually negative, so we take the absolute value
        const invested = Math.abs(Number(tx.amount));

        yearly[year] = (yearly[year] || 0) + invested;
        monthly[month] = (monthly[month] || 0) + invested;
    }

    return { monthly, yearly };
}

function calculateTradeROI(transactions: Transaction[], enrichedPositions: Position[]) {
    // 1. Create a fast lookup for the live prices we just fetched
    const livePrices: Record<string, number> = {};
    for (const pos of enrichedPositions) {
        if (pos.Symbol !== "-" && pos.Price) {
            livePrices[pos.Symbol] = pos.Price;
        }
    }

    // 2. Filter for executed trades that have a defined price and share count
    const buyTxs = transactions.filter(t =>
        ["BUY", "PRIVATE_MARKET_BUY"].includes(t.type) && t.price && t.shares
    );

    const now = new Date().getTime();

    const roiData = buyTxs.map(tx => {
        const buyPrice = Number(tx.price);
        const symbol = tx.symbol || "-";

        // Use live price if we have it, otherwise fallback to buy price (0% ROI)
        const currentPrice = livePrices[symbol] || buyPrice;

        // Date math
        const txDate = new Date(tx.date).getTime();
        const msHeld = now - txDate;
        const daysHeld = Math.max(1, msHeld / (1000 * 60 * 60 * 24)); // Floor to 1 day to avoid Infinity
        const yearsHeld = daysHeld / 365.25;

        // ROI Math
        const absoluteReturn = (currentPrice - buyPrice) / buyPrice;
        // Annualized Return (CAGR) formula
        const annualizedROI = (Math.pow(currentPrice / buyPrice, 1 / yearsHeld) - 1);

        return {
            Date: tx.date ? (tx.date.split('T')[0] || "") : "",
            Name: tx.name.substring(0, 20),
            Symbol: symbol,
            'Invested': `€${Math.abs(Number(tx.amount)).toFixed(2)}`,
            'Buy Price': `€${buyPrice.toFixed(4)}`,
            'Current Price': `€${currentPrice.toFixed(4)}`,
            'Days Held': Math.round(daysHeld),
            'ROI (Abs)': `${(absoluteReturn * 100).toFixed(2)}%`,
            'ROI (Ann)': `${(annualizedROI * 100).toFixed(2)}%`
        };
    });

    // 3. Sort chronologically (oldest trades first)
    return roiData.sort((a, b) => new Date(a.Date || 0).getTime() - new Date(b.Date || 0).getTime());
}

// Execution Logic
const filePath = process.argv[2];

if (!filePath) {
    console.error("❌ Error: No file path provided.");
    console.error("Usage: bun run parse.ts <path_to_your_file.csv>");
    process.exit(1);
}

async function main() {
    try {
        const file = Bun.file(filePath);

        if (!(await file.exists())) {
            console.error(`❌ Error: File not found at '${filePath}'`);
            process.exit(1);
        }

        const text = await file.text();

        const { data, errors } = parse<Transaction>(text, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true,
        });

        if (errors.length > 0) {
            console.warn("⚠️ Warning: Parsed with some errors:", errors);
        }

        console.log(`✅ Successfully parsed ${data.length} transactions.\n`);

        const groupedData = data.reduce((acc, tx) => {
            const category = categorizeTransaction(tx);
            if (!acc[category]) acc[category] = [];
            acc[category].push(tx);
            return acc;
        }, {} as Record<TransactionCategory, Transaction[]>);

        console.log("📊 Transaction Summary:");
        console.log("-----------------------");
        for (const [category, transactions] of Object.entries(groupedData)) {
            const totalVolume = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
            console.log(`${category}:`);
            console.log(`  Count:  ${transactions.length}`);
            console.log(`  Volume: €${totalVolume.toFixed(2)}\n`);
        }

        console.log("\n💼 CURRENT POSITIONS:");
        let positions = calculatePositions(data);
        positions = await fetchAndEnrichPositions(positions);
        console.table(positions);

        // --- Calculate Total Value by Category ---
        console.log("\n💰 PORTFOLIO VALUE SUMMARY:");
        console.log("-----------------------");

        const valueByCategory: Record<string, number> = {};
        let grandTotal = 0;

        for (const pos of positions) {
            const val = pos.TotalValue || 0;
            valueByCategory[pos.Account] = (valueByCategory[pos.Account] || 0) + val;
            grandTotal += val;
        }

        // Print individual category totals
        for (const [acc, val] of Object.entries(valueByCategory)) {
            console.log(`${acc.padEnd(15)}: €${val.toFixed(2)}`);
        }

        console.log("-----------------------");
        console.log(`TOTAL PORTFOLIO: €${grandTotal.toFixed(2)}\n`);

        const { monthly, yearly } = calculateInvestmentsOverTime(data);
        const roiPerTrade = calculateTradeROI(data, positions);

        // --- YEARLY BREAKDOWN ---
        console.log("\n📅 INVESTMENTS PER MONTH:");
        console.log("-----------------------");

        // Sort chronologically and format for the table
        const formattedMonthly = Object.entries(monthly)
            .sort((a, b) => a[0].localeCompare(b[0])) // Ensures '2024-03' comes before '2024-04'
            .map(([month, amount]) => ({
                Month: month,
                Invested: `€${amount.toFixed(2)}`
            }));

        console.table(formattedMonthly);

        // --- CLI PLOTTING (MONTHLY) ---
        console.log("\n📈 MONTHLY INVESTMENT CHART:");
        console.log("-----------------------------");

        const sortedMonths = Object.keys(monthly).sort();
        // Provide a fallback of 0 so TypeScript knows it will absolutely be a number
        const monthlyDataSeries = sortedMonths.map(month => monthly[month] || 0);

        if (monthlyDataSeries.length > 0) {
            // Asciichart needs at least a few data points to look good
            console.log(
                asciichart.plot(monthlyDataSeries, {
                    height: 12,
                    colors: [asciichart.green],
                    format: (x) => `€${x.toFixed(0).padStart(5)}` // Format the Y-axis labels
                })
            );
            console.log(`\nTimeline: ${sortedMonths[0]} ➔ ${sortedMonths[sortedMonths.length - 1]}\n`);
        } else {
            console.log("Not enough monthly data to plot.\n");
        }

        // --- TRADE ROI ---
        console.log("\n🚀 ROI PER TRADE (Sorted by Date):");
        console.log("----------------------------------");
        console.table(roiPerTrade);

    } catch (error) {
        console.error("❌ An unexpected error occurred:", error);
    }
}

main();