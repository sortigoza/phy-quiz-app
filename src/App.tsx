import { useCallback, useEffect, useLayoutEffect, useReducer, useState } from 'react';
import { initialState, reducer, type AppState, type AppAction } from './app/state';
import { takeBankLink } from './bank-link';
import type { ParsedBankLink } from './domain/private-bank';
import { backgroundMusic, CRAB_CANON_CREDIT } from './music/background';
import type { Music } from './music/player';
import { saveInProgress } from './quiz';
import { getMusicOn, setMusicOn } from './storage/db';
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
  /** The library's background music. Replaced in tests, which have no Web Audio. */
  music?: Music;
};

export function App({
  bankLink: initialBankLink = { kind: 'none' },
  music = backgroundMusic,
}: Props) {
  const [state, dispatch] = useReducer(reducer, initialState);
  // Held until the library has shown its outcome, so returning there later does not open it again.
  const [bankLink, setBankLink] = useState(initialBankLink);
  const bankLinkHandled = useCallback(() => setBankLink({ kind: 'none' }), []);
  useBankLinksWhileOpen(setBankLink);
  useLeaveWarning(isAttemptInProgress(state));
  const unsaved = usePersistAttempt(state);
  const [musicOn, toggleMusic] = useMusicSetting();
  useBackgroundMusic(music, state.screen === 'library' && musicOn === true);

  return (
    <div className="app">
      <header className="app__header">
        <h1>Physics Quiz</h1>
        <div className="app__nav">
          {state.screen === 'library' && musicOn !== undefined && (
            <button
              type="button"
              className="button button--quiet"
              aria-pressed={musicOn}
              title={CRAB_CANON_CREDIT}
              onClick={() => {
                // Turning music on is a gesture too: with music off, no other listener passed one on.
                if (!musicOn) music.unlock();
                toggleMusic();
              }}
            >
              Music
            </button>
          )}
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
 * The music setting, and a toggle for it. Undefined until read, so music that
 * was turned off never starts for the moment it takes to find out.
 */
function useMusicSetting(): [boolean | undefined, () => void] {
  const [on, setOn] = useState<boolean>();
  useEffect(() => {
    let cancelled = false;
    getMusicOn().then(
      (value) => !cancelled && setOn((held) => held ?? value),
      // Storage refused: play, since the setting cannot be remembered anyway.
      () => !cancelled && setOn((held) => held ?? true),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  const toggle = useCallback(() => {
    const next = !on;
    setOn(next);
    setMusicOn(next).catch(() => undefined);
  }, [on]);
  return [on, toggle];
}

/**
 * Plays the music while `active`, and stops it otherwise. The library is the
 * only screen that sets it: a quiz is no place for a canon.
 *
 * Browsers hold sound back until the person interacts with the page, so the
 * first click or key press anywhere is passed on as permission, including the
 * click that leaves the library. That is safe because of the order of events:
 * the listener captures the click before React handles it, React commits the
 * new screen and runs this layout effect inside the same event, and only
 * afterwards can the audio context report that it is running. By then music
 * is no longer wanted, and nothing sounds.
 */
function useBackgroundMusic(music: Music, active: boolean): void {
  useLayoutEffect(() => {
    if (active) music.play();
    else music.stop();
  }, [music, active]);

  useEffect(() => {
    if (!active) return;
    const unlock = () => music.unlock();
    const events = ['click', 'keydown'] as const;
    for (const event of events) document.addEventListener(event, unlock, { capture: true });
    return () => {
      for (const event of events) document.removeEventListener(event, unlock, { capture: true });
    };
  }, [music, active]);

  useEffect(() => () => music.stop(), [music]);
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
          onSetConfidence={(questionId, confidence) =>
            dispatch({ type: 'set-confidence', questionId, confidence })
          }
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
          review={state.review}
          backTo={state.back.screen}
          onDone={() => dispatch({ type: 'close-review' })}
        />
      );

    case 'history':
      return (
        <History
          filter={state.filter}
          onFilter={(filter) => dispatch({ type: 'filter-history', filter })}
          onReview={(attempt, review) => dispatch({ type: 'open-review', attempt, review })}
          onDone={() => dispatch({ type: 'open-library' })}
        />
      );
  }
}

/**
 * Takes a bank link entered while the app is already open. Changing only the
 * fragment of an open tab's address does not reload the page, so the link read
 * at start-up would never see it. It is cleared from the address bar at once,
 * as at start-up, and opens when the library is next on screen.
 */
function useBankLinksWhileOpen(open: (link: ParsedBankLink) => void) {
  useEffect(() => {
    const onHashChange = () => {
      const link = takeBankLink();
      if (link.kind !== 'none') open(link);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [open]);
}
