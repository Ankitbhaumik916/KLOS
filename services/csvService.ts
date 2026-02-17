
import { ZomatoOrder, ItemSales } from "../types";

export const parseCSV = async (file: File): Promise<ZomatoOrder[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) {
          resolve([]);
          return;
        }

        const lines = text.split(/\r\n|\n/);
        
        // CSV Parsing Helper: Handles quoted strings with commas
        const parseLine = (line: string) => {
          const result = [];
          let start = 0;
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            if (line[i] === '"') {
              inQuotes = !inQuotes;
            } else if (line[i] === ',' && !inQuotes) {
              result.push(line.substring(start, i).trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
              start = i + 1;
            }
          }
          result.push(line.substring(start).trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
          return result;
        };

        if (lines.length < 2) {
            resolve([]);
            return;
        }

        const headers = parseLine(lines[0]).map(h => h.toLowerCase().trim());

        // Helper to find column index by loose name matching
        const findCol = (possibleNames: string[]) => {
            return headers.findIndex(h => possibleNames.some(name => h === name.toLowerCase()));
        };

        const idxMap = {
          orderId: findCol(['order id', 'orderid']),
          restaurantName: findCol(['restaurant name', 'restaurant']),
          orderPlacedAt: findCol(['order placed at', 'date', 'created at']),
          orderStatus: findCol(['order status', 'status']),
          total: findCol(['total', 'grand total', 'final amount']), 
          rating: findCol(['rating']),
          items: findCol(['items in order', 'items']),
          city: findCol(['city'])
        };

        const orders: ZomatoOrder[] = [];

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line.trim()) continue;

          const row = parseLine(line);
          if (row.length < headers.length * 0.5) continue; // Skip empty/malformed rows

          const getVal = (idx: number) => (idx !== -1 && row[idx]) ? row[idx] : '';

          // 1. Parse Date
          const dateStr = getVal(idxMap.orderPlacedAt);
          let timestamp = 0;
          
          if (dateStr) {
             let parsed = Date.parse(dateStr);
             if (isNaN(parsed)) {
                 const parts = dateStr.match(/(\d{1,2}:\d{2}\s?[APap][Mm]),\s?(.+)/);
                 if (parts && parts.length === 3) {
                     const fixedDateString = `${parts[2]} ${parts[1]}`;
                     parsed = Date.parse(fixedDateString);
                 }
             }
             if (!isNaN(parsed)) timestamp = parsed;
             else {
                 const simple = dateStr.replace(/,/g, '');
                 timestamp = Date.parse(simple) || 0;
             }
          }
          if (timestamp === 0) timestamp = Date.now(); 

          // 2. Parse Amount
          const amountRaw = getVal(idxMap.total);
          const amountClean = amountRaw.replace(/[^0-9.-]/g, '');
          const amount = parseFloat(amountClean) || 0;

          // 3. Parse Rating
          const ratingRaw = getVal(idxMap.rating);
          const ratingVal = parseFloat(ratingRaw);
          
          const rawId = getVal(idxMap.orderId);
          const orderId = rawId || `GEN-${timestamp}-${i}-${Math.random().toString(36).substr(2, 9)}`;

          orders.push({
            orderId: orderId,
            restaurantName: getVal(idxMap.restaurantName) || 'Unknown',
            orderPlacedAt: timestamp,
            orderStatus: getVal(idxMap.orderStatus) || 'Unknown',
            totalAmount: amount,
            rating: !isNaN(ratingVal) ? ratingVal : undefined,
            items: getVal(idxMap.items),
            city: getVal(idxMap.city)
          });
        }

        resolve(orders);
      } catch (err) {
        console.error("CSV Parse logic error", err);
        reject(err);
      }
    };

    reader.onerror = (err) => reject(err);
    reader.readAsText(file);
  });
};

/**
 * Parses the "Items in order" string (e.g., "1 x Item A, 2 x Item B") 
 * and aggregates sales count per item.
 */
export const extractTopItems = (orders: ZomatoOrder[]): ItemSales[] => {
  const itemCounts = new Map<string, number>();

  orders.forEach(order => {
    if (!order.items) return;

    // Split by comma (assuming comma separates items, need to be careful with commas in names)
    // Zomato format often: "1 x Butter Chicken, 2 x Naan"
    const parts = order.items.split(','); 
    
    parts.forEach(part => {
      const trimmed = part.trim();
      // Regex to find Quantity x Name
      const match = trimmed.match(/^(\d+)\s*[xX]\s*(.+)$/);
      
      if (match) {
        const qty = parseInt(match[1]);
        const name = match[2].trim();
        itemCounts.set(name, (itemCounts.get(name) || 0) + qty);
      } else {
        // Fallback: assume quantity 1 if pattern doesn't match but text exists
        if (trimmed.length > 2) {
           itemCounts.set(trimmed, (itemCounts.get(trimmed) || 0) + 1);
        }
      }
    });
  });

  return Array.from(itemCounts.entries())
    .map(([itemName, quantity]) => ({ itemName, quantity }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);
};
