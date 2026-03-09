import json
import faiss
import numpy as np
from datetime import datetime
from sentence_transformers import SentenceTransformer
import torch

device = "cuda" if torch.cuda.is_available() else "cpu"

model = SentenceTransformer(
    "all-MiniLM-L6-v2",
    device=device
)

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

embeddings = model.encode(
    documents,
    batch_size=32,
    show_progress_bar=True,
    convert_to_numpy=True,
    normalize_embeddings=True,
)

dimension = embeddings.shape[1]

index = faiss.IndexFlatL2(dimension)

index.add(np.array(embeddings).astype("float32"))

faiss.write_index(index, "orders_index.faiss")

print("Vector DB created")