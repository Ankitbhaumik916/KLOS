
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { ZomatoOrder, User } from './types';
import Dashboard from './components/Dashboard';
import DataGrid from './components/DataGrid';
import Login from './components/Login';
import Settings from './components/Settings';
import { parseCSV } from './services/csvService';
import { supabaseService } from './services/supabaseService';
import { authService } from './services/authService';

const GeminiInsight = lazy(() => import('./components/GeminiInsight'));
const AIDeepdive = lazy(() => import('./components/AIDeepdive'));

type Tab = 'dashboard' | 'data' | 'ai' | 'deepdive';

const getOrdersCacheKey = (userEmail: string) => `clos_orders_cache_${userEmail.toLowerCase()}`;

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<ZomatoOrder[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isUploading, setIsUploading] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Unknown error';
  };

  const normalizeOrderId = (value: unknown): string => String(value ?? '').trim();

  const normalizeOrderDate = (value: unknown): number => {
    if (typeof value === 'number') {
      return value > 0 && value < 9999999999 ? value * 1000 : value;
    }

    if (typeof value === 'string') {
      const numeric = Number(value);
      if (!Number.isNaN(numeric)) {
        return numeric > 0 && numeric < 9999999999 ? numeric * 1000 : numeric;
      }

      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }

    return Date.now();
  };

  const normalizeImportedOrders = (value: unknown): ZomatoOrder[] => {
    if (!Array.isArray(value)) {
      throw new Error('JSON must be an array of orders.');
    }

    return value.map((item, index) => {
      if (!item || typeof item !== 'object') {
        throw new Error(`Order at index ${index} is not a valid object.`);
      }

      const order = item as Partial<ZomatoOrder> & { orderPlacedAt?: unknown };
      if (!order.orderId || !order.restaurantName) {
        throw new Error(`Order at index ${index} is missing required fields like orderId or restaurantName.`);
      }

      return {
        orderId: normalizeOrderId(order.orderId),
        restaurantName: String(order.restaurantName),
        orderPlacedAt: normalizeOrderDate(order.orderPlacedAt),
        orderStatus: String(order.orderStatus || 'Unknown'),
        totalAmount: Number(order.totalAmount || 0),
        rating: typeof order.rating === 'number' ? order.rating : undefined,
        items: order.items ? String(order.items) : '',
        city: order.city ? String(order.city) : '',
      };
    });
  };

  const mergeOrdersById = (existingOrders: ZomatoOrder[], incomingOrders: ZomatoOrder[]): ZomatoOrder[] => {
    const merged = new Map<string, ZomatoOrder>();

    existingOrders.forEach((order) => {
      merged.set(normalizeOrderId(order.orderId), {
        ...order,
        orderId: normalizeOrderId(order.orderId),
      });
    });

    incomingOrders.forEach((order) => {
      merged.set(normalizeOrderId(order.orderId), {
        ...order,
        orderId: normalizeOrderId(order.orderId),
      });
    });

    return Array.from(merged.values()).sort((a, b) => b.orderPlacedAt - a.orderPlacedAt);
  };

  const readCachedOrders = (userEmail: string): ZomatoOrder[] => {
    try {
      const raw = localStorage.getItem(getOrdersCacheKey(userEmail));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return normalizeImportedOrders(parsed);
    } catch (err) {
      console.warn('Failed to read cached orders, ignoring cache:', err);
      return [];
    }
  };

  // Load User Session & Orders on Mount
  useEffect(() => {
    // Enforce dark mode class
    document.documentElement.classList.add('dark');
    // Try to restore auth session from Supabase
    (async () => {
      try {
        const session = await supabaseService.getSession();
        if (session && session.user) {
          const email = session.user.email ?? `${session.user.id}@unknown.local`;
          setUser({ name: email, email, id: session.user.id });
          return;
        }
      } catch (err) {
        console.error('Session restore failed', err);
      }

      const localSession = authService.getSession();
      if (localSession) {
        setUser({
          name: localSession.name,
          email: localSession.email,
          id: localSession.id || localSession.email,
        });
      }
    })();
  }, []);

  // Load orders whenever the active user changes (initial session restore or manual login)
  useEffect(() => {
    (async () => {
      if (!user?.id || !user?.email) {
        setOrders([]);
        return;
      }

      const cachedOrders = readCachedOrders(user.email);
      if (cachedOrders.length > 0) {
        setOrders(cachedOrders);
      }

      try {
        const loadedOrders = await supabaseService.loadOrders(user.id);
        const mergedOrders = mergeOrdersById(cachedOrders, loadedOrders);
        setOrders(mergedOrders);
      } catch (err) {
        console.error('Failed to load orders for user', user.id, err);
      }
    })();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.email) return;
    try {
      localStorage.setItem(getOrdersCacheKey(user.email), JSON.stringify(orders));
    } catch (err) {
      console.warn('Failed to cache orders locally:', err);
    }
  }, [orders, user?.email]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && user?.id) {
      setIsUploading(true);
      try {
        const parsedOrders = (await parseCSV(file)).map((order) => ({
          ...order,
          orderId: normalizeOrderId(order.orderId),
        }));
        if (parsedOrders.length === 0) {
          throw new Error('No valid rows were found in the CSV file. Check the header names and row format.');
        }

        const existingIds = new Set(orders.map((o) => normalizeOrderId(o.orderId)));
        const uploadedUniqueIds = new Set(parsedOrders.map((o) => normalizeOrderId(o.orderId)));
        const expectedNew = Array.from(uploadedUniqueIds).filter((id) => !existingIds.has(id)).length;
        const expectedExisting = uploadedUniqueIds.size - expectedNew;

        await supabaseService.saveOrders(user.id, parsedOrders);
        const verifiedCount = await supabaseService.countExistingOrderIds(
          user.id,
          Array.from(uploadedUniqueIds)
        );
        const loadedOrders = await supabaseService.loadOrders(user.id);
        if (loadedOrders.length === 0) {
          throw new Error('Orders were saved, but no rows were returned from Supabase. Check your table name, row-level security, and user_id column.');
        }

        const missingAfterSync = uploadedUniqueIds.size - verifiedCount;
        if (missingAfterSync > 0) {
          throw new Error(
            `Cloud sync incomplete. ${missingAfterSync} uploaded order IDs were not found in Supabase after save (verified ${verifiedCount}/${uploadedUniqueIds.size}).`
          );
        }

        setOrders(mergeOrdersById(orders, loadedOrders));
        alert(
          `Upload successful. Processed ${parsedOrders.length} rows (${uploadedUniqueIds.size} unique IDs): ${expectedNew} new, ${expectedExisting} existing updated.`
        );
      } catch (err) {
        console.error('CSV upload failed', err);
        alert(`Upload failed: ${getErrorMessage(err)}`);
      } finally {
        setIsUploading(false);
      }
    }
  };

  const exportOrdersAsJson = (parsedOrders: ZomatoOrder[], originalName: string) => {
    const jsonOrders = parsedOrders.map((order) => ({
      orderId: order.orderId,
      restaurantName: order.restaurantName,
      orderPlacedAt: order.orderPlacedAt,
      orderStatus: order.orderStatus,
      totalAmount: order.totalAmount,
      items: order.items || '',
      city: order.city || '',
    }));

    const blob = new Blob([JSON.stringify(jsonOrders, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${originalName.replace(/\.csv$/i, '') || 'orders'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleConvertCsvToJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsConverting(true);
    try {
      const parsedOrders = await parseCSV(file);
      if (parsedOrders.length === 0) {
        throw new Error('No valid rows were found in the CSV file. Check the header names and row format.');
      }

      exportOrdersAsJson(parsedOrders, file.name);
      alert(`Converted ${parsedOrders.length} orders to JSON.`);
    } catch (err) {
      console.error('CSV to JSON conversion failed', err);
      alert(`Conversion failed: ${getErrorMessage(err)}`);
    } finally {
      setIsConverting(false);
      (e.target as HTMLInputElement).value = '';
    }
  };

  const handleClearData = async () => {
    if (window.confirm("Are you sure you want to clear all stored data? This cannot be undone.")) {
      try {
        if (!user?.id) throw new Error('No signed-in user id');
        await supabaseService.clearOrders(user.id);
        setOrders([]);
      } catch (err) {
        console.error('Failed to purge cloud orders', err);
        alert('Failed to purge cloud data.');
      }
    }
  };

  const handleExportData = async () => {
    try {
      if (!user?.id) throw new Error('No signed-in user id');
      const data = await supabaseService.loadOrders(user.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clos_orders_${user?.email || 'guest'}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed', err);
      alert('Failed to export data.');
    }
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    try {
      const text = await file.text();
      const parsedOrders = normalizeImportedOrders(JSON.parse(text)).map((order) => ({
        ...order,
        orderId: normalizeOrderId(order.orderId),
      }));
      const existingIds = new Set(orders.map((o) => normalizeOrderId(o.orderId)));
      const uploadedUniqueIds = new Set(parsedOrders.map((o) => normalizeOrderId(o.orderId)));
      const expectedNew = Array.from(uploadedUniqueIds).filter((id) => !existingIds.has(id)).length;
      const expectedExisting = uploadedUniqueIds.size - expectedNew;

      try {
        await supabaseService.saveOrders(user.id, parsedOrders);
        const verifiedCount = await supabaseService.countExistingOrderIds(
          user.id,
          Array.from(uploadedUniqueIds)
        );
        const loadedOrders = await supabaseService.loadOrders(user.id);

        const missingAfterSync = uploadedUniqueIds.size - verifiedCount;
        if (missingAfterSync > 0) {
          throw new Error(
            `Cloud sync incomplete. ${missingAfterSync} uploaded order IDs were not found in Supabase after save (verified ${verifiedCount}/${uploadedUniqueIds.size}).`
          );
        }

        setOrders((currentOrders) => mergeOrdersById(currentOrders, loadedOrders));
        alert(
          `Import successful. Processed ${parsedOrders.length} rows (${uploadedUniqueIds.size} unique IDs): ${expectedNew} new, ${expectedExisting} existing updated.`
        );
      } catch (saveErr) {
        console.warn('JSON import failed to save to Supabase:', saveErr);
        alert(`Import failed: ${getErrorMessage(saveErr)}`);
        return;
      }
    } catch (err) {
      console.error('Import failed', err);
      alert(`Failed to import JSON data: ${getErrorMessage(err)}`);
    } finally {
      (e.target as HTMLInputElement).value = '';
    }
  };

  const handleLogout = async () => {
    try {
      await supabaseService.signOut();
    } catch (err) {
      console.error('Sign out failed', err);
    } finally {
      authService.logout();
      setOrders([]);
      setUser(null);
    }
  };

  if (!user) {
    return <Login onLogin={setUser} />;
  }

  return (
    <div className="min-h-screen font-sans flex flex-col bg-[#121212] text-[#fef3c7]">
      
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#1c1c1e]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-9 h-9 bg-orange-600 rounded-lg flex items-center justify-center text-lg font-bold text-white shadow-lg shadow-orange-900/20">
               K
             </div>
             <div>
                <h1 className="text-sm font-bold tracking-tight text-[#fef3c7]">KITCHEN<span className="text-orange-500">OS</span></h1>
                <p className="text-[9px] uppercase tracking-widest font-semibold text-gray-500">
                   {user.name}
                </p>
             </div>
          </div>
          
          <div className="flex items-center gap-3">
             {orders.length > 0 && (
                <>
                  <button onClick={handleClearData} className="text-[10px] text-red-400 hover:text-red-300 font-medium px-3 py-2 transition-colors uppercase tracking-wider">
                    Purge DB
                  </button>
                  <button onClick={() => handleExportData()} className="text-[10px] text-gray-300 hover:text-gray-100 font-medium px-3 py-2 transition-colors uppercase tracking-wider">
                    Export Data
                  </button>
                </>
             )}
             
             <label className={`cursor-pointer px-4 py-2 rounded-lg font-bold text-[10px] uppercase tracking-widest transition-all border flex items-center gap-2 ${
                  isUploading 
                  ? 'bg-gray-800 text-gray-400 border-gray-700' 
                  : 'bg-white/5 border-white/10 text-orange-500 hover:bg-orange-500 hover:text-white hover:border-orange-500'
                }`}>
                {isUploading ? <span>Ingesting...</span> : (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    <span>Import CSV</span>
                  </>
                )}
                <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
             </label>

             <label className={`cursor-pointer px-4 py-2 rounded-lg font-bold text-[10px] uppercase tracking-widest transition-all border flex items-center gap-2 ${
                  isConverting
                  ? 'bg-gray-800 text-gray-400 border-gray-700'
                  : 'bg-white/5 border-white/10 text-blue-400 hover:bg-blue-500 hover:text-white hover:border-blue-500'
                }`}>
                {isConverting ? <span>Converting...</span> : (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V8m0 8h8m-8 0 8-8m4 0v8m0-8h-8m8 0-8 8" /></svg>
                    <span>CSV → JSON</span>
                  </>
                )}
                <input type="file" accept=".csv" className="hidden" onChange={handleConvertCsvToJson} />
             </label>

             {/* Hidden input for importing a previous export (JSON) */}
             <label className="text-[10px] text-gray-400 hover:text-gray-200 font-medium px-3 py-2 transition-colors uppercase tracking-wider cursor-pointer">
               Import Data
               <input id="importJson" type="file" accept="application/json" className="hidden" onChange={handleImportJson} />
             </label>

             <button onClick={handleLogout} className="text-[10px] font-bold text-gray-500 hover:text-[#fef3c7] ml-2 uppercase tracking-wider">
                Logout
             </button>
            <button onClick={() => setShowSettings(true)} title="Settings" className="text-[10px] font-bold text-gray-500 hover:text-[#fef3c7] ml-2 uppercase tracking-wider">
              Settings
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        
        {orders.length === 0 ? (
           // Empty State
           <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-8 animate-fade-in">
              <div className="relative">
                 <div className="absolute inset-0 bg-orange-500/10 blur-2xl rounded-full"></div>
                 <div className="w-24 h-24 rounded-full flex items-center justify-center border border-white/10 bg-[#1c1c1e] relative z-10">
                    <svg className="w-8 h-8 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                 </div>
              </div>
              <div className="max-w-lg">
                <h2 className="text-2xl font-light text-[#fef3c7] mb-2">Awaiting Dataset</h2>
                <p className="text-sm leading-relaxed text-gray-500">
                  Welcome, Chef {user.name}.<br/> 
                  Upload your Zomato CSV reports to initialize the analytics engine.
                </p>
              </div>
           </div>
        ) : (
           // Loaded State
           <div className="flex flex-col space-y-6">
              
              {/* Tab Navigation */}
              <div className="border-b border-white/5 flex gap-1">
                 <button
                    onClick={() => setActiveTab('dashboard')}
                    className={`flex items-center gap-2 px-6 py-4 text-xs font-bold uppercase tracking-widest transition-all border-b-2 ${
                      activeTab === 'dashboard' 
                        ? 'border-orange-500 text-orange-500 bg-white/5' 
                        : 'border-transparent text-gray-500 hover:text-[#fef3c7]'
                    }`}
                  >
                    Dashboard
                  </button>

                  <button
                    onClick={() => setActiveTab('data')}
                    className={`flex items-center gap-2 px-6 py-4 text-xs font-bold uppercase tracking-widest transition-all border-b-2 ${
                      activeTab === 'data' 
                        ? 'border-orange-500 text-orange-500 bg-white/5' 
                        : 'border-transparent text-gray-500 hover:text-[#fef3c7]'
                    }`}
                  >
                    Raw Data
                  </button>

                  <button
                    onClick={() => setActiveTab('ai')}
                    className={`flex items-center gap-2 px-6 py-4 text-xs font-bold uppercase tracking-widest transition-all border-b-2 ${
                      activeTab === 'ai' 
                        ? 'border-orange-500 text-orange-500 bg-white/5' 
                        : 'border-transparent text-gray-500 hover:text-[#fef3c7]'
                    }`}
                  >
                    <svg className="w-4 h-4 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                    AI Insights
                  </button>

                  <button
                    onClick={() => setActiveTab('deepdive')}
                    className={`flex items-center gap-2 px-6 py-4 text-xs font-bold uppercase tracking-widest transition-all border-b-2 ${
                      activeTab === 'deepdive' 
                        ? 'border-blue-500 text-blue-400 bg-white/5' 
                        : 'border-transparent text-gray-500 hover:text-[#fef3c7]'
                    }`}
                  >
                    <svg className="w-4 h-4 mb-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5a4 4 0 100-8 4 4 0 000 8z" /></svg>
                    Deep Dive
                  </button>
              </div>

              {/* Content Area */}
              <div className="min-h-[500px]">
                 {activeTab === 'dashboard' && <Dashboard orders={orders} user={user} />}
                 {activeTab === 'data' && <DataGrid orders={orders} />}
                  {(activeTab === 'ai' || activeTab === 'deepdive') && (
                   <Suspense fallback={<div className="text-sm text-gray-400 py-8">Loading AI module...</div>}>
                    {activeTab === 'ai' && <GeminiInsight orders={orders} userName={user.name} userId={user.id} />}
                    {activeTab === 'deepdive' && <AIDeepdive orders={orders} />}
                   </Suspense>
                  )}
              </div>
           </div>
        )}
      </main>
        {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </div>
  );
};

export default App;
