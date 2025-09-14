import React, { useState, useRef, useEffect } from 'react';

export default function Component3() {
  const [stage, setStage] = useState('idle'); // idle|queued|module1|module2|module3|done|error
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const pollRef = useRef(null);

  // Start processing (POST)
  const startPipeline = async () => {
    if (stage !== 'idle' && stage !== 'error' && stage !== 'done') return;
    setError(null);
    setResults(null);
    setProgress(0);
    setStage('queued');
    try {
      const res = await fetch('http://localhost:8001/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: '__ORCH_PLACEHOLDER__' }) // backend modules ignore or use their own input chain
      });
      if (!res.ok) {
        const errPayload = await res.json().catch(()=>({}));
        throw new Error(errPayload.error || 'Failed to start pipeline');
      }
      beginPolling();
    } catch (e) {
      setError(e.message);
      setStage('error');
    }
  };

  // Poll status (GET)
  const beginPolling = () => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('http://localhost:8001/status');
        const data = await res.json();
        setStage(data.stage || 'idle');
        setProgress(data.progress || 0);
        if (data.error) {
          setError(data.error);
          clearInterval(pollRef.current);
          setStage('error');
        } else if (data.stage === 'done') {
          clearInterval(pollRef.current);
          fetchResults();
        }
      } catch (e) {
        setError('Status check failed');
        clearInterval(pollRef.current);
        setStage('error');
      }
    }, 2000);
  };

  // Fetch results (GET)
  const fetchResults = async () => {
    try {
      const res = await fetch('http://localhost:8001/results');
      if (!res.ok) throw new Error('Results not ready');
      const data = await res.json();
      setResults(data);
    } catch (e) {
      setError(e.message);
      setStage('error');
    }
  };

  useEffect(() => () => clearInterval(pollRef.current), []);

  return (
    <div style={{ padding: '2rem', border: '2px solid #6A057F', borderRadius: '12px', margin: '2rem 0', background: '#f8f8ff' }}>
      <h2 style={{ color: '#6A057F' }}>Component 3: Your Module</h2>
      {['queued','module1','module2','module3'].includes(stage) ? (
        <div style={{ minHeight: '200px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
          <span>Running pipeline... ({stage})</span>
          <progress value={progress} max={100} style={{ width: '80%', marginTop: '1rem' }} />
          <span style={{ marginTop: '0.5rem' }}>{progress}%</span>
        </div>
      ) : stage === 'error' ? (
        <div style={{ minHeight: '200px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'red' }}>
          <span>Error processing data. Please try again.</span>
          <button onClick={startPipeline} style={{ marginTop: '1rem' }}>Retry</button>
        </div>
      ) : stage === 'done' && results ? (
        <div style={{ minHeight: '200px', color: '#222' }}>
          <h3>Results:</h3>
          <pre style={{ background: '#fff', padding: '1rem', borderRadius: '8px', maxHeight: '300px', overflow: 'auto' }}>{JSON.stringify(results, null, 2)}</pre>
          <button onClick={() => { setStage('idle'); setProgress(0); setResults(null); setError(null); }}>New Run</button>
        </div>
      ) : (
        <div style={{ minHeight: '200px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
          <span>Pipeline idle. Run orchestrated chain.</span>
          <button onClick={startPipeline} style={{ marginTop: '1rem', background: '#6A057F', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.5rem 1.5rem', cursor: 'pointer' }}>
            Run Pipeline
          </button>
        </div>
      )}
    </div>
  );
}
