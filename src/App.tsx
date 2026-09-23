import { useEffect, useReducer } from 'react';
import { initialState, reducer, type AppState, type AppAction } from './app/state';
import { AttemptScreen } from './ui/AttemptScreen';
import { Help } from './ui/Help';
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
export function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  useLeaveWarning(isAttemptInProgress(state));

  return (
    <div className="app">
      <header className="app__header">
        <h1>Physics Quiz</h1>
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
      </header>

      <main className="app__main">
        <Screen state={state} dispatch={dispatch} />
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
 * away from. Until ticket 07 persists the attempt, leaving loses every answer.
 */
function useLeaveWarning(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);
}

function Screen({ state, dispatch }: { state: AppState; dispatch: (action: AppAction) => void }) {
  switch (state.screen) {
    case 'library':
      return <Library onStart={(bank) => dispatch({ type: 'open-start', bank })} />;

    case 'start':
      return (
        <Start
          stored={state.bank}
          onBegin={(inProgress) => dispatch({ type: 'begin', inProgress })}
          onCancel={() => dispatch({ type: 'open-library' })}
        />
      );

    case 'attempt':
      return (
        <AttemptScreen
          inProgress={state.inProgress}
          index={state.index}
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
  }
}
