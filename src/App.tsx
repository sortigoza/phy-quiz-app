import { useCallback, useEffect, useReducer, useState } from 'react';
import { initialState, reducer, type AppState, type AppAction } from './app/state';
import type { ParsedBankLink } from './domain/private-bank';
import { saveInProgress } from './quiz';
import { storageProblem } from './storage/problems';
import { AttemptScreen } from './ui/AttemptScreen';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { Help } from './ui/Help';
import { History } from './ui/History';
import { Library } from './ui/Library';
import { Review } from './ui/Review';
import { Start } from './ui/Start';
import { APP_VERSION } from './version';

/**
 * The application shell.
 *
 * There is no router: screens are chosen by state, which is what lets the build
 * work unchanged at any subpath. See `app/state.ts` for the transitions.
 */
type Props = {
  /** A bank link the page was opened with, already cleared from the address bar. */
  bankLink?: ParsedBankLink;
};

export function App({ bankLink: initialBankLink = { kind: 'none' } }: Props) {
  const [state, dispatch] = useReducer(reducer, initialState);
  // Held until the library has shown its outcome, so returning there later does not open it again.
  const [bankLink, setBankLink] = useState(initialBankLink);
  const bankLinkHandled = useCallback(() => setBankLink({ kind: 'none' }), []);
  useLeaveWarning(isAttemptInProgress(state));
  const unsaved = usePersistAttempt(state);

  return (
    <div className="app">
      <header className="app__header">
        <h1>Physics Quiz</h1>
        <div className="app__nav">
          {state.screen === 'library' && (
            <button
              type="button"
              className="button button--quiet"
              onClick={() => dispatch({ type: 'open-history' })}
            >
              History
            </button>
          )}
          {state.screen === 'help' ? (
            <button
              type="button"
              className="button button--quiet"
              onClick={() => dispatch({ type: 'close-help' })}
            >
              Close help
            </button>
          ) : (
            <button
              type="button"
              className="button button--quiet"
              onClick={() => dispatch({ type: 'open-help' })}
            >
              Help
            </button>
          )}
        </div>
      </header>

      <main className="app__main">
        <ErrorBoundary
          screen={state.screen}
          onBackToLibrary={() => dispatch({ type: 'open-library' })}
        >
          <Screen
            state={state}
            dispatch={dispatch}
            unsaved={unsaved}
            bankLink={bankLink}
            onBankLinkHandled={bankLinkHandled}
          />
        </ErrorBoundary>
      </main>

      <footer className="app__footer">
        <span>Physics Quiz</span>
        <span className="app__version">v{APP_VERSION}</span>
      </footer>
    </div>
  );
}

/** True from Begin until Submit, including while Help is open over the attempt. */
function isAttemptInProgress(state: AppState): boolean {
  return state.screen === 'attempt' || (state.screen === 'help' && state.back.screen === 'attempt');
}

/**
 * Asks the browser to confirm before the page is closed, reloaded or navigated
 * away from. The attempt is saved and can be resumed, but leaving by accident
 * mid-quiz is still worth a question.
 */
function useLeaveWarning(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);
}

/**
 * Writes the attempt to storage whenever an answer or the question on screen
 * changes. Returns why the last write failed, or null when it succeeded.
 */
function usePersistAttempt(state: AppState): string | null {
  const [problem, setProblem] = useState<string | null>(null);
  const attempt = state.screen === 'attempt' ? state : undefined;
  const inProgress = attempt?.inProgress;
  const index = attempt?.index;
  useEffect(() => {
    if (inProgress === undefined || index === undefined) return;
    saveInProgress(inProgress, index).then(
      () => setProblem(null),
      (error: unknown) => setProblem(storageProblem(error)),
    );
  }, [inProgress, index]);
  return problem;
}

type ScreenProps = {
  state: AppState;
  dispatch: (action: AppAction) => void;
  /** Why the attempt in progress is not being saved, or null. */
  unsaved: string | null;
  /** A bank link still to be opened, shown by the library. */
  bankLink: ParsedBankLink;
  onBankLinkHandled: () => void;
};

function Screen({ state, dispatch, unsaved, bankLink, onBankLinkHandled }: ScreenProps) {
  switch (state.screen) {
    case 'library':
      return (
        <Library
          onStart={(stored, bank) => dispatch({ type: 'open-start', stored, bank })}
          onResume={(inProgress, index) => dispatch({ type: 'resume', inProgress, index })}
          bankLink={bankLink}
          onBankLinkHandled={onBankLinkHandled}
        />
      );

    case 'start':
      return (
        <Start
          stored={state.stored}
          bank={state.bank}
          onBegin={(inProgress) => dispatch({ type: 'begin', inProgress })}
          onCancel={() => dispatch({ type: 'open-library' })}
        />
      );

    case 'attempt':
      return (
        <AttemptScreen
          inProgress={state.inProgress}
          index={state.index}
          unsaved={unsaved}
          onChoose={(questionId, optionId) => dispatch({ type: 'choose', questionId, optionId })}
          onGoTo={(index) => dispatch({ type: 'go-to', index })}
          onSubmitted={(attempt) => dispatch({ type: 'submitted', attempt })}
        />
      );

    case 'help':
      return <Help />;

    case 'review':
      return (
        <Review
          attempt={state.attempt}
          selection={state.selection}
          language={state.language}
          onDone={() => dispatch({ type: 'open-library' })}
        />
      );

    case 'history':
      return <History onDone={() => dispatch({ type: 'open-library' })} />;
  }
}
