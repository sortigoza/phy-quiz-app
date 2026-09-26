import { useMemo } from 'react';
import { renderBankText } from '../render/markdown';

/**
 * A participant's own response, rendered with its maths and Markdown by the
 * same renderer as bank text, so `$F = ma$` looks the same in both. It carries
 * no language: the participant may write in any. The HTML is safe to set
 * directly because `renderBankText` sanitises it, exactly as for bank text.
 */
export function ResponseText({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => renderBankText(text), [text]);
  return (
    <div
      className={['bank-text', className].filter(Boolean).join(' ')}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
