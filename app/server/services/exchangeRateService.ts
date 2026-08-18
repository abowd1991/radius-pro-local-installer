/**
 * Exchange Rate Service
 * 
 * Fetches live exchange rates from ExchangeRate-API.com (free tier)
 * Supports ILS → USD and USD → USD conversions
 * Caches rates for 1 hour to reduce API calls
 */

// Simple in-memory cache
interface CacheEntry {
  rate: number;
  timestamp: number;
}

const rateCache = new Map<string, CacheEntry>();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

/**
 * Get exchange rate from one currency to another
 * @param from Source currency (ILS or USD)
 * @param to Target currency (USD)
 * @returns Exchange rate (e.g., 1 ILS = 0.27 USD → returns 0.27)
 */
export async function getExchangeRate(from: string, to: string): Promise<number> {
  // If both currencies are the same, return 1
  if (from === to) {
    return 1.0;
  }

  // Check cache first
  const cacheKey = `${from}_${to}`;
  const cached = rateCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log(`[Exchange Rate] Using cached rate for ${from} → ${to}: ${cached.rate}`);
    return cached.rate;
  }

  try {
    // Fetch from ExchangeRate-API.com (free tier - 1500 requests/month)
    const apiUrl = `https://api.exchangerate-api.com/v4/latest/${from}`;
    
    console.log(`[Exchange Rate] Fetching rate from API: ${from} → ${to}`);
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      console.warn(`[Exchange Rate] API returned ${response.status}: ${response.statusText}`);
      throw new Error(`Exchange Rate API unavailable`);
    }

    // Try to parse JSON, handle non-JSON responses
    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      console.warn(`[Exchange Rate] Failed to parse API response as JSON`);
      throw new Error(`Exchange Rate API returned invalid response`);
    }
    
    // Extract the rate
    const rate = data.rates[to];
    
    if (!rate) {
      throw new Error(`Exchange rate not found for ${from} → ${to}`);
    }

    // Cache the result
    rateCache.set(cacheKey, {
      rate,
      timestamp: Date.now(),
    });

    console.log(`[Exchange Rate] Fetched and cached rate for ${from} → ${to}: ${rate}`);
    return rate;
  } catch (error) {
    console.error(`[Exchange Rate] Error fetching rate for ${from} → ${to}:`, error);
    
    // Fallback rates (approximate - last known rates as of Feb 2026)
    const fallbackRates: Record<string, number> = {
      'ILS_USD': 0.27, // 1 ILS ≈ 0.27 USD
      'USD_ILS': 3.70, // 1 USD ≈ 3.70 ILS
    };

    const fallbackRate = fallbackRates[cacheKey];
    
    if (fallbackRate) {
      console.warn(`[Exchange Rate] Using fallback rate for ${from} → ${to}: ${fallbackRate}`);
      return fallbackRate;
    }

    throw new Error(`Failed to fetch exchange rate and no fallback available for ${from} → ${to}`);
  }
}

/**
 * Convert amount from one currency to another
 * @param amount Amount in source currency
 * @param from Source currency
 * @param to Target currency
 * @returns Converted amount in target currency
 */
export async function convertCurrency(
  amount: number,
  from: string,
  to: string
): Promise<number> {
  const rate = await getExchangeRate(from, to);
  const converted = amount * rate;
  
  // Round to 2 decimal places
  return Math.round(converted * 100) / 100;
}

/**
 * Clear the exchange rate cache (useful for testing)
 */
export function clearExchangeRateCache(): void {
  rateCache.clear();
  console.log('[Exchange Rate] Cache cleared');
}
