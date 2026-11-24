import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { refreshCatalog } from './services/datasets';
import './index.css';

// Swap in the guide list from the database as soon as it arrives.
void refreshCatalog();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
