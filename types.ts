
export interface User {
  name: string;
  email: string;
  password?: string; // In a real app, never store plain text. For local DSS, simple storage.
}

export interface ZomatoOrder {
  orderId: string;
  restaurantName: string;
  orderPlacedAt: number; // Unix timestamp
  orderStatus: string;
  totalAmount: number;
  rating?: number;
  items?: string;
  customerName?: string;
  city?: string;
}

export interface SalesSummary {
  totalOrders: number;
  totalRevenue: number;
  avgRating: number;
  completionRate: number;
}

export interface ChartDataPoint {
  name: string;
  value: number;
  [key: string]: any;
}

export interface InsightResponse {
  greeting: string;
  alert?: string;
  demandForecasting: string;
  customerInsights: string;
  profitabilityAnalysis: {
    grossRevenue: number;
    zomatoCommission: number;
    estimatedNet: number;
    analysis: string;
  };
  recommendations: string[];
}

export interface HourlyData {
  hour: string;
  orders: number;
  sales: number;
}

export interface StatusDistribution {
  name: string;
  value: number;
  color: string;
}

export interface ItemSales {
  itemName: string;
  quantity: number;
}

// Types for LiveOrders component
export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  customerName: string;
  totalAmount: number;
  timestamp: number;
  items: OrderItem[];
  status: string;
}

export enum SocketStatus {
  CONNECTING = 'Connecting...',
  CONNECTED = 'Connected',
  DISCONNECTED = 'Disconnected'
}

// Types for RAG-based DSS (Decision Support System)
export interface DSSRecommendation {
  category: string;
  insight: string;
  actionItems: string[];
  confidenceScore: number;
}

export interface DSSAnalysis {
  timestamp: string;
  query: string;
  similarOrders: ZomatoOrder[];
  recommendations: DSSRecommendation[];
  executiveSummary: string;
}

export interface RAGKBStats {
  initialized: boolean;
  embeddingsCount: number;
  modelLoaded: boolean;
}
