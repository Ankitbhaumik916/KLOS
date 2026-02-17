import { ZomatoOrder } from '../types';

export interface BusinessMetrics {
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  avgRating: number;
  completionRate: number;
  rejectionRate: number;
  completedOrders: number;
  rejectedOrders: number;
  topRestaurants: Array<{ name: string; count: number; revenue: number }>;
  topCities: Array<{ name: string; count: number; avgRating: number }>;
  popularItems: Array<{ item: string; frequency: number; avgRating: number }>;
  ratingDistribution: { [key: number]: number };
  statusDistribution: { [key: string]: number };
  revenueByCity: { [key: string]: number };
  revenueByRestaurant: { [key: string]: number };
  estimatedProfit: number;
  zomatoCommission: number;
}

export interface RejectionAnalysis {
  totalRejected: number;
  rejectionRate: number;
  estimatedLoss: number;
  byCity: { [key: string]: number };
  byRestaurant: { [key: string]: number };
  byTimeOfDay: { [key: string]: number };
}

export interface InventoryInsight {
  topItems: Array<{ item: string; frequency: number; trend: 'up' | 'down' | 'stable' }>;
  recommendedStock: { [key: string]: number };
  byCity: { [key: string]: string[] };
  predictedDemand: number;
}

class BusinessMetricsService {
  /**
   * Calculate comprehensive business metrics
   */
  calculateMetrics(orders: ZomatoOrder[]): BusinessMetrics {
    if (orders.length === 0) {
      return this.getEmptyMetrics();
    }

    const totalRevenue = orders.reduce((sum, o) => sum + o.totalAmount, 0);
    const completedOrders = orders.filter(o => o.orderStatus === 'Completed').length;
    const rejectedOrders = orders.filter(o => o.orderStatus === 'Rejected').length;
    const ratedOrders = orders.filter(o => o.rating !== undefined && o.rating !== null);

    return {
      totalOrders: orders.length,
      totalRevenue,
      avgOrderValue: totalRevenue / orders.length,
      avgRating: ratedOrders.length > 0 
        ? ratedOrders.reduce((sum, o) => sum + (o.rating || 0), 0) / ratedOrders.length
        : 0,
      completionRate: (completedOrders / orders.length) * 100,
      rejectionRate: (rejectedOrders / orders.length) * 100,
      completedOrders,
      rejectedOrders,
      topRestaurants: this.getTopRestaurants(orders),
      topCities: this.getTopCities(orders),
      popularItems: this.getPopularItems(orders),
      ratingDistribution: this.getRatingDistribution(orders),
      statusDistribution: this.getStatusDistribution(orders),
      revenueByCity: this.getRevenueByCity(orders),
      revenueByRestaurant: this.getRevenueByRestaurant(orders),
      estimatedProfit: (totalRevenue * 0.65),
      zomatoCommission: (totalRevenue * 0.35)
    };
  }

  /**
   * Analyze rejection patterns
   */
  analyzeRejections(orders: ZomatoOrder[]): RejectionAnalysis {
    const rejectedOrders = orders.filter(o => o.orderStatus === 'Rejected');
    const totalRejected = rejectedOrders.length;
    const estimatedLoss = rejectedOrders.reduce((sum, o) => sum + o.totalAmount, 0);

    const byCity: { [key: string]: number } = {};
    const byRestaurant: { [key: string]: number } = {};
    const byTimeOfDay: { [key: string]: number } = {};

    rejectedOrders.forEach(order => {
      // By City
      if (order.city) {
        byCity[order.city] = (byCity[order.city] || 0) + 1;
      }

      // By Restaurant
      byRestaurant[order.restaurantName] = (byRestaurant[order.restaurantName] || 0) + 1;

      // By Time of Day
      const hour = new Date(order.orderPlacedAt).getHours();
      const timeSlot = this.getTimeSlot(hour);
      byTimeOfDay[timeSlot] = (byTimeOfDay[timeSlot] || 0) + 1;
    });

    return {
      totalRejected,
      rejectionRate: (totalRejected / orders.length) * 100,
      estimatedLoss,
      byCity,
      byRestaurant,
      byTimeOfDay
    };
  }

