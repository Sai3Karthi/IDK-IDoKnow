import React from 'react';
import Component1 from './components/Component1';
import Component2 from './components/Component2';
import { Component3 } from './components/component3';
import { BackgroundRippleEffect } from './components/ui/background-ripple-effect';

function App() {
  return (
  <div className="relative min-h-screen w-full text-foreground bg-background px-4 md:px-8 py-10 space-y-8">
      <BackgroundRippleEffect className="z-0" />
      <div className="relative z-10 space-y-8">
        <header className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">IDK-IDoKnow Frontend</h1>
          <p className="text-sm text-muted-foreground">Edit <code className="px-1.5 py-0.5 rounded border bg-card/40">src/App.js</code> and save to reload.</p>
        </header>
        <div className="flex flex-col gap-8 h-[calc(100vh-14rem)] justify-between">
          <Component1 />
          <Component2 />
          <Component3 />
        </div>
      </div>
    </div>
  );
}

export default App;
