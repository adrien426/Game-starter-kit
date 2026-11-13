import './core/physicsGuard';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { runtime } from './core/runtime';
import { useGame } from './core/store';

// Handy in the browser console: __kit.runtime, __kit.useGame.getState()
window.__kit = { runtime, useGame };

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
