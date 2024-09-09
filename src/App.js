import React from 'react';
import Dashboard from './components/Dashboard';

function App({ gameState }) {
  return (
    <div className="App">
      <Dashboard gameState={gameState} />
    </div>
  );
}

export default App;