  /**
   * Generate inventory insights
   */
  generateInventoryInsights(
    orders: ZomatoOrder[],
    recentOrders?: ZomatoOrder[]
  ): InventoryInsight {
    const topItems = this.getPopularItems(orders);
    const recommendedStock: { [key: string]: number } = {};

    // Calculate recommended stock based on frequency
    topItems.slice(0, 10).forEach(item => {
      recommendedStock[item.item] = Math.ceil(item.frequency / 7) * 1.2; // Weekly + 20% buffer
    });

    // By city analysis
    const byCity: { [key: string]: string[] } = {};
    orders.forEach(order => {
      if (order.city && order.items) {
        if (!byCity[order.city]) {
          byCity[order.city] = [];
        }
        byCity[order.city].push(order.items);
      }
    });

    // Trend analysis
    const recentPopular = recentOrders ? this.getPopularItems(recentOrders) : topItems;
    const trendComparison = topItems.map((item, idx) => {
      const recentIdx = recentPopular.findIndex(rp => rp.item === item.item);
      if (recentIdx === -1) {
        return { ...item, trend: 'down' as const };
      }
      if (recentIdx < idx) {
        return { ...item, trend: 'up' as const };
      }
      if (recentIdx > idx) {
        return { ...item, trend: 'down' as const };
      }
      return { ...item, trend: 'stable' as const };
    });

    return {
      topItems: trendComparison.slice(0, 10),
      recommendedStock,
      byCity,
      predictedDemand: Math.ceil((orders.length / 30) * 1.1) // Monthly average + 10%
    };
  }

  /**
   * Calculate pricing optimization
   */
  calculatePricingOptimization(orders: ZomatoOrder[]) {
    const completed = orders.filter(o => o.orderStatus === 'Completed');
    const abandoned = orders.filter(o => o.orderStatus === 'Rejected' || o.orderStatus === 'Cancelled');

    const completedAvg = completed.length > 0 
      ? completed.reduce((sum, o) => sum + o.totalAmount, 0) / completed.length
      : 0;

    const abandonedAvg = abandoned.length > 0
      ? abandoned.reduce((sum, o) => sum + o.totalAmount, 0) / abandoned.length
      : 0;

    return {
      currentAvgPrice: orders.reduce((sum, o) => sum + o.totalAmount, 0) / orders.length,
      completionByPrice: this.getCompletionByPriceRange(completed, abandoned),
      optimalPricePoint: completedAvg,
      priceElasticity: abandonedAvg > 0 ? (abandonedAvg - completedAvg) / completedAvg : 0,
      recommendedIncrease: completedAvg * 1.05,
      recommendedStrategy: this.getPricingStrategy(completedAvg, abandonedAvg)
    };
  }

  /**
   * Analyze customer satisfaction trends
   */
  analyzeSatisfactionTrends(orders: ZomatoOrder[]) {
    const ratedOrders = orders.filter(o => o.rating !== undefined && o.rating !== null);
    const completed = orders.filter(o => o.orderStatus === 'Completed');

    const avgRating = ratedOrders.length > 0
      ? ratedOrders.reduce((sum, o) => sum + (o.rating || 0), 0) / ratedOrders.length
      : 0;

    const by5Star = ratedOrders.filter(o => o.rating === 5).length;
    const by4Star = ratedOrders.filter(o => o.rating === 4).length;
    const by3Star = ratedOrders.filter(o => o.rating === 3).length;
    const by2Star = ratedOrders.filter(o => o.rating === 2).length;
    const by1Star = ratedOrders.filter(o => o.rating === 1).length;

    return {
      avgRating: avgRating.toFixed(2),
      ratingDistribution: {
        five: by5Star,
        four: by4Star,
        three: by3Star,
        two: by2Star,
        one: by1Star
      },
      percentageAbove4: ratedOrders.length > 0 
        ? ((by5Star + by4Star) / ratedOrders.length * 100).toFixed(1)
        : 0,
      improvementAreas: this.getImprovementAreas(by1Star, by2Star, orders),
      strengths: this.getStrengths(by5Star, by4Star, ratedOrders.length)
    };
  }

  // ---- Private helpers ----

  private getEmptyMetrics(): BusinessMetrics {
    return {
      totalOrders: 0,
      totalRevenue: 0,
      avgOrderValue: 0,
      avgRating: 0,
      completionRate: 0,
      rejectionRate: 0,
      completedOrders: 0,
      rejectedOrders: 0,
      topRestaurants: [],
      topCities: [],
      popularItems: [],
      ratingDistribution: {},
      statusDistribution: {},
      revenueByCity: {},
      revenueByRestaurant: {},
      estimatedProfit: 0,
      zomatoCommission: 0
    };
  }

  private getTopRestaurants(orders: ZomatoOrder[], limit = 5) {
    const restaurants: { [key: string]: { count: number; revenue: number } } = {};

    orders.forEach(order => {
      if (!restaurants[order.restaurantName]) {
        restaurants[order.restaurantName] = { count: 0, revenue: 0 };
      }
      restaurants[order.restaurantName].count++;
      restaurants[order.restaurantName].revenue += order.totalAmount;
    });

    return Object.entries(restaurants)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  }

