
import React, { useState } from 'react';
import { authService } from '../services/authService';
import { User } from '../types';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [isSignup, setIsSignup] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isSignup) {
      if (!name || !email || !password) {
        setError("All fields are required.");
        return;
      }
      const result = authService.signup({ name, email, password });
      if (result.success) {
        const user = authService.login(email, password);
        if (user) {
          setError('');
          onLogin(user);
        }
      } else {
        setError(result.message);
      }
    } else {
      if (!email || !password) {
        setError("Email and access key are required.");
        return;
      }
      const user = authService.login(email, password);
      if (user) {
        setError('');
        onLogin(user);
      } else {
        setError("Invalid email or access key.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#121212] flex items-center justify-center p-4 relative overflow-hidden font-sans">
      
      {/* Background Texture - Abstract Kitchen Smoke */}
      <div className="absolute inset-0 z-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1556910103-1c02745a30bf?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center mix-blend-overlay"></div>
      
      {/* Main Container */}
      <div className="w-full max-w-md bg-[#1c1c1e] border border-white/10 p-8 rounded-xl shadow-2xl relative z-10 backdrop-blur-sm">
        
        <div className="text-center mb-10">
            <div className="inline-block p-4 rounded-full bg-orange-500/10 mb-4 border border-orange-500/20">
               <svg className="w-8 h-8 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
            </div>
            <h1 className="text-3xl font-light text-[#fef3c7] tracking-tight">KITCHEN<span className="font-bold text-orange-500">OS</span></h1>
            <p className="text-gray-500 text-xs uppercase tracking-[0.2em] mt-2">Cloud Intelligence Platform</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {isSignup && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-orange-500 uppercase tracking-wider pl-1">Chef Name</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#121212] border border-white/10 rounded-lg p-3 text-[#fef3c7] placeholder-gray-600 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-all"
                placeholder="Ex. Ankit"
              />
            </div>
          )}
          
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-orange-500 uppercase tracking-wider pl-1">Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#121212] border border-white/10 rounded-lg p-3 text-[#fef3c7] placeholder-gray-600 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-all"
              placeholder="kitchen@domain.com"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-orange-500 uppercase tracking-wider pl-1">Access Key</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#121212] border border-white/10 rounded-lg p-3 text-[#fef3c7] placeholder-gray-600 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-all"
              placeholder="••••••••"
            />
          </div>

          {error && <div className="text-red-400 text-xs text-center bg-red-900/10 py-2 rounded border border-red-900/20">{error}</div>}

          <button 
            type="submit" 
            className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-3.5 rounded-lg shadow-lg shadow-orange-900/20 transition-all hover:-translate-y-0.5 mt-2"
          >
            {isSignup ? "INITIALIZE ACCOUNT" : "ACCESS DASHBOARD"}
          </button>
        </form>

        <div className="mt-8 text-center pt-6 border-t border-white/5">
          <p className="text-gray-500 text-xs">
            {isSignup ? "Already initialized?" : "New to KitchenOS?"}
            <button 
              onClick={() => { setIsSignup(!isSignup); setError(''); }}
              className="text-[#fef3c7] ml-2 hover:text-orange-400 font-medium transition-colors"
            >
              {isSignup ? "Login here" : "Create Protocol"}
            </button>
          </p>
        </div>
      </div>
      
      <div className="absolute bottom-4 text-center w-full text-gray-700 text-[10px]">
         SECURE CONNECTION • ENCRYPTED • V1.4.2
      </div>
    </div>
  );
};

export default Login;
