import { supabase } from './supabaseClient';
import { ZomatoOrder, User } from '../types';

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint, record.code]
      .filter((part) => typeof part === 'string' && part.trim().length > 0);
    if (parts.length > 0) return parts.join(' | ');
    try {
      return JSON.stringify(error);
    } catch {
      return 'Unknown Supabase error';
    }
  }
  return 'Unknown Supabase error';
}

function throwSupabaseError(error: unknown, fallbackMessage: string): never {
  const message = toErrorMessage(error);
  throw new Error(message === 'Unknown Supabase error' ? fallbackMessage : message);
}

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

function toSupabaseTimestamp(value: unknown): string {
  return new Date(toUnixMs(value)).toISOString();
}

function normalizeOrderId(value: unknown): string {
  return String(value ?? '').trim();
}

function encodeScopedOrderId(userId: string, orderId: unknown): string {
  const raw = String(orderId ?? '').trim() || `GEN-${Date.now()}`;
  if (raw.startsWith(`${userId}::`)) return raw;
  return `${userId}::${raw}`;
}

function decodeScopedOrderId(userId: string, orderId: unknown): string {
  const raw = String(orderId ?? '').trim();
  const prefix = `${userId}::`;
  return raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
}

async function requireCloudUser(expectedUserId?: string): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throwSupabaseError(error, 'Failed to verify Supabase authentication session.');

  const cloudUserId = data.user?.id;
  if (!cloudUserId) {
    throw new Error('No active Supabase session. Log out and sign in again using cloud auth, then retry upload.');
  }

  if (expectedUserId && cloudUserId !== expectedUserId) {
    throw new Error('Cloud session user mismatch. Please log out and sign in again before syncing data.');
  }

  return cloudUserId;
}

export const supabaseService = {
  /**
   * Sign up a new user
   */
  async signUp(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throwSupabaseError(error, 'Sign up failed.');
    return data;
  },

  /**
   * Sign in an existing user
   */
  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throwSupabaseError(error, 'Sign in failed.');
    return data;
  },

  /**
   * Get current user session
   */
  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throwSupabaseError(error, 'Failed to read Supabase session.');
    return data.session;
  },

  /**
   * Sign out current user
   */
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throwSupabaseError(error, 'Sign out failed.');
  },

  /**
   * Save orders to Supabase
   */
  async saveOrders(userId: string, orders: ZomatoOrder[]) {
    const cloudUserId = await requireCloudUser(userId);

    // Upsert by scoped orderId so re-imports can update changed fields.
    const normalized = orders.map(order => ({
      ...order,
      orderId: encodeScopedOrderId(cloudUserId, order.orderId),
      orderPlacedAt: toSupabaseTimestamp((order as any).orderPlacedAt),
      user_id: cloudUserId,
    }));
    const { error } = await supabase
      .from('orders')
      .upsert(normalized, {
        onConflict: 'orderId',
      });
    if (error) throwSupabaseError(error, 'Failed to save orders to Supabase.');
  },

  /**
   * Verify how many uploaded order IDs exist in Supabase for the cloud user.
   */
  async countExistingOrderIds(userId: string, orderIds: string[]): Promise<number> {
    const cloudUserId = await requireCloudUser(userId);
    const scopedIds = Array.from(
      new Set(orderIds.map((id) => encodeScopedOrderId(cloudUserId, normalizeOrderId(id))))
    );

    if (scopedIds.length === 0) return 0;

    const { data, error } = await supabase
      .from('orders')
      .select('orderId')
      .eq('user_id', cloudUserId)
      .in('orderId', scopedIds);

    if (error) throwSupabaseError(error, 'Failed to verify uploaded order IDs in Supabase.');
    return (data || []).length;
  },

  /**
   * Clear all orders for a user
   */
  async clearOrders(userId: string) {
    const cloudUserId = await requireCloudUser(userId);

    const { error } = await supabase
      .from('orders')
      .delete()
      .eq('user_id', cloudUserId);
    if (error) throwSupabaseError(error, 'Failed to clear Supabase orders.');
  },

  /**
   * Load orders for a user
   */
  async loadOrders(userId: string): Promise<ZomatoOrder[]> {
    const cloudUserId = await requireCloudUser(userId);

    const pageSize = 1000;
    let from = 0;
    const rows: any[] = [];

    while (true) {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', cloudUserId)
        .order('orderPlacedAt', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throwSupabaseError(error, 'Failed to load orders from Supabase.');

      const batch = data || [];
      rows.push(...batch);

      if (batch.length < pageSize) break;
      from += pageSize;
    }

    return rows.map((order: any) => ({
      ...order,
      orderId: decodeScopedOrderId(cloudUserId, order.orderId),
      orderPlacedAt: toUnixMs(order.orderPlacedAt),
    }));
  },
};