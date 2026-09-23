import { APP_VERSION } from './version';

/**
 * The application shell.
 *
 * Ticket 01 is a walking skeleton: this renders the frame that every later
 * screen hangs inside, and nothing else. The library screen arrives in ticket 02.
 */
export function App() {
  return (
    <div className="app">
      <header className="app__header">
        <h1>Physics Quiz</h1>
      </header>

      <main className="app__main">
        <section className="card">
          <h2>Nothing here yet</h2>
          <p>
            This is the walking skeleton: build, tests and deployment are wired up end to end. Your
            question bank library will live on this screen.
          </p>
        </section>
      </main>

      <footer className="app__footer">
        <span>Physics Quiz</span>
        <span className="app__version">v{APP_VERSION}</span>
      </footer>
    </div>
  );
}
