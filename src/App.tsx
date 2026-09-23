import { Library } from './ui/Library';
import { APP_VERSION } from './version';

/**
 * The application shell.
 *
 * There is no router: screens are chosen by state, which is what lets the build
 * work unchanged at any subpath. Ticket 03 introduces the state machine when
 * there is more than one screen to choose between.
 */
export function App() {
  return (
    <div className="app">
      <header className="app__header">
        <h1>Physics Quiz</h1>
      </header>

      <main className="app__main">
        <Library />
      </main>

      <footer className="app__footer">
        <span>Physics Quiz</span>
        <span className="app__version">v{APP_VERSION}</span>
      </footer>
    </div>
  );
}
