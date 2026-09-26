import type { BankIssue } from '../domain/bank';

/**
 * How many problems a file's report lists. SPEC section 3.3. A bank generated
 * with one mistake repeated can have hundreds, and the first few say what to fix.
 */
export const ISSUES_SHOWN = 20;

/** A file's problems, each at the path of the field that caused it. */
export function IssueList({ issues }: { issues: BankIssue[] }) {
  const hidden = issues.length - ISSUES_SHOWN;
  return (
    <>
      <ul className="issues">
        {issues.slice(0, ISSUES_SHOWN).map((issue, index) => (
          <li key={`${issue.path}-${index}`}>
            {issue.path && <code>{issue.path}</code>} {issue.message}
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <p className="issues__more">
          …and {hidden} more. Fix these first: the rest often go with them.
        </p>
      )}
    </>
  );
}
