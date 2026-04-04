import { ZomatoOrder } from '../types';
import { GoogleGenAI } from '@google/genai';

const geminiApiKey =
  import.meta.env.VITE_GEMINI_API_KEY ||
  (typeof process !== 'undefined' ? process.env.API_KEY : undefined) ||
  (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : undefined) ||
  '';

const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;
const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-2.5-flash'];
const GEMINI_RATE_LIMIT_COOLDOWN_MS = 60 * 1000;
const QA_CACHE_TTL_MS = 2 * 60 * 1000;
const QA_COOLDOWN_KEY = 'gemini.qa.cooldownUntil';

const qaCache = new Map<string, { at: number; value: string }>();
const qaInFlight = new Map<string, Promise<string>>();
let qaGeminiCooldownUntil = 0;

export function getQaGeminiCooldownRemainingMs(): number {
  const until = Math.max(qaGeminiCooldownUntil, getPersistentCooldownUntil());
  return Math.max(0, until - Date.now());
}

function getPersistentCooldownUntil(): number {
  if (typeof window === 'undefined') return qaGeminiCooldownUntil;
  const raw = window.localStorage.getItem(QA_COOLDOWN_KEY);
  const parsed = Number(raw || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function setPersistentCooldownUntil(value: number): void {
  qaGeminiCooldownUntil = value;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(QA_COOLDOWN_KEY, String(value));
  }
}

function buildQaCacheKey(question: string, orders: ZomatoOrder[], userName: string): string {
  const total = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0).toFixed(2);
  const latest = orders.reduce((max, o) => Math.max(max, Number(o.orderPlacedAt) || 0), 0);
  return `${userName}|${question.trim().toLowerCase()}|${orders.length}|${total}|${latest}`;
}

function isRateLimitError(err: any): boolean {
  const message = String(err?.message || err || '').toLowerCase();
  const status = Number(err?.status || err?.code || 0);
  return status === 429 || message.includes('429') || message.includes('too many requests') || message.includes('rate limit');
}

function buildDataContext(orders: ZomatoOrder[]): string {
  const totalRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const totalOrders = orders.length;
  const avgRating = orders.filter(o => o.rating).length > 0 
    ? (orders.filter(o => o.rating).reduce((sum, o) => sum + (o.rating || 0), 0) / orders.filter(o => o.rating).length).toFixed(2)
    : 'N/A';

  const itemsMap: Record<string, number> = {};
  orders.forEach(o => {
    if (o.items) {
      const parts = o.items.split(',');
      parts.forEach(p => {
        const name = p.replace(/^\d+\s*[xX]\s*/, '').trim();
        itemsMap[name] = (itemsMap[name] || 0) + 1;
      });
    }
  });
  const topItems = Object.entries(itemsMap).sort((a,b)=>b[1]-a[1]).slice(0,5).map(x => `${x[0]} (${x[1]} times)`).join(', ');

  return `DATASET CONTEXT:
- Total Orders: ${totalOrders}
- Total Revenue: ₹${totalRevenue.toFixed(2)}
- Average Rating: ${avgRating}/5
- Top Items: ${topItems}
- Zomato Commission Rate: ~35%
- Net Revenue (approx): ₹${(totalRevenue * 0.65).toFixed(2)}`;
}

export async function askAI(question: string, orders: ZomatoOrder[], userName: string): Promise<string> {
  const cacheKey = buildQaCacheKey(question, orders, userName);
  const cached = qaCache.get(cacheKey);
  if (cached && (Date.now() - cached.at) < QA_CACHE_TTL_MS) {
    return cached.value;
  }

  const existing = qaInFlight.get(cacheKey);
  if (existing) return existing;

  const dataContext = buildDataContext(orders);

  const prompt = `You are KitchenOS AI, a strategic analytics assistant for ${userName}'s cloud kitchen.

${dataContext}

USER QUESTION: ${question}

INSTRUCTIONS:
- Answer the question directly and concisely (2-3 sentences).
- Use data context above to provide specific insights.
- If the question is outside the scope of kitchen analytics, politely redirect to relevant topics.
- Keep response under 200 words.`;

  const run = (async (): Promise<string> => {
    if (ai) {
      const cooldownUntil = Math.max(qaGeminiCooldownUntil, getPersistentCooldownUntil());
      if (Date.now() < cooldownUntil) {
        const waitSec = Math.ceil((cooldownUntil - Date.now()) / 1000);
        console.warn(`Gemini Q&A cooldown active. Retrying cloud model in ~${waitSec}s.`);
      } else {
        try {
          for (const model of GEMINI_MODELS) {
            const response = await ai.models.generateContent({
              model,
              contents: prompt,
            });

            const text = response.text?.trim();
            if (text) {
              qaCache.set(cacheKey, { at: Date.now(), value: text });
              return text;
            }
          }
        } catch (err) {
          if (isRateLimitError(err)) {
            setPersistentCooldownUntil(Date.now() + GEMINI_RATE_LIMIT_COOLDOWN_MS);
          }
          console.warn('Gemini Q&A failed, using deterministic fallback:', err);
        }
      }
    }

    const fallback = localAnswerFallback(question, orders);
    qaCache.set(cacheKey, { at: Date.now(), value: fallback });
    return fallback;
  })();

  qaInFlight.set(cacheKey, run);
  try {
    return await run;
  } finally {
    qaInFlight.delete(cacheKey);
  }
}

