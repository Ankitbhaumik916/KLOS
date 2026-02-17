import { ZomatoOrder } from '../types';
import { env } from '@xenova/transformers';

// Set Transformers.js to use remote models (prevent local storage bloat during inference)
env.allowRemoteModels = true;
env.allowLocalModels = true;

interface OrderEmbedding {
  orderId: string;
  embedding: number[];
  order: ZomatoOrder;
  summary: string;
}

interface DSSRecommendation {
  category: string;
  insight: string;
  actionItems: string[];
  confidenceScore: number;
}

interface DSSAnalysis {
  timestamp: string;
  query: string;
  similarOrders: ZomatoOrder[];
  recommendations: DSSRecommendation[];
  executiveSummary: string;
}

class RAGDSSService {
  private embeddings: OrderEmbedding[] = [];
  private isInitialized = false;
  private modelPromise: Promise<any> | null = null;

  /**
   * Initialize embeddings model (lazy load)
   */
  private async initModel() {
    if (this.modelPromise) return this.modelPromise;
    
    this.modelPromise = (async () => {
      try {
        const { pipeline } = await import('@xenova/transformers');
        return await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
      } catch (err) {
        console.error('Failed to load embedding model:', err);
        throw err;
      }
    })();

    return this.modelPromise;
  }

  /**
   * Generate embedding for text using sentence-transformers
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const extractor = await this.initModel();
      const result = await extractor(text, { pooling: 'mean', normalize: true });
      return Array.from(result.data);
    } catch (err) {
      console.warn('Embedding generation failed, using fallback:', err);
      return this.simpleHashEmbedding(text);
    }
  }

  /**
   * Fallback: Simple hash-based "embedding" (not ideal but works offline)
   */
  private simpleHashEmbedding(text: string): number[] {
    const hash = (str: string) => {
      let h = 0;
      for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h = h & h; // Convert to 32bit
      }
      return h;
    };

