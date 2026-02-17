
import { ZomatoOrder } from "../types";
import { authService } from "./authService";

/**
 * User-aware persistent storage using localStorage.
 * Data is keyed per user email so each user has their own dataset.
 */

function getStorageKey(): string {
  const session = authService.getSession();
  const email = session?.email || 'guest';
  return authService.getUserDataKey(email);
}

export const storageService = {
  /**
   * Load all orders from local storage for the current user
   */
  loadOrders: (): ZomatoOrder[] => {
    try {
      const key = getStorageKey();
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error("Failed to load orders from storage", error);
      return [];
    }
  },

  /**
   * Save orders to local storage, merging with existing data and removing duplicates
   */
  saveOrders: (newOrders: ZomatoOrder[]): ZomatoOrder[] => {
    try {
      const key = getStorageKey();
      const existing = storageService.loadOrders();
      
      // Create a Map for deduplication based on Order ID
      const orderMap = new Map<string, ZomatoOrder>();
      
      // Load existing first
      existing.forEach(o => orderMap.set(o.orderId, o));
      
      // Add new (overwriting if ID exists to ensure updates)
      newOrders.forEach(o => orderMap.set(o.orderId, o));
      
      const merged = Array.from(orderMap.values());
      
      // Sort by date desc
      merged.sort((a, b) => b.orderPlacedAt - a.orderPlacedAt);
      
      localStorage.setItem(key, JSON.stringify(merged));
      return merged;
    } catch (error) {
      console.error("Failed to save orders", error);
      alert("Storage limit reached! Try clearing old data.");
      return newOrders;
    }
  },

  /**
   * Clear all stored data for the current user
   */
  clearOrders: () => {
    const key = getStorageKey();
    localStorage.removeItem(key);
  }
};
