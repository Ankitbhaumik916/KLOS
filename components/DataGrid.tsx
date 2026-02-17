
import React from 'react';
import { ZomatoOrder } from '../types';

interface DataGridProps {
  orders: ZomatoOrder[];
}

const DataGrid: React.FC<DataGridProps> = ({ orders }) => {
  if (orders.length === 0) return <div className="text-center text-slate-500 py-10">No data loaded.</div>;

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-sm overflow-hidden flex flex-col h-[600px]">
      <div className="p-4 border-b border-slate-700 bg-slate-800 flex justify-between items-center">
         <h3 className="font-bold text-white">Raw Order Data ({orders.length} rows)</h3>
         <button className="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded text-white transition-colors">
            Export JSON
         </button>
      </div>
      <div className="overflow-auto flex-1">
        <table className="w-full text-left text-xs text-slate-400">
          <thead className="text-xs uppercase bg-slate-900 text-slate-300 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3">Order ID</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Restaurant</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-center">Rating</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {orders.map((order, idx) => (
              <tr key={idx} className="hover:bg-slate-700/50 transition-colors">
                <td className="px-4 py-2 font-mono text-slate-300">{order.orderId}</td>
                <td className="px-4 py-2">{new Date(order.orderPlacedAt).toLocaleDateString()} {new Date(order.orderPlacedAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</td>
                <td className="px-4 py-2 text-white">{order.restaurantName}</td>
                <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold ${
                        order.orderStatus.toLowerCase().includes('delivered') ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400'
                    }`}>
                        {order.orderStatus}
                    </span>
                </td>
                <td className="px-4 py-2 text-right font-medium text-emerald-400">₹{order.totalAmount}</td>
                <td className="px-4 py-2 text-center">
                    {order.rating ? (
                        <span className={order.rating >= 4 ? 'text-yellow-400' : 'text-slate-500'}>
                            {order.rating} ★
                        </span>
                    ) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DataGrid;
