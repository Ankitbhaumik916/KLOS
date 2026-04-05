import { useState, useEffect, useRef, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

interface Order {
  orderId: string;
  restaurantName?: string;
  orderPlacedAt: number;
  orderStatus: string;
  totalAmount: number;
  items?: string;
  city?: string;
}

interface OrderChunk {
  id: string;
  text: string;
  metadata: {
    startDate: string;
    endDate: string;
    restaurant?: string;
    city?: string;
    orderCount: number;
    totalRevenue: number;
  };
}

interface VectorEntry {
  chunk: OrderChunk;
  embedding: number[];
}

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: OrderChunk[];
  timestamp: number;
}

interface IndexStatus {
  state: "idle" | "loading_model" | "indexing" | "ready" | "error";
  progress?: number;
  chunkCount?: number;
  error?: string;
}

// ── Chunk Builder ────────────────────────────────────────────────────────────

function groupByWeek(orders: Order[]): Record<string, Order[]> {
  return orders.reduce((acc, order) => {
    const date = new Date(order.orderPlacedAt);
    const day = date.getDay();
    const monday = new Date(date);
    monday.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
    const key = monday.toISOString().split("T")[0];
    if (!acc[key]) acc[key] = [];
    acc[key].push(order);
    return acc;
  }, {} as Record<string, Order[]>);
}

function buildGlobalSummaryChunk(orders: Order[]): OrderChunk {
  const delivered = orders.filter((o) => o.orderStatus === "Delivered");
  const cancelled = orders.filter((o) => o.orderStatus === "Cancelled");
  const totalRevenue = delivered.reduce((s, o) => s + o.totalAmount, 0);
  const avgOrder = delivered.length ? totalRevenue / delivered.length : 0;
  const cancelRate = orders.length ? (cancelled.length / orders.length) * 100 : 0;

  const itemCounts: Record<string, number> = {};
  for (const o of orders) {
    const rawItems = o.items ?? "";
    const match = rawItems.match(/^(\d+) x (.+)$/);
    const qty = match ? parseInt(match[1], 10) : 1;
    const name = match ? match[2].trim() : rawItems.trim();
    itemCounts[name] = (itemCounts[name] || 0) + qty;
  }
  const topItems = Object.entries(itemCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([n, c]) => `${n} (${c})`)
    .join(", ");

  const cityCounts: Record<string, number> = {};
  for (const o of orders) {
    const city = o.city || "Unknown city";
    cityCounts[city] = (cityCounts[city] || 0) + 1;
  }
  const topCities = Object.entries(cityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([c, n]) => `${c} (${n})`)
    .join(", ");

  const restaurantCounts: Record<string, number> = {};
  const restaurantRevenue: Record<string, number> = {};
  for (const o of orders) {
    const restaurant = o.restaurantName || "Unknown restaurant";
    restaurantCounts[restaurant] = (restaurantCounts[restaurant] || 0) + 1;
  }
  for (const o of delivered) {
    const restaurant = o.restaurantName || "Unknown restaurant";
    restaurantRevenue[restaurant] = (restaurantRevenue[restaurant] || 0) + o.totalAmount;
  }
  const topRestaurants = Object.entries(restaurantCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([r, n]) => `${r} (${n})`)
    .join(", ");
  const topRestaurantsByRevenue = Object.entries(restaurantRevenue)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([r, v]) => `${r} (₹${v.toFixed(2)})`)
    .join(", ");

  const timestamps = orders.map((o) => o.orderPlacedAt).sort((a, b) => a - b);
  const firstDate = new Date(timestamps[0]).toISOString().split("T")[0];
  const lastDate = new Date(timestamps[timestamps.length - 1]).toISOString().split("T")[0];

  return {
    id: "global-summary",
    text: [
      `GLOBAL SUMMARY across all data (${firstDate} to ${lastDate}):`,
      `Total orders: ${orders.length}, Delivered: ${delivered.length}, Cancelled: ${cancelled.length}.`,
      `Total revenue: ₹${totalRevenue.toFixed(2)}, Average order value: ₹${avgOrder.toFixed(2)}.`,
      `Overall cancellation rate: ${cancelRate.toFixed(1)}%.`,
      `Top items by quantity sold (all-time): ${topItems}.`,
      `Top cities by order count (all-time): ${topCities}.`,
      `Top restaurants by order count (all-time): ${topRestaurants}.`,
      `Top restaurants by revenue (all-time): ${topRestaurantsByRevenue}.`,
    ].join(" "),
    metadata: {
      startDate: firstDate,
      endDate: lastDate,
      orderCount: orders.length,
      totalRevenue,
    },
  };
}

