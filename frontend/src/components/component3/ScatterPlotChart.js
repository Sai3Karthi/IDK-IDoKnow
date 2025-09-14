import React from 'react';

export default function ScatterPlotChart({ perspectives }) {
  return (
    <div style={{ 
      color: '#eee', 
      padding: '20px', 
      border: '1px solid #444', 
      borderRadius: '8px',
      background: '#1a1a1a',
      height: '200px'
    }}>
      <h3>Scatter Plot Chart</h3>
      <p>Perspectives: {perspectives ? perspectives.length : 0}</p>
      {/* Placeholder for future chart implementation */}
    </div>
  );
}