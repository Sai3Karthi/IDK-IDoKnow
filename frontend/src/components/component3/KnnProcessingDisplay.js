import React from 'react';

export default function KnnProcessingDisplay({ perspectives, knnComplete }) {
  return (
    <div style={{ 
      color: '#eee', 
      padding: '20px', 
      border: '1px solid #444', 
      borderRadius: '8px',
      background: '#1a1a1a'
    }}>
      <h3>KNN Processing Display</h3>
      <p>Complete: {knnComplete ? 'Yes' : 'No'}</p>
      <p>Perspectives: {perspectives ? perspectives.length : 0}</p>
      {/* Placeholder for future implementation */}
    </div>
  );
}