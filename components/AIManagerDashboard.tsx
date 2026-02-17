import React, { useState, useEffect } from 'react';
import { ZomatoOrder, DSSAnalysis } from '../types';
import { ragDssService } from '../services/ragDssService';
import { businessMetricsService, BusinessMetrics, RejectionAnalysis, InventoryInsight } from '../services/businessMetricsService';

interface AIManagerDashboardProps {
  orders: ZomatoOrder[];
  userName: string;
}

export const AIManagerDashboard: React.FC<AIManagerDashboardProps> = ({ orders, userName }) => {
  const [metrics, setMetrics] = useState<BusinessMetrics | null>(null);
  const [rejectionAnalysis, setRejectionAnalysis] = useState<RejectionAnalysis | null>(null);
  const [inventoryInsights, setInventoryInsights] = useState<InventoryInsight | null>(null);
  const [selectedQuery, setSelectedQuery] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<DSSAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Initialize metrics on mount
  useEffect(() => {
    if (orders.length === 0) return;

    const newMetrics = businessMetricsService.calculateMetrics(orders);
    setMetrics(newMetrics);

    const rejectionData = businessMetricsService.analyzeRejections(orders);
    setRejectionAnalysis(rejectionData);

    const inventoryData = businessMetricsService.generateInventoryInsights(orders);
    setInventoryInsights(inventoryData);

    // Initialize RAG KB
    ragDssService.buildKnowledgeBase(orders);
  }, [orders]);

  // Manager-specific queries with enhanced context
  const managerQueries = [
    {
      id: 'rejections',
      label: '🚫 Analyze Rejection Patterns',
      emoji: '🚫',
      description: 'Identify why orders are being rejected',
      query: `Based on ${rejectionAnalysis?.totalRejected || 0} rejections (${rejectionAnalysis?.rejectionRate.toFixed(1) || 0}% rate) causing ₹${rejectionAnalysis?.estimatedLoss || 0} loss, what are the root causes and how can we reduce rejections by 50%?`
    },
    {
      id: 'revenue',
      label: '💰 Revenue Optimization Strategy',
      emoji: '💰',
      description: 'Increase average order value and profit',
      query: `Our current metrics: Avg order ₹${metrics?.avgOrderValue.toFixed(0) || 0}, Total revenue ₹${metrics?.totalRevenue || 0}, Est. profit ₹${metrics?.estimatedProfit.toFixed(0) || 0}. How can we increase AOV by 15% and improve margins?`
    },
    {
      id: 'inventory',
      label: '📦 Inventory & Stock Planning',
      emoji: '📦',
      description: 'Forecast inventory needs based on patterns',
      query: `Top items: ${inventoryInsights?.topItems.slice(0, 3).map(i => i.item).join(', ') || 'loading'}. Predicted weekly demand: ${inventoryInsights?.predictedDemand || 0} orders. What inventory levels should we maintain?`
    },
    {
      id: 'cities',
      label: '🏆 City Performance & Expansion',
      emoji: '🏆',
      description: 'Analyze performance by city and recommend growth',
      query: `Top city: ${metrics?.topCities[0]?.name || 'N/A'} with ${metrics?.topCities[0]?.count || 0} orders. Revenue by city: ${Object.entries(metrics?.revenueByCity || {}).slice(0, 3).map(([city, rev]) => `${city} ₹${rev}`).join(', ')}. Which city should we expand in?`
    },
    {
      id: 'quality',
      label: '⭐ Customer Satisfaction Analysis',
      emoji: '⭐',
      description: 'Understand and improve ratings',
      query: `Current avg rating: ${metrics?.avgRating.toFixed(1) || 'N/A'}/5, Completion rate: ${metrics?.completionRate.toFixed(1) || 0}%. What's impacting our ratings and how to achieve 4.7+ stars?`
    },
    {
      id: 'restaurants',
      label: '🍽️ Restaurant Partnership Optimization',
      emoji: '🍽️',
      description: 'Optimize restaurant partnerships',
      query: `Top restaurants: ${metrics?.topRestaurants.slice(0, 3).map(r => `${r.name} (₹${r.revenue})`).join(', ') || 'N/A'}. How should we prioritize our partnerships for maximum ROI?`
    },
    {
      id: 'pricing',
      label: '💵 Pricing Strategy & Market Positioning',
      emoji: '💵',
      description: 'Optimize pricing to maximize conversions',
      query: `Avg order value ₹${metrics?.avgOrderValue.toFixed(0) || 0} with ${metrics?.completionRate.toFixed(1) || 0}% completion. What price points maximize conversion and profit per order?`
    },
    {
      id: 'scaling',
      label: '📈 Scaling & Growth Strategy',
      emoji: '📈',
      description: 'Plan for operational scaling',
      query: `Current volume: ${orders.length} orders, Revenue: ₹${metrics?.totalRevenue || 0}, Monthly growth needed: 50%. What operational changes needed to handle 1.5x volume without quality drop?`
    }
  ];

  const handleQuery = async (query: string, queryId: string) => {
    setSelectedQuery(queryId);
    setLoading(true);
    setAnalysis(null);

    try {
      const result = await ragDssService.generateDSSAnalysis(
        query,
        orders,
        `${userName}'s Kitchen Manager`,
        baseUrl
      );
      setAnalysis(result);
    } catch (err) {
      console.error('Query failed:', err);
      setAnalysis({
        timestamp: new Date().toISOString(),
        query,
        similarOrders: [],
        recommendations: [
          {
            category: 'Error',
            insight: `Failed to get Llama analysis. ${err instanceof Error ? err.message : 'Unknown error'}`,
            actionItems: ['Check if Ollama is running', 'Verify connection to localhost:11434'],
            confidenceScore: 0
          }
        ],
        executiveSummary: 'Llama service not available - using local analysis only'
      });
    } finally {
      setLoading(false);
    }
  };

  if (!metrics || !rejectionAnalysis || !inventoryInsights) {
    return (
      <div className="p-6 bg-slate-900 rounded-lg border border-slate-700 text-center">
        <p className="text-slate-400">Initializing Kitchen Manager Dashboard...</p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="p-6 bg-red-900 rounded-lg border border-red-700 text-center">
        <p className="text-red-200">No order data available. Please upload CSV first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-900 to-orange-900 rounded-xl border border-amber-700 p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-3xl font-bold text-white mb-1">🤵 Kitchen Manager AI</h2>
            <p className="text-amber-100 text-sm">AI-powered decision support for ${userName}'s operations</p>
          </div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-white rounded text-sm transition-colors"
          >
            {showAdvanced ? '✕ Hide Metrics' : '⚙️ View Metrics'}
          </button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <div className="bg-black/30 rounded p-2">
            <div className="text-amber-200 text-xs">Total Orders</div>
            <div className="text-white font-bold">{metrics.totalOrders}</div>
          </div>
          <div className="bg-black/30 rounded p-2">
            <div className="text-amber-200 text-xs">Avg Rating</div>
            <div className="text-white font-bold">{metrics.avgRating.toFixed(1)}/5 ⭐</div>
          </div>
          <div className="bg-black/30 rounded p-2">
            <div className="text-amber-200 text-xs">Revenue</div>
            <div className="text-white font-bold">₹{(metrics.totalRevenue / 1000).toFixed(0)}K</div>
          </div>
          <div className="bg-black/30 rounded p-2">
            <div className="text-amber-200 text-xs">Completion</div>
            <div className="text-white font-bold">{metrics.completionRate.toFixed(0)}%</div>
          </div>
          <div className="bg-black/30 rounded p-2">
            <div className="text-amber-200 text-xs">Est. Profit</div>
            <div className="text-white font-bold">₹{(metrics.estimatedProfit / 1000).toFixed(0)}K</div>
          </div>
        </div>
      </div>

      {/* Advanced Metrics (Collapsible) */}
      {showAdvanced && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Rejections */}
          <div className="bg-red-900 border border-red-700 rounded-lg p-4">
            <h3 className="text-red-200 font-bold mb-2">🚫 Rejection Analysis</h3>
            <div className="space-y-1 text-sm text-red-100">
              <div>Total Rejected: {rejectionAnalysis.totalRejected}</div>
              <div>Rate: {rejectionAnalysis.rejectionRate.toFixed(1)}%</div>
              <div>Est. Loss: ₹{rejectionAnalysis.estimatedLoss}</div>
              <div className="text-xs text-red-300 mt-2">
                Worst City: {Object.entries(rejectionAnalysis.byCity).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'}
              </div>
            </div>
          </div>

          {/* Top Items */}
          <div className="bg-green-900 border border-green-700 rounded-lg p-4">
            <h3 className="text-green-200 font-bold mb-2">📦 Top Items</h3>
            <div className="space-y-1 text-xs text-green-100">
              {inventoryInsights.topItems.slice(0, 4).map((item, i) => (
                <div key={i} className="flex justify-between">
                  <span>{item.item}</span>
                  <span className="text-green-300">x{item.frequency}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Restaurants */}
          <div className="bg-blue-900 border border-blue-700 rounded-lg p-4">
            <h3 className="text-blue-200 font-bold mb-2">🍽️ Top Restaurants</h3>
            <div className="space-y-1 text-xs text-blue-100">
              {metrics.topRestaurants.slice(0, 3).map((rest, i) => (
                <div key={i} className="flex justify-between">
                  <span>{rest.name}</span>
                  <span className="text-blue-300">₹{rest.revenue}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Cities */}
          <div className="bg-purple-900 border border-purple-700 rounded-lg p-4">
            <h3 className="text-purple-200 font-bold mb-2">🏆 Top Cities</h3>
            <div className="space-y-1 text-xs text-purple-100">
              {metrics.topCities.slice(0, 3).map((city, i) => (
                <div key={i} className="flex justify-between">
                  <span>{city.name}</span>
                  <span className="text-purple-300">{city.count} orders</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Manager Queries */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-6">
        <h3 className="text-white font-bold mb-4">Strategic Queries</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {managerQueries.map((q) => (
            <button
              key={q.id}
              onClick={() => handleQuery(q.query, q.id)}
              disabled={loading}
              className={`p-3 rounded-lg border transition-all text-left ${
                selectedQuery === q.id
                  ? 'bg-amber-700 border-amber-600'
                  : 'bg-slate-800 border-slate-700 hover:bg-slate-700 hover:border-slate-600'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title={q.description}
            >
              <div className="text-lg mb-1">{q.emoji}</div>
              <div className="text-white text-sm font-semibold line-clamp-2">{q.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="bg-blue-900 border border-blue-700 rounded-lg p-6 text-center">
          <div className="text-blue-200 font-semibold mb-2">🔍 Analyzing your business...</div>
          <div className="text-blue-100 text-sm">Processing {orders.length} orders with AI Deep Dive</div>
          <div className="mt-3 flex justify-center gap-1">
            <div className="h-2 w-2 bg-blue-400 rounded-full animate-bounce"></div>
            <div className="h-2 w-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
            <div className="h-2 w-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          </div>
        </div>
      )}

      {/* Analysis Results */}
      {analysis && !loading && (
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 space-y-4">
          <div>
            <h3 className="text-white font-bold mb-2">📊 AI Analysis</h3>
            <p className="text-slate-300 text-sm">{analysis.executiveSummary}</p>
          </div>

          {/* Similar Orders Context */}
          {analysis.similarOrders.length > 0 && (
            <div className="bg-slate-800 rounded p-4">
              <h4 className="text-slate-200 font-semibold text-sm mb-2">Similar Historical Orders (Context)</h4>
              <div className="space-y-2">
                {analysis.similarOrders.map((order, i) => (
                  <div key={i} className="text-xs text-slate-400 bg-slate-700 rounded p-2">
                    <span className="text-slate-300">{order.restaurantName}</span>
                    {' - '}
                    <span>₹{order.totalAmount}</span>
                    {' - '}
                    <span className={order.orderStatus === 'Completed' ? 'text-green-400' : 'text-red-400'}>
                      {order.orderStatus}
                    </span>
                    {' - '}
                    <span>⭐ {order.rating || 'unrated'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          <div className="space-y-3">
            <h4 className="text-white font-semibold">💡 Key Recommendations</h4>
            {analysis.recommendations.map((rec, i) => (
              <div key={i} className="bg-slate-800 border-l-4 border-amber-600 rounded p-4">
                <div className="flex justify-between items-start mb-2">
                  <h5 className="text-amber-200 font-bold">{rec.category}</h5>
                  <div className="text-sm text-slate-400">
                    Confidence: {(rec.confidenceScore * 100).toFixed(0)}%
                  </div>
                </div>
                <p className="text-slate-300 text-sm mb-2">{rec.insight}</p>
                {rec.actionItems.length > 0 && (
                  <ul className="text-xs text-slate-400 space-y-1">
                    {rec.actionItems.map((action, j) => (
                      <li key={j} className="ml-4 before:content-['→'] before:mr-2">
                        {action}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {/* Raw Response Option */}
          <details className="bg-slate-800 rounded p-3">
            <summary className="text-slate-300 text-sm cursor-pointer font-semibold">
              📄 View Full AI Response
            </summary>
            <pre className="mt-3 text-xs text-slate-400 whitespace-pre-wrap break-words max-h-64 overflow-y-auto bg-black rounded p-2">
              {analysis.recommendations.map(r => `${r.category}: ${r.insight}`).join('\n\n')}
            </pre>
          </details>
        </div>
      )}

      {/* Settings */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
        <details>
          <summary className="text-slate-300 cursor-pointer text-sm font-semibold">
            ⚙️ LLM Settings
          </summary>
          <div className="mt-3 space-y-2">
            <div>
              <label className="text-slate-400 text-sm block mb-1">Ollama Base URL</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full bg-slate-800 text-white rounded px-3 py-2 text-sm border border-slate-700"
                placeholder="http://localhost:11434"
              />
            </div>
            <p className="text-xs text-slate-500">
              Ensure Ollama is running locally: ollama serve
            </p>
          </div>
        </details>
      </div>
    </div>
  );
};

export default AIManagerDashboard;
