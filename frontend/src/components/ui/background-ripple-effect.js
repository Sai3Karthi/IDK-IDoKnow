// Converted from Aceternity registry (TypeScript -> JS)
// Provides interactive background ripple effect grid
import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { cn } from '../../lib/utils';

export function BackgroundRippleEffect({
  cellSize = 60,
  auto = true,
  idle = true,
  idleInterval = 5000,
  intensity = 1, // new: scales opacity & brightness
  className,
}) {
  const ref = useRef(null);
  const [grid, setGrid] = useState({ rows: 0, cols: 0 });
  const [clickedCell, setClickedCell] = useState(null); // internal ripple origin
  const [rippleKey, setRippleKey] = useState(0);

  // Calculate how many cells are needed to cover viewport
  const recalc = useCallback(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cols = Math.ceil(w / cellSize) + 2; // pad edges
    const rows = Math.ceil(h / cellSize) + 2;
    setGrid(prev => (prev.rows === rows && prev.cols === cols ? prev : { rows, cols }));
  }, [cellSize]);

  // Debounce resize for performance
  useEffect(() => {
    let frame; let timeout;
    const onResize = () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      timeout = setTimeout(() => { frame = requestAnimationFrame(recalc); }, 60);
    };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); cancelAnimationFrame(frame); clearTimeout(timeout); };
  }, [recalc]);

  useEffect(() => { recalc(); }, [recalc]);

  // Trigger an initial ripple from center once grid known
  useEffect(() => {
    if (!auto || grid.rows === 0) return;
    const center = { row: Math.floor(grid.rows / 2), col: Math.floor(grid.cols / 2) };
    setClickedCell(center);
    setRippleKey(k => k + 1);
  }, [auto, grid]);

  // Idle ripple every interval if no interaction
  useEffect(() => {
    if (!idle) return;
    const id = setInterval(() => {
      setClickedCell(cur => {
        const row = Math.floor(Math.random() * grid.rows);
        const col = Math.floor(Math.random() * grid.cols);
        return { row, col };
      });
      setRippleKey(k => k + 1);
    }, idleInterval);
    return () => clearInterval(id);
  }, [idle, idleInterval, grid]);
  return (
    <div
      ref={ref}
      className={cn(
        'fixed inset-0 h-full w-full select-none pointer-events-none will-change-transform',
        // Opacity scaled by intensity parameter
        `[--cell-border-color:rgba(255,255,255,${0.06 * intensity})] [--cell-fill-color:rgba(255,255,255,${0.045 * intensity})]`,
        'dark:[--cell-border-color:rgba(255,255,255,0.06)] dark:[--cell-fill-color:rgba(255,255,255,0.04)]',
        className
      )}
    >
      <div className="relative h-auto w-auto overflow-hidden mx-auto transition-opacity duration-500">
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/10 to-black/80" />
        <DivGrid
          key={`base-${rippleKey}`}
          className="opacity-80"
          rows={grid.rows}
          cols={grid.cols}
          cellSize={cellSize}
          borderColor="var(--cell-border-color)"
          fillColor="var(--cell-fill-color)"
          clickedCell={clickedCell}
          interactive={false}
        />
      </div>
    </div>
  );
}

function DivGrid({
  className,
  rows = 0,
  cols = 0,
  cellSize = 60,
  borderColor = 'rgba(255,255,255,0.08)',
  fillColor = 'rgba(255,255,255,0.06)',
  clickedCell = null,
  onCellClick = () => {},
  interactive = false,
}) {
  const cells = useMemo(() => Array.from({ length: rows * cols }, (_, idx) => idx), [rows, cols]);

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
    gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
    width: cols * cellSize,
    height: rows * cellSize,
    marginInline: 'auto',
  };

  return (
    <div className={cn('relative z-[3] pointer-events-none', className)} style={gridStyle}>
      {cells.map(idx => {
        const rowIdx = Math.floor(idx / cols);
        const colIdx = idx % cols;
        const distance = clickedCell ? Math.hypot(clickedCell.row - rowIdx, clickedCell.col - colIdx) : 0;
        const delay = clickedCell ? Math.max(0, distance * 45) : 0; // faster wave
        const duration = 160 + distance * 60; // shorter overall
        const style = clickedCell ? { '--delay': `${delay}ms`, '--duration': `${duration}ms` } : {};

        return (
          <div
            key={idx}
            className={cn(
              'cell relative border-[0.5px] opacity-25 transition-[opacity,background-color] duration-200 will-change-transform',
              clickedCell && 'animate-cell-ripple [animation-fill-mode:none]'
            )}
            style={{ backgroundColor: fillColor, borderColor: borderColor, ...style }}
            // clicks disabled intentionally
          />
        );
      })}
    </div>
  );
}

export default BackgroundRippleEffect;
