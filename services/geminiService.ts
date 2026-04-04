
import { GoogleGenAI, Type } from "@google/genai";
import { ZomatoOrder, InsightResponse } from "../types";

const geminiApiKey =
  import.meta.env.VITE_GEMINI_API_KEY ||
  (typeof process !== 'undefined' ? process.env.API_KEY : undefined) ||
  (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : undefined) ||
  '';

const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

const insightCache = new Map<string, { at: number; data: InsightResponse }>();
const inFlightRequests = new Map<string, Promise<InsightResponse>>();
const INSIGHT_CACHE_TTL_MS = 2 * 60 * 1000;
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];
const GEMINI_RATE_LIMIT_COOLDOWN_MS = 60 * 1000;

let geminiCooldownUntil = 0;

export function getInsightsGeminiCooldownRemainingMs(): number {
  return Math.max(0, geminiCooldownUntil - Date.now());
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRateLimitError(err: any): boolean {
  const message = String(err?.message || err || '').toLowerCase();
  const status = Number(err?.status || err?.code || 0);
  return status === 429 || message.includes('429') || message.includes('too many requests') || message.includes('rate limit');
}

function buildInsightCacheKey(userName: string, orders: ZomatoOrder[]): string {
  const total = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0).toFixed(2);
  const latest = orders.reduce((max, o) => Math.max(max, Number(o.orderPlacedAt) || 0), 0);
  return `${userName}|${orders.length}|${total}|${latest}`;
}

function getCooldownErrorMessage(): string {
  const waitMs = Math.max(0, geminiCooldownUntil - Date.now());
  const waitSec = Math.ceil(waitMs / 1000);
  return `Gemini is temporarily rate-limited. Retry in ~${waitSec}s.`;
}

/**
 * Deterministic fallback when Gemini is unavailable.
 */
function localInsightFallback(orders: ZomatoOrder[], userName: string, totalRevenue: number, totalOrders: number, avgRating: string, daysSinceLastOrder: number, topItems: string): InsightResponse {
  const zomatoCommission = totalRevenue * 0.35;
  const netRevenue = totalRevenue - zomatoCommission;
  const isStale = daysSinceLastOrder > 7;

  let demandInsight = '';
  if (topItems) {
    const items = topItems.split(',').map(s => s.trim()).slice(0, 3);
    demandInsight = `Top performers: ${items.join(', ')}. Use these as hero items and build bundles around them to raise average order value.`;
  } else {
    demandInsight = `Insufficient data for demand forecasting. Upload more records to unlock menu optimization.`;
  }

  let customerInsight = '';
  if (avgRating !== 'N/A') {
    const rating = parseFloat(avgRating);
    if (rating >= 4.5) customerInsight = `Excellent rating (${avgRating}/5). Customers are highly satisfied. Maintain current quality and consider premium offerings.`;
    else if (rating >= 4.0) customerInsight = `Good rating (${avgRating}/5). Room for improvement. Focus on consistency and faster delivery times.`;
    else if (rating >= 3.5) customerInsight = `Average rating (${avgRating}/5). Critical feedback on quality or service. Review recent complaints and staff training.`;
    else customerInsight = `Low rating (${avgRating}/5). Urgent action needed. Audit kitchen operations and prioritize quality over volume.`;
  } else {
    customerInsight = `Insufficient ratings data. Encourage customers to rate orders for better insights.`;
  }

  return {
    greeting: `Welcome back, Chef ${userName}. Here's your kitchen snapshot.`,
    alert: isStale ? "Data is older than 7 days. Please upload new CSV for current insights." : undefined,
    demandForecasting: demandInsight,
    customerInsights: customerInsight,
    profitabilityAnalysis: {
      grossRevenue: totalRevenue,
      zomatoCommission: zomatoCommission,
      estimatedNet: netRevenue,
      analysis: netRevenue > 10000 
        ? `Strong profitability: ₹${netRevenue.toLocaleString()} net from ₹${totalRevenue.toLocaleString()} gross. At ${totalOrders} orders, your unit margin is solid. Scale operations to increase absolute profit.`
        : `Tight margins: 35% Zomato cut leaves limited room. Focus on high-margin items and operational efficiency. Consider menu consolidation.`
    },
    recommendations: [
      `Optimize top 3 items: ${topItems.split(',').slice(0, 3).join(', ') || 'Pending data'}`,
      `Target ${Math.round(totalOrders * 1.25)} orders/month via promotions`,
      `Monitor ratings weekly; aim for 4.5+ to reduce churn`
    ]
  };
}

