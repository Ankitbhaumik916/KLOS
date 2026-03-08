import json
import faiss
import numpy as np
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
    doc = f"""
    Order ID: {order['orderId']}
    Restaurant: {order['restaurantName']}
    Status: {order['orderStatus']}
    Amount: {order['totalAmount']}
    Items: {order['items']}
    City: {order['city']}
    """

    documents.append(doc)

embeddings = model.encode(
    documents,
    batch_size=32,
    show_progress_bar=True
)

dimension = embeddings.shape[1]

index = faiss.IndexFlatL2(dimension)

index.add(np.array(embeddings).astype("float32"))

faiss.write_index(index, "orders_index.faiss")

print("Vector DB created")