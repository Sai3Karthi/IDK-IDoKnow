import React, { useEffect, useState, useRef, useCallback, useId, useMemo } from "react";
import { createPortal } from "react-dom";
import { useOutsideClick } from "../../../hooks/use-outside-click";
import { AnimatePresence, motion } from "framer-motion";
import "./ExpandablePerspectiveCards.css";

/**
 * Rebuilt ExpandablePerspectiveCards
 * Goals:
 *  - Match Aceternity expandable-card feel (grid -> modal expansion)
 *  - Integrate streaming perspective data grouped by color
 *  - Keep animations smooth & minimal (avoid ResizeObserver spam)
 *  - Accessible: ESC to close, outside click, aria attributes
 */
export function ExpandablePerspectiveCards({ perspectivesByColor }) {
  const [active, setActive] = useState(null); // {color, items}
  const [hovered, setHovered] = useState(null); // perspective object
  const dialogRef = useRef(null);
  const scrollRef = useRef(null); // scroll container for auto-scroll
  const id = useId();

  // Memoize cards to avoid re-renders when unrelated colors stream in
  const cards = useMemo(() => {
    const order = ["red","orange","yellow","green","teal","blue","indigo","violet","purple"]; // visual spectrum-ish + extras
    const idx = (c) => {
      const i = order.indexOf(c);
      return i === -1 ? order.length + 1 : i; // unknowns go last
    };
    return Object.entries(perspectivesByColor)
      .map(([color, list]) => ({
        color,
        title: colorLabel(color),
        count: list.length,
        items: list,
        gradient: colorGradient(color)
      }))
      .sort((a, b) => idx(a.color) - idx(b.color));
  }, [perspectivesByColor]);

  const close = useCallback(() => setActive(null), []);
  useOutsideClick(dialogRef, () => active && close());

  useEffect(() => {
    if (!active) return;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = originalOverflow;
    };
  }, [active, close]);

  // Auto-scroll: when active card's item count increases, scroll to bottom if user is already near bottom
  const prevCountRef = useRef(0);
  useEffect(() => {
    if (!active || !scrollRef.current) return;
    const currentCount = active.items.length;
    const el = scrollRef.current;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 32; // 32px tolerance
    if (currentCount > prevCountRef.current && atBottom) {
      // Smooth scroll to bottom for new content visibility
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
    prevCountRef.current = currentCount;
  }, [active, active?.items.length]);

  return (
    <div className="epc-root">
      {/* Overlay & Dialog moved to portal */}
      {active && createPortal(
        <>
          <div className="epc-overlay" aria-hidden></div>
          <div className="epc-dialog-wrapper epc-dialog-center" role="presentation">
            <div
              ref={dialogRef}
              key={active.color}
              className="epc-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby={`epc-title-${id}`}
            >
              <div className="epc-hero" style={{ background: active.gradient }}>
                {/** Metrics overlay */}
                <div className="epc-hero-overlay">
                  {hovered ? (
                    <div className="epc-metrics">
                      <span className="epc-metric"><label>Bias</label><strong>{fmtNum(hovered.bias_x)}</strong></span>
                      <span className="epc-metric"><label>Significance</label><strong>{fmtNum(hovered.significance_y)}</strong></span>
                    </div>
                  ) : (
                    <div className="epc-metrics epc-metrics-fallback">
                      {aggregateMetrics(active.items)}
                    </div>
                  )}
                </div>
              </div>
              <button className="epc-close" onClick={close} aria-label="Close expanded card">
                <CloseIcon />
              </button>
              <div className="epc-content">
                <motion.h3
                  id={`epc-title-${id}`}
                  className="epc-heading"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                >{active.title}</motion.h3>
                <motion.p
                  className="epc-sub"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >{active.count} perspective{active.count !== 1 && 's'}</motion.p>
                <motion.div
                  className="epc-scroll"
                  ref={scrollRef}
                  initial="hidden"
                  animate="visible"
                  variants={{
                    hidden: { opacity: 0 },
                    visible: { opacity: 1, transition: { staggerChildren: 0.025, delayChildren: 0.15 } }
                  }}
                >
                  {active.items.length === 0 && (
                    <div className="epc-empty">No perspectives yet… streaming will populate this soon.</div>
                  )}
                  <ul className="epc-list">
                    {active.items.map((p, i) => (
                      <motion.li
                        key={p.id || p.text?.slice(0,40) || i}
                        className="epc-item"
                        style={{ borderColor: active.color }}
                        tabIndex={0}
                        onMouseEnter={() => setHovered(p)}
                        onFocus={() => setHovered(p)}
                        onMouseLeave={() => setHovered(h => (h === p ? null : h))}
                        onBlur={() => setHovered(h => (h === p ? null : h))}
                        variants={{ hidden: { opacity: 0, x: -6 }, visible: { opacity: 1, x: 0 } }}
                      >
                        {p.text || JSON.stringify(p)}
                      </motion.li>
                    ))}
                  </ul>
                </motion.div>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}

      {/* Grid with squeeze-on-hover behavior */}
      <div
        className="epc-grid"
        data-hovering={typeof window !== 'undefined' && undefined}
        onMouseLeave={(e) => { e.currentTarget.removeAttribute('data-hovering'); }}
      >
        {cards.map(card => (
          <motion.button
            key={card.color}
            className="epc-card"
            style={{ background: card.gradient }}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setActive(card)}
            onMouseEnter={(e)=>{
              const grid = e.currentTarget.parentElement;
              grid.setAttribute('data-hovering','true');
              e.currentTarget.setAttribute('data-active-hover','true');
            }}
            onMouseLeave={(e)=>{
              e.currentTarget.removeAttribute('data-active-hover');
            }}
            onFocus={(e)=>{
              const grid = e.currentTarget.parentElement;
              grid.setAttribute('data-hovering','true');
              e.currentTarget.setAttribute('data-active-hover','true');
            }}
            onBlur={(e)=>{
              e.currentTarget.removeAttribute('data-active-hover');
              const grid = e.currentTarget.parentElement;
              if(!grid.querySelector('[data-active-hover]')) grid.removeAttribute('data-hovering');
            }}
          >
            <div className="epc-card-shade" />
            <div className="epc-card-body">
              <h4 className="epc-card-title">{card.title}</h4>
              <p className="epc-card-count">{card.count} item{card.count !== 1 && 's'}</p>
              <span className="epc-card-cta">Open</span>
            </div>
          </motion.button>
        ))}
        {cards.length === 0 && (
          <div className="epc-placeholder">No perspectives received yet.</div>
        )}
      </div>
    </div>
  );
}

