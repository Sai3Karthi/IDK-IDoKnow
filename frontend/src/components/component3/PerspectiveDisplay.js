import React from 'react';

export default function PerspectiveDisplay({ perspectives, category, data }) {
  return (
    <div className="p-5 rounded-lg border border-border bg-card/30 backdrop-blur-sm text-foreground text-sm space-y-1 shadow-sm">
      <h3 className="font-medium text-base tracking-tight">Perspective Display - {category}</h3>
      <p className="text-muted-foreground">Data items: <span className="font-semibold text-foreground">{data ? data.length : (perspectives ? perspectives.length : 0)}</span></p>
      <p className="text-xs italic text-muted-foreground">Placeholder for future implementation</p>
    </div>
  );
}