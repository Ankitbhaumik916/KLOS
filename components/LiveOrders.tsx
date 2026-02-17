import React from 'react';
import { Order, SocketStatus } from '../types';

interface LiveOrdersProps {
  orders: Order[];
  status: SocketStatus;
}

const LiveOrders: React.FC<LiveOrdersProps> = ({ orders, status }) => {
  // Show only the last 20 orders, sorted by newest first
  const displayOrders = [...orders].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-sm flex flex-col h-full max-h-[600px]">
      <div className="p-4 border-b border-slate-700 flex justify-between items-center sticky top-0 bg-slate-800 rounded-t-xl z-10">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          Live Feed
          {status === SocketStatus.CONNECTED && (
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          )}
        </h3>
        <span className={`text-xs px-2 py-1 rounded-full ${
          status === SocketStatus.CONNECTED ? 'bg-emerald-900 text-emerald-300' :
          status === SocketStatus.CONNECTING ? 'bg-amber-900 text-amber-300' :
          'bg-red-900 text-red-300'
        }`}>
          {status === SocketStatus.CONNECTED ? 'Socket Active' : status}
        </span>
      </div>
      
      <div className="overflow-y-auto flex-1 p-2 space-y-2">
        {displayOrders.length === 0 ? (
           <div className="text-center text-slate-500 py-10">Waiting for Zomato orders...</div>
        ) : (
          displayOrders.map((order) => (
            <div key={order.id} className="bg-slate-700/50 p-3 rounded-lg border border-slate-600 animate-fade-in-down transition-all hover:bg-slate-700">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">{order.id}</span>
                    <span className="text-[10px] uppercase tracking-wider bg-red-500/20 text-red-300 px-1 rounded">Zomato</span>
                  </div>
                  <p className="text-slate-400 text-xs mt-0.5">{order.customerName}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-emerald-400">₹{order.totalAmount}</p>
                  <p className="text-slate-500 text-[10px]">{new Date(order.timestamp).toLocaleTimeString()}</p>
                </div>
              </div>
              <div className="space-y-1">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-xs text-slate-300">
                    <span>{item.quantity}x {item.name}</span>
                    <span className="text-slate-500">₹{item.price * item.quantity}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-slate-600 flex justify-between items-center">
                 <span className="text-[10px] text-slate-400 uppercase font-semibold">{order.status}</span>
                 {order.status === 'pending' && (
                    <button className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded transition-colors">
                        Accept
                    </button>
                 )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default LiveOrders;