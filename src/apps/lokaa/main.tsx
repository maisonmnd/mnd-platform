import '../../shared/preload-guard';
import '../../shared/version';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './lokaa.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
