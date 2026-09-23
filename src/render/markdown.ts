import DOMPurify from 'dompurify';
import katex from 'katex';
import 'katex/contrib/mhchem';
import { Marked } from 'marked';

/**
 * Bank text in, safe HTML out.
 *
 * Every prompt, option, why, explanation and description passes through here. Banks come
 * from URLs strangers control, so the order of the steps is the design:
 *
 * 1. Maths is lifted out into placeholders, so Markdown cannot mangle it
 *    (`a_1 * b_2` is not emphasis).
 * 2. Markdown is parsed, with raw HTML escaped rather than passed through.
 * 3. The result is sanitised against a short allowlist of tags.
 * 4. Only then is each formula rendered by KaTeX and put back, into text
 *    nodes only, so a formula cannot smuggle HTML past the sanitiser and a
 *    placeholder in an attribute cannot become markup.
 *
 * See SPEC section 2.4.
 */

export type RenderOptions = {
  /** Render a single run of phrasing content with no paragraph around it, for options. */
  inline?: boolean;
};

/**
 * Private-use characters bracket a placeholder, so no real text can look like
 * one. Each render also stamps its placeholders with a fresh nonce, so a bank
 * that spells the characters as HTML entities still cannot forge one.
 */
const PLACEHOLDER_OPEN = '';
const PLACEHOLDER_CLOSE = '';
const anyPlaceholder = new RegExp(
  `${PLACEHOLDER_OPEN}[^${PLACEHOLDER_CLOSE}]*${PLACEHOLDER_CLOSE}`,
  'g',
);

type Formula = { source: string; tex: string; display: boolean };

/**
 * Finds `$...$` and `$$...$$`, skipping `\$` and code spans.
 *
 * Inline maths follows Pandoc's rule so prices survive: the opening `$` must
 * not be followed by a space, and the closing `$` must not follow a space or
 * precede a digit. "Between $5 and $10" therefore stays text.
 */
const mathsPattern =
  /\\\$|(`+)[\s\S]*?\1|\$\$([\s\S]+?)\$\$|\$(?!\s)((?:\\.|[^$\\])+?)(?<!\s)\$(?!\d)/g;

type ExtractedMaths = { text: string; formulas: Formula[]; placeholder: RegExp };

function extractMaths(text: string): ExtractedMaths {
  const nonce = crypto.getRandomValues(new Uint32Array(1))[0]?.toString(36) ?? '';
  const formulas: Formula[] = [];
  const replaced = text
    .replaceAll(PLACEHOLDER_OPEN, '')
    .replaceAll(PLACEHOLDER_CLOSE, '')
    .replace(mathsPattern, (match, _ticks, display?: string, inline?: string) => {
      const tex = display ?? inline;
      if (tex === undefined) return match;
      formulas.push({ source: match, tex, display: display !== undefined });
      return `${PLACEHOLDER_OPEN}${nonce}-${formulas.length - 1}${PLACEHOLDER_CLOSE}`;
    });
  const placeholder = new RegExp(`${PLACEHOLDER_OPEN}${nonce}-(\\d+)${PLACEHOLDER_CLOSE}`, 'g');
  return { text: replaced, formulas, placeholder };
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const marked = new Marked({
  gfm: true,
  async: false,
  renderer: {
    // Raw HTML is shown as the author typed it, never interpreted.
    html: ({ text }) => escapeHtml(text),
    // Images would mean network requests to hosts the bank author chose.
    image: ({ text }) => escapeHtml(text),
    heading({ tokens }) {
      return `<p>${this.parser.parseInline(tokens)}</p>\n`;
    },
  },
});

/** Emphasis, code, lists, links and tables. Anything else is reduced to its text. */
const purifyConfig = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'em',
    'strong',
    'del',
    'code',
    'pre',
    'ul',
    'ol',
    'li',
    'a',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
  ],
  ALLOWED_ATTR: ['href', 'title', 'align', 'start'],
};

const purify = DOMPurify();
purify.addHook('afterSanitizeAttributes', (node) => {
  // Following a link must not navigate away from an attempt in progress.
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

function renderFormula({ source, tex, display }: Formula): string {
  try {
    return katex.renderToString(tex, {
      displayMode: display,
      throwOnError: true,
      // No \href, \url, \htmlClass and friends: bank authors are not trusted.
      trust: false,
      strict: 'ignore',
      output: 'htmlAndMathml',
      // A hostile formula must not be able to cover the page or hang the tab.
      maxSize: 10,
      maxExpand: 100,
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return `<span class="math-error" title="${escapeHtml(`Could not render this formula: ${reason}`)}">${escapeHtml(source)}</span>`;
  }
}

/**
 * Swaps this render's placeholders for rendered maths, in text nodes only.
 * Maths in an attribute (a link address or title) is dropped rather than
 * written back, because attributes were already vetted by the sanitiser.
 */
function reinsertMaths(root: DocumentFragment, { formulas, placeholder }: ExtractedMaths): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeValue?.includes(PLACEHOLDER_OPEN)) texts.push(node as Text);
  }

  for (const node of texts) {
    const template = document.createElement('template');
    template.innerHTML = escapeHtml(node.nodeValue ?? '')
      .replace(placeholder, (_match, index: string) => {
        const formula = formulas[Number(index)];
        return formula ? renderFormula(formula) : '';
      })
      .replace(anyPlaceholder, '');
    node.replaceWith(template.content);
  }

  for (const element of root.querySelectorAll('*')) {
    for (const attribute of element.attributes) {
      attribute.value = attribute.value.replace(anyPlaceholder, '');
    }
  }
}

export function renderBankText(text: string, options: RenderOptions = {}): string {
  const extracted = extractMaths(text);
  const markup = options.inline
    ? marked.parseInline(extracted.text, { async: false })
    : marked.parse(extracted.text, { async: false });

  const safe = purify.sanitize(markup, { ...purifyConfig, RETURN_DOM_FRAGMENT: true });
  reinsertMaths(safe, extracted);

  const container = document.createElement('div');
  container.append(safe);
  return container.innerHTML.trim();
}
