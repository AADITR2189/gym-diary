import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import App from './App';
import './index.css';

// Service worker: caches the app shell (incl. fonts) so it loads instantly and works offline.
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Opening logo (in index.html): kept until its steps have climbed in, then faded out.
const splash = document.getElementById('splash');
if (splash) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = Math.max(0, (reduce ? 250 : 850) - performance.now());
  window.setTimeout(() => {
    splash.classList.add('out');
    window.setTimeout(() => splash.remove(), 300);
  }, wait);
}
