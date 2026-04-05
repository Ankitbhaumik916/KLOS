import json
with open("clos_orders_sanjoybhaumik42@gmail.com.json", "r") as f:
    data= json.load(f)
documents=[]
for order in data:
    doc=f"""Order ID: {order['orderId']}
Restaurant: {order['restaurantName']}
Status: {order['orderStatus']}
Amount: {order['totalAmount']}
Items: {order['items']}
City: {order['city']}
"""
    documents.append(doc)
print("Documents:", documents[:2])