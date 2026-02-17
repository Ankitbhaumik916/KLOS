import React, { useState, useEffect } from 'react';

type Props = {
  onClose: () => void;
};

const ls = {
  get: (k: string) => localStorage.getItem(k) || '',
  set: (k: string, v: string) => localStorage.setItem(k, v),
};

const Settings: React.FC<Props> = ({ onClose }) => {
  const [url, setUrl] = useState('');
  const [exact, setExact] = useState('');
  const [model, setModel] = useState('');

  useEffect(() => {
    setUrl(ls.get('localAi.url') || 'http://localhost:11435');
    setExact(ls.get('localAi.exactUrl') || 'http://localhost:11435/api/generate');
    setModel(ls.get('localAi.model') || 'llama3');
  }, []);

  const handleSave = () => {
    ls.set('localAi.url', url);
    ls.set('localAi.exactUrl', exact);
    ls.set('localAi.model', model);
    alert('Settings saved. Reload the app if needed.');
    onClose();
  };

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const endpointsToTry = () => {
    if (exact) return [exact];
    return [
      `${url}/api/generate`,
      `${url}/api/completions`,
      `${url}/v1/generate`,
      `${url}/generate`,
    ];
  };

  const handleTest = async () => {
    setTestResult(null);
    setTesting(true);
    const probeBody = { model: model || 'test-model', prompt: 'ping', max_tokens: 1 };
    const tries = endpointsToTry();
    let results: string[] = [];
    
    for (const ep of tries) {
      results.push(`Trying ${ep}...`);
      setTestResult(results.join('\n'));
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const res = await fetch(ep, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(probeBody),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          setTestResult(`✓ Found endpoint: ${ep}\nHTTP ${res.status} ${res.statusText}\n\nResponse: ${text.substring(0, 500)}`);
          setTesting(false);
          return;
        }
        const ct = res.headers.get('content-type') || '';
        const bodyText = ct.includes('application/json') ? JSON.stringify(await res.json()) : await res.text();
        setTestResult(`✓ SUCCESS: ${ep} responded.\n\nResponse: ${bodyText.substring(0, 1000)}`);
        setTesting(false);
        return;
      } catch (err: any) {
        results[results.length - 1] = `✗ ${results[results.length - 1].replace('Trying ', '')} — ${err?.name === 'AbortError' ? 'timeout (5s)' : err?.message || 'connection error'}`;
        setTestResult(results.join('\n'));
      }
    }
    results.push('\n⚠ All endpoints failed. Check:');
    results.push('1. Proxy is running: npm run start-llm-proxy');
    results.push('2. LLM is running: ollama serve or equivalent');
    results.push('3. Firewall allows port 11435');
    results.push('4. URL is correct (use PC IP, not localhost)');
    setTestResult(results.join('\n'));
    setTesting(false);
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-xl mx-4 bg-[#0f1724] border border-white/5 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold">AI / Local LLM Settings</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">Close</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Proxy/Base URL</label>
            <input value={url} onChange={e => setUrl(e.target.value)} className="w-full bg-[#0b1220] border border-white/5 rounded px-3 py-2 text-sm" />
            <p className="text-[11px] text-gray-500 mt-1">Example: <code>http://10.168.131.72:11435</code> (use your PC IP if connecting from phone)</p>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Exact generate endpoint</label>
            <input value={exact} onChange={e => setExact(e.target.value)} className="w-full bg-[#0b1220] border border-white/5 rounded px-3 py-2 text-sm" />
            <p className="text-[11px] text-gray-500 mt-1">Example: <code>http://10.168.131.72:11435/api/generate</code></p>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Model name</label>
            <input value={model} onChange={e => setModel(e.target.value)} className="w-full bg-[#0b1220] border border-white/5 rounded px-3 py-2 text-sm" />
            <p className="text-[11px] text-gray-500 mt-1">Example: <code>llama3</code> or <code>phi-3mini</code></p>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button onClick={handleTest} className="px-3 py-2 rounded bg-gray-800 text-sm text-white" disabled={testing}>{testing ? 'Testing...' : 'Test Endpoint'}</button>
                <button onClick={() => { navigator.clipboard?.writeText(url); alert('Copied base URL to clipboard'); }} className="px-3 py-2 rounded bg-transparent border border-white/10 text-sm">Copy URL</button>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={onClose} className="px-3 py-2 rounded bg-transparent border border-white/10 text-sm">Cancel</button>
                <button onClick={handleSave} className="px-3 py-2 rounded bg-orange-500 text-white text-sm">Save</button>
              </div>
            </div>

            {testResult && (
              <pre className="whitespace-pre-wrap text-xs bg-black/30 border border-white/5 rounded p-3 text-gray-200 max-h-44 overflow-auto">{testResult}</pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