  private getTopCities(orders: ZomatoOrder[], limit = 5) {
    const cities: { [key: string]: { count: number; ratings: number[] } } = {};

    orders.forEach(order => {
      if (order.city) {
        if (!cities[order.city]) {
          cities[order.city] = { count: 0, ratings: [] };
        }
        cities[order.city].count++;
        if (order.rating) {
          cities[order.city].ratings.push(order.rating);
        }
      }
    });

    return Object.entries(cities)
      .map(([name, data]) => ({
        name,
        count: data.count,
        avgRating: data.ratings.length > 0
          ? data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length
          : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  private getPopularItems(orders: ZomatoOrder[], limit = 15) {
    const items: { [key: string]: { frequency: number; ratings: number[] } } = {};

    orders.forEach(order => {
      if (order.items) {
        const itemList = order.items.split(',').map(i => i.trim());
        itemList.forEach(item => {
          if (!items[item]) {
            items[item] = { frequency: 0, ratings: [] };
          }
          items[item].frequency++;
          if (order.rating) {
            items[item].ratings.push(order.rating);
          }
        });
      }
    });

    return Object.entries(items)
      .map(([item, data]) => ({
        item,
        frequency: data.frequency,
        avgRating: data.ratings.length > 0
          ? data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length
          : 0
      }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, limit);
  }

  private getRatingDistribution(orders: ZomatoOrder[]) {
    const dist: { [key: number]: number } = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    orders.forEach(order => {
      if (order.rating && order.rating >= 1 && order.rating <= 5) {
        dist[order.rating]++;
      }
    });
    return dist;
  }

  private getStatusDistribution(orders: ZomatoOrder[]) {
    const dist: { [key: string]: number } = {};
    orders.forEach(order => {
      dist[order.orderStatus] = (dist[order.orderStatus] || 0) + 1;
    });
    return dist;
  }

  private getRevenueByCity(orders: ZomatoOrder[]) {
    const revenue: { [key: string]: number } = {};
    orders.forEach(order => {
      if (order.city) {
        revenue[order.city] = (revenue[order.city] || 0) + order.totalAmount;
      }
    });
    return revenue;
  }

  private getRevenueByRestaurant(orders: ZomatoOrder[]) {
    const revenue: { [key: string]: number } = {};
    orders.forEach(order => {
      revenue[order.restaurantName] = (revenue[order.restaurantName] || 0) + order.totalAmount;
    });
    return revenue;
  }

  private getTimeSlot(hour: number): string {
    if (hour < 6) return 'Night (12am-6am)';
    if (hour < 12) return 'Morning (6am-12pm)';
    if (hour < 18) return 'Afternoon (12pm-6pm)';
    return 'Evening (6pm-12am)';
  }

  private getCompletionByPriceRange(
    completed: ZomatoOrder[],
    abandoned: ZomatoOrder[]
  ) {
    const ranges = [
      { min: 0, max: 100 },
      { min: 100, max: 200 },
      { min: 200, max: 300 },
      { min: 300, max: 500 },
      { min: 500, max: 10000 }
    ];

    return ranges.map(range => {
      const completedInRange = completed.filter(
        o => o.totalAmount >= range.min && o.totalAmount < range.max
      ).length;
      const abandonedInRange = abandoned.filter(
        o => o.totalAmount >= range.min && o.totalAmount < range.max
      ).length;
      const total = completedInRange + abandonedInRange;

      return {
        range: `₹${range.min}-${range.max}`,
        completionRate: total > 0 ? (completedInRange / total) * 100 : 0,
        totalOrders: total
      };
    });
  }

  private getPricingStrategy(completedAvg: number, abandonedAvg: number): string {
    if (completedAvg > abandonedAvg * 1.2) {
      return 'PREMIUM: Higher prices still convert well - consider increasing slightly';
    }
    if (completedAvg < abandonedAvg * 0.8) {
      return 'DISCOUNT: Abandoned orders are at higher price - test lower price points';
    }
    return 'BALANCED: Current pricing is optimal';
  }

  private getImprovementAreas(lowRatings1: number, lowRatings2: number, orders: ZomatoOrder[]): string[] {
    const areas: string[] = [];
    const totalOrders = orders.length;

    if ((lowRatings1 + lowRatings2) / totalOrders > 0.1) {
      areas.push('Quality consistency needs improvement');
    }
    const rejectionRate = orders.filter(o => o.orderStatus === 'Rejected').length / totalOrders;
    if (rejectionRate > 0.15) {
      areas.push('High rejection rate affecting ratings');
    }
    if (orders.filter(o => o.orderStatus === 'Completed').length < totalOrders * 0.85) {
      areas.push('Order fulfillment completion rate too low');
    }

    return areas.length > 0 ? areas : ['Maintain current quality standards'];
  }

  private getStrengths(fiveStars: number, fourStars: number, totalRated: number): string[] {
    const strengths: string[] = [];
    const topRating = (fiveStars + fourStars) / totalRated;

    if (topRating > 0.8) {
      strengths.push('Consistently high customer satisfaction');
    }
    if (fiveStars / totalRated > 0.5) {
      strengths.push('Exceptional quality delivering 5-star ratings');
    }

    return strengths.length > 0 ? strengths : ['Good baseline performance'];
  }
}

export const businessMetricsService = new BusinessMetricsService();
