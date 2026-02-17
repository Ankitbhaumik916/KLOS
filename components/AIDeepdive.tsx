import React, { useState, useEffect } from 'react';
import { ZomatoOrder, DSSAnalysis } from '../types';
import { ragDssService } from '../services/ragDssService';

interface AIDeepdiveProps {
  orders: ZomatoOrder[];
  userName: string;
}

const AIDeepdive: React.FC<AIDeepdiveProps> = ({ orders, userName }) => {
  const [query, setQuery] = useState('');
  const [analysis, setAnalysis] = useState<DSSAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [initialized, setInitialized] = useState(false);

  // Initialize RAG knowledge base
  useEffect(() => {
    const initialize = async () => {
      if (orders.length === 0) {
        setError('No orders available. Please upload CSV data first.');
        return;
      }

      try {
        setLoading(true);
        await ragDssService.buildKnowledgeBase(orders);
        setInitialized(true);
        setError('');
      } catch (err) {
        console.error('Failed to initialize RAG KB:', err);
        setError('Failed to initialize. Check console for details.');
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, [orders]);

  // Handle query submission
  const handleQuerySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !initialized) return;

    setLoading(true);
    setError('');
    setAnalysis(null);

    try {
      const result = await ragDssService.generateDSSAnalysis(
        query,
        orders,
        userName,
        'http://localhost:11435'
      );
      setAnalysis(result);
    } catch (err) {
      console.error('Query failed:', err);
      setError(`Analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Example queries
  const exampleQueries = [
    'What are the best-performing menu items?',
    'How can I reduce order rejection rate?',
    'What times have the highest demand?',
    'How can I improve customer ratings?'
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900 to-blue-800 rounded-xl border border-blue-700 p-6">
        <h2 className="text-3xl font-bold text-white mb-2">🧠 AI Deep Dive</h2>
        <p className="text-blue-100 text-sm">RAG-powered Q&A using your {orders.length} order records</p>
      </div>

      {/* Query Input */}
      <form onSubmit={handleQuerySubmit} className="space-y-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask anything about your orders... e.g., 'What should I do to increase revenue?'"
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={!initialized || loading}
        />

        <button
          type="submit"
          disabled={!initialized || loading || !query.trim()}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-bold py-3 rounded-lg transition-colors"
        >
          {loading ? '🔍 Analyzing...' : '⚡ Analyze'}
        </button>
      </form>

      {/* Quick Examples */}
      <div>
        <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Quick Examples:</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {exampleQueries.map((q, i) => (
            <button
              key={i}
              onClick={() => setQuery(q)}
              className="p-2 text-left bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-xs text-slate-300 hover:text-white transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-900 border border-red-700 rounded text-red-200 text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {analysis && !loading && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <h3 className="text-white font-bold mb-2">📊 Summary</h3>
            <p className="text-slate-300 text-sm">{analysis.executiveSummary}</p>
          </div>

          {/* Similar Orders */}
          {analysis.similarOrders.length > 0 && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <h3 className="text-white font-bold mb-3">🔍 Similar Orders ({analysis.similarOrders.length})</h3>
              <div className="space-y-2">
                {analysis.similarOrders.map((order, i) => (
                  <div key={i} className="text-xs bg-slate-700 rounded p-3">
                    <div className="text-slate-300 font-medium">{order.restaurantName}</div>
                    <div className="text-slate-400 mt-1">
                      {order.items && <span>{order.items} • </span>}
                      ₹{order.totalAmount}
                      {order.rating && <span> • ⭐{order.rating}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {analysis.recommendations.length > 0 && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <h3 className="text-white font-bold mb-3">💡 Recommendations</h3>
              <div className="space-y-3">
                {analysis.recommendations.map((rec, i) => (
                  <div key={i} className="border-l-4 border-blue-500 pl-3">
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="text-blue-300 font-semibold text-sm">{rec.category}</h4>
                      <span className="text-xs text-slate-400">{(rec.confidenceScore * 100).toFixed(0)}%</span>
                    </div>
                    <p className="text-slate-300 text-xs mb-2">{rec.insight}</p>
                    {rec.actionItems.length > 0 && (
                      <ul className="text-xs text-slate-400 space-y-1">
                        {rec.actionItems.slice(0, 3).map((action, j) => (
                          <li key={j} className="ml-2 before:content-['→'] before:mr-2">{action}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="p-6 text-center">
          <div className="text-blue-300 font-semibold mb-2">🔍 Analyzing...</div>
          <div className="flex justify-center gap-1">
            <div className="h-2 w-2 bg-blue-400 rounded-full animate-bounce"></div>
            <div className="h-2 w-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
            <div className="h-2 w-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          </div>
        </div>
      )}

      {/* KB Status */}
      <div className="text-xs text-slate-500 p-3 bg-slate-900 rounded border border-slate-800">
        <p>✓ Knowledge base ready with {orders.length} orders</p>
        <p className="mt-1">💡 Tip: Ask specific questions about your order data to get insights</p>
      </div>
    </div>
  );
};

export default AIDeepdive;
