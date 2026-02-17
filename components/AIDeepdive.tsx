import React, { useState, useEffect } from 'react';
import { ZomatoOrder, DSSAnalysis, RAGKBStats } from '../types';
import { ragDssService } from '../services/ragDssService';

interface AIDeepdiveProps {
  orders: ZomatoOrder[];
  userName: string;
}

const AIDeepdive: React.FC<AIDeepdiveProps> = ({ orders, userName }) => {
  const [query, setQuery] = useState('');
  const [analysis, setAnalysis] = useState<DSSAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [kbStats, setKbStats] = useState<RAGKBStats | null>(null);
  const [error, setError] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434');
  const [showSettings, setShowSettings] = useState(false);

  // Initialize RAG knowledge base on component mount
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
        setKbStats(ragDssService.getStats());
        setError('');
      } catch (err) {
        console.error('Failed to initialize RAG KB:', err);
        setError('Failed to initialize AI model. Check console for details.');
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, [orders]);

  // Handle DSS query submission
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
        baseUrl
      );
      setAnalysis(result);
    } catch (err) {
      console.error('Query failed:', err);
      setError(`Analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Example queries for quick access
  const exampleQueries = [
    'What are the best-performing menu items?',
    'How can I reduce order rejection rate?',
    'What times have the highest demand?',
    'How can I improve customer ratings?',
    'What is my profit optimization strategy?'
  ];

  const handleExampleQuery = (exampleQuery: string) => {
    setQuery(exampleQuery);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl border border-slate-700 p-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">AI Deep Dive</h2>
            <p className="text-slate-400 text-sm">
              RAG-powered Decision Support System using your {orders.length} order records
            </p>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="text-slate-400 hover:text-white transition-colors px-3 py-2 rounded border border-slate-600 text-xs"
          >
            ⚙️ Settings
          </button>
        </div>

        {/* Knowledge Base Status */}
        <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
          <div className="bg-slate-700/50 rounded p-2 border border-slate-600">
            <p className="text-slate-400">KB Status</p>
            <p className="text-emerald-400 font-bold">
              {initialized ? '✓ Ready' : loading ? 'Initializing...' : '○ Pending'}
            </p>
          </div>
          <div className="bg-slate-700/50 rounded p-2 border border-slate-600">
            <p className="text-slate-400">Embeddings</p>
            <p className="text-blue-400 font-bold">{kbStats?.embeddingsCount || 0}</p>
          </div>
          <div className="bg-slate-700/50 rounded p-2 border border-slate-600">
            <p className="text-slate-400">Mode</p>
            <p className="text-yellow-400 font-bold">Fallback* 
              <span className="text-[10px] block text-slate-400">Start Ollama for AI</span>
            </p>
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <h3 className="text-sm font-bold text-white mb-3">Configuration</h3>
          <div className="space-y-2">
            <label className="block text-xs text-slate-400">
              Llama Base URL
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost:11434"
              className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Make sure Ollama is running: <code className="bg-slate-700 px-1">ollama serve llama3.2</code>
            </p>
          </div>
        </div>
      )}

      {/* Query Input */}
      <form onSubmit={handleQuerySubmit} className="space-y-3">
        <div className="relative">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask your DSS query... (e.g., 'What menu items should I focus on for revenue?')"
            disabled={!initialized || loading}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-50 resize-none text-sm"
            rows={3}
          />
        </div>

        <button
          type="submit"
          disabled={!initialized || loading || !query.trim()}
          className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-slate-600 disabled:to-slate-600 text-white font-bold py-2 rounded-lg transition-all text-sm"
        >
          {loading ? '🔄 Analyzing...' : '🚀 Analyze'}
        </button>
      </form>

      {/* Example Queries */}
      {!analysis && (
        <div className="space-y-2">
          <p className="text-xs text-slate-400">Quick start examples:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {exampleQueries.map((exampleQuery, idx) => (
              <button
                key={idx}
                onClick={() => handleExampleQuery(exampleQuery)}
                disabled={!initialized}
                className="text-left bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-600 rounded px-3 py-2 text-xs text-slate-300 hover:text-white transition-colors"
              >
                💡 {exampleQuery}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded-lg p-4">
          <p className="text-red-300 text-sm">⚠️ {error}</p>
        </div>
      )}

      {/* Analysis Results */}
      {analysis && (
        <div className="space-y-4">
          {/* Executive Summary */}
          <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
            <h3 className="text-sm font-bold text-white mb-2">📊 Executive Summary</h3>
            <p className="text-slate-300 text-sm leading-relaxed">{analysis.executiveSummary}</p>
            <p className="text-slate-500 text-xs mt-3">Query: "{analysis.query}"</p>
          </div>

          {/* Recommendations */}
          {analysis.recommendations.length > 0 && (
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
              <h3 className="text-sm font-bold text-white mb-3">🎯 Recommendations</h3>
              <div className="space-y-3">
                {analysis.recommendations.map((rec, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-700/50 rounded border border-slate-600 p-3"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-white font-semibold text-sm">{rec.category}</p>
                      <div className="flex items-center gap-1">
                        <div className="w-12 h-1 bg-slate-600 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-green-500 to-emerald-500"
                            style={{ width: `${rec.confidenceScore * 100}%` }}
                          />
                        </div>
                        <span className="text-slate-400 text-xs">
                          {(rec.confidenceScore * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    <p className="text-slate-300 text-sm mb-2">{rec.insight}</p>
                    <ul className="space-y-1">
                      {rec.actionItems.map((action, aidx) => (
                        <li key={aidx} className="text-slate-400 text-xs flex gap-2">
                          <span>→</span>
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Similar Orders Retrieved */}
          {analysis.similarOrders.length > 0 && (
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-4">
              <h3 className="text-sm font-bold text-white mb-3">📋 Similar Historical Orders</h3>
              <div className="space-y-2">
                {analysis.similarOrders.map((order) => (
                  <div
                    key={order.orderId}
                    className="bg-slate-700/50 rounded px-3 py-2 border border-slate-600 text-xs"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-white font-semibold">{order.restaurantName}</p>
                        <p className="text-slate-400">
                          {order.items || 'Unknown items'} | {order.city || 'N/A'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-emerald-400 font-bold">₹{order.totalAmount}</p>
                        <p className={`text-[10px] ${
                          order.orderStatus === 'Completed' ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {order.orderStatus} {order.rating ? `• ⭐${order.rating}` : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New Query Button */}
          <button
            onClick={() => {
              setAnalysis(null);
              setQuery('');
            }}
            className="w-full bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg py-2 text-white text-sm transition-colors"
          >
            ← New Query
          </button>
        </div>
      )}

      {/* Ollama Setup Banner */}
      <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-4">
        <div className="flex gap-3">
          <div className="text-amber-400 text-xl">⚡</div>
          <div>
            <p className="text-amber-300 text-sm font-semibold mb-1">Enhanced Mode: Query-Specific Analysis</p>
            <p className="text-amber-200/70 text-xs mb-2">
              Currently using intelligent fallback analysis. To unlock AI-powered insights with deep reasoning:
            </p>
            <ol className="text-amber-200/70 text-xs space-y-1 ml-2">
              <li><strong>1.</strong> Download Ollama: <a href="https://ollama.ai" className="underline hover:text-amber-300" target="_blank" rel="noopener">https://ollama.ai</a></li>
              <li><strong>2.</strong> Run: <code className="bg-black/40 px-1">ollama pull llama3.2 && ollama serve</code></li>
              <li><strong>3.</strong> Refresh this page & try your query again</li>
            </ol>
            <p className="text-amber-200/50 text-xs mt-2 italic">Windows: Double-click setup-ollama.bat in your project folder for auto-setup</p>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {!loading && !analysis && initialized && (
        <div className="text-center py-12 text-slate-500">
          <p className="text-sm mb-2">🤖 Knowledge base ready</p>
          <p className="text-xs">
            Ask a question about your orders to get insights (enhanced fallback mode active)
          </p>
        </div>
      )}
    </div>
  );
};

export default AIDeepdive;
