
import React, { useMemo, useState, useEffect } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell, PieChart, Pie, Legend
} from 'recharts';
import { ZomatoOrder, HourlyData, StatusDistribution, User, InsightResponse } from '../types';
import { extractTopItems } from '../services/csvService';
import { analyzeKitchenData } from '../services/geminiService';

interface DashboardProps {
  orders: ZomatoOrder[];
  user: User;
}

const Dashboard: React.FC<DashboardProps> = ({ orders, user }) => {
  const [dateRange, setDateRange] = useState<'all' | '30' | '7'>('all');
  const [jarvisInsight, setJarvisInsight] = useState<InsightResponse | null>(null);
  const [loadingJarvis, setLoadingJarvis] = useState(false);

  // Trigger Jarvis analysis on mount (or when orders change)
  useEffect(() => {
    if (orders.length > 0) {
      setLoadingJarvis(true);
      analyzeKitchenData(orders, user.name)
        .then(res => setJarvisInsight(res))
        .catch(err => console.error("Jarvis failed", err))
        .finally(() => setLoadingJarvis(false));
    }
  }, [orders, user.name]);

  // Filter Orders based on Date Range
  const filteredOrders = useMemo(() => {
    if (dateRange === 'all') return orders;
    const now = new Date();
    const days = parseInt(dateRange);
    const cutoff = new Date(now.setDate(now.getDate() - days)).getTime();
    return orders.filter(o => o.orderPlacedAt >= cutoff);
  }, [orders, dateRange]);

  // 1. KPI Calculation
  const kpi = useMemo(() => {
    const totalRevenue = filteredOrders.reduce((acc, o) => acc + o.totalAmount, 0);
    const avgRating = filteredOrders.reduce((acc, o) => acc + (o.rating || 0), 0) / (filteredOrders.filter(o => o.rating).length || 1);
    const completed = filteredOrders.filter(o => o.orderStatus.toLowerCase().includes('delivered')).length;
    const cancelled = filteredOrders.filter(o => o.orderStatus.toLowerCase().includes('cancel') || o.orderStatus.toLowerCase().includes('reject')).length;
    const completionRate = (completed / (filteredOrders.length || 1)) * 100;

    return { totalRevenue, avgRating, totalOrders: filteredOrders.length, completionRate, completed, cancelled };
  }, [filteredOrders]);

  // 2. Revenue Trend
  const revenueData = useMemo(() => {
    const map = new Map<string, number>();
    filteredOrders.forEach(o => {
        const date = new Date(o.orderPlacedAt);
        const key = date.toISOString().split('T')[0]; 
        map.set(key, (map.get(key) || 0) + o.totalAmount);
    });
    return Array.from(map.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, total]) => ({
            date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            sales: total
        }));
  }, [filteredOrders]);

  // 3. Top Items
  const topItemsData = useMemo(() => {
    return extractTopItems(filteredOrders);
  }, [filteredOrders]);

  // 4. Hourly Heatmap
  const hourlyData: HourlyData[] = useMemo(() => {
    const hours = new Array(24).fill(0).map((_, i) => ({ hour: i, sales: 0, orders: 0 }));
    filteredOrders.forEach(o => {
      const h = new Date(o.orderPlacedAt).getHours();
      hours[h].sales += o.totalAmount;
      hours[h].orders += 1;
    });
    return hours.map(h => ({
      hour: `${h.hour}:00`,
      sales: h.sales,
      orders: h.orders
    }));
  }, [filteredOrders]);

  // 5. Status Distribution
  const statusData: StatusDistribution[] = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    filteredOrders.forEach(o => {
      let s = o.orderStatus.toLowerCase();
      if (s.includes('delivered')) s = 'Delivered';
      else if (s.includes('cancel')) s = 'Cancelled';
      else if (s.includes('reject')) s = 'Rejected';
      else s = 'Other';
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    });
    
    return Object.entries(statusCounts).map(([name, value]) => ({
      name,
      value,
      color: name === 'Delivered' ? '#10b981' : name === 'Cancelled' ? '#ef4444' : name === 'Rejected' ? '#f59e0b' : '#64748b'
    }));
  }, [filteredOrders]);

  if (orders.length === 0) return null;

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      
      {/* JARVIS GREETING BANNER */}
      <div className="bg-[#1c1c1e] rounded-xl border border-orange-500/20 p-6 shadow-lg relative overflow-hidden">
        <div className="relative z-10 flex gap-4 items-start">
           <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center border border-orange-500/30">
             {loadingJarvis ? (
                <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
             ) : (
                <svg className="w-6 h-6 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
             )}
           </div>
           <div className="flex-1">
              <h2 className="text-xl font-medium text-[#fef3c7] mb-1">
                 {jarvisInsight ? jarvisInsight.greeting : `Welcome, ${user.name}. Analyzing shift data...`}
              </h2>
              {jarvisInsight?.alert ? (
                 <div className="bg-red-900/20 border border-red-500/30 text-red-200 px-3 py-2 rounded-lg text-sm mt-2 flex items-center gap-2 max-w-fit">
                    <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    {jarvisInsight.alert}
                 </div>
              ) : (
                <p className="text-gray-400 text-sm mt-1">System is running efficiently. No critical alerts.</p>
              )}
           </div>
        </div>
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-center bg-[#1c1c1e] p-3 rounded-lg border border-white/5">
         <h2 className="text-[#fef3c7] font-medium text-sm pl-2 mb-2 sm:mb-0 uppercase tracking-widest">
            Performance Metrics
         </h2>
         <div className="flex gap-2">
            {['all', '30', '7'].map((range) => (
                <button 
                  key={range}
                  onClick={() => setDateRange(range as any)} 
                  className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-wider transition-colors ${dateRange === range ? 'bg-orange-600 text-white' : 'text-gray-500 hover:text-[#fef3c7] bg-white/5 hover:bg-white/10'}`}
                >
                  {range === 'all' ? 'All Time' : `Last ${range} Days`}
                </button>
            ))}
         </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Gross Revenue", value: `₹${kpi.totalRevenue.toLocaleString()}`, color: "text-emerald-400", sub: "Pre-commission" },
          { label: "Total Orders", value: kpi.totalOrders, color: "text-orange-400", sub: "Volume" },
          { label: "Avg Rating", value: kpi.avgRating.toFixed(1), color: "text-yellow-400", sub: "Customer Satisfaction" },
          { label: "Completion", value: `${kpi.completionRate.toFixed(1)}%`, color: "text-blue-400", sub: "Fulfillment" },
        ].map((stat, i) => (
            <div key={i} className="bg-[#1c1c1e] p-5 rounded-xl border border-white/5 shadow-lg relative group overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <div className={`w-16 h-16 rounded-full blur-xl ${stat.color.replace('text', 'bg')}`}></div>
                </div>
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">{stat.label}</p>
                <div className="flex flex-col mt-2 relative z-10">
                    <span className={`text-2xl font-medium text-[#fef3c7]`}>{stat.value}</span>
                    <span className={`text-xs ${stat.color} font-medium mt-1`}>{stat.sub}</span>
                </div>
            </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Revenue Timeline */}
          <div className="bg-[#1c1c1e] p-6 rounded-xl border border-white/5 h-[350px] lg:col-span-2 shadow-lg">
             <h3 className="text-xs font-bold text-orange-500 mb-6 uppercase tracking-widest">Revenue Trajectory</h3>
             <ResponsiveContainer width="100%" height="85%">
                  <AreaChart data={revenueData}>
                      <defs>
                        <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} stroke="#fff" />
                      <XAxis dataKey="date" stroke="#525252" fontSize={10} tickLine={false} axisLine={false} minTickGap={30} />
                      <YAxis stroke="#525252" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `₹${val/1000}k`} />
                      <Tooltip contentStyle={{ backgroundColor: '#121212', border: '1px solid #333', color: '#fef3c7' }} />
                      <Area type="monotone" dataKey="sales" stroke="#f97316" strokeWidth={2} fillOpacity={1} fill="url(#colorSales)" />
                  </AreaChart>
              </ResponsiveContainer>
          </div>

          {/* Top 5 Items */}
          <div className="bg-[#1c1c1e] p-6 rounded-xl border border-white/5 h-[350px] shadow-lg">
             <h3 className="text-xs font-bold text-orange-500 mb-6 uppercase tracking-widest flex items-center gap-2">
                Top Performers
             </h3>
             <ResponsiveContainer width="100%" height="85%">
                <BarChart data={topItemsData} layout="vertical" margin={{ left: 0, right: 20 }}>
                   <XAxis type="number" hide />
                   <YAxis dataKey="itemName" type="category" width={100} tick={{fontSize: 10, fill: '#a3a3a3'}} axisLine={false} tickLine={false} />
                   <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{ backgroundColor: '#121212', border: '1px solid #333', color: '#fef3c7' }} />
                   <Bar dataKey="quantity" fill="#f97316" radius={[0, 4, 4, 0]} barSize={24}>
                      {topItemsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? '#f97316' : '#ea580c'} opacity={1 - (index * 0.15)} />
                      ))}
                   </Bar>
                </BarChart>
             </ResponsiveContainer>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
           {/* Hourly Activity */}
           <div className="bg-[#1c1c1e] p-6 rounded-xl border border-white/5 h-80 shadow-lg">
              <h3 className="text-xs font-bold text-orange-500 mb-6 uppercase tracking-widest">Rush Hours</h3>
              <ResponsiveContainer width="100%" height="85%">
                  <BarChart data={hourlyData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} stroke="#fff" />
                      <XAxis dataKey="hour" stroke="#525252" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#121212', border: '1px solid #333', color: '#fef3c7' }} />
                      <Bar dataKey="orders" fill="#fef3c7" radius={[2, 2, 0, 0]} />
                  </BarChart>
              </ResponsiveContainer>
           </div>

           {/* Status Donut */}
           <div className="bg-[#1c1c1e] p-6 rounded-xl border border-white/5 h-80 shadow-lg">
              <h3 className="text-xs font-bold text-orange-500 mb-6 uppercase tracking-widest">Fulfillment Status</h3>
              <ResponsiveContainer width="100%" height="85%">
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#121212', border: '1px solid #333', color: '#fef3c7' }} />
                  <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" wrapperStyle={{fontSize: '11px', color: '#a3a3a3'}} />
                </PieChart>
              </ResponsiveContainer>
           </div>
      </div>

    </div>
  );
};

export default Dashboard;