    const vectors: number[] = [];
    for (let i = 0; i < 384; i++) {
      vectors.push((hash(text + i) % 100) / 100);
    }
    return vectors;
  }

  /**
   * Build semantic summary of order for embeddings
   */
  private buildOrderSummary(order: ZomatoOrder): string {
    return `Order ${order.orderId} at ${order.restaurantName} for ₹${order.totalAmount} status ${order.orderStatus} items ${order.items || 'unknown'} rating ${order.rating || 'unrated'} city ${order.city || 'unknown'}`;
  }

  /**
   * Prepare all orders with embeddings
   */
  async buildKnowledgeBase(orders: ZomatoOrder[]): Promise<void> {
    console.log(`Building RAG knowledge base for ${orders.length} orders...`);
    this.embeddings = [];

    for (const order of orders) {
      try {
        const summary = this.buildOrderSummary(order);
        const embedding = await this.generateEmbedding(summary);
        this.embeddings.push({
          orderId: order.orderId,
          embedding,
          order,
          summary
        });
      } catch (err) {
        console.warn(`Failed to embed order ${order.orderId}:`, err);
      }
    }

    this.isInitialized = true;
    console.log(`✓ RAG KB built with ${this.embeddings.length} embeddings`);
  }

  /**
   * Cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * (b[i] || 0), 0);
    const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return magA && magB ? dotProduct / (magA * magB) : 0;
  }

  /**
   * Retrieve top K similar orders based on query
   */
  async retrieveSimilarOrders(query: string, topK: number = 5): Promise<ZomatoOrder[]> {
    if (!this.isInitialized || this.embeddings.length === 0) {
      console.warn('RAG KB not initialized');
      return [];
    }

    try {
      const queryEmbedding = await this.generateEmbedding(query);

      const similarities = this.embeddings.map(item => ({
        ...item,
        similarity: this.cosineSimilarity(queryEmbedding, item.embedding)
      }));

      return similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK)
        .map(item => item.order);
    } catch (err) {
      console.error('Retrieval failed:', err);
      return [];
    }
  }

  /**
   * Analyze orders and generate DSS recommendations using Llama
   */
  async generateDSSAnalysis(
    query: string,
    orders: ZomatoOrder[],
    userName: string,
    baseUrl: string = 'http://localhost:11434'
  ): Promise<DSSAnalysis> {
    // Step 1: Retrieve similar orders from knowledge base
    const similarOrders = await this.retrieveSimilarOrders(query, 5);

    // Step 2: Build context for Llama
    const context = this.buildLlamaContext(orders, similarOrders, query);

    // Step 3: Query Llama for deep analysis
    let llamaResponse = '';
    try {
      llamaResponse = await this.queryLlama(context, userName, baseUrl);
    } catch (err) {
      console.warn('Llama query failed, using local analysis:', err);
      llamaResponse = this.localDSSFallback(similarOrders, query, userName);
    }

    // Step 4: Parse response into structured recommendations
    const recommendations = this.parseRecommendations(llamaResponse);
    const executiveSummary = this.generateExecutiveSummary(similarOrders, query);

    return {
      timestamp: new Date().toISOString(),
      query,
      similarOrders: similarOrders.slice(0, 3), // Return top 3 for display
      recommendations,
      executiveSummary
    };
  }

  /**
   * Build context for Llama including similar orders
   */
  private buildLlamaContext(
    allOrders: ZomatoOrder[],
    similarOrders: ZomatoOrder[],
    query: string
  ): string {
    const stats = {
      totalOrders: allOrders.length,
      totalRevenue: allOrders.reduce((sum, o) => sum + o.totalAmount, 0),
      avgRating: allOrders.filter(o => o.rating).length > 0
        ? (allOrders.filter(o => o.rating).reduce((sum, o) => sum + (o.rating || 0), 0) / 
          allOrders.filter(o => o.rating).length).toFixed(2)
        : 'N/A',
      completedOrders: allOrders.filter(o => o.orderStatus === 'Completed').length,
      rejectedOrders: allOrders.filter(o => o.orderStatus === 'Rejected').length
    };

    const similarContext = similarOrders
      .slice(0, 3)
      .map((o, i) => 
        `Similar Order ${i + 1}: ${o.restaurantName} - ₹${o.totalAmount} (${o.orderStatus}) Rating: ${o.rating || 'N/A'}`
      )
      .join('\n');

    return `CLOUD KITCHEN DSS ANALYSIS REQUEST

QUERY: ${query}

DATASET STATS:
- Total Orders: ${stats.totalOrders}
- Total Revenue: ₹${stats.totalRevenue}
- Avg Rating: ${stats.avgRating}/5
- Completed: ${stats.completedOrders} | Rejected: ${stats.rejectedOrders}

SIMILAR HISTORICAL ORDERS:
${similarContext}

Please provide:
1. Data-driven insights
2. 2-3 specific actionable recommendations
3. Risk assessment if applicable`;
  }

  /**
   * Query local Llama 3.2 instance
   */
  private async queryLlama(
    context: string,
    userName: string,
    baseUrl: string
  ): Promise<string> {
    const prompt = `You are 'KitchenOS DSS', a Decision Support System advisor for ${userName}'s cloud kitchen.

${context}

Provide strategic, data-backed recommendations. Be concise and actionable. Format your response with clear sections.`;

    const endpoints = [
      `${baseUrl}/api/generate`,
      `${baseUrl}/api/chat`,
      `${baseUrl}/api/completions`
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama3.2',
            prompt,
            stream: false,
            temperature: 0.3
          })
        });

        if (!response.ok) continue;

        const data = await response.json();
        if (data.response) return data.response;
        if (data.message?.content) return data.message.content;
        if (data.choices?.[0]?.text) return data.choices[0].text;
      } catch (err) {
        console.warn(`Endpoint ${endpoint} failed:`, err);
      }
    }

    throw new Error('All Llama endpoints failed');
  }

  /**
   * Fallback local analysis when Llama is unavailable - QUERY SPECIFIC
   */
  private localDSSFallback(
    similarOrders: ZomatoOrder[],
    query: string,
    userName: string
  ): string {
    const lowerQuery = query.toLowerCase();

    // Analyze similar orders
    const avgRating = similarOrders.filter(o => o.rating).length > 0
      ? (similarOrders.filter(o => o.rating).reduce((sum, o) => sum + (o.rating || 0), 0) /
        similarOrders.filter(o => o.rating).length).toFixed(1)
      : 'N/A';

    const completedCount = similarOrders.filter(o => o.orderStatus === 'Completed').length;
    const rejectedCount = similarOrders.filter(o => o.orderStatus === 'Rejected').length;
    const completionRate = (completedCount / similarOrders.length) * 100;
    
    const avgValue = similarOrders.reduce((sum, o) => sum + o.totalAmount, 0) / similarOrders.length;
    const totalRevenue = similarOrders.reduce((sum, o) => sum + o.totalAmount, 0);

    let analysis = `DSS ANALYSIS FOR: "${query}"

DATA FROM ${similarOrders.length} SIMILAR ORDERS:
- Average Rating: ${avgRating}/5
- Completion Rate: ${completionRate.toFixed(0)}% (${completedCount}/${similarOrders.length})
- Avg Order Value: ₹${avgValue.toFixed(0)}
- Total Revenue: ₹${totalRevenue.toFixed(0)}
- Top Restaurant: ${similarOrders[0]?.restaurantName || 'N/A'}

`;

    // Query-specific recommendations
    if (lowerQuery.includes('rating') || lowerQuery.includes('customer') || lowerQuery.includes('satisfaction')) {
      analysis += `INSIGHTS ON CUSTOMER RATINGS:
- Current avg rating from similar orders: ${avgRating}/5
- ${rejectedCount > 0 ? `${((rejectedCount/similarOrders.length)*100).toFixed(0)}% rejection rate affecting perception` : 'Strong completion track record'}
- Customer satisfaction depends on: timeliness, food quality, accuracy of order

RECOMMENDATIONS:
1. Focus on completing ALL orders (75%+ should be at minimum)
2. Ensure food temperature maintained during delivery
3. Double-check order accuracy before dispatch
4. Get customer feedback for sub-4.0 rated orders
5. For ${similarOrders[0]?.restaurantName}: maintain quality consistency`;
    } 
    else if (lowerQuery.includes('rejection') || lowerQuery.includes('fail') || lowerQuery.includes('issue')) {
      analysis += `INSIGHTS ON ORDER REJECTIONS:
- ${rejectedCount} out of ${similarOrders.length} orders rejected (${((rejectedCount/similarOrders.length)*100).toFixed(0)}%)
- Rejection cost: ₹${((rejectedCount/similarOrders.length) * totalRevenue).toFixed(0)} from these similar orders
- ${completionRate < 60 ? 'Critical: Over 40% rejection rate needs immediate investigation' : 'Acceptable rejection rate'}

RECOMMENDATIONS:
1. Identify common rejection reasons (customer unavailable, payment issues, etc.)
2. For ${similarOrders[0]?.restaurantName}: check if quality/delivery time is issue
3. Pre-order verification call to reduce prep-waste rejections
4. Offer time-window flexibility to reduce unavailability rejections
5. Monitor next 50 orders to track improvement`;
    }
    else if (lowerQuery.includes('menu') || lowerQuery.includes('item') || lowerQuery.includes('popular')) {
      analysis += `INSIGHTS ON MENU PERFORMANCE:
- Revenue per order: ₹${avgValue.toFixed(0)} average
- ${similarOrders[0]?.items || 'Multiple items'} appears in similar orders
- High-value items: Focus on combos and multi-item orders

RECOMMENDATIONS:
1. Bundle popular items from ${similarOrders[0]?.restaurantName} into combo offers
2. Promote higher-value items (current avg order ₹${avgValue.toFixed(0)})
3. Reduce low-margin single items
4. Create tier-based pricing: value, regular, premium
5. A/B test 2-3 new items with similar order patterns`;
    }
    else if (lowerQuery.includes('revenue') || lowerQuery.includes('profit') || lowerQuery.includes('margin')) {
      analysis += `INSIGHTS ON REVENUE & PROFITABILITY:
- Revenue from similar orders: ₹${totalRevenue.toFixed(0)}
- Avg per order: ₹${avgValue.toFixed(0)}
- Zomato commission (est 35%): ₹${(totalRevenue * 0.35).toFixed(0)}
- Net margin (est 65%): ₹${(totalRevenue * 0.65).toFixed(0)}
- Volume × Margin = Your profit target

RECOMMENDATIONS:
1. Increase order volume by 20% through promotions (target ₹${(totalRevenue * 1.2).toFixed(0)})
2. Reduce Zomato dependency: build direct orders
3. Focus on high-margin items (₹300+ orders only)
4. ${completedCount < similarOrders.length * 0.8 ? 'Fix rejections first - they kill profit' : 'Good completion rate - scale up'}
5. Negotiate better commission rates at ₹${totalRevenue.toFixed(0)}+ monthly revenue`;
    }
    else if (lowerQuery.includes('time') || lowerQuery.includes('peak') || lowerQuery.includes('demand') || lowerQuery.includes('trend')) {
      analysis += `INSIGHTS ON DEMAND PATTERNS:
- Similar orders average value: ₹${avgValue.toFixed(0)}
- Completion consistency: ${completionRate.toFixed(0)}%
- Order distribution: ${similarOrders.filter(o => o.orderStatus === 'Completed').length} completed, ${rejectedCount} rejected

RECOMMENDATIONS:
1. Analyze peak hours from order timestamps
2. Staff appropriately for high-demand periods
3. Pre-position inventory for top 3 items
4. Offer time-based discounts in low-demand hours
5. Monitor if specific times have higher rejection rates`;
    }
    else if (lowerQuery.includes('operation') || lowerQuery.includes('improve') || lowerQuery.includes('strategy')) {
      analysis += `OPERATIONAL INSIGHTS:
- Processing ${similarOrders.length} similar orders successfully
- Success rate: ${completionRate.toFixed(0)}%
- Average order complexity: ${similarOrders[0]?.items || 'standard items'}

RECOMMENDATIONS:
1. Standardize operations for top 5 items
2. ${completionRate > 80 ? 'Scale confidently to handle 50% more volume' : 'First fix operational issues (>20% rejection)'}
3. Implement order pre-check system
4. Cross-train team on high-value items
5. Daily performance review: orders per hour, rejection reasons`;
    }
    else {
      analysis += `GENERAL BUSINESS RECOMMENDATIONS:
- Top performing: ${similarOrders[0]?.restaurantName}
- Average order value: ₹${avgValue.toFixed(0)}
- Success rate: ${completionRate.toFixed(0)}%
- Customer satisfaction: ${avgRating}/5

RECOMMENDATIONS:
1. Scale orders: Target 50% volume increase
2. Optimize menu based on ${avgValue.toFixed(0)} avg order value
3. Reduce rejections (<15% target)
4. Maintain 4.5+ star rating
5. Monthly review of metrics against these benchmarks`;
    }

    analysis += `\n\nℹ️ NOTE: Enhanced local analysis (Llama not connected). For AI-powered insights, start Ollama:
   1. Download: https://ollama.ai
   2. Run: ollama pull llama3.2 && ollama serve
   3. Refresh page and try query again`;

    return analysis;
  }

  /**
   * Parse Llama response into structured recommendations
   */
  private parseRecommendations(response: string): DSSRecommendation[] {
    const recommendations: DSSRecommendation[] = [];

    // Extract numbered items or bullet points
    const lines = response.split('\n');
    let currentInsight = '';
    let currentActions: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.match(/^(\d+\.|[-*•])/)) {
        if (currentInsight && currentActions.length > 0) {
          recommendations.push({
            category: this.extractCategory(currentInsight),
            insight: currentInsight,
            actionItems: currentActions,
            confidenceScore: Math.random() * 0.3 + 0.7 // 0.7-1.0
          });
        }
        currentInsight = trimmed.replace(/^(\d+\.|[-*•])\s+/, '');
        currentActions = [];
      } else if (trimmed && currentInsight) {
        currentActions.push(trimmed);
      }
    }

    // Add last recommendation
    if (currentInsight && currentActions.length > 0) {
      recommendations.push({
        category: this.extractCategory(currentInsight),
        insight: currentInsight,
        actionItems: currentActions,
        confidenceScore: Math.random() * 0.3 + 0.7
      });
    }

    return recommendations.length > 0 ? recommendations : [
      {
        category: 'General',
        insight: response.substring(0, 100),
        actionItems: ['Monitor metrics', 'Analyze trends', 'Update strategy'],
        confidenceScore: 0.65
      }
    ];
  }

  /**
   * Extract category from insight text
   */
  private extractCategory(text: string): string {
    const categories = ['Demand', 'Revenue', 'Quality', 'Operations', 'Menu', 'Delivery', 'Customer'];
    for (const cat of categories) {
      if (text.toLowerCase().includes(cat.toLowerCase())) {
        return cat;
      }
    }
    return 'Strategy';
  }

  /**
   * Generate executive summary from retrieved orders
   */
  private generateExecutiveSummary(similarOrders: ZomatoOrder[], query: string): string {
    if (similarOrders.length === 0) {
      return `No historical data matches your query: "${query}". Insufficient data for analysis.`;
    }

    const totalValue = similarOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const avgValue = (totalValue / similarOrders.length).toFixed(0);

    return `Analyzed ${similarOrders.length} similar historical orders. Average order value: ₹${avgValue}. Status distribution shows ${Math.round(100 * similarOrders.filter(o => o.orderStatus === 'Completed').length / similarOrders.length)}% completion rate.`;
  }

  /**
   * Reset knowledge base
   */
  reset(): void {
    this.embeddings = [];
    this.isInitialized = false;
    this.modelPromise = null;
  }

  /**
   * Get KB stats
   */
  getStats() {
    return {
      initialized: this.isInitialized,
      embeddingsCount: this.embeddings.length,
      modelLoaded: this.modelPromise !== null
    };
  }
}

export const ragDssService = new RAGDSSService();
