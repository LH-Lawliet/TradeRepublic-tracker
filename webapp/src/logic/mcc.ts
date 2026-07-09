// Fallback if the APIs fail
const FALLBACK_CATEGORY = { label: "Other Expenses", color: "#cbd5e1" };

// In-memory caches to prevent spamming the APIs on re-renders
let mccCache: Record<string, string> | null = null;
const logoCache = new Map<string, string>();

/**
 * Deterministically generates a consistent color based on a string hash.
 */
function stringToColor(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 70%, 60%)`; // Soft, UI-friendly saturation and lightness
}

/**
 * Fetches all standard MCC descriptions from a public repository.
 */
export async function fetchMccMappings(): Promise<Record<string, string>> {
    if (mccCache) return mccCache;

    try {
        // Fetching an open-source, maintained JSON of MCC codes
        const res = await fetch("https://raw.githubusercontent.com/greggles/mcc-codes/main/mcc_codes.json");
        if (!res.ok) throw new Error("Failed to fetch MCC data");

        const data: { mcc: string; edited_description: string }[] = await res.json();

        mccCache = {};
        data.forEach(item => {
            mccCache![item.mcc] = item.edited_description;
        });

        return mccCache;
    } catch (error) {
        console.warn("Failed to load MCC API, falling back.", error);
        mccCache = {}; // empty cache so we don't endless-loop
        return mccCache;
    }
}

export async function getCategoryFromMcc(mcc: string): Promise<{ label: string; color: string }> {
    const mappings = await fetchMccMappings();
    const label = mappings[mcc];

    if (!label) return FALLBACK_CATEGORY;

    return {
        label,
        color: stringToColor(label)
    };
}

/**
 * Uses Clearbit's Autocomplete Search API to dynamically find a company's logo.
 */
export async function guessLogoUrl(merchantName: string): Promise<string> {
    const cleanName = merchantName.toLowerCase()
        .replace(/pending/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .trim();

    if (!cleanName) return "";
    if (logoCache.has(cleanName)) return logoCache.get(cleanName)!;

    try {
        const res = await fetch(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(cleanName)}`);
        if (!res.ok) return "";

        const suggestions = await res.json();
        if (suggestions && suggestions.length > 0 && suggestions[0].logo) {
            const logo = suggestions[0].logo;
            logoCache.set(cleanName, logo);
            return logo;
        }
    } catch (e) {
        // Silently ignore fetch errors so we don't spam the console
    }

    logoCache.set(cleanName, ""); // Cache the failure
    return "";
}