export const CloseIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M18 6l-12 12" />
    <path d="M6 6l12 12" />
  </svg>
);

// Color helpers
function colorLabel(c){ return c.charAt(0).toUpperCase()+c.slice(1); }
function colorGradient(color){
  const map = {
    red: ["#ff5f6d","#ffc371"],
    orange:["#ff8008","#ffc837"],
    yellow:["#f7971e","#ffd200"],
    green:["#11998e","#38ef7d"],
    blue:["#396afc","#2948ff"],
    indigo:["#4776e6","#8e54e9"],
    violet:["#7f00ff","#e100ff"],
    purple:["#6441A5","#2a0845"],
    teal:["#136a8a","#267871"],
  };
  const g = map[color] || ["#434343","#000000"];
  return `linear-gradient(135deg, ${g[0]}, ${g[1]})`;
}

// Number formatter (0.00)
function fmtNum(v){
  if (v === undefined || v === null || isNaN(v)) return '—';
  return (+v).toFixed(2);
}

function aggregateMetrics(items){
  if (!items || !items.length) return (
    <div className="epc-metric-single"><label>Awaiting Data</label><strong>—</strong></div>
  );
  const biasVals = items.map(i => i.bias_x).filter(n => typeof n === 'number');
  const sigVals = items.map(i => i.significance_y).filter(n => typeof n === 'number');
  const avg = (arr) => arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length) : null;
  const bAvg = avg(biasVals);
  const sAvg = avg(sigVals);
  return (
    <>
      <span className="epc-metric"><label>Avg Bias</label><strong>{fmtNum(bAvg)}</strong></span>
      <span className="epc-metric"><label>Avg Signif.</label><strong>{fmtNum(sAvg)}</strong></span>
    </>
  );
}