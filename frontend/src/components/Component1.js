import React from 'react';

export default function Component1() {
  return (
    <div style={{ 
      padding: '2rem', 
      border: '2px solid #ffffff', 
      borderRadius: '12px', 
      margin: '2rem 0', 
      background: '#1a1a1a',
      boxShadow: '0 0 10px rgba(255, 255, 255, 0.3)',
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <h2 style={{ color: '#ffffff' }}>Component 1</h2>
      <div style={{ flex: 1, color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span>Placeholder for Component 1</span>
      </div>
    </div>
  );
}
