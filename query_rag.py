import faiss
import json
import numpy as np
import ollama
import torch
from sentence_transformers import SentenceTransformer

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
    doc = f"""
    Order ID: {order['orderId']}
    Restaurant: {order['restaurantName']}
    Status: {order['orderStatus']}
    Amount: {order['totalAmount']}
    Items: {order['items']}
    City: {order['city']}
    """
    documents.append(doc)

query = input("Ask your sales data: ")

query_embedding = model.encode([query])

distances, indices = index.search(np.array(query_embedding), 5)

context = "\n".join([documents[i] for i in indices[0]])

prompt = f"""
Use the following sales data to answer.

Data:
{context}

Question:
{query}
"""

response = ollama.chat(
    model="llama3.2",
    messages=[{"role": "user", "content": prompt}]
)

print(response["message"]["content"])