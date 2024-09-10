import React from 'react';
import Dashboard from './components/Dashboard';
import ErrorBoundary from './components/ErrorBoundary';

function App({ gameState }) {
  return (
    <ErrorBoundary>
      <div className="App">
        <Dashboard gameState={gameState} />
      </div>
    </ErrorBoundary>
  );
}

export default App;