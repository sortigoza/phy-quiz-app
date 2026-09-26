import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { takeBankLink } from './bank-link';
import { connectPwa, staticPwa } from './pwa';
import { registerSW } from 'virtual:pwa-register';
import 'katex/dist/katex.min.css';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root is missing from index.html');

// Before anything renders or awaits, so the key leaves the address bar even if
// opening the bank later fails. See SPEC section 3.4.4.
const bankLink = takeBankLink();

// The development server has no service worker, and neither do some browsers.
const pwa =
  import.meta.env.PROD && 'serviceWorker' in navigator
    ? connectPwa(window, (hooks) => registerSW({ immediate: true, ...hooks }))
    : staticPwa;

createRoot(container).render(
  <StrictMode>
    <App bankLink={bankLink} pwa={pwa} />
  </StrictMode>,
);
