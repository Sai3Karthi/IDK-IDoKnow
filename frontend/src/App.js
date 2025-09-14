import React from 'react';
import Component1 from './components/Component1';
import Component2 from './components/Component2';
import { Component3 } from './components/component3';
// ...existing code...

function App() {
  return (
    <div style={{ 
      width: '100%', 
      margin: '0 auto', 
      padding: '2rem',
      color: '#ffffff',
      minHeight: '100vh',
      boxSizing: 'border-box'
    }}>
      <header style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ color: '#ffffff' }}>IDK-IDoKnow Frontend</h1>
        <p>Edit <code style={{ background: '#000000', padding: '2px 5px', borderRadius: '3px', border: '1px solid #ffffff' }}>src/App.js</code> and save to reload.</p>
      </header>
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '2rem', 
        height: 'calc(100vh - 10rem)',
        justifyContent: 'space-between'
      }}>
        <Component1 />
        <Component2 />
        <Component3 />
      </div>
    </div>
  );
}

export default App;
