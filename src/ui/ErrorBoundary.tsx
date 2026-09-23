import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * The last line of defence: a screen that throws while rendering shows a short
 * message and a way back to the library, instead of taking the page down.
 *
 * Failures the app can foresee, such as a bank that no longer opens or storage
 * being unavailable, are explained where they happen. This catches the rest.
 */

type Props = {
  children: ReactNode;
  /** The screen showing. Moving to another one, by any means, clears the failure. */
  screen: string;
  onBackToLibrary: () => void;
};

type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidUpdate(previous: Props): void {
    if (this.state.error && previous.screen !== this.props.screen) this.setState({ error: null });
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('Unexpected failure on a screen', error, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="panel panel--error" role="alert">
        <h2>Something went wrong</h2>
        <p>
          The app hit a problem it did not expect: {error.message}. Anything already saved in this
          browser is still there.
        </p>
        <div className="actions">
          <button
            type="button"
            className="button"
            onClick={() => {
              this.setState({ error: null });
              this.props.onBackToLibrary();
            }}
          >
            Back to library
          </button>
        </div>
      </div>
    );
  }
}
