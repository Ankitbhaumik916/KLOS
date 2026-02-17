import React, { useState, useRef, useEffect } from 'react';
import { ZomatoOrder, InsightResponse } from '../types';
import { analyzeKitchenData } from '../services/geminiService';
import { askAI } from '../services/qaService';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface GeminiInsightProps {
  orders: ZomatoOrder[];
  userName: string;
}

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  timestamp: number;
}

const GeminiInsight: React.FC<GeminiInsightProps> = ({ orders, userName }) => {
  const [insight, setInsight] = useState<InsightResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  const handleGenerateInsight = async () => {
    if (orders.length === 0) return;
    setLoading(true);
    try {
      const result = await analyzeKitchenData(orders, userName);
      setInsight(result);
    } finally {
      setLoading(false);
    }
  };

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || orders.length === 0 || chatLoading) return;

    const userMessage = chatInput;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage, timestamp: Date.now() }]);
    setChatLoading(true);

    try {
      const aiResponse = await askAI(userMessage, orders, userName);
      setChatMessages(prev => [...prev, { role: 'ai', content: aiResponse, timestamp: Date.now() }]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to get AI response';
      setChatMessages(prev => [...prev, { role: 'ai', content: `Error: ${errorMsg}`, timestamp: Date.now() }]);
    } finally {
      setChatLoading(false);
    }
  };

  const profitData = insight ? [
    { name: 'Net Revenue', value: insight.profitabilityAnalysis.estimatedNet, color: '#10b981' },
    { name: 'Zomato Cut (35%)', value: insight.profitabilityAnalysis.zomatoCommission, color: '#f97316' },
  ] : [];

  return (
    <div className="bg-[#1c1c1e] p-8 rounded-xl border border-white/5 shadow-2xl min-h-[600px] flex flex-col">
      
      {!insight && !loading && chatMessages.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto space-y-8 text-center py-10">
            <div className="relative w-24 h-24">
                <div className="absolute inset-0 bg-orange-500/20 blur-xl rounded-full animate-pulse"></div>
                <div className="relative w-full h-full bg-[#2c2c2e] rounded-full flex items-center justify-center border border-orange-500/30">
                    <svg className="w-10 h-10 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                </div>
            </div>
            
            <h3 className="text-3xl font-light text-[#fef3c7]">Kitchen Intelligence</h3>
            <p className="text-gray-400 leading-relaxed text-sm">
               Activate deep learning models to analyze your {orders.length} order records. 
               Get insights on <span className="text-orange-400">Profitability</span>, 
               <span className="text-orange-400"> Menu Optimization</span>, and ask custom questions.
            </p>
            <button
                onClick={handleGenerateInsight}
                className="bg-orange-600 hover:bg-orange-500 text-white font-medium py-3 px-10 rounded-lg shadow-lg shadow-orange-900/20 transition-all hover:scale-105 uppercase tracking-widest text-xs"
            >
                Start Analysis
            </button>
        </div>
      )}

      {loading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 py-20">
              <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-orange-200 font-mono text-xs uppercase tracking-widest">Processing {orders.length} records...</p>
          </div>
      )}

      {insight && chatMessages.length === 0 && (
        <div className="w-full max-w-6xl mx-auto space-y-8 animate-fade-in flex-1">
          
          <div className="flex justify-between items-end border-b border-white/10 pb-4">
             <div>
                <h3 className="text-2xl font-medium text-[#fef3c7]">{insight.greeting}</h3>
                {insight.alert && (
                    <p className="text-red-400 text-xs mt-1 flex items-center gap-2">
                        <span className="w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
                        {insight.alert}
                    </p>
                )}
             </div>
             <button onClick={() => setInsight(null)} className="text-xs text-orange-400 hover:text-orange-300 uppercase tracking-widest">Clear Report</button>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Profitability Card */}
              <div className="bg-[#2c2c2e] p-6 rounded-lg border border-white/5 shadow-lg lg:col-span-1">
                  <h4 className="text-orange-500 text-xs font-bold uppercase tracking-widest mb-4">Profitability & Commission</h4>
                  <div className="h-48 relative">
                      <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                              <Pie data={profitData} innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value">
                                  {profitData.map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                  ))}
                              </Pie>
                              <Tooltip 
                                formatter={(value: number) => `₹${value.toLocaleString()}`}
                                contentStyle={{ backgroundColor: '#1c1c1e', border: '1px solid #333', color: '#fff' }}
                              />
                          </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                          <p className="text-xs text-gray-500">Gross</p>
                          <p className="text-sm font-bold text-white">₹{insight.profitabilityAnalysis.grossRevenue.toLocaleString()}</p>
                      </div>
                  </div>
                  <div className="space-y-3 mt-4">
                      <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Zomato Cut (35%)</span>
                          <span className="text-orange-400 font-mono">-₹{insight.profitabilityAnalysis.zomatoCommission.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm pt-2 border-t border-white/10">
                          <span className="text-emerald-400 font-medium">Est. Net Revenue</span>
                          <span className="text-emerald-400 font-bold font-mono">₹{insight.profitabilityAnalysis.estimatedNet.toLocaleString()}</span>
                      </div>
                  </div>
                  <p className="mt-4 text-xs text-gray-400 leading-relaxed border-t border-white/5 pt-3">
                      {insight.profitabilityAnalysis.analysis}
                  </p>
              </div>

              {/* Text Analysis Grid */}
              <div className="lg:col-span-2 space-y-6">
                  
                  {/* Demand & Menu */}
                  <div className="bg-[#2c2c2e] p-6 rounded-lg border border-white/5 shadow-lg">
                      <h4 className="text-orange-500 text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                          Demand Forecasting & Menu Optimization
                      </h4>
                      <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">
                          {insight.demandForecasting}
                      </p>
                  </div>

                  {/* Customer Insights */}
                  <div className="bg-[#2c2c2e] p-6 rounded-lg border border-white/5 shadow-lg">
                      <h4 className="text-orange-500 text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" /></svg>
                          Customer Insights
                      </h4>
                      <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">
                          {insight.customerInsights}
                      </p>
                  </div>
              </div>
          </div>

          {/* Recommendations */}
          <div className="mt-6">
            <h4 className="text-[#fef3c7] text-sm font-bold uppercase tracking-widest mb-4">Strategic Action Items</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {insight.recommendations.map((rec, idx) => (
                <div key={idx} className="bg-[#2c2c2e] p-5 rounded-lg border border-white/5 hover:border-orange-500/30 transition-all group">
                   <div className="text-4xl font-black text-white/5 group-hover:text-orange-500/20 transition-colors mb-2">0{idx + 1}</div>
                   <p className="text-gray-300 text-sm font-medium">{rec}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Chat Starter */}
          <div className="mt-8 pt-6 border-t border-white/10">
            <p className="text-xs text-gray-400 mb-3">💬 Ask follow-up questions about your data:</p>
          </div>
        </div>
      )}

      {/* Chat Interface */}
      {(chatMessages.length > 0 || insight) && (
        <div className="flex flex-col h-full max-w-4xl mx-auto w-full">
          <div className="flex-1 bg-[#0a0a0a] rounded-lg border border-white/5 p-4 overflow-y-auto space-y-4 mb-4" style={{ maxHeight: '400px' }}>
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${
                  msg.role === 'user' 
                    ? 'bg-orange-600 text-white' 
                    : 'bg-[#2c2c2e] text-gray-200 border border-white/5'
                }`}>
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                  <p className="text-xs opacity-50 mt-1">{new Date(msg.timestamp).toLocaleTimeString()}</p>
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-[#2c2c2e] px-4 py-3 rounded-lg border border-white/5">
                  <div className="flex gap-2">
                    <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleAskQuestion} className="flex gap-2">
            <input 
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about your data..."
              disabled={chatLoading || orders.length === 0}
              className="flex-1 bg-[#121212] border border-white/10 rounded-lg px-4 py-3 text-[#fef3c7] placeholder-gray-600 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none text-sm disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={chatLoading || orders.length === 0 || !chatInput.trim()}
              className="bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 text-white font-medium px-4 py-3 rounded-lg transition-all text-sm uppercase tracking-wider"
            >
              {chatLoading ? '...' : 'Ask'}
            </button>
            {chatMessages.length > 0 && (
              <button
                type="button"
                onClick={() => { setChatMessages([]); setInsight(null); }}
                className="text-orange-400 hover:text-orange-300 text-xs uppercase tracking-widest px-3 py-3"
              >
                Clear
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  );
};

export default GeminiInsight;