function localAnswerFallback(question: string, orders: ZomatoOrder[]): string {
  // Simple heuristic-based answers using dataset
  const q = question.toLowerCase();
  const totalRevenue = orders.reduce((s, o) => s + (o.totalAmount || 0), 0);
  const totalOrders = orders.length;
  const itemsMap: Record<string, number> = {};
  orders.forEach(o => {
    if (o.items) {
      o.items.split(',').forEach(p => {
        const name = p.replace(/^\d+\s*[xX]\s*/, '').trim();
        if (name) itemsMap[name] = (itemsMap[name] || 0) + 1;
      });
    }
  });
  const topItems = Object.entries(itemsMap).sort((a,b)=>b[1]-a[1]);

  if (q.includes('top item') || q.includes('top items') || q.includes('best seller') || q.includes('popular')) {
    if (topItems.length === 0) return 'No item data in your dataset.';
    const top = topItems.slice(0,3).map(t => `${t[0]} (${t[1]} orders)`).join(', ');
    return `Your best sellers are: ${top}. Consider promoting these items to boost revenue.`;
  }

  if (q.includes('revenue') || q.includes('gross') || q.includes('total')) {
    return `Total revenue: ₹${totalRevenue.toFixed(2)} from ${totalOrders} orders. Average order value: ₹${(totalRevenue/totalOrders).toFixed(2)}.`;
  }

  if (q.includes('rating') || q.includes('customer') || q.includes('satisfaction')) {
    const rated = orders.filter(o => typeof o.rating === 'number');
    if (rated.length === 0) return 'No rating data available yet. Encourage customers to rate orders.';
    const avg = (rated.reduce((s,o) => s + (o.rating||0), 0) / rated.length).toFixed(2);
    return `Average rating: ${avg}/5 from ${rated.length} rated orders. Focus on consistency to improve.`;
  }

  if (q.includes('profit') || q.includes('zomato') || q.includes('commission') || q.includes('net')) {
    const commission = totalRevenue * 0.35;
    const net = totalRevenue - commission;
    return `Gross: ₹${totalRevenue.toFixed(2)} | Zomato cut (35%): ₹${commission.toFixed(2)} | Your net: ₹${net.toFixed(2)}.`;
  }

  if (q.includes('low') || q.includes('bad') || q.includes('improve') || q.includes('increase')) {
    const rated = orders.filter(o => typeof o.rating === 'number');
    if (rated.length > 0) {
      const avg = rated.reduce((s,o) => s + (o.rating||0), 0) / rated.length;
      if (avg < 4) return 'Your ratings are below 4/5. Prioritize faster delivery and consistent quality to improve customer satisfaction.';
    }
    if (topItems.length > 0) {
      const lowSellers = topItems.slice(-3).map(t => t[0]).join(', ');
      return `Low-performing items: ${lowSellers}. Consider removing or repositioning these on your menu.`;
    }
    return 'Review your operations for delivery speed and food quality improvements.';
  }

  // Generic fallback with top item suggestion
  if (topItems.length > 0) {
    return `Based on your data: ${topItems[0][0]} is your top seller. Total orders: ${totalOrders}, Revenue: ₹${totalRevenue.toFixed(2)}.`;
  }
  
  return `Dataset has ${totalOrders} orders with ₹${totalRevenue.toFixed(2)} revenue. For richer responses, ensure Gemini API key is configured.`;
}
