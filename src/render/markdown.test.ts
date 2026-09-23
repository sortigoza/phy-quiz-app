import { describe, expect, it } from 'vitest';
import { renderBankText } from './markdown';

/**
 * Bank text in, safe HTML out. Banks come from URLs strangers control, so the
 * cases that matter most are the hostile ones.
 */

function dom(html: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container;
}

describe('maths', () => {
  it('renders inline maths with KaTeX, including a MathML copy for screen readers', () => {
    const html = dom(renderBankText('Kinetic energy is $\\frac{1}{2}mv^2$.'));
    const maths = html.querySelector('.katex');
    expect(maths).not.toBeNull();
    expect(html.querySelector('.katex-display')).toBeNull();
    expect(html.querySelector('math annotation')?.textContent).toBe('\\frac{1}{2}mv^2');
    expect(html.textContent).toMatch(/^Kinetic energy is /);
  });

  it('renders $$...$$ as display maths', () => {
    const html = dom(renderBankText('Newton says\n\n$$F = ma$$\n\nand that is all.'));
    expect(html.querySelector('.katex-display annotation')?.textContent).toBe('F = ma');
  });

  it('supports mhchem', () => {
    const html = dom(renderBankText('Water is $\\ce{H2O}$.'));
    expect(html.querySelector('.katex')).not.toBeNull();
    expect(html.querySelector('.math-error')).toBeNull();
  });

  it('keeps Markdown from mangling a formula', () => {
    // Underscores and asterisks would otherwise become emphasis.
    const html = dom(renderBankText('$a_1 * b_2 * c_3$ and $x_i$'));
    expect(html.querySelector('em')).toBeNull();
    expect(html.querySelectorAll('.katex')).toHaveLength(2);
    expect(html.querySelector('annotation')?.textContent).toBe('a_1 * b_2 * c_3');
  });

  it('leaves a lone or escaped dollar sign alone', () => {
    expect(dom(renderBankText('It costs $5 and \\$10 to buy.')).textContent).toBe(
      'It costs $5 and $10 to buy.',
    );
    expect(dom(renderBankText('Between $5 and $10.')).querySelector('.katex')).toBeNull();
  });

  it('does not render maths inside code', () => {
    const html = dom(renderBankText('Write `$x^2$` for a square.'));
    expect(html.querySelector('.katex')).toBeNull();
    expect(html.querySelector('code')?.textContent).toBe('$x^2$');
  });

  it('shows a malformed formula as visibly marked raw source, keeping the rest of the text', () => {
    const html = dom(renderBankText('Before $\\frac{1}{$ after.'));
    const error = html.querySelector('.math-error');
    expect(error?.textContent).toBe('$\\frac{1}{$');
    expect(error?.getAttribute('title')).toMatch(/could not render/i);
    expect(html.textContent).toBe('Before $\\frac{1}{$ after.');
  });

  it('cannot smuggle HTML through a formula', () => {
    const html = dom(renderBankText('$\\text{<img src=x onerror=alert(1)>}$'));
    expect(html.querySelector('img')).toBeNull();
    expect(html.querySelector('[onerror]')).toBeNull();
  });

  it('cannot forge a formula placeholder to write into a link after sanitising', () => {
    const link = dom(renderBankText('[x](&#xE000;0&#xE001;) $javascript:alert(1)$')).querySelector(
      'a',
    );
    expect(link?.getAttribute('href') ?? '').not.toMatch(/javascript/);
  });

  it('caps the size of what a formula can draw', () => {
    const html = dom(renderBankText('$\\rule{100000em}{100000em}$'));
    const sizes = [...html.querySelectorAll<HTMLElement>('[style]')].map((el) => el.style.cssText);
    expect(sizes.join(' ')).not.toMatch(/100000em/);
  });

  it('refuses KaTeX commands that emit links or HTML', () => {
    const html = dom(renderBankText('$\\href{javascript:alert(1)}{x}$ $\\htmlClass{evil}{y}$'));
    expect(html.querySelector('a')).toBeNull();
    expect(html.querySelector('.evil')).toBeNull();
  });
});

describe('Markdown', () => {
  it('renders emphasis, code, lists and tables', () => {
    const html = dom(
      renderBankText(
        [
          'Some *emphasis*, **strong** and `code`.',
          '',
          '- one',
          '- two',
          '',
          '1. first',
          '2. second',
          '',
          '| Quantity | Unit |',
          '| --- | :-: |',
          '| Force | $\\mathrm{N}$ |',
        ].join('\n'),
      ),
    );
    expect(html.querySelector('em')?.textContent).toBe('emphasis');
    expect(html.querySelector('strong')?.textContent).toBe('strong');
    expect(html.querySelector('code')?.textContent).toBe('code');
    expect(html.querySelectorAll('ul li')).toHaveLength(2);
    expect(html.querySelectorAll('ol li')).toHaveLength(2);
    expect(html.querySelectorAll('table th')).toHaveLength(2);
    expect(html.querySelector('table td .katex')).not.toBeNull();
  });

  it('opens links in a new tab without handing over the page, so an attempt in progress survives', () => {
    const link = dom(renderBankText('See [the docs](https://example.org/a).')).querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.org/a');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('drops links to scripts', () => {
    const html = dom(renderBankText('[click](javascript:alert(1))'));
    expect(html.querySelector('a')?.getAttribute('href') ?? null).toBeNull();
  });

  it('shows raw HTML as text rather than rendering it', () => {
    const html = dom(renderBankText('Some <b>bold</b> and <em>em</em>.'));
    expect(html.querySelector('b')).toBeNull();
    expect(html.querySelector('em')).toBeNull();
    expect(html.textContent).toBe('Some <b>bold</b> and <em>em</em>.');
  });

  it('never lets a script, handler or iframe through', () => {
    const html = dom(
      renderBankText(
        [
          '<script>alert(1)</script>',
          '',
          '<img src=x onerror="alert(1)">',
          '',
          '<iframe src="https://example.org"></iframe>',
          '',
          '![x](https://example.org/tracker.png)',
        ].join('\n'),
      ),
    );
    expect(html.querySelector('script, img, iframe, [onerror]')).toBeNull();
  });

  it('flattens Markdown outside the allowed set to its text', () => {
    const html = dom(renderBankText('# A heading\n\n> a quote'));
    expect(html.querySelector('h1, blockquote')).toBeNull();
    expect(html.textContent).toContain('A heading');
    expect(html.textContent).toContain('a quote');
  });

  it('renders a single line without a paragraph when asked for inline text', () => {
    const html = dom(renderBankText('*Newton*, $\\mathrm{kg\\,m/s^2}$', { inline: true }));
    expect(html.querySelector('p')).toBeNull();
    expect(html.querySelector('em')?.textContent).toBe('Newton');
    expect(html.querySelector('.katex')).not.toBeNull();
  });
});
