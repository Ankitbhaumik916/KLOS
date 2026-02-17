import { ZomatoOrder, InsightResponse } from '../types';

/**
 * agentService — attempts to call a local model (Ollama / phi-3mini) running on the user's machine.
 *
 * Notes for the user:
 * - Ollama typically exposes an HTTP API on http://127.0.0.1:11434. Ensure CORS is enabled or run a small proxy.
 * - You can set a custom URL by storing it in localStorage under `localAi.url` (e.g. "http://127.0.0.1:11434").
 * - This client will try a couple of common Ollama-style endpoints and fall back gracefully.
 */

const DEFAULT_LOCAL_AI = 'http://localhost:11434';
const LOCAL_AI_MODEL_KEY = 'localAi.model';
const LOCAL_AI_EXACT_URL_KEY = 'localAi.exactUrl';

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

function buildPrompt(orders: ZomatoOrder[], userName: string) {
  const totalRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const totalOrders = orders.length;
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
  const topItems = Object.entries(itemsMap).sort((a,b)=>b[1]-a[1]).slice(0,5).map(x=>x[0]).join(', ');

  return `You are KitchenOS AI, an agentic analytics assistant for a cloud kitchen owned by ${userName}.\n\n`+
    `DATA_SUMMARY:\n- GrossRevenue: ₹${totalRevenue.toFixed(2)}\n- TotalOrders: ${totalOrders}\n- TopItems: ${topItems}\n\n`+
    `INSTRUCTIONS:\nReturn a single JSON object with the following keys: greeting, alert (nullable), demandForecasting, customerInsights, profitabilityAnalysis (object with grossRevenue, zomatoCommission, estimatedNet, analysis), recommendations (array of strings). Keep JSON valid and parsable.`;
}

export async function analyzeWithLocalModel(orders: ZomatoOrder[], userName: string): Promise<InsightResponse> {
  const baseUrl = (typeof window !== 'undefined' && localStorage.getItem('localAi.url')) || DEFAULT_LOCAL_AI;
  const exactUrl = (typeof window !== 'undefined' && localStorage.getItem(LOCAL_AI_EXACT_URL_KEY)) || null;
  const prompt = buildPrompt(orders, userName);

  // If an exact URL is provided, try only that. Otherwise try common Ollama-style endpoints.
  const tryEndpoints = exactUrl ? [exactUrl] : [
    `${baseUrl}/api/generate`,
    `${baseUrl}/api/completions`,
    `${baseUrl}/v1/generate`,
    `${baseUrl}/generate`,
  ];

  // Allow the model name to be configured via localStorage (useful for Llama3)
  const configuredModel = (typeof window !== 'undefined' && localStorage.getItem(LOCAL_AI_MODEL_KEY)) || 'phi-3mini';
  const body = {
    model: configuredModel,
    prompt,
    max_tokens: 1024,
    temperature: 0.2,
  };

  let lastError: any = null;
  for (const url of tryEndpoints) {
    try {
      const result = await tryFetchJson(url, body);
      // Try to extract text from common response shapes
      if (!result) continue;
      // Ollama may return {model:..., prompt:..., generations:[{text: ...}]}
      if (typeof result === 'object') {
        if (result.generations && Array.isArray(result.generations) && result.generations[0]?.text) {
          return JSON.parse(result.generations[0].text) as InsightResponse;
        }
        if (result.completion) {
          try { return JSON.parse(result.completion) as InsightResponse; } catch {}
        }
        // If response has 'text' property
        if (result.text && typeof result.text === 'string') {
          try { return JSON.parse(result.text) as InsightResponse; } catch {}
        }
        // Some endpoints return {choices:[{text: ...}]}
        if (result.choices && Array.isArray(result.choices) && result.choices[0]?.text) {
          try { return JSON.parse(result.choices[0].text) as InsightResponse; } catch {}
        }
        // If the whole object looks like the InsightResponse already, do a cast after a quick heuristic
        if (result.greeting && result.profitabilityAnalysis) {
          return result as InsightResponse;
        }
      }

      if (typeof result === 'string') {
        // Try parse string as JSON
        try {
          return JSON.parse(result) as InsightResponse;
        } catch (e) {
          // ignore, not JSON
        }
      }
    } catch (err) {
      lastError = err;
      // try next endpoint
    }
  }

  throw new Error('Local model calls failed: ' + (lastError?.message || 'unknown'));
}
