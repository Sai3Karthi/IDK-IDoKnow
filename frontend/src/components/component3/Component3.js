import React, { useState, useRef, useEffect, Suspense, lazy } from 'react';
// UI components
import { ExpandablePerspectiveCards } from './cards/ExpandablePerspectiveCards';
import { Button } from '../ui/button';

export default function Component3() {
  const [stage, setStage] = useState('idle'); // idle|queued|module1|module2|module3|done|error
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const pollRef = useRef(null);
  const [perspectivesByColor, setPerspectivesByColor] = useState({});
  const wsRef = useRef(null);

  // Start processing (POST)
  const startPipeline = async () => {
    if (stage !== 'idle' && stage !== 'error' && stage !== 'done') return;
    // Reset all state
    setError(null);
    setResults(null);
    setProgress(0);
    setStage('queued');
    setPerspectivesByColor({});

    // Open WebSocket connection to the orchestrator
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    try {
      console.log('Attempting to connect to orchestrator WebSocket...');
      
      // Connect to the orchestrator's WebSocket endpoint
      const orchestratorPort = 8001;  // Updated to match orchestrator running on port 8001
      const ws = new WebSocket(`ws://localhost:${orchestratorPort}/ws/perspectives`);
      wsRef.current = ws;
      
      ws.onopen = () => {
        console.log('WebSocket connected successfully to orchestrator!');
        // Trigger pipeline through the orchestrator's /run endpoint
        fetch(`http://localhost:${orchestratorPort}/run`, { 
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}), // Any additional data can go here
        }).then(response => {
          if (!response.ok) {
            console.error('Failed to start pipeline:', response.status, response.statusText);
            setError(`Pipeline start failed: ${response.status}`);
          } else {
            console.log('Pipeline started successfully through orchestrator');
            // Start polling for status updates
            beginPolling();
          }
        }).catch(err => {
          console.error('Error starting pipeline:', err);
          setError(`Cannot reach orchestrator: ${err.message}`);
        });
      };
      
      ws.onmessage = (event) => {
        try {
          console.log('WebSocket message received from orchestrator:', event.data);
          const data = JSON.parse(event.data);
          
          // Handle perspective data
          if (data.color && Array.isArray(data.perspectives)) {
            console.log(`Received ${data.perspectives.length} perspectives for color ${data.color}`);
            setPerspectivesByColor(prev => ({
              ...prev,
              [data.color]: data.perspectives
            }));
          }
          // Handle ping messages
          else if (data.type === "ping") {
            console.log("Received ping from orchestrator");
          }
          else {
            console.warn('Received message with unexpected format:', data);
          }
        } catch (e) {
          console.warn('WebSocket message parse error:', e, event.data);
        }
      };
      
      ws.onerror = (e) => {
        console.error('WebSocket error:', e);
        setError(`WebSocket error: ${e.message || 'Connection failed'}`);
        // Don't set stage to error here, as we're still polling for status
      };
      
      ws.onclose = (e) => {
        console.log('WebSocket closed:', e.code, e.reason);
      };
    } catch (wsError) {
      console.error('Error creating WebSocket:', wsError);
      setError(`WebSocket initialization error: ${wsError.message}`);
      // Continue with polling even if WebSocket fails
      beginPolling();
    }
  };

  // Poll status from orchestrator (GET)
  const beginPolling = () => {
    clearInterval(pollRef.current);
    
    // Poll the orchestrator's status endpoint
    pollRef.current = setInterval(async () => {
      try {
        const orchestratorPort = 8001;  // Updated to match orchestrator running on port 8001
        const res = await fetch(`http://localhost:${orchestratorPort}/status`);
        const data = await res.json();
        
        // Update component state based on orchestrator response
        setStage(data.stage || 'idle');
        setProgress(data.progress || 0);
        
        // Check if we're processing - if so, let's manually request any cached perspectives
        if (data.stage === 'module3' && data.progress > 0) {
          try {
            // Request the current perspective cache
            const cacheRes = await fetch(`http://localhost:${orchestratorPort}/ws/cache`);
            if (cacheRes.ok) {
              const cacheData = await cacheRes.json();
              console.log("Received perspective cache:", Object.keys(cacheData));
              
              // Update our local state with any perspectives
              Object.entries(cacheData).forEach(([color, perspectives]) => {
                if (Array.isArray(perspectives) && perspectives.length > 0) {
                  // Check if we already have this color's perspectives
                  const existingPerspectives = perspectivesByColor[color] || [];
                  if (existingPerspectives.length !== perspectives.length) {
                    console.log(`Received ${perspectives.length} ${color} perspectives from cache`);
                    setPerspectivesByColor(prev => ({
                      ...prev,
                      [color]: perspectives
                    }));
                  }
                }
              });
              
              // Special handling for violet if it's the last one
              if (cacheData.violet && Array.isArray(cacheData.violet) && cacheData.violet.length > 0) {
                console.log(`Ensuring violet perspectives are displayed: ${cacheData.violet.length} items`);
                setPerspectivesByColor(prev => ({
                  ...prev,
                  violet: cacheData.violet
                }));
              }
            }
          } catch (cacheError) {
            console.warn('Error fetching perspective cache:', cacheError);
          }
        }
        
        if (data.error) {
          setError(data.error);
          clearInterval(pollRef.current);
          setStage('error');
        } else if (data.stage === 'done') {
          clearInterval(pollRef.current);
          fetchResults();
        }
      } catch (e) {
        console.warn('Orchestrator status check failed:', e);
        setError(`Cannot reach orchestrator: ${e.message}`);
      }
    }, 2000);
  };
  
  // Fallback simulation method if backend is unavailable
  const simulatePipelineStages = () => {
    clearInterval(pollRef.current);
    
    let moduleProgress = 0;
    let currentModule = 'module1';
    
    pollRef.current = setInterval(() => {
      moduleProgress += 5;
      setProgress(moduleProgress);
      
      if (moduleProgress >= 100) {
        moduleProgress = 0;
        
        if (currentModule === 'module1') {
          currentModule = 'module2';
        } else if (currentModule === 'module2') {
          currentModule = 'module3';
        } else if (currentModule === 'module3') {
          clearInterval(pollRef.current);
          setStage('done');
          fetchResults();
          return;
        }
      }
      
      setStage(currentModule);
    }, 1000);
  };

  // Fetch results from orchestrator (GET)
  const fetchResults = async () => {
    try {
      // Fetch main results from orchestrator
      const orchestratorPort = 8001;  // Updated to match orchestrator running on port 8001
      const res = await fetch(`http://localhost:${orchestratorPort}/results`);
      
      if (!res.ok) {
        throw new Error(`Results not ready (${res.status}): ${res.statusText}`);
      }
      
      const data = await res.json();
      setResults(data);
      console.log('Results fetched from orchestrator:', data);
      
      // Use the full results to ensure we have all perspectives
      if (data.perspectives) {
        // Group perspectives by color
        const byColor = {};
        data.perspectives.forEach(p => {
          const color = p.color;
          if (!byColor[color]) byColor[color] = [];
          byColor[color].push(p);
        });
        
        // Make sure our UI state has all perspectives
        console.log("Updating UI with all perspectives from results:", Object.keys(byColor));
        setPerspectivesByColor(byColor);
      }
    } catch (e) {
      console.error("Error fetching results from orchestrator:", e);
      setError(e.message);
      // Don't set stage to error here, as we might have partial results from WebSocket
    }
  };


  // Auto reconnect WebSocket if it closes unexpectedly
  useEffect(() => {
    const reconnectWebSocket = () => {
      if (stage !== 'idle' && stage !== 'error' && stage !== 'done') {
        console.log('WebSocket reconnection attempt to orchestrator...');
        // Implement exponential backoff for reconnection
        setTimeout(() => {
          if (wsRef.current?.readyState === WebSocket.CLOSED) {
            try {
              const orchestratorPort = 8000;  // Update this to match your orchestrator port
              const ws = new WebSocket(`ws://localhost:${orchestratorPort}/ws/perspectives`);
              wsRef.current = ws;
              
              ws.onopen = () => {
                console.log('WebSocket reconnected successfully to orchestrator!');
              };
              
              ws.onmessage = (event) => {
                try {
                  console.log('WebSocket message received from orchestrator:', event.data);
                  const data = JSON.parse(event.data);
                  
                  // Handle perspective data
                  if (data.color && Array.isArray(data.perspectives)) {
                    console.log(`Received ${data.perspectives.length} perspectives for color ${data.color}`);
                    setPerspectivesByColor(prev => ({
                      ...prev,
                      [data.color]: data.perspectives
                    }));
                  } 
                  // Handle ping messages
                  else if (data.type === "ping") {
                    console.log("Received ping from orchestrator");
                  }
                  else {
                    console.warn('Received message with unexpected format:', data);
                  }
                } catch (e) {
                  console.warn('WebSocket message parse error:', e, event.data);
                }
              };
              
              ws.onerror = (e) => {
                console.error('WebSocket reconnection error:', e);
              };
              
              ws.onclose = (e) => {
                console.log('Reconnected WebSocket closed:', e.code, e.reason);
                // Schedule another reconnect attempt if still processing
                if (stage !== 'idle' && stage !== 'error' && stage !== 'done') {
                  reconnectWebSocket();
                }
              };
            } catch (wsError) {
              console.error('Error during WebSocket reconnection to orchestrator:', wsError);
            }
          }
        }, 3000); // Wait 3 seconds before reconnecting
      }
    };
    
    // Setup listener for WebSocket closure
    if (wsRef.current) {
      const currentWs = wsRef.current;
      const onWsClose = (e) => {
        if (stage !== 'idle' && stage !== 'error' && stage !== 'done') {
          console.log('WebSocket to orchestrator closed unexpectedly, attempting to reconnect...');
          reconnectWebSocket();
        }
      };
      
      currentWs.addEventListener('close', onWsClose);
      
      return () => {
        currentWs.removeEventListener('close', onWsClose);
      };
    }
  }, [stage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearInterval(pollRef.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return (
    <div className="p-8 border-2 border-border rounded-xl my-8 bg-card/40 backdrop-blur-sm text-foreground shadow-sm space-y-6">
      <h2 className="text-xl font-semibold tracking-tight">Political Perspective Analysis Pipeline</h2>
      
      {/* Error State */}
      {stage === 'error' && (
        <div className="p-5 text-center space-y-4 text-destructive">
          <p className="text-sm">Error: {error}</p>
          <Button variant="outline" onClick={startPipeline}>Retry</Button>
        </div>
      )}
      
      {/* Idle State */}
      {stage === 'idle' && (
        <div className="p-5 text-center space-y-4">
          <p className="text-sm text-muted-foreground">Pipeline idle. Click to start analysis.</p>
            <Button onClick={startPipeline}>Run Pipeline</Button>
        </div>
      )}
      
      {/* Processing States */}
      {['queued', 'module1', 'module2', 'module3'].includes(stage) && (
        <div className="p-5 space-y-2">
          <p className="text-sm font-medium flex items-center gap-2">
            <span className="inline-flex h-2 w-2 rounded-full bg-primary animate-pulse" />
            Stage: <span className="font-semibold capitalize">{stage}</span>
          </p>
          <p className="text-xs text-muted-foreground">Progress: {progress}%</p>
          <div className="w-full h-2 bg-muted/40 rounded-md overflow-hidden">
            <div
              className="h-full bg-primary transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
      
      {/* Perspectives Streaming Display */}
      {Object.keys(perspectivesByColor).length > 0 && (
        <div className="mt-4 p-6 rounded-xl bg-card/60 border border-border/60 shadow-inner space-y-4">
          <h3 className="text-lg font-semibold tracking-tight">Streaming Perspectives by Color</h3>
          <div className="py-2">
            <ExpandablePerspectiveCards perspectivesByColor={perspectivesByColor} />
          </div>
        </div>
      )}
    </div>
  );
}
