import { useMemo } from 'react';
import { renderBankText } from '../render/markdown';

/**
 * Text written by a bank author, rendered with its maths and Markdown.
 *
 * It carries the bank's language, so a screen reader pronounces a Swedish
 * prompt as Swedish inside an English app. The HTML is safe to set directly:
 * `renderBankText` sanitises it, and is the only thing that may produce it.
 */

type Props = {
  text: string;
  /** BCP 47 tag from the bank's `language`. */
  lang: string;
  /** Phrasing content only, for places like a radio label. */
  inline?: boolean;
  className?: string;
  id?: string;
};

export function BankText({ text, lang, inline = false, className, id }: Props) {
  const html = useMemo(() => renderBankText(text, { inline }), [text, inline]);
  const Element = inline ? 'span' : 'div';
  return (
    <Element
      id={id}
      lang={lang}
      className={['bank-text', className].filter(Boolean).join(' ')}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