export const analyzeKitchenData = async (orders: ZomatoOrder[], userName: string): Promise<InsightResponse> => {
  if (orders.length === 0) {
    throw new Error('No orders available for analysis.');
  }

  const cacheKey = buildInsightCacheKey(userName, orders);
  const cached = insightCache.get(cacheKey);
  if (cached && (Date.now() - cached.at) < INSIGHT_CACHE_TTL_MS) {
    return cached.data;
  }

  const existing = inFlightRequests.get(cacheKey);
  if (existing) {
    return existing;
  }

  const totalRevenue = orders.reduce((sum, o) => sum + o.totalAmount, 0);
  const totalOrders = orders.length;
  const zomatoCommission = totalRevenue * 0.35;

  const ratedOrders = orders.filter(o => o.rating !== undefined);
  const avgRating = ratedOrders.length > 0 
    ? (ratedOrders.reduce((sum, o) => sum + (o.rating || 0), 0) / ratedOrders.length).toFixed(1)
    : "N/A";

  const timestamps = orders.map(o => o.orderPlacedAt);
  const lastOrderDate = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : new Date();
  const daysSinceLastOrder = Math.floor((Date.now() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24));
  
  // Top Items for context
  const itemsMap: Record<string, number> = {};
  orders.forEach(o => {
      if(o.items) {
          const parts = o.items.split(',');
          parts.forEach(p => {
              const name = p.replace(/^\d+\s*[xX]\s*/, '').trim();
              itemsMap[name] = (itemsMap[name] || 0) + 1;
          });
      }
  });
  const topItems = Object.entries(itemsMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(x => x[0]).join(", ");

  const completedOrders = orders.filter(o => {
    const s = (o.orderStatus || '').toLowerCase();
    return s.includes('deliver') || s.includes('complete');
  }).length;
  const rejectedOrders = orders.filter(o => (o.orderStatus || '').toLowerCase().includes('reject')).length;
  const completionRate = ((completedOrders / Math.max(1, totalOrders)) * 100).toFixed(1);

  const hourlyCounts = new Array(24).fill(0);
  orders.forEach(o => {
    const d = new Date(o.orderPlacedAt);
    if (!Number.isNaN(d.getTime())) hourlyCounts[d.getHours()] += 1;
  });
  const peakHour = hourlyCounts
    .map((count, hour) => ({ hour, count }))
    .sort((a, b) => b.count - a.count)[0];

  const run = (async (): Promise<InsightResponse> => {
    // Primary: Gemini
    if (ai) {
      if (Date.now() < geminiCooldownUntil) {
        console.warn(getCooldownErrorMessage());
      } else {
      try {
        const result = await callGoogleGenAI({
          orders,
          userName,
          totalRevenue,
          zomatoCommission,
          daysSinceLastOrder,
          avgRating,
          topItems,
          completionRate,
          rejectedOrders,
          peakHour: peakHour ? `${peakHour.hour.toString().padStart(2, '0')}:00-${((peakHour.hour + 1) % 24).toString().padStart(2, '0')}:00` : 'N/A',
        });
        insightCache.set(cacheKey, { at: Date.now(), data: result });
        return result;
      } catch (err) {
          if (isRateLimitError(err)) {
            geminiCooldownUntil = Date.now() + GEMINI_RATE_LIMIT_COOLDOWN_MS;
          }
          console.warn('Google GenAI failed:', err?.message || err);
        }
      }
    } else {
      console.info('No Gemini API key found; using deterministic fallback');
    }

    // Fallback: deterministic local analysis
    console.info('✓ Using local fallback analysis');
    const fallback = localInsightFallback(orders, userName, totalRevenue, totalOrders, avgRating, daysSinceLastOrder, topItems);
    insightCache.set(cacheKey, { at: Date.now(), data: fallback });
    return fallback;
  })();

  inFlightRequests.set(cacheKey, run);
  try {
    return await run;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
};

async function callGoogleGenAI(params: {
  orders: ZomatoOrder[];
  userName: string;
  totalRevenue: number;
  zomatoCommission: number;
  daysSinceLastOrder: number;
  avgRating: string;
  topItems: string;
  completionRate: string;
  rejectedOrders: number;
  peakHour: string;
}): Promise<InsightResponse> {
  const {
    orders,
    userName,
    totalRevenue,
    zomatoCommission,
    daysSinceLastOrder,
    avgRating,
    topItems,
    completionRate,
    rejectedOrders,
    peakHour,
  } = params;

  const prompt = `
    You are 'KitchenOS AI', a strategic partner for a Cloud Kitchen owned by ${userName}.
    
    DATA CONTEXT:
    - Gross Revenue: ₹${totalRevenue.toFixed(2)}
    - Zomato Commission (est 35%): ₹${zomatoCommission.toFixed(2)}
    - Total Orders: ${orders.length}
    - Days since last data upload: ${daysSinceLastOrder}
    - Average Rating: ${avgRating}
    - Completion Rate: ${completionRate}%
    - Rejected Orders: ${rejectedOrders}
    - Top Items: ${topItems || 'N/A'}
    - Peak Hour: ${peakHour}

    REQUIREMENTS:
    Provide a JSON response with specific deep-dive sections.
    1. "greeting": A warm, professional greeting to ${userName}.
    2. "alert": If (daysSinceLastOrder > 7), warn that data is stale. Else null.
    3. "demandForecasting": Analyze likely trends and menu optimization.
    4. "customerInsights": Analyze customer satisfaction based on available data.
    5. "profitabilityAnalysis": An object containing numeric values for grossRevenue, zomatoCommission, estimatedNet, and a string "analysis".
    6. "recommendations": 3 actionable steps to improve profitability or ratings.
  `;

  if (!ai) {
    throw new Error('Gemini client not initialized (missing API key).');
  }

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    for (const model of GEMINI_MODELS) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                greeting: { type: Type.STRING },
                alert: { type: Type.STRING },
                demandForecasting: { type: Type.STRING },
                customerInsights: { type: Type.STRING },
                profitabilityAnalysis: {
                    type: Type.OBJECT,
                    properties: {
                        grossRevenue: { type: Type.NUMBER },
                        zomatoCommission: { type: Type.NUMBER },
                        estimatedNet: { type: Type.NUMBER },
                        analysis: { type: Type.STRING }
                    }
                },
                recommendations: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              }
            }
          }
        });

        const text = response.text;
        if (!text) throw new Error("No response from Gemini");
        return JSON.parse(text) as InsightResponse;
      } catch (error) {
        const shouldRetry = isRateLimitError(error) && attempt < maxAttempts;
        if (!shouldRetry && model === GEMINI_MODELS[GEMINI_MODELS.length - 1]) throw error;
      }
    }

    const backoffMs = 800 * Math.pow(2, attempt - 1);
    console.warn(`Gemini rate-limited (attempt ${attempt}/${maxAttempts}), retrying in ${backoffMs}ms`);
    await sleep(backoffMs);
    if (attempt === maxAttempts) {
      geminiCooldownUntil = Date.now() + GEMINI_RATE_LIMIT_COOLDOWN_MS;
    }
  }

  throw new Error('Gemini request failed after retries.');
}