function buildChunks(orders: Order[]): OrderChunk[] {
  const chunks: OrderChunk[] = [];

  // ── Daily chunks ──
  const dailyGroups: Record<string, Order[]> = {};
  for (const order of orders) {
    const day = new Date(order.orderPlacedAt).toISOString().split("T")[0];
    if (!dailyGroups[day]) dailyGroups[day] = [];
    dailyGroups[day].push(order);
  }

  for (const [day, dayOrders] of Object.entries(dailyGroups)) {
    const delivered = dayOrders.filter((o) => o.orderStatus === "Delivered");
    const cancelled = dayOrders.filter((o) => o.orderStatus === "Cancelled");
    const revenue = delivered.reduce((s, o) => s + o.totalAmount, 0);

    const itemCounts: Record<string, number> = {};
    for (const o of dayOrders) {
      const item = (o.items ?? "Unknown item").replace(/^\d+ x /, "").trim();
      itemCounts[item] = (itemCounts[item] || 0) + 1;
    }
    const topItems = Object.entries(itemCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([n, c]) => `${n} (${c})`)
      .join(", ");

    const cityCounts: Record<string, number> = {};
    for (const o of dayOrders) {
      const city = o.city ?? "Unknown city";
      cityCounts[city] = (cityCounts[city] || 0) + 1;
    }
    const topCities = Object.entries(cityCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([c, n]) => `${c} (${n})`)
      .join(", ");

    const restaurantCounts: Record<string, number> = {};
    for (const o of dayOrders) {
      const restaurant = o.restaurantName ?? "Unknown restaurant";
      restaurantCounts[restaurant] = (restaurantCounts[restaurant] || 0) + 1;
    }
    const topRestaurants = Object.entries(restaurantCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([r, n]) => `${r} (${n})`)
      .join(", ");

    chunks.push({
      id: `day-${day}`,
      text: `Day ${day}: Total orders ${dayOrders.length}, Delivered ${delivered.length}, Cancelled ${cancelled.length}, Revenue ₹${revenue.toFixed(2)}, Top items: ${topItems}, Top cities: ${topCities}, Top restaurants: ${topRestaurants}.`,
      metadata: {
        startDate: day,
        endDate: day,
        orderCount: dayOrders.length,
        totalRevenue: revenue,
      },
    });
  }

  // ── Weekly chunks ──
  const weeks = groupByWeek(orders);
  for (const [weekStart, weekOrders] of Object.entries(weeks)) {
    const delivered = weekOrders.filter((o) => o.orderStatus === "Delivered");
    const cancelled = weekOrders.filter((o) => o.orderStatus === "Cancelled");
    const revenue = delivered.reduce((s, o) => s + o.totalAmount, 0);

    const itemCounts: Record<string, number> = {};
    for (const o of weekOrders) {
      const item = (o.items ?? "Unknown item").replace(/^\d+ x /, "").trim();
      itemCounts[item] = (itemCounts[item] || 0) + 1;
    }
    const topItems = Object.entries(itemCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([n, c]) => `${n} (${c})`)
      .join(", ");

    const cityCounts: Record<string, number> = {};
    for (const o of weekOrders) {
      const city = o.city ?? "Unknown city";
      cityCounts[city] = (cityCounts[city] || 0) + 1;
    }
    const topCities = Object.entries(cityCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([c, n]) => `${c} (${n})`)
      .join(", ");

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const endStr = weekEnd.toISOString().split("T")[0];

    const avgOrderValue = delivered.length
      ? (revenue / delivered.length).toFixed(2)
      : "0";
    const cancelRate = weekOrders.length
      ? ((cancelled.length / weekOrders.length) * 100).toFixed(1)
      : "0";

    chunks.push({
      id: `week-${weekStart}`,
      text: `Week ${weekStart} to ${endStr}: Total orders ${weekOrders.length}, Delivered ${delivered.length}, Cancelled ${cancelled.length}, Revenue ₹${revenue.toFixed(2)}, Avg order value ₹${avgOrderValue}, Cancellation rate ${cancelRate}%, Top items: ${topItems}, Top cities: ${topCities}.`,
      metadata: {
        startDate: weekStart,
        endDate: endStr,
        orderCount: weekOrders.length,
        totalRevenue: revenue,
      },
    });
  }

  // ── Per-restaurant monthly chunks ──
  const restaurantMonthMap: Record<string, Order[]> = {};
  for (const o of orders) {
    const d = new Date(o.orderPlacedAt);
    const restaurant = o.restaurantName ?? "Unknown restaurant";
    const key = `${restaurant}::${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!restaurantMonthMap[key]) restaurantMonthMap[key] = [];
    restaurantMonthMap[key].push(o);
  }

  for (const [key, rOrders] of Object.entries(restaurantMonthMap)) {
    const [restaurant, month] = key.split("::");
    const delivered = rOrders.filter((o) => o.orderStatus === "Delivered");
    const revenue = delivered.reduce((s, o) => s + o.totalAmount, 0);

    const itemCounts: Record<string, number> = {};
    for (const o of rOrders) {
      const item = (o.items ?? "Unknown item").replace(/^\d+ x /, "").trim();
      itemCounts[item] = (itemCounts[item] || 0) + 1;
    }
    const topItems = Object.entries(itemCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([n, c]) => `${n} (${c})`)
      .join(", ");

    chunks.push({
      id: `restaurant-${restaurant}-${month}`,
      text: `Restaurant ${restaurant} in ${month}: Total orders ${rOrders.length}, Delivered ${delivered.length}, Revenue ₹${revenue.toFixed(2)}, Top items: ${topItems}.`,
      metadata: {
        startDate: `${month}-01`,
        endDate: `${month}-28`,
        restaurant,
        orderCount: rOrders.length,
        totalRevenue: revenue,
      },
    });
  }

  // ── Per-city monthly chunks ──
  const cityMonthMap: Record<string, Order[]> = {};
  for (const o of orders) {
    const d = new Date(o.orderPlacedAt);
    const city = o.city ?? "Unknown city";
    const key = `${city}::${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!cityMonthMap[key]) cityMonthMap[key] = [];
    cityMonthMap[key].push(o);
  }

  for (const [key, cOrders] of Object.entries(cityMonthMap)) {
    const [city, month] = key.split("::");
    const delivered = cOrders.filter((o) => o.orderStatus === "Delivered");
    const revenue = delivered.reduce((s, o) => s + o.totalAmount, 0);
    const cancelled = cOrders.filter((o) => o.orderStatus === "Cancelled");
    const cancelRate = cOrders.length
      ? ((cancelled.length / cOrders.length) * 100).toFixed(1)
      : "0";

    chunks.push({
      id: `city-${city}-${month}`,
      text: `City ${city} in ${month}: Total orders ${cOrders.length}, Delivered ${delivered.length}, Revenue ₹${revenue.toFixed(2)}, Cancellation rate ${cancelRate}%.`,
      metadata: {
        startDate: `${month}-01`,
        endDate: `${month}-28`,
        city,
        orderCount: cOrders.length,
        totalRevenue: revenue,
      },
    });
  }

  return chunks;
}

