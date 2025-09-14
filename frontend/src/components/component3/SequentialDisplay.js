import React from 'react';

export default function SequentialDisplay({ components, isActive }) {
  return (
    <div style={{ color: '#eee', padding: '20px' }}>
      <h3>Sequential Display Component</h3>
      <p>Active: {isActive ? 'Yes' : 'No'}</p>
      <p>Components count: {components ? components.length : 0}</p>
      {/* Placeholder for future implementation */}
    </div>
  );
}