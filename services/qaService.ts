import { ZomatoOrder } from '../types';

/**
 * QA Service - handles custom questions from user about their data using local/cloud AI.
 */

async function tryFetchJson(url: string, body: any) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return await res.json();
  return await res.text();
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
  const dataContext = buildDataContext(orders);
  const baseUrl = (typeof window !== 'undefined' && localStorage.getItem('localAi.url')) || 'http://localhost:11434';
  const exactUrl = (typeof window !== 'undefined' && localStorage.getItem('localAi.exactUrl')) || null;
  const configuredModel = (typeof window !== 'undefined' && localStorage.getItem('localAi.model')) || 'llama3';

  const prompt = `You are KitchenOS AI, a strategic analytics assistant for ${userName}'s cloud kitchen.

${dataContext}

USER QUESTION: ${question}

INSTRUCTIONS:
- Answer the question directly and concisely (2-3 sentences).
- Use data context above to provide specific insights.
- If the question is outside the scope of kitchen analytics, politely redirect to relevant topics.
- Keep response under 200 words.`;

  const tryEndpoints = exactUrl ? [exactUrl] : [
    `${baseUrl}/api/generate`,
    `${baseUrl}/api/completions`,
    `${baseUrl}/v1/generate`,
    `${baseUrl}/generate`,
  ];

  const body = {
    model: configuredModel,
    prompt,
    max_tokens: 256,
    temperature: 0.2,
  };

  let lastError: any = null;
  for (const url of tryEndpoints) {
    try {
      const result = await tryFetchJson(url, body);
      if (!result) continue;

      if (typeof result === 'object') {
        // Try various response shapes
        if (result.response && typeof result.response === 'string') {
          return result.response.trim();
        }
        if (result.text && typeof result.text === 'string') {
          return result.text.trim();
        }
        if (result.completion && typeof result.completion === 'string') {
          return result.completion.trim();
        }
        if (result.generations && Array.isArray(result.generations) && result.generations[0]?.text) {
          return result.generations[0].text.trim();
        }
        if (result.choices && Array.isArray(result.choices) && result.choices[0]?.text) {
          return result.choices[0].text.trim();
        }
      }

      if (typeof result === 'string') {
        return result.trim();
      }
    } catch (err) {
      lastError = err;
    }
  }

  // If remote/local model calls fail, use a deterministic local fallback
  try {
    return localAnswerFallback(question, orders);
  } catch (e) {
    throw new Error('AI service unavailable: ' + (lastError?.message || 'unknown'));
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
  
  return `Dataset has ${totalOrders} orders with ₹${totalRevenue.toFixed(2)} revenue. For detailed AI insights, ensure your local LLM is running.`;
}
