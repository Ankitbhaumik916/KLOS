
import React, { useState, useEffect } from 'react';
import { ZomatoOrder, User } from './types';
import Dashboard from './components/Dashboard';
import DataGrid from './components/DataGrid';
import GeminiInsight from './components/GeminiInsight';
import AIDeepdive from './components/AIDeepdive';
import Login from './components/Login';
import Settings from './components/Settings';
import { parseCSV } from './services/csvService';
import { storageService } from './services/storageService';
import { authService } from './services/authService';

type Tab = 'dashboard' | 'data' | 'ai' | 'deepdive';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<ZomatoOrder[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isUploading, setIsUploading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Load User Session & Orders on Mount
  useEffect(() => {
    const session = authService.getSession();
    if (session) setUser(session);

    const savedOrders = storageService.loadOrders();
    setOrders(savedOrders);
    
    // Enforce dark mode class
    document.documentElement.classList.add('dark');
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploading(true);
      try {
        const parsedOrders = await parseCSV(file);
        const merged = storageService.saveOrders(parsedOrders);
        setOrders(merged);
      } catch (err) {
        console.error("CSV Parse Error", err);
        alert("Failed to parse CSV file.");
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleClearData = () => {
    if (window.confirm("Are you sure you want to clear all stored data? This cannot be undone.")) {
      storageService.clearOrders();
      setOrders([]);
    }
  };

  const handleExportData = () => {
    try {
      const data = storageService.loadOrders();
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
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as ZomatoOrder[];
      const merged = storageService.saveOrders(parsed);
      setOrders(merged);
      alert('Import successful.');
    } catch (err) {
      console.error('Import failed', err);
      alert('Failed to import JSON data. Ensure it matches expected format.');
    } finally {
      // clear the input so same file can be selected again
      (e.target as HTMLInputElement).value = '';
    }
  };

  const handleLogout = () => {
    authService.logout();
    setUser(null);
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
                 {activeTab === 'ai' && <GeminiInsight orders={orders} userName={user.name} />}
                 {activeTab === 'deepdive' && <AIDeepdive orders={orders} userName={user.name} />}
              </div>
           </div>
        )}
      </main>
        {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </div>
  );
};

export default App;
