import React, { useState, useRef, useEffect, Suspense, lazy } from 'react';
// UI components
import { ExpandablePerspectiveCards } from './cards/ExpandablePerspectiveCards';
import { Button } from '../ui/button';
import { StreamingBiasSignificanceMotionChart } from './StreamingBiasSignificanceMotionChart';
import { TextGenerateEffect } from '../ui/text-generate-effect';

export default function Component3() {
  const [stage, setStage] = useState('idle'); // idle|queued|module1|module2|module3|done|error
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const pollRef = useRef(null);
  const [perspectivesByColor, setPerspectivesByColor] = useState({});
  const wsRef = useRef(null);
  const [showWhyModal, setShowWhyModal] = useState(false);
  const [selectedPerspectives, setSelectedPerspectives] = useState([]);
  const [cacheAvailable, setCacheAvailable] = useState(false);
  const cacheSnapshotRef = useRef(null);
  const [showChart, setShowChart] = useState(false); // defer chart mount
  const [revealedColors, setRevealedColors] = useState([]); // progressive color reveal order
  const cardsContainerRef = useRef(null);
  const chartAnchorRef = useRef(null); // anchor spot to scroll before chart appears

  // Start processing (POST)
  const startPipeline = async () => {
    if (stage !== 'idle' && stage !== 'error' && stage !== 'done') return;
    // Reset all state
    setError(null);
    setResults(null);
    setProgress(0);
    setStage('queued');
    setPerspectivesByColor({});
    // Clear any previously loaded cache snapshot & remove cache availability so UI doesn't offer stale load
    cacheSnapshotRef.current = null;
    setCacheAvailable(false);
    setSelectedPerspectives([]);
  setShowChart(false);
  setRevealedColors([]);

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
            // Auto-reveal: ensure color appended to reveal sequence if chart already mounted
            setRevealedColors(rc => rc.includes(data.color) ? rc : [...rc, data.color]);
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

  useEffect(() => {
    // Probe cache once on mount
    (async () => {
      try {
        const orchestratorPort = 8001;
        const res = await fetch(`http://localhost:${orchestratorPort}/ws/cache`);
        if (res.ok) {
          const data = await res.json();
            // Determine if cache has at least one non-empty array
            const hasAny = Object.values(data).some(v => Array.isArray(v) && v.length);
            if (hasAny) {
              cacheSnapshotRef.current = data;
              setCacheAvailable(true);
            }
        }
      } catch (e) {
        // Silent fail; cache just not available
      }
    })();
  }, []);

  // Auto-scroll once first perspectives arrive: first ensure cards visible, then scroll near future chart anchor just before mount
  useEffect(() => {
    const colorKeys = Object.keys(perspectivesByColor);
    if (!showChart && colorKeys.length > 0) {
      // Step 1: ensure cards are in view
      if (cardsContainerRef.current) {
        try { cardsContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
      }
      // Step 2: shortly after, pre-scroll to chart anchor (even though chart not yet mounted)
      const toAnchor = setTimeout(() => {
        if (chartAnchorRef.current) {
          try { chartAnchorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
        }
      }, 350);
      // Step 3: mount chart after a bit more delay
      const t = setTimeout(() => setShowChart(true), 900);
      return () => clearTimeout(t);
    }
  }, [perspectivesByColor, showChart]);

  // Fallback: after chart mounts, verify it is in viewport; if not, scroll again
  useEffect(() => {
    if (showChart) {
      const chk = setTimeout(() => {
        const el = chartAnchorRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight || 0;
        if (rect.top < 0 || rect.bottom > vh) {
          try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
        }
      }, 150);
      return () => clearTimeout(chk);
    }
  }, [showChart]);

  // Progressive color reveal timing: once chart visible, reveal next unseen color every 500ms
  useEffect(() => {
    if (!showChart) return;
    const allColors = Object.keys(perspectivesByColor);
    if (allColors.length === 0) return;
    if (revealedColors.length >= allColors.length) return;
    const next = allColors.filter(c => !revealedColors.includes(c))[0];
    if (!next) return;
    const t = setTimeout(() => {
      setRevealedColors(rc => rc.includes(next) ? rc : [...rc, next]);
    }, 500);
    return () => clearTimeout(t);
  }, [showChart, perspectivesByColor, revealedColors]);

  // Build filtered perspectives object for chart (only revealed colors)
  const chartPerspectives = React.useMemo(() => {
    if (!showChart) return {};
    const obj = {};
    revealedColors.forEach(c => { if (perspectivesByColor[c]) obj[c] = perspectivesByColor[c]; });
    return obj;
  }, [showChart, revealedColors, perspectivesByColor]);

  // Total perspectives generated (all colors, not just revealed subset)
  const totalPerspectives = React.useMemo(() => {
    return Object.values(perspectivesByColor).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0);
  }, [perspectivesByColor]);

  // Attempt to read an input significance score from results (naming fallback) if backend supplies it
  const inputSignificance = results?.input_significance ?? results?.significance ?? null;

  // Build significance → perspective count explanation (or inverse derivation if s not provided)
  const significanceExplanation = React.useMemo(() => {
    if (!totalPerspectives) return null;
    const N = totalPerspectives;
    // If significance available, forward compute; else derive approximate s from N = ceil(128*s^{2.8}+8)
    let s;
    let derived = false;
    if (typeof inputSignificance === 'number' && !Number.isNaN(inputSignificance)) {
      s = Math.min(1, Math.max(0, inputSignificance));
    } else {
      // Invert (ignore ceil for approximation): s = ((N - 8)/128)^{1/2.8}
      s = Math.pow(Math.max(0, (N - 8)) / 128, 1 / 2.8);
      derived = true;
    }
    const raw = 128 * Math.pow(s, 2.8) + 8;
    const forward = Math.ceil(raw);
    return { N, s, raw, forward, derived };
  }, [totalPerspectives, inputSignificance]);

  const loadCache = () => {
    if (!cacheSnapshotRef.current) return;
    const byColor = {};
    Object.entries(cacheSnapshotRef.current).forEach(([color, arr]) => {
      if (Array.isArray(arr) && arr.length) byColor[color] = arr;
    });
    setPerspectivesByColor(byColor);
    setStage('module3'); // simulate near-complete stage for UI context
    setProgress(95);
  };

  return (
    <div className="p-8 border-2 border-border rounded-xl my-8 bg-card/40 backdrop-blur-sm text-foreground shadow-sm space-y-6">
      {/* Why Perspectives Modal (portal-like simple absolute overlay) */}
      {showWhyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={() => setShowWhyModal(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <h4 className="text-lg font-semibold tracking-tight">Why Generate Perspectives?</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We stream political perspectives grouped by color as an accessible way to surface patterns in rhetoric, framing, and ideological bias while the analysis pipeline is still running. Each color cluster corresponds to a semantic grouping or polarity segment discovered during processing. Showing them incrementally helps you:
            </p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
              <li>Observe emerging bias distributions without waiting for final output</li>
              <li>Compare tone, framing, and emphasis across clusters</li>
              <li>Validate data ingestion and model responsiveness in real time</li>
              <li>Spot anomalies (e.g., missing clusters or extreme outliers)</li>
            </ul>
            <p className="text-sm text-muted-foreground">
              These perspectives are raw model-generated snippets that later feed aggregation, normalization, and visualization steps (bias vs significance mapping, clustering, and contrast synthesis). Final reports refine wording and remove redundancies.
            </p>
            <div className="border border-border/50 rounded-md p-3 bg-muted/10 space-y-3">
              <h5 className="text-xs font-semibold tracking-wide uppercase text-foreground/80">How many perspectives are generated?</h5>
              <p className="text-xs text-muted-foreground leading-relaxed">
                The total perspective count <span className="font-mono">N</span> is a smooth, significance–sensitive function of the input's importance score <span className="font-mono">s \u2208 [0,1]</span>:
              </p>
              <pre className="text-[11px] whitespace-pre-wrap bg-background/60 rounded px-2 py-1 border border-border/40 overflow-x-auto"><code>N = ceil( 128 * s^{2.8} + 8 )</code></pre>
              <p className="text-xs text-muted-foreground">
                This curve sharply increases output density for highly significant inputs while capping noise for low-signal statements. The exponent <span className="font-mono">2.8</span> creates a sub‑linear ramp early, then accelerates near the top end.
              </p>
              <h5 className="text-xs font-semibold tracking-wide uppercase text-foreground/80 pt-1">Color scaffolding & streaming</h5>
              <p className="text-xs text-muted-foreground leading-relaxed">
                We first allocate a scaffold of <span className="font-mono">N</span> slots distributed across 7 spectral color groups (red → violet) in bias order. Each group is requested independently; as soon as a group returns, its validated perspectives are streamed to the UI.
              </p>
              <h5 className="text-xs font-semibold tracking-wide uppercase text-foreground/80 pt-1">Adaptive top-N stratification</h5>
              <p className="text-xs text-muted-foreground leading-relaxed">
                After raw generation, a stratified reducer (see <span className="font-mono">TOP-N_K_MEANS-CLUSTERING.py</span>) partitions perspectives into Leftist / Common / Rightist bands using bias thresholds and then:
              </p>
              <ol className="list-decimal pl-5 text-xs text-muted-foreground space-y-1">
                <li>Computes a target reduced size <span className="font-mono">k</span> via piecewise ranges.</li>
                <li>Proportionally allocates slots to each ideological band.</li>
                <li>Rounds & rebalances to ensure \u2211 slots = <span className="font-mono">k</span>.</li>
                <li>Selects highest-significance entries per band (top-N by <span className="font-mono">significance_y</span>).</li>
              </ol>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Pseudo-form: <code className="font-mono">slots_band = round( (|band| / N) * k )</code> with iterative balancing until total equals <span className="font-mono">k</span>.
              </p>
              <h5 className="text-xs font-semibold tracking-wide uppercase text-foreground/80 pt-1">Why k-means mention?</h5>
              <p className="text-xs text-muted-foreground leading-relaxed">
                A downstream (optional) clustering step can further merge semantically redundant perspectives. Its current script label references k-means, but active logic here performs stratified proportional top-N selection rather than iterative centroid optimization. The naming is preserved for future expansion to true embedding-based clustering.
              </p>
              <h5 className="text-xs font-semibold tracking-wide uppercase text-foreground/80 pt-1">Bias & significance mapping</h5>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Each perspective carries <span className="font-mono">bias_x</span> (0→1 continuum) and <span className="font-mono">significance_y</span>. The live scatter animates axes first, then reveals points so you perceive structural balance before density.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowWhyModal(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}
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
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Button onClick={startPipeline}>Run Pipeline</Button>
            {cacheAvailable && (
              <Button variant="secondary" onClick={loadCache}>Cache Found • Load</Button>
            )}
          </div>
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
        <div ref={cardsContainerRef} className="mt-4 p-6 rounded-xl bg-card/60 border border-border/60 shadow-inner space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <h3 className="text-lg font-semibold tracking-tight flex items-center gap-3">
              <span>Streaming Perspectives by Color</span>
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="h-6 px-2 text-[10px] uppercase tracking-wide font-medium"
                onClick={() => setShowWhyModal(true)}
              >See why we generate perspectives</Button>
            </h3>
          </div>
          <div className="py-2">
            <ExpandablePerspectiveCards perspectivesByColor={perspectivesByColor} />
          </div>
          {/* Animated label retained even after chart mounts */}
          <div className="flex justify-center pt-1">
            <TextGenerateEffect words="graph" duration={0.6} className="text-primary/90" />
          </div>
          <div ref={chartAnchorRef} />
          {showChart && (
            <div className="pt-4 border-t border-border/40">
              <StreamingBiasSignificanceMotionChart
                perspectivesByColor={chartPerspectives}
                height={340}
                onSelectionChange={setSelectedPerspectives}
              />
              {significanceExplanation && (
                <div className="mt-2 text-[10px] text-muted-foreground/80 leading-relaxed font-mono space-y-0.5">
                  <div>Formula: N = ceil(128 * s^{2.8} + 8)</div>
                  {significanceExplanation.derived ? (
                    <div>
                      Given N = {significanceExplanation.N}, inferred s ≈ {significanceExplanation.s.toFixed(3)} → ceil(128 * {significanceExplanation.s.toFixed(3)}^{2.8} + 8) = {significanceExplanation.forward}
                    </div>
                  ) : (
                    <div>
                      s = {significanceExplanation.s.toFixed(3)} → 128 * s^{2.8} + 8 = {significanceExplanation.raw.toFixed(2)} → N = ceil({significanceExplanation.raw.toFixed(2)}) = {significanceExplanation.forward}
                    </div>
                  )}
                  <div>Total generated perspectives: {significanceExplanation.N}</div>
                  {significanceExplanation.forward !== significanceExplanation.N && (
                    <div className="text-[9px] opacity-70">(Note: runtime curation or filtering adjusted final count)</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
