import React from 'react';
import Component1 from './components/Component1';
import Component2 from './components/Component2';
import Component3 from './components/Component3';
// ...existing code...

function App() {
  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem' }}>
      <header style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1>IDK-IDoKnow Frontend</h1>
        <p>Edit <code>src/App.js</code> and save to reload.</p>
      </header>
      <Component1 />
      <Component2 />
      <Component3 />
    </div>
  );
}

export default App;
