/**
 * chunkService.ts — KLOS RAG Chunk Builder
 *
 * Converts raw order JSON into semantically rich text chunks
 * suitable for embedding and retrieval.
 *
 * Three chunk types:
 *   1. Weekly summaries  — broad temporal patterns
 *   2. Restaurant/month  — per-brand performance
 *   3. City/month        — geographic demand patterns
 */

export interface Order {
  orderId: string;
  restaurantName: string;
  orderPlacedAt: number; // Unix ms timestamp
  orderStatus: string;
  totalAmount: number;
  items: string;
  city: string;
}

export interface OrderChunk {
  id: string;
  text: string;
  metadata: {
    type: "daily" | "weekly" | "restaurant" | "city";
    startDate: string;
    endDate: string;
    restaurant?: string;
    city?: string;
    orderCount: number;
    totalRevenue: number;
  };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function topN<T extends Record<string, number>>(
  map: T,
  n: number
): [string, number][] {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  return items.reduce((acc, item) => {
    const k = key(item);
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().split("T")[0];
}

function monthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function weekStart(ms: number): string {
  const date = new Date(ms);
  const day = date.getDay();
  const monday = new Date(date);
  monday.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return monday.toISOString().split("T")[0];
}

function stripQuantity(items: string): string {
  return items.replace(/^\d+ x /, "").trim();
}

// ── Chunk Builders ────────────────────────────────────────────────────────────

function dailyChunks(orders: Order[]): OrderChunk[] {
  const groups: Record<string, Order[]> = {};
  for (const order of orders) {
    const key = isoDate(order.orderPlacedAt);
    if (!groups[key]) groups[key] = [];
    groups[key].push(order);
  }

  return Object.entries(groups).map(([day, dayOrders]) => {
    const delivered = dayOrders.filter((order) => order.orderStatus === "Delivered");
    const cancelled = dayOrders.filter((order) => order.orderStatus === "Cancelled");
    const revenue = delivered.reduce((sum, order) => sum + order.totalAmount, 0);

    const itemMap = countBy(dayOrders, (order) => stripQuantity(order.items));
    const cityMap = countBy(dayOrders, (order) => order.city);
    const restaurantMap = countBy(dayOrders, (order) => order.restaurantName);

    const topItems = topN(itemMap, 4).map(([name, count]) => `${name} (${count})`).join(", ");
    const topCities = topN(cityMap, 3).map(([name, count]) => `${name} (${count})`).join(", ");
    const topRestaurants = topN(restaurantMap, 3).map(([name, count]) => `${name} (${count})`).join(", ");

    return {
      id: `day-${day}`,
      text: [
        `Day ${day}:`,
        `Total orders ${dayOrders.length}, Delivered ${delivered.length}, Cancelled ${cancelled.length}.`,
        `Revenue ₹${revenue.toFixed(2)}.`,
        `Top items: ${topItems}.`,
        `Top cities: ${topCities}.`,
        `Top restaurants: ${topRestaurants}.`,
      ].join(" "),
      metadata: {
        type: "daily" as const,
        startDate: day,
        endDate: day,
        orderCount: dayOrders.length,
        totalRevenue: revenue,
      },
    };
  });
}

function weeklyChunks(orders: Order[]): OrderChunk[] {
  const groups: Record<string, Order[]> = {};
  for (const o of orders) {
    const k = weekStart(o.orderPlacedAt);
    if (!groups[k]) groups[k] = [];
    groups[k].push(o);
  }

  return Object.entries(groups).map(([start, weekOrders]) => {
    const delivered = weekOrders.filter((o) => o.orderStatus === "Delivered");
    const cancelled = weekOrders.filter((o) => o.orderStatus === "Cancelled");
    const revenue = delivered.reduce((s, o) => s + o.totalAmount, 0);
    const avgOrder = delivered.length ? revenue / delivered.length : 0;
    const cancelRate = (cancelled.length / weekOrders.length) * 100;

    const itemMap = countBy(weekOrders, (o) => stripQuantity(o.items));
    const cityMap = countBy(weekOrders, (o) => o.city);
    const restaurantMap = countBy(weekOrders, (o) => o.restaurantName);

    const topItems = topN(itemMap, 5).map(([n, c]) => `${n} (${c})`).join(", ");
    const topCities = topN(cityMap, 4).map(([c, n]) => `${c} (${n})`).join(", ");
    const topRestaurants = topN(restaurantMap, 3).map(([r, n]) => `${r} (${n})`).join(", ");

    const endDate = new Date(start);
    endDate.setDate(endDate.getDate() + 6);
    const end = endDate.toISOString().split("T")[0];

    const text = [
      `Week ${start} to ${end}:`,
      `Total orders ${weekOrders.length}, Delivered ${delivered.length}, Cancelled ${cancelled.length}.`,
      `Revenue ₹${revenue.toFixed(2)}, Avg order value ₹${avgOrder.toFixed(2)}.`,
      `Cancellation rate ${cancelRate.toFixed(1)}%.`,
      `Top items: ${topItems}.`,
      `Top cities: ${topCities}.`,
      `Top restaurants: ${topRestaurants}.`,
    ].join(" ");

    return {
      id: `week-${start}`,
      text,
      metadata: {
        type: "weekly" as const,
        startDate: start,
        endDate: end,
        orderCount: weekOrders.length,
        totalRevenue: revenue,
      },
    };
  });
}

function restaurantMonthChunks(orders: Order[]): OrderChunk[] {
  const groups: Record<string, Order[]> = {};
  for (const o of orders) {
    const k = `${o.restaurantName}::${monthKey(o.orderPlacedAt)}`;
    if (!groups[k]) groups[k] = [];
    groups[k].push(o);
  }

  return Object.entries(groups).map(([key, rOrders]) => {
    const [restaurant, month] = key.split("::");
    const delivered = rOrders.filter((o) => o.orderStatus === "Delivered");
    const cancelled = rOrders.filter((o) => o.orderStatus === "Cancelled");
    const revenue = delivered.reduce((s, o) => s + o.totalAmount, 0);
    const avgOrder = delivered.length ? revenue / delivered.length : 0;
    const cancelRate = (cancelled.length / rOrders.length) * 100;

    const itemMap = countBy(rOrders, (o) => stripQuantity(o.items));
    const cityMap = countBy(rOrders, (o) => o.city);
    const topItems = topN(itemMap, 3).map(([n, c]) => `${n} (${c})`).join(", ");
    const topCities = topN(cityMap, 3).map(([c, n]) => `${c} (${n})`).join(", ");

    const text = [
      `Restaurant "${restaurant}" in ${month}:`,
      `Total orders ${rOrders.length}, Delivered ${delivered.length}, Cancelled ${cancelled.length}.`,
      `Revenue ₹${revenue.toFixed(2)}, Avg order ₹${avgOrder.toFixed(2)}.`,
      `Cancellation rate ${cancelRate.toFixed(1)}%.`,
      `Top items: ${topItems}.`,
      `Top cities: ${topCities}.`,
    ].join(" ");

    return {
      id: `restaurant-${restaurant.replace(/\s+/g, "_")}-${month}`,
      text,
      metadata: {
        type: "restaurant" as const,
        startDate: `${month}-01`,
        endDate: `${month}-28`,
        restaurant,
        orderCount: rOrders.length,
        totalRevenue: revenue,
      },
    };
  });
}

function cityMonthChunks(orders: Order[]): OrderChunk[] {
  const groups: Record<string, Order[]> = {};
  for (const o of orders) {
    const k = `${o.city}::${monthKey(o.orderPlacedAt)}`;
    if (!groups[k]) groups[k] = [];
    groups[k].push(o);
  }

  return Object.entries(groups).map(([key, cOrders]) => {
    const [city, month] = key.split("::");
    const delivered = cOrders.filter((o) => o.orderStatus === "Delivered");
    const cancelled = cOrders.filter((o) => o.orderStatus === "Cancelled");
    const revenue = delivered.reduce((s, o) => s + o.totalAmount, 0);
    const cancelRate = (cancelled.length / cOrders.length) * 100;

    const restaurantMap = countBy(cOrders, (o) => o.restaurantName);
    const itemMap = countBy(cOrders, (o) => stripQuantity(o.items));
    const topRestaurants = topN(restaurantMap, 3).map(([r, n]) => `${r} (${n})`).join(", ");
    const topItems = topN(itemMap, 3).map(([n, c]) => `${n} (${c})`).join(", ");

    const text = [
      `City "${city}" in ${month}:`,
      `Total orders ${cOrders.length}, Delivered ${delivered.length}, Cancelled ${cancelled.length}.`,
      `Revenue ₹${revenue.toFixed(2)}.`,
      `Cancellation rate ${cancelRate.toFixed(1)}%.`,
      `Top restaurants: ${topRestaurants}.`,
      `Top items: ${topItems}.`,
    ].join(" ");

    return {
      id: `city-${city.replace(/\s+/g, "_")}-${month}`,
      text,
      metadata: {
        type: "city" as const,
        startDate: `${month}-01`,
        endDate: `${month}-28`,
        city,
        orderCount: cOrders.length,
        totalRevenue: revenue,
      },
    };
  });
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Build all chunk types from raw orders.
 * Returns weekly + restaurant/month + city/month chunks.
 */
export function buildChunks(orders: Order[]): OrderChunk[] {
  return [
    ...dailyChunks(orders),
    ...weeklyChunks(orders),
    ...restaurantMonthChunks(orders),
    ...cityMonthChunks(orders),
  ];
}

/**
 * Quick summary stats for debugging / display.
 */
export function chunkStats(chunks: OrderChunk[]) {
  const byType = chunks.reduce((acc, c) => {
    acc[c.metadata.type] = (acc[c.metadata.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  return {
    total: chunks.length,
    byType,
    avgTextLength: Math.round(
      chunks.reduce((s, c) => s + c.text.length, 0) / chunks.length
    ),
  };
}
