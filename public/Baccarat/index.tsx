import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Get initial balance from window or use default
const initialBalance = (window as any).baccaratInitialBalance || 2500;

// Balance change handler to sync with main game
const handleBalanceChange = (newBalance: number) => {
  // Update window object for main game to detect
  (window as any).baccaratCurrentBalance = newBalance;
  
  // If main game has a callback, use it
  if ((window as any).updateMainGameBalance) {
    (window as any).updateMainGameBalance(newBalance);
  }
};

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App initialBalance={initialBalance} onBalanceChange={handleBalanceChange} />
  </React.StrictMode>
);
