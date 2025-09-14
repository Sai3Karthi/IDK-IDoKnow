import React from 'react';

export default function ScatterPlotChart({ perspectives }) {
  return (
    <div className="p-5 h-52 rounded-lg border border-border bg-card/30 backdrop-blur-sm text-foreground text-sm space-y-1 shadow-sm flex flex-col">
      <h3 className="font-medium text-base tracking-tight">Scatter Plot Chart</h3>
      <p className="text-muted-foreground">Perspectives: <span className="font-semibold text-foreground">{perspectives ? perspectives.length : 0}</span></p>
      <div className="flex-1 flex items-center justify-center text-xs italic text-muted-foreground">Placeholder for future chart implementation</div>
    </div>
  );
}