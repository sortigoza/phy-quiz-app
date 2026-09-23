import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import pkg from '../package.json' with { type: 'json' };
import { App } from './App';

describe('App', () => {
  it('names the app', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Physics Quiz');
  });

  it('shows the version from the package manifest in the footer', () => {
    render(<App />);
    expect(screen.getByRole('contentinfo')).toHaveTextContent(`v${pkg.version}`);
  });
});
