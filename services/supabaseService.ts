import { supabase } from './supabaseClient';
import { ZomatoOrder, User } from '../types';

function toUnixMs(value: unknown): number {
  if (typeof value === 'number') {
    // Treat second-based timestamps as unix seconds and convert to ms.
    return value > 0 && value < 9999999999 ? value * 1000 : value;
  }

  if (typeof value === 'string') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return numeric > 0 && numeric < 9999999999 ? numeric * 1000 : numeric;
    }

    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return Date.now();
}

export const supabaseService = {
  /**
   * Sign up a new user
   */
  async signUp(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  },

  /**
   * Sign in an existing user
   */
  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  /**
   * Get current user session
   */
  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  },

  /**
   * Sign out current user
   */
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  /**
   * Save orders to Supabase
   */
  async saveOrders(userId: string, orders: ZomatoOrder[]) {
    // Upsert orders for the user
    const normalized = orders.map(order => ({
      ...order,
      orderPlacedAt: toUnixMs((order as any).orderPlacedAt),
      user_id: userId,
    }));

    const { error } = await supabase
      .from('orders')
      .upsert(normalized);
    if (error) throw error;
  },

  /**
   * Clear all orders for a user
   */
  async clearOrders(userId: string) {
    const { error } = await supabase
      .from('orders')
      .delete()
      .eq('user_id', userId);
    if (error) throw error;
  },

  /**
   * Load orders for a user
   */
  async loadOrders(userId: string): Promise<ZomatoOrder[]> {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;

    return (data || []).map((order: any) => ({
      ...order,
      orderPlacedAt: toUnixMs(order.orderPlacedAt),
    }));
  },
};