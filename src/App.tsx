import { useReducer } from 'react';
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
          onDone={() => dispatch({ type: 'open-library' })}
        />
      );
  }
}
