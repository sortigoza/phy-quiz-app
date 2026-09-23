import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(cleanup);

// jsdom gives MathML elements no `style`, so computing their style throws, and
// accessible names are computed through KaTeX's MathML. Treat them as unstyled.
const getComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = (element, pseudo) =>
  'style' in element ? getComputedStyle(element, pseudo) : document.createElement('div').style;
