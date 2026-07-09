// Fallback if the APIs fail
const FALLBACK_CATEGORY = { label: "Other Expenses", color: "#cbd5e1" };

/**
 * A hand-picked, high-contrast color palette for our specific categories.
 * These colors are selected to look cohesive in Recharts while remaining distinct.
 */
const CATEGORY_COLORS: Record<string, string> = {
    "Groceries": "#10b981",          // Emerald Green
    "Dining & Drinks": "#f97316",    // Vibrant Orange
    "Gas & Fuel": "#475569",         // Slate Gray
    "Taxis & Ride Shares": "#eab308",// Taxi Yellow
    "Gambling & Betting": "#7f1d1d", // Dark Red (stands out as a warning color)
    "Airlines": "#0ea5e9",           // Sky Blue
    "Car Rental": "#14b8a6",         // Teal
    "Hotels & Lodging": "#6366f1",   // Indigo
    "Transportation": "#3b82f6",     // Royal Blue
    "Utilities & Telecom": "#06b6d4",// Cyan
    "Shopping & Retail": "#ec4899",  // Pink
    "Financial Services": "#84cc16", // Lime Green
    "Personal Care": "#f43f5e",      // Rose
    "Entertainment": "#a855f7",      // Purple
    "Medical & Health": "#ef4444",   // Red
    "Education": "#d97706",          // Amber
    "Memberships & Orgs": "#1e3a8a", // Navy Blue
    "Government": "#8b5cf6",         // Violet
    "Other": "#cbd5e1"               // Light Gray
};

const CATEGORY_EMOJIS: Record<string, string> = {
    "Groceries": "🛒",
    "Dining & Drinks": "🍽️",
    "Gas & Fuel": "⛽",
    "Taxis & Ride Shares": "🚕",
    "Gambling & Betting": "🎲",
    "Airlines": "✈️",
    "Car Rental": "🚗",
    "Hotels & Lodging": "🏨",
    "Transportation": "🚆",
    "Utilities & Telecom": "📱",
    "Shopping & Retail": "🛍️",
    "Financial Services": "🏦",
    "Personal Care": "🧴",
    "Entertainment": "🎟️",
    "Medical & Health": "🏥",
    "Education": "🎓",
    "Memberships & Orgs": "🆔",
    "Government": "🏛️",
    "Other": "🧾"
};

/**
 * Groups MCC codes into broad, user-friendly categories based on official numeric ranges.
 */
function getBroadCategoryName(mccCode: string): string {
    const mcc = parseInt(mccCode, 10);
    if (isNaN(mcc)) return "Other";

    // 1. High-Priority Finance & Lifestyle Overrides 
    if (mcc >= 5400 && mcc <= 5499) return "Groceries";
    if (mcc >= 5811 && mcc <= 5814) return "Dining & Drinks";
    if (mcc === 5541 || mcc === 5542) return "Gas & Fuel";
    if (mcc === 4121) return "Taxis & Ride Shares";
    if (mcc === 7995 || mcc === 7800 || mcc === 7801 || mcc === 7802) {
        return "Gambling & Betting";
    }

    // 2. Official Block Ranges
    if (mcc >= 3000 && mcc <= 3299) return "Airlines";
    if (mcc >= 3300 && mcc <= 3499) return "Car Rental";
    if (mcc >= 3500 && mcc <= 3999) return "Hotels & Lodging";
    if (mcc >= 4000 && mcc <= 4799) return "Transportation";
    if (mcc >= 4800 && mcc <= 4999) return "Utilities & Telecom";
    if (mcc >= 5000 && mcc <= 5999) return "Shopping & Retail";
    if (mcc >= 6000 && mcc <= 6999) return "Financial Services";
    if (mcc >= 7200 && mcc <= 7299) return "Personal Care";
    if (mcc >= 7800 && mcc <= 7999) return "Entertainment";
    if (mcc >= 8000 && mcc <= 8099) return "Medical & Health";
    if (mcc >= 8200 && mcc <= 8299) return "Education";
    if (mcc >= 8600 && mcc <= 8699) return "Memberships & Orgs";
    if (mcc >= 9000 && mcc <= 9999) return "Government";

    return "Other";
}

/**
 * Maps an MCC code directly to its category label and assigned color.
 */
export function getCategoryFromMcc(mcc: string): { label: string; color: string } {
    if (!mcc) return FALLBACK_CATEGORY;

    const label = getBroadCategoryName(mcc);

    return {
        label,
        color: CATEGORY_COLORS[label] || FALLBACK_CATEGORY.color
    };
}

/**
 * Generates an instant, API-free SVG logo based on the category.
 * Creates a rounded square using the category's specific color and a relevant emoji.
 */
export function getCategoryLogo(categoryName: string): string {
    const emoji = CATEGORY_EMOJIS[categoryName] || CATEGORY_EMOJIS["Other"];
    const bgColor = CATEGORY_COLORS[categoryName] || FALLBACK_CATEGORY.color;

    // Create a simple, clean SVG with a colored background and centered emoji
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
            <rect width="100" height="100" fill="${bgColor}" rx="20" />
            <text x="50%" y="54%" font-size="50" text-anchor="middle" dominant-baseline="middle">
                ${emoji}
            </text>
        </svg>
    `.trim();

    // Return as a base64 encoded data URI so it can be dropped straight into an <img src="...">
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}