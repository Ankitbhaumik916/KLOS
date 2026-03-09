import faiss
import json
import ollama
import time
import re
import calendar
from collections import defaultdict
from datetime import datetime
import torch
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Any, Optional, Tuple

device = "cuda" if torch.cuda.is_available() else "cpu"

model = SentenceTransformer(
    "all-MiniLM-L6-v2",
    device=device
)

index = faiss.read_index("orders_index.faiss")

with open("clos_orders_sanjoybhaumik42@gmail.com.json", "r") as f:
    data = json.load(f)

documents = []

for order in data:
    placed_at = order.get("orderPlacedAt")
    if placed_at:
        dt = datetime.fromtimestamp(placed_at / 1000)
        order_date = dt.strftime("%Y-%m-%d")
        order_month = dt.strftime("%B %Y")
    else:
        order_date = "unknown"
        order_month = "unknown"

    doc = (
        f"Order ID: {order.get('orderId', 'N/A')} | "
        f"Restaurant: {order.get('restaurantName', 'N/A')} | "
        f"Date: {order_date} | Month: {order_month} | "
        f"Status: {order.get('orderStatus', 'N/A')} | "
        f"Amount: {order.get('totalAmount', 0)} | "
        f"Items: {order.get('items', 'N/A')} | "
        f"City: {order.get('city', 'N/A')}"
    )
    documents.append(doc)

MONTH_NAME_TO_NUM = {
    name.lower(): i for i, name in enumerate(calendar.month_name) if name
}


def parse_items(items_raw: str) -> List[Tuple[str, int]]:
    if not items_raw:
        return []

    parsed: List[Tuple[str, int]] = []
    parts = [p.strip() for p in items_raw.split(",") if p.strip()]
    for part in parts:
        match = re.match(r"^(\d+)\s*x\s*(.+)$", part, flags=re.IGNORECASE)
        if match:
            qty = int(match.group(1))
            name = match.group(2).strip()
            parsed.append((name, qty))
        else:
            parsed.append((part, 1))
    return parsed


def parse_month_year_from_query(query: str) -> Tuple[Optional[int], Optional[int]]:
    lower_q = query.lower()
    month = None
    year = None

    for name, num in MONTH_NAME_TO_NUM.items():
        if name in lower_q:
            month = num
            break

    year_match = re.search(r"\b(20\d{2})\b", lower_q)
    if year_match:
        year = int(year_match.group(1))

    return month, year


def order_datetime(order: Dict[str, Any]) -> Optional[datetime]:
    ts = order.get("orderPlacedAt")
    if not ts:
        return None
    return datetime.fromtimestamp(ts / 1000)


def filter_orders(month: Optional[int], year: Optional[int]) -> List[Dict[str, Any]]:
    if month is None and year is None:
        return data

    filtered: List[Dict[str, Any]] = []
    for order in data:
        dt = order_datetime(order)
        if not dt:
            continue
        if month is not None and dt.month != month:
            continue
        if year is not None and dt.year != year:
            continue
        filtered.append(order)
    return filtered


def format_scope(month: Optional[int], year: Optional[int]) -> str:
    if month is not None and year is not None:
        return f"{calendar.month_name[month]} {year}"
    if month is not None:
        return calendar.month_name[month]
    if year is not None:
        return str(year)
    return "all available data"


def compute_kpis(orders: List[Dict[str, Any]]) -> Dict[str, Any]:
    total_orders = len(orders)
    total_sales = sum(float(o.get("totalAmount", 0) or 0) for o in orders)
    delivered_orders = sum(1 for o in orders if o.get("orderStatus") == "Delivered")
    rejected_orders = sum(1 for o in orders if o.get("orderStatus") == "Rejected")
    avg_order_value = total_sales / total_orders if total_orders else 0.0
    completion_rate = (delivered_orders / total_orders * 100) if total_orders else 0.0

    daily_sales: Dict[str, float] = defaultdict(float)
    monthly_sales: Dict[str, float] = defaultdict(float)
    dish_counts: Dict[str, int] = defaultdict(int)

    for o in orders:
        dt = order_datetime(o)
        if dt:
            day_key = dt.strftime("%Y-%m-%d")
            month_key = dt.strftime("%Y-%m")
            amount = float(o.get("totalAmount", 0) or 0)
            daily_sales[day_key] += amount
            monthly_sales[month_key] += amount

        for dish, qty in parse_items(str(o.get("items", "") or "")):
            dish_counts[dish] += qty

    top_dish = max(dish_counts.items(), key=lambda x: x[1], default=("N/A", 0))
    top_month = max(monthly_sales.items(), key=lambda x: x[1], default=("N/A", 0.0))

    return {
        "total_orders": total_orders,
        "total_sales": total_sales,
        "delivered_orders": delivered_orders,
        "rejected_orders": rejected_orders,
        "avg_order_value": avg_order_value,
        "completion_rate": completion_rate,
        "daily_sales": dict(daily_sales),
        "monthly_sales": dict(monthly_sales),
        "top_dish": top_dish,
        "top_month": top_month,
    }


