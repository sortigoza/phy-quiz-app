import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(cleanup);

// Node's TextEncoder returns bytes from Node's realm, which fail `instanceof
// Uint8Array` against jsdom's globals, and `jose` checks exactly that. A
// browser has one realm; give the tests one too.
const nodeEncode = TextEncoder.prototype.encode.bind(new TextEncoder());
TextEncoder.prototype.encode = (input?: string) => new Uint8Array(nodeEncode(input));

// jsdom gives MathML elements no `style`, so computing their style throws, and
// accessible names are computed through KaTeX's MathML. Treat them as unstyled.
const getComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = (element, pseudo) =>
  'style' in element ? getComputedStyle(element, pseudo) : document.createElement('div').style;
