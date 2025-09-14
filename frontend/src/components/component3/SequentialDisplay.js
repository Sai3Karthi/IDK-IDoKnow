import React from 'react';

export default function SequentialDisplay({ components, isActive }) {
  return (
    <div className="p-5 text-sm rounded-lg border border-border bg-card/30 backdrop-blur-sm text-foreground space-y-1">
      <h3 className="font-medium text-base">Sequential Display Component</h3>
      <p className="text-muted-foreground">Active: <span className="font-semibold text-foreground">{isActive ? 'Yes' : 'No'}</span></p>
      <p className="text-muted-foreground">Components count: <span className="font-semibold text-foreground">{components ? components.length : 0}</span></p>
      <p className="text-xs italic text-muted-foreground">Placeholder for future implementation</p>
    </div>
  );
}