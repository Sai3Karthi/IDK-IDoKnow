import React from 'react';

export default function KnnProcessingDisplay({ perspectives, knnComplete }) {
  return (
    <div className="p-5 rounded-lg border border-border bg-card/30 backdrop-blur-sm text-foreground text-sm space-y-1 shadow-sm">
      <h3 className="font-medium text-base tracking-tight">KNN Processing Display</h3>
      <p className="text-muted-foreground">Complete: <span className="font-semibold text-foreground">{knnComplete ? 'Yes' : 'No'}</span></p>
      <p className="text-muted-foreground">Perspectives: <span className="font-semibold text-foreground">{perspectives ? perspectives.length : 0}</span></p>
      <p className="text-xs italic text-muted-foreground">Placeholder for future implementation</p>
    </div>
  );
}