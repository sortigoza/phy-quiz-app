import type { CSSProperties } from 'react';

/**
 * The score as a ring that fills to the percentage, with the number inside.
 * It draws in once when the review opens, unless the system asks for reduced
 * motion. Named by its percentage for screen readers; the tally beside it
 * gives the counts.
 */
export function ScoreRing({ percent }: { percent: number }) {
  return (
    <svg
      className="score-ring"
      role="img"
      aria-label={`Score: ${percent}%`}
      viewBox="0 0 120 120"
      style={{ '--score': percent } as CSSProperties}
    >
      <circle className="score-ring__track" cx="60" cy="60" r="52" pathLength={100} />
      <circle className="score-ring__fill" cx="60" cy="60" r="52" pathLength={100} />
      <text className="score-ring__label" x="60" y="60" aria-hidden="true">
        {percent}%
      </text>
    </svg>
  );
}
