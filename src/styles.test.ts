import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The palette holds WCAG AA contrast: 4.5:1 for text against every background
 * it is shown on, and 3:1 for the borders and focus ring that mark out a
 * control (WCAG 1.4.3 and 1.4.11). Read from the tokens in styles.css, so a
 * change of colour that breaks contrast fails here.
 */

// Vitest stubs CSS imports, so the file is read as it is; tests run from the project root.
const css = readFileSync('src/styles.css', 'utf8');
const root = /:root\s*{([^}]*)}/.exec(css)?.[1] ?? '';

type Rgba = [number, number, number, number];

function token(name: string): Rgba {
  const value = new RegExp(`--${name}:\\s*([^;]+);`).exec(root)?.[1]?.trim();
  if (!value) throw new Error(`No --${name} in :root`);
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgb = /^rgb\((\d+) (\d+) (\d+) \/ (\d+)%\)$/.exec(value);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Number(rgb[4]) / 100];
  throw new Error(`Cannot read --${name}: ${value}`);
}

/** A translucent colour laid over an opaque one. */
function over([r, g, b, a]: Rgba, [br, bg, bb]: Rgba): Rgba {
  return [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a), 1];
}

function luminance([r, g, b]: Rgba): number {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrast(a: Rgba, b: Rgba): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

describe('contrast', () => {
  it('computes the WCAG ratio', () => {
    expect(contrast([0, 0, 0, 1], [255, 255, 255, 1])).toBeCloseTo(21);
    expect(contrast([118, 118, 118, 1], [255, 255, 255, 1])).toBeCloseTo(4.54, 2);
  });
});

describe('the palette', () => {
  const backgrounds = {
    bg: token('bg'),
    surface: token('surface'),
    // The glow on the horizon, where the page background is at its lightest.
    horizon: over(token('horizon'), token('bg')),
  };

  const texts = ['text', 'text-muted', 'accent', 'link', 'correct', 'wrong', 'unanswered'];
  for (const [backgroundName, background] of Object.entries(backgrounds)) {
    for (const name of texts) {
      it(`shows --${name} text on ${backgroundName} at 4.5:1 or more`, () => {
        expect(contrast(token(name), background)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it.each([
    ['text', 'danger-bg'],
    ['text-muted', 'danger-bg'],
    ['wrong', 'danger-bg'],
    ['link', 'danger-bg'],
    ['text', 'correct-bg'],
    ['correct', 'correct-bg'],
    ['text-muted', 'correct-bg'],
    ['accent-text', 'accent'],
  ])('shows --%s text on --%s at 4.5:1 or more', (text, background) => {
    expect(contrast(token(text), token(background))).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['border', 'bg'],
    ['border', 'surface'],
    ['danger-border', 'danger-bg'],
    ['focus', 'bg'],
    ['focus', 'surface'],
    ['focus', 'danger-bg'],
  ])('draws --%s against --%s at 3:1 or more', (line, background) => {
    expect(contrast(token(line), token(background))).toBeGreaterThanOrEqual(3);
  });
});
