import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';

// Color mapping re-used from cards (fallback colors included)
const COLOR_MAP = {
  red: '#ff5f6d',
  orange: '#ff8008',
  yellow: '#f7971e',
  green: '#38ef7d',
  blue: '#396afc',
  indigo: '#4776e6',
  violet: '#7f00ff',
  purple: '#6441A5',
  teal: '#136a8a'
};

/**
 * StreamingBiasSignificanceMotionChart
 * Animated scatter plot (bias_x vs significance_y) using raw SVG + Framer Motion.
 * - Axis draw animations
 * - Staggered tick fade-in
 * - Pop / pulse for new points
 * - Responsive via ResizeObserver
 * - Tooltip & hover highlighting
 */
export function StreamingBiasSignificanceMotionChart({
  perspectivesByColor,
  xDomain,
  yDomain,
  height = 360,
  margin = { top: 28, right: 28, bottom: 48, left: 56 },
  animateAxis = true,
  maxPoints = 2500,
  onPointHover,
  onSelectionChange
}) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(640);
  const [hovered, setHovered] = useState(null);
  const [hiddenColors, setHiddenColors] = useState(new Set());
  const toggleColor = useCallback((color) => {
    setHiddenColors(prev => {
      const next = new Set(prev);
      if (next.has(color)) next.delete(color); else next.add(color);
      return next;
    });
  }, []);
  const [lasso, setLasso] = useState(null); // {x1,y1,x2,y2}
  const svgRef = useRef(null);
  const pointerDownRef = useRef(null);
  const prevIdsRef = useRef(new Set());
  const [readyForPoints, setReadyForPoints] = useState(false); // delay point appearance

  // Delay points to let users watch axis build: axis duration ~2.2s + tick fade => show points after 1.4s
  useEffect(() => {
    const t = setTimeout(() => setReadyForPoints(true), 1400); // adjustable
    return () => clearTimeout(t);
  }, []);

  // Resize observer for responsive width
  useEffect(() => {
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Flatten & sanitize points
  const points = useMemo(() => {
    const flat = [];
    Object.entries(perspectivesByColor || {}).forEach(([color, arr]) => {
      (arr || []).forEach(p => {
        if (typeof p.bias_x === 'number' && typeof p.significance_y === 'number') {
          if (hiddenColors.has(color)) return;
          flat.push({
            id: p.id || p.text || Math.random().toString(36).slice(2),
            x: p.bias_x,
            y: p.significance_y,
            color,
            text: p.text || ''
          });
        }
      });
    });
    return flat.slice(-maxPoints);
  }, [perspectivesByColor, maxPoints, hiddenColors]);

  // Domains (with padding when auto)
  const [xMin, xMax] = xDomain || (() => {
    if (!points.length) return [-1, 1];
    const xs = points.map(p => p.x);
    const min = Math.min(...xs);
    const max = Math.max(...xs);
    const pad = (max - min) * 0.08 || 0.2;
    return [min - pad, max + pad];
  })();
  const [yMin, yMax] = yDomain || (() => {
    if (!points.length) return [0, 1];
    const ys = points.map(p => p.y);
    const min = Math.min(...ys);
    const max = Math.max(...ys);
    const pad = (max - min) * 0.08 || 0.1;
    return [min - pad, max + pad];
  })();

  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = Math.max(0, height - margin.top - margin.bottom);

  const xScale = v => margin.left + ((v - xMin) / (xMax - xMin || 1)) * innerW;
  const yScale = v => margin.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;

  // Detect new points
  const newIds = [];
  points.forEach(p => { if (!prevIdsRef.current.has(p.id)) newIds.push(p.id); });
  useEffect(() => { prevIdsRef.current = new Set(points.map(p => p.id)); }, [points]);

  // Tick generator
  const genTicks = (min, max, count = 6) => {
    if (min === max) return [min];
    const step = (max - min) / count;
    return Array.from({ length: count + 1 }, (_, i) => +(min + i * step).toFixed(2));
  };
  const xTicks = genTicks(xMin, xMax, 6);
  const yTicks = genTicks(yMin, yMax, 6);

  // Slower axis animation for more pronounced build
  const axisAnim = (delay = 0) => animateAxis ? { initial: { pathLength: 0 }, animate: { pathLength: 1, transition: { duration: 2.2, delay, ease: 'easeInOut' } } } : {};

  // LASSO HANDLERS
  const toLocal = (clientX, clientY) => {
    const rect = svgRef.current.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };
  const onPointerDown = (e) => {
    if (e.button !== 0) return; // left only
    const { x, y } = toLocal(e.clientX, e.clientY);
    pointerDownRef.current = { x, y };
    setLasso({ x1: x, y1: y, x2: x, y2: y });
  };
  const onPointerMove = (e) => {
    if (!pointerDownRef.current) return;
    const { x, y } = toLocal(e.clientX, e.clientY);
    setLasso(l => l ? { ...l, x2: x, y2: y } : l);
  };
  const onPointerUp = () => {
    if (!pointerDownRef.current) return;
    const { x: xStart, y: yStart } = pointerDownRef.current;
    pointerDownRef.current = null;
    setLasso(l => {
      if (!l) return null;
      const minX = Math.min(l.x1, l.x2), maxX = Math.max(l.x1, l.x2);
      const minY = Math.min(l.y1, l.y2), maxY = Math.max(l.y1, l.y2);
      const selected = points.filter(p => {
        const px = xScale(p.x); const py = yScale(p.y);
        return px >= minX && px <= maxX && py >= minY && py <= maxY;
      });
      onSelectionChange && onSelectionChange(selected);
      return null;
    });
  };
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  });

  // Quadrant midlines (split at 0 bias and mid of significance domain)
  const midYVal = (yMin + yMax) / 2;
  const midY = yScale(midYVal);
  const zeroX = xScale(0);

  return (
    <div ref={containerRef} style={{ width: '100%', height }} className="relative select-none">
      {/* Legend */}
      <div className="absolute top-1 right-2 z-10 flex flex-wrap gap-2 text-[10px]">
        {Object.keys(perspectivesByColor).map(c => (
          <button key={c} onClick={()=>toggleColor(c)}
            className={`px-2 py-1 rounded-md border backdrop-blur-sm transition text-foreground/90 ${hiddenColors.has(c)?'opacity-40 line-through':'opacity-90'} hover:opacity-100`}
            style={{ background:(COLOR_MAP[c]||'#666')+'22', borderColor:(COLOR_MAP[c]||'#666')+'55' }}>
            {c}
          </button>
        ))}
      </div>
      <svg ref={svgRef} width={width} height={height} className="overflow-visible" style={{ touchAction:'none', cursor: lasso? 'crosshair':'default' }}>
        <LayoutGroup>
          {/* Quadrant background rectangles */}
          <g opacity={0.48}>
            <rect x={margin.left} y={margin.top} width={Math.max(0, zeroX - margin.left)} height={Math.max(0, midY - margin.top)} fill="hsl(var(--muted)/0.22)" />
            <rect x={zeroX} y={margin.top} width={Math.max(0, margin.left+innerW - zeroX)} height={Math.max(0, midY - margin.top)} fill="hsl(var(--muted)/0.15)" />
            <rect x={margin.left} y={midY} width={Math.max(0, zeroX - margin.left)} height={Math.max(0, margin.top+innerH - midY)} fill="hsl(var(--muted)/0.15)" />
            <rect x={zeroX} y={midY} width={Math.max(0, margin.left+innerW - zeroX)} height={Math.max(0, margin.top+innerH - midY)} fill="hsl(var(--muted)/0.22)" />
          </g>

          {/* Axes */}
          <motion.line
            key="x-axis"
            x1={margin.left}
            y1={margin.top + innerH}
            x2={margin.left + innerW}
            y2={margin.top + innerH}
            stroke="hsl(var(--foreground)/0.9)"
            strokeWidth={2.2}
            shapeRendering="crispEdges"
            {...axisAnim(.05)}
          />
          <motion.line
            key="y-axis"
            x1={margin.left}
            y1={margin.top}
            x2={margin.left}
            y2={margin.top + innerH}
            stroke="hsl(var(--foreground)/0.9)"
            strokeWidth={2.2}
            shapeRendering="crispEdges"
            {...axisAnim(.15)}
          />

          {/* X ticks */}
          {xTicks.map((t, i) => {
            const x = xScale(t);
            return (
              <motion.g key={`xt-${t}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .55 + i * .07 }}>
                <line x1={x} x2={x} y1={margin.top + innerH} y2={margin.top + innerH + 6} stroke="hsl(var(--border)/0.7)" />
                <text x={x} y={margin.top + innerH + 18} textAnchor="middle" fontSize={11} fill="hsl(var(--foreground)/0.85)" fontWeight="500">{t}</text>
              </motion.g>
            );
          })}

          {/* Y ticks */}
          {yTicks.map((t, i) => {
            const y = yScale(t);
            return (
              <motion.g key={`yt-${t}`} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .55 + i * .07 }}>
                <line x1={margin.left - 6} x2={margin.left} y1={y} y2={y} stroke="hsl(var(--border)/0.7)" />
                <text x={margin.left - 10} y={y + 3} textAnchor="end" fontSize={11} fill="hsl(var(--foreground)/0.85)" fontWeight="500">{t}</text>
              </motion.g>
            );
          })}

          {/* Points */}
          <AnimatePresence>
            {readyForPoints && points.map(p => {
              const isNew = newIds.includes(p.id);
              const baseColor = COLOR_MAP[p.color] || '#999';
              return (
                <motion.circle
                  key={p.id}
                  cx={xScale(p.x)}
                  cy={yScale(p.y)}
                  r={6}
                  initial="hidden"
                  animate={isNew ? { opacity: 1, scale: [0, 1.55, 1], transition: { duration: 1.25, ease: 'easeOut', delay: 0.05 } } : { opacity: 1, scale: 1, transition: { delay: 0.05 } }}
                  strokeWidth={1.8}
                  fill={baseColor + '88'}
                  style={{ cursor: 'pointer', filter: hovered?.id === p.id ? 'drop-shadow(0 0 6px rgba(255,255,255,.55))' : 'none' }}
                  whileHover={{ scale: 1.4 }}
                  onMouseEnter={() => { setHovered(p); onPointHover && onPointHover(p); }}
                  onMouseLeave={() => setHovered(h => h === p ? null : h)}
                  stroke={baseColor}
                />
              );
            })}
          </AnimatePresence>

          {/* Lasso rectangle */}
          {lasso && (
            <rect x={Math.min(lasso.x1, lasso.x2)} y={Math.min(lasso.y1, lasso.y2)}
              width={Math.abs(lasso.x2 - lasso.x1)} height={Math.abs(lasso.y2 - lasso.y1)}
              fill="rgba(180,200,255,0.12)" stroke="rgba(140,170,255,0.8)" strokeDasharray="4 4" />
          )}
        </LayoutGroup>
      </svg>
      {/* Increase axis label contrast */}
      <motion.div className="absolute left-1/2 -translate-x-1/2 bottom-1 text-[12px] text-foreground"
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: { delay: 1.3 } }}>Bias</motion.div>
      <motion.div className="absolute top-1/2 left-2 text-[12px] text-foreground" style={{ writingMode: 'vertical-rl', transform: 'translateY(-55%) rotate(180deg)' }}
        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0, transition: { delay: 1.45 } }}>Significance</motion.div>

      {/* Tooltip */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            className="pointer-events-none absolute rounded-md bg-popover/90 backdrop-blur px-2 py-1 text-[11px] leading-snug border border-border shadow-md max-w-[240px]"
            initial={{ opacity: 0, scale: .9, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: .9, y: 4, transition: { duration: 0.15 } }}
            style={{ left: xScale(hovered.x) + 10, top: yScale(hovered.y) - 10 }}
          >
            <div className="font-medium mb-0.5 capitalize">{hovered.color}</div>
            <div className="opacity-80">Bias {hovered.x.toFixed(2)} | Sig {hovered.y.toFixed(2)}</div>
            {hovered.text && <div className="mt-0.5 line-clamp-3">{hovered.text}</div>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {!points.length && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/70 italic">
          Awaiting perspectives…
        </div>
      )}
    </div>
  );
}

export default StreamingBiasSignificanceMotionChart;
