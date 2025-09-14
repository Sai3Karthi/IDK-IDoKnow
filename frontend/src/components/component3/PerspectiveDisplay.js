import React from 'react';

export default function PerspectiveDisplay({ perspectives, category, data }) {
  return (
    <div style={{ 
      color: '#eee', 
      padding: '20px', 
      border: '1px solid #444', 
      borderRadius: '8px',
      background: '#1a1a1a'
    }}>
      <h3>Perspective Display - {category}</h3>
      <p>Data items: {data ? data.length : (perspectives ? perspectives.length : 0)}</p>
      {/* Placeholder for future implementation */}
    </div>
  );
}