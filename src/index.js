import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';
import './index.css';
import { gameState } from './services/gameState';

ReactDOM.render(
  <React.StrictMode>
    <App gameState={gameState} />
  </React.StrictMode>,
  document.getElementById('root')
);