// ── Cosine similarity ────────────────────────────────────────────────────────

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    ma += a[i] * a[i];
    mb += b[i] * b[i];
  }
  return dot / (Math.sqrt(ma) * Math.sqrt(mb) || 1);
}

// ── RAG Engine (singleton) ───────────────────────────────────────────────────

class RAGEngine {
  private static instance: RAGEngine | null = null;
  private vectorStore: VectorEntry[] = [];
  private chunks: OrderChunk[] = [];
  private ready = false;

  static getInstance(): RAGEngine {
    if (!RAGEngine.instance) RAGEngine.instance = new RAGEngine();
    return RAGEngine.instance;
  }

  isReady() {
    return this.ready;
  }

  async loadEmbedder(
    onProgress: (msg: string) => void
  ): Promise<void> {
    onProgress("Connecting to local embedding service…");
    const res = await fetch("http://localhost:3001/health", {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      throw new Error(`Embedding service unavailable (${res.status})`);
    }
    const data = await res.json();
    if (!data?.ollama) {
      throw new Error("Local embedding service is not ready.");
    }
  }

  async buildIndex(
    orders: Order[],
    onProgress: (msg: string, pct: number) => void
  ): Promise<number> {
    this.chunks = buildChunks(orders);
    this.vectorStore = [];

    const BATCH = 8;
    for (let i = 0; i < this.chunks.length; i += BATCH) {
      const batch = this.chunks.slice(i, i + BATCH);
      const pct = Math.round((i / this.chunks.length) * 100);
      onProgress(
        `Embedding chunk ${i + 1}–${Math.min(i + BATCH, this.chunks.length)} of ${this.chunks.length}`,
        pct
      );

      const res = await fetch("http://localhost:3001/api/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: batch.map((chunk) => chunk.text) }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Embedding proxy error ${res.status}: ${errText.slice(0, 200)}`);
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const body = await res.text();
        throw new Error(`Embedding proxy returned non-JSON response (${contentType || "unknown"}). ${body.slice(0, 120)}`);
      }

      const data = await res.json();
      const embeddings: number[][] = data.embeddings;
      if (!Array.isArray(embeddings) || embeddings.length !== batch.length) {
        throw new Error("Embedding proxy returned an invalid embedding payload.");
      }

      batch.forEach((chunk, index) => {
        this.vectorStore.push({
          chunk,
          embedding: embeddings[index],
        });
      });
    }

    // Persist embeddings
    try {
      localStorage.setItem(
        "klos_rag_vectors",
        JSON.stringify(
          this.vectorStore.map((e) => ({
            id: e.chunk.id,
            embedding: e.embedding,
          }))
        )
      );
      localStorage.setItem("klos_rag_chunks", JSON.stringify(this.chunks));
    } catch (_) {
      // localStorage quota — silently skip
    }

    this.ready = true;
    return this.chunks.length;
  }

  async loadFromCache(): Promise<boolean> {
    try {
      const rawVecs = localStorage.getItem("klos_rag_vectors");
      const rawChunks = localStorage.getItem("klos_rag_chunks");
      if (!rawVecs || !rawChunks) return false;
      this.chunks = JSON.parse(rawChunks);
      const vecs = JSON.parse(rawVecs) as { id: string; embedding: number[] }[];
      const chunkMap = Object.fromEntries(this.chunks.map((c) => [c.id, c]));
      this.vectorStore = vecs.map((v) => ({
        chunk: chunkMap[v.id],
        embedding: v.embedding,
      }));
      this.ready = true;
      return true;
    } catch (_) {
      return false;
    }
  }

  async retrieve(query: string, topK = 8): Promise<OrderChunk[]> {
    if (!this.ready) return [];

    const res = await fetch("http://localhost:3001/api/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts: [query] }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Embedding proxy error ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const qv = data.embeddings?.[0] as number[] | undefined;
    if (!Array.isArray(qv)) {
      throw new Error("Embedding proxy returned an invalid query embedding.");
    }

    const globalEntry = this.vectorStore.find((e) => e.chunk.id === "global-summary");
    const rest = this.vectorStore.filter((e) => e.chunk.id !== "global-summary");

    const ranked = rest
      .map((e) => ({ chunk: e.chunk, score: cosineSim(qv, e.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(0, topK - 1))
      .map((e) => e.chunk);

    return globalEntry ? [globalEntry.chunk, ...ranked] : ranked;
  }
}

// ── Suggested queries ────────────────────────────────────────────────────────

const SUGGESTED = [
  "Which week had the highest revenue?",
  "Which city has the most cancellations?",
  "What are the top 3 best-selling items?",
  "Show trends in average order value over time",
  "Which restaurant performed best in February?",
  "What days see the most orders?",
];

// ── Main Component ───────────────────────────────────────────────────────────

interface AIDeepdiveProps {
  orders?: Order[];
}

export default function AIDeepdive({ orders: ordersProp }: AIDeepdiveProps) {
  const orders: Order[] = ordersProp ?? [];
  const [indexStatus, setIndexStatus] = useState<IndexStatus>({ state: "idle" });
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState("Thinking…");
  const [llmOnline, setLlmOnline] = useState<boolean | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const engine = RAGEngine.getInstance();

  const pingLlmHealth = useCallback(async () => {
    try {
      const res = await fetch("http://localhost:3001/health", {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) {
        setLlmOnline(false);
        return;
      }
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        setLlmOnline(false);
        return;
      }
      const data = await res.json();
      setLlmOnline(data?.ollama === true);
    } catch {
      setLlmOnline(false);
    }
  }, []);

  // ── Check LLM proxy (and keep status fresh) ──
  useEffect(() => {
    pingLlmHealth();
    const timer = window.setInterval(pingLlmHealth, 5000);
    return () => window.clearInterval(timer);
  }, [pingLlmHealth]);

  // ── Auto-scroll ──
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  // ── Build index ──
  const buildIndex = useCallback(async () => {
    if (!orders || orders.length === 0) return;

    setIndexStatus({ state: "loading_model" });
    try {
      await engine.loadEmbedder((msg) =>
        setIndexStatus({ state: "loading_model", error: msg })
      );

      setIndexStatus({ state: "indexing", progress: 0 });
      const count = await engine.buildIndex(orders, (msg, pct) =>
        setIndexStatus({ state: "indexing", progress: pct, error: msg })
      );

      setIndexStatus({ state: "ready", chunkCount: count });
      setMessages([
        {
          role: "assistant",
          content: `Index ready — ${count} contextual chunks built from ${orders.length} orders. Ask me anything about your data.`,
          timestamp: Date.now(),
        },
      ]);
    } catch (err: any) {
      setIndexStatus({ state: "error", error: err.message });
    }
  }, [orders, engine]);

  // ── Try loading from cache on mount ──
  useEffect(() => {
    (async () => {
      const cached = await engine.loadFromCache();
      if (cached) {
        setIndexStatus({
          state: "ready",
          chunkCount: (engine as any).chunks?.length,
        });
        setMessages([
          {
            role: "assistant",
            content: "Index loaded from cache. Ask me anything about your orders.",
            timestamp: Date.now(),
          },
        ]);
      }
    })();
  }, [engine]);

  // ── Send query ──
  const send = useCallback(
    async (query: string) => {
      if (!query.trim() || isThinking) return;
      setInput("");

      const userMsg: Message = {
        role: "user",
        content: query,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsThinking(true);
      setThinkingLabel("Searching vector index…");

      try {
        const sources = await engine.retrieve(query, 6);
        setThinkingLabel("Generating analysis…");

        const context = sources.map((c) => c.text).join("\n\n");
        const prompt = `You are KLOS, a precise data analyst for a cloud kitchen.
      STRICT RULES:
      - Only use numbers that appear verbatim in the context below. Never calculate or estimate.
      - If a specific number isn't in the context, say "data not available for this".
      - Quote the exact week/month range when citing a figure.
      - Keep response under 200 words unless the question requires more detail.

DATA CONTEXT:
${context}

QUESTION: ${query}

ANALYSIS:`;

        const res = await fetch("http://localhost:3001/api/llm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, model: "llama3.2" }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Proxy error ${res.status}: ${errText.slice(0, 200)}`);
        }
        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          const body = await res.text();
          throw new Error(
            `Proxy returned non-JSON response (${contentType || "unknown content type"}). ${body.slice(0, 120)}`
          );
        }
        const data = await res.json();

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.response || data.message || "No response from model.",
            sources,
            timestamp: Date.now(),
          },
        ]);
      } catch (err: any) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Error: ${err.message}. Make sure the LLM proxy is running (\`npm run start-llm-proxy\`) and Ollama is serving Llama 3.2.`,
            timestamp: Date.now(),
          },
        ]);
      } finally {
        setIsThinking(false);
      }
    },
    [engine, isThinking]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.headerIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <p style={styles.headerTitle}>AI Deep Dive</p>
            <p style={styles.headerSub}>RAG · Llama 3.2{orders.length > 0 ? ` · ${orders.length.toLocaleString()} orders` : ""}</p>
          </div>
        </div>
        <div style={styles.headerRight}>
            {orders.length > 0 && (
              <button
                onClick={buildIndex}
                style={styles.rebuildBtn}
                disabled={indexStatus.state === "loading_model" || indexStatus.state === "indexing"}
              >
                Rebuild Index
              </button>
            )}
          <StatusPill llmOnline={llmOnline} indexStatus={indexStatus} />
        </div>
      </div>

      {/* Empty state */}
      {orders.length === 0 && indexStatus.state !== "ready" && (
        <div style={styles.indexPanel}>
          <div style={styles.indexIcon}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M9 17H7A5 5 0 017 7h2M15 7h2a5 5 0 010 10h-2M8 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <p style={styles.indexTitle}>No orders loaded</p>
          <p style={styles.indexSub}>Upload a CSV or JSON file from the Data tab first, then return here to build the RAG index.</p>
        </div>
      )}

      {/* Index panel */}
      {orders.length > 0 && indexStatus.state !== "ready" && (
        <IndexPanel
          status={indexStatus}
          orderCount={orders.length}
          onBuild={buildIndex}
        />
      )}

      {/* Chat area */}
      {indexStatus.state === "ready" && (
        <>
          <div style={styles.chatArea}>
            {messages.length === 0 && (
              <SuggestedQueries suggestions={SUGGESTED} onSelect={send} />
            )}

            {messages.map((msg, i) => (
              <ChatMessage key={i} message={msg} />
            ))}

            {isThinking && <ThinkingBubble label={thinkingLabel} />}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={styles.inputArea}>
            {messages.length > 1 && (
              <div style={styles.suggestScroll}>
                {SUGGESTED.slice(0, 3).map((s) => (
                  <button
                    key={s}
                    style={styles.chipBtn}
                    onClick={() => send(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div style={styles.inputRow}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your order data…"
                rows={1}
                style={styles.textarea}
                disabled={isThinking}
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || isThinking}
                style={{
                  ...styles.sendBtn,
                  opacity: !input.trim() || isThinking ? 0.4 : 1,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatusPill({ llmOnline, indexStatus }: { llmOnline: boolean | null; indexStatus: IndexStatus }) {
  const ready = indexStatus.state === "ready";
  const color = ready && llmOnline ? "#16a34a" : ready || llmOnline ? "#d97706" : "#dc2626";
  const label =
    llmOnline === null
      ? "Checking…"
      : llmOnline
      ? ready
        ? "Ready"
        : "LLM online"
      : "LLM offline";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
      <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{label}</span>
    </div>
  );
}

function IndexPanel({
  status,
  orderCount,
  onBuild,
}: {
  status: IndexStatus;
  orderCount: number;
  onBuild: () => void;
}) {
  const isRunning = status.state === "loading_model" || status.state === "indexing";

  return (
    <div style={styles.indexPanel}>
      <div style={styles.indexIcon}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M11 8v3l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
      <p style={styles.indexTitle}>Build Vector Index</p>
      <p style={styles.indexSub}>
        {orderCount.toLocaleString()} orders will be chunked into weekly, restaurant, and city summaries, then embedded locally using{" "}
        <code style={{ fontSize: 11 }}>all-MiniLM-L6-v2</code> — no API cost.
      </p>

      {status.state === "error" && (
        <p style={{ fontSize: 12, color: "var(--color-text-danger)", marginBottom: 12 }}>
          {status.error}
        </p>
      )}

      {isRunning ? (
        <div style={styles.progressWrap}>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${status.progress ?? 0}%`,
              }}
            />
          </div>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 8 }}>
            {status.error || "Working…"}
          </p>
        </div>
      ) : (
        <button onClick={onBuild} style={styles.buildBtn}>
          Build Index
        </button>
      )}
    </div>
  );
}

function SuggestedQueries({
  suggestions,
  onSelect,
}: {
  suggestions: string[];
  onSelect: (q: string) => void;
}) {
  return (
    <div style={styles.suggestGrid}>
      <p style={styles.suggestLabel}>Suggested queries</p>
      <div style={styles.suggestCards}>
        {suggestions.map((s) => (
          <button key={s} style={styles.suggestCard} onClick={() => onSelect(s)}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const [showSources, setShowSources] = useState(false);

  return (
    <div style={{ ...styles.msgRow, justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div
        style={{
          ...styles.msgBubble,
          background: isUser
            ? "var(--color-background-info)"
            : "var(--color-background-secondary)",
          maxWidth: isUser ? "72%" : "85%",
          borderBottomRightRadius: isUser ? 4 : undefined,
          borderBottomLeftRadius: !isUser ? 4 : undefined,
        }}
      >
        <p style={styles.msgText}>{message.content}</p>

        {message.sources && message.sources.length > 0 && (
          <div style={styles.sourcesWrap}>
            <button
              style={styles.sourcesToggle}
              onClick={() => setShowSources((v) => !v)}
            >
              {showSources ? "Hide" : "Show"} {message.sources.length} sources
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                style={{ transform: showSources ? "rotate(180deg)" : undefined, transition: "transform 0.2s" }}
              >
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
            {showSources && (
              <div style={styles.sourcesList}>
                {message.sources.map((src) => (
                  <div key={src.id} style={styles.sourceChip}>
                    <span style={styles.sourceChipDot} />
                    <span style={styles.sourceChipText}>
                      {src.metadata.restaurant
                        ? `${src.metadata.restaurant} · ${src.metadata.startDate.slice(0, 7)}`
                        : src.metadata.city
                        ? `${src.metadata.city} · ${src.metadata.startDate.slice(0, 7)}`
                        : `Week ${src.metadata.startDate}`}
                      {" — "}
                      {src.metadata.orderCount} orders
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <p style={styles.msgTime}>
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}

function ThinkingBubble({ label }: { label: string }) {
  return (
    <div style={{ ...styles.msgRow, justifyContent: "flex-start" }}>
      <div style={{ ...styles.msgBubble, background: "var(--color-background-secondary)" }}>
        <div style={styles.thinkingRow}>
          <div style={styles.dotGroup}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  ...styles.dot,
                  animationDelay: `${i * 0.15}s`,
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{label}</span>
        </div>
      </div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 520,
    background: "var(--color-background-primary)",
    borderRadius: "var(--border-radius-lg)",
    border: "0.5px solid var(--color-border-tertiary)",
    overflow: "hidden",
    fontFamily: "var(--font-sans)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 20px",
    borderBottom: "0.5px solid var(--color-border-tertiary)",
    background: "var(--color-background-secondary)",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 12 },
  headerRight: { display: "flex", alignItems: "center", gap: 10 },
  rebuildBtn: {
    padding: "6px 10px",
    borderRadius: "var(--border-radius-sm)",
    border: "0.5px solid var(--color-border-info)",
    background: "var(--color-background-info)",
    color: "var(--color-text-info)",
    fontSize: 11,
    cursor: "pointer",
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: "var(--border-radius-md)",
    background: "var(--color-background-info)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--color-text-info)",
  },
  headerTitle: { margin: 0, fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" },
  headerSub: { margin: 0, fontSize: 11, color: "var(--color-text-secondary)", marginTop: 1 },

  indexPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "40px 32px",
    textAlign: "center",
    gap: 4,
  },
  indexIcon: { color: "var(--color-text-secondary)", marginBottom: 8 },
  indexTitle: { margin: 0, fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 8 },
  indexSub: { margin: 0, fontSize: 13, color: "var(--color-text-secondary)", maxWidth: 360, lineHeight: 1.6, marginBottom: 20 },
  progressWrap: { width: "100%", maxWidth: 360 },
  progressBar: {
    height: 4,
    background: "var(--color-border-tertiary)",
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "var(--color-text-info)",
    borderRadius: 999,
    transition: "width 0.3s ease",
  },
  buildBtn: {
    padding: "10px 28px",
    background: "var(--color-background-info)",
    color: "var(--color-text-info)",
    border: "0.5px solid var(--color-border-info)",
    borderRadius: "var(--border-radius-md)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  },

  chatArea: {
    flex: 1,
    overflowY: "auto",
    padding: "20px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },

  suggestGrid: { padding: "8px 0 16px" },
  suggestLabel: { margin: "0 0 12px", fontSize: 11, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" },
  suggestCards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: 8,
  },
  suggestCard: {
    padding: "10px 14px",
    background: "var(--color-background-secondary)",
    border: "0.5px solid var(--color-border-tertiary)",
    borderRadius: "var(--border-radius-md)",
    fontSize: 12,
    color: "var(--color-text-secondary)",
    cursor: "pointer",
    textAlign: "left",
    lineHeight: 1.5,
  },

  msgRow: { display: "flex" },
  msgBubble: {
    padding: "10px 14px",
    borderRadius: "var(--border-radius-md)",
    maxWidth: "85%",
  },
  msgText: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.6,
    color: "var(--color-text-primary)",
    whiteSpace: "pre-wrap",
  },
  msgTime: { margin: "6px 0 0", fontSize: 10, color: "var(--color-text-tertiary)", textAlign: "right" },

  sourcesWrap: { marginTop: 10, borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 8 },
  sourcesToggle: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    background: "none",
    border: "none",
    fontSize: 11,
    color: "var(--color-text-secondary)",
    cursor: "pointer",
    padding: 0,
  },
  sourcesList: { marginTop: 8, display: "flex", flexDirection: "column", gap: 4 },
  sourceChip: { display: "flex", alignItems: "center", gap: 6 },
  sourceChipDot: { width: 5, height: 5, borderRadius: "50%", background: "var(--color-text-info)", flexShrink: 0 },
  sourceChipText: { fontSize: 11, color: "var(--color-text-secondary)" },

  thinkingRow: { display: "flex", alignItems: "center", gap: 10 },
  dotGroup: { display: "flex", gap: 4 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "var(--color-text-secondary)",
    animation: "klos-bounce 0.8s ease-in-out infinite",
  },

  inputArea: {
    borderTop: "0.5px solid var(--color-border-tertiary)",
    padding: "12px 16px",
    background: "var(--color-background-secondary)",
  },
  suggestScroll: {
    display: "flex",
    gap: 6,
    overflowX: "auto",
    paddingBottom: 10,
    scrollbarWidth: "none",
  },
  chipBtn: {
    flexShrink: 0,
    padding: "5px 10px",
    background: "var(--color-background-primary)",
    border: "0.5px solid var(--color-border-secondary)",
    borderRadius: 999,
    fontSize: 11,
    color: "var(--color-text-secondary)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  inputRow: { display: "flex", gap: 8, alignItems: "flex-end" },
  textarea: {
    flex: 1,
    padding: "9px 12px",
    fontSize: 13,
    borderRadius: "var(--border-radius-md)",
    border: "0.5px solid var(--color-border-secondary)",
    background: "var(--color-background-primary)",
    color: "var(--color-text-primary)",
    resize: "none",
    fontFamily: "var(--font-sans)",
    lineHeight: 1.5,
    outline: "none",
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: "var(--border-radius-md)",
    background: "var(--color-background-info)",
    border: "none",
    color: "var(--color-text-info)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
  },
};

// ── Keyframe injection (once) ─────────────────────────────────────────────────

if (typeof document !== "undefined" && !document.getElementById("klos-rag-styles")) {
  const style = document.createElement("style");
  style.id = "klos-rag-styles";
  style.textContent = `
    @keyframes klos-bounce {
      0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
      40% { transform: translateY(-5px); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}