def format_monthly_sales(monthly_sales: Dict[str, float], limit: int = 12) -> str:
    if not monthly_sales:
        return "No monthly sales data found."

    rows = sorted(monthly_sales.items())[:limit]
    return "\n".join(f"- {k}: Rs {v:.2f}" for k, v in rows)


def exact_kpi_answer(query: str) -> Optional[str]:
    lower_q = query.lower()
    month, year = parse_month_year_from_query(query)
    scoped_orders = filter_orders(month, year)
    scope = format_scope(month, year)

    if not scoped_orders:
        return f"No orders found for {scope}."

    kpi = compute_kpis(scoped_orders)

    asks_kpi = any(k in lower_q for k in ["kpi", "summary", "dashboard", "overview"])
    asks_total = "total sales" in lower_q or ("sales" in lower_q and "total" in lower_q)
    asks_avg = "average" in lower_q and "sale" in lower_q
    asks_monthly = "monthly sales" in lower_q or "month wise" in lower_q
    asks_top_dish = any(k in lower_q for k in ["most ordered", "top ordered", "top dish", "best selling", "most sold"])
    asks_delivered = "delivered" in lower_q and "order" in lower_q
    asks_rejected = "rejected" in lower_q and "order" in lower_q
    asks_best_month = "highest sales month" in lower_q or "which month had highest sales" in lower_q

    # If query is specific to KPIs and not open-ended strategy, answer deterministically.
    if any([
        asks_kpi,
        asks_total,
        asks_avg,
        asks_monthly,
        asks_top_dish,
        asks_delivered,
        asks_rejected,
        asks_best_month,
    ]):
        lines = [f"KPI scope: {scope}"]

        if asks_kpi or not any([
            asks_total,
            asks_avg,
            asks_monthly,
            asks_top_dish,
            asks_delivered,
            asks_rejected,
            asks_best_month,
        ]):
            lines.extend([
                f"- Total sales: Rs {kpi['total_sales']:.2f}",
                f"- Total orders: {kpi['total_orders']}",
                f"- Delivered orders: {kpi['delivered_orders']}",
                f"- Rejected orders: {kpi['rejected_orders']}",
                f"- Completion rate: {kpi['completion_rate']:.2f}%",
                f"- Average order value: Rs {kpi['avg_order_value']:.2f}",
                f"- Most ordered dish: {kpi['top_dish'][0]} (qty {kpi['top_dish'][1]})",
            ])

        if asks_total:
            lines.append(f"- Total sales: Rs {kpi['total_sales']:.2f}")

        if asks_avg:
            lines.append(f"- Average sales per order: Rs {kpi['avg_order_value']:.2f}")

        if asks_monthly:
            lines.append("- Monthly sales:")
            lines.append(format_monthly_sales(kpi["monthly_sales"]))

        if asks_top_dish:
            lines.append(f"- Most ordered dish: {kpi['top_dish'][0]} (qty {kpi['top_dish'][1]})")

        if asks_delivered:
            lines.append(f"- Delivered orders: {kpi['delivered_orders']}")

        if asks_rejected:
            lines.append(f"- Rejected orders: {kpi['rejected_orders']}")

        if asks_best_month:
            best_month, best_sales = kpi["top_month"]
            lines.append(f"- Highest sales month: {best_month} (Rs {best_sales:.2f})")

        return "\n".join(lines)

    return None


def answer_query(query: str, top_k: int = 8) -> str:
    exact = exact_kpi_answer(query)

    query_embedding = model.encode(
        [query],
        convert_to_numpy=True,
        normalize_embeddings=True,
    ).astype("float32")

    _, indices = index.search(query_embedding, top_k)

    retrieved: List[str] = [documents[i] for i in indices[0] if 0 <= i < len(documents)]
    context = "\n".join(retrieved)

    prompt = f"""Use the following sales data to answer clearly and briefly.
If this question is KPI-related, keep suggestions practical for a cloud kitchen manager.
Avoid inventing exact totals; use context patterns only for recommendations.

Data:
{context}

Question:
{query}
"""

    suggestion_text = ""
    try:
        response = ollama.chat(
            model="llama3.2",
            messages=[{"role": "user", "content": prompt}],
            options={"temperature": 0.2, "num_predict": 180},
        )
        suggestion_text = response["message"]["content"]
    except Exception as exc:
        suggestion_text = f"Suggestion engine unavailable ({exc})."

    if exact:
        return f"{exact}\n\nSuggestions:\n{suggestion_text}"
    return suggestion_text


print("RAG ready. Type your question (or 'exit' to quit).")
while True:
    query = input("Ask your sales data: ").strip()
    if not query:
        continue
    if query.lower() in {"exit", "quit"}:
        break

    start = time.perf_counter()
    print(answer_query(query))
    elapsed = time.perf_counter() - start
    print(f"[Latency] {elapsed:.2f}s")