/**
 * The installed-app side of the page: whether a new version is waiting in the
 * service worker, and whether the browser has offered to install the app.
 *
 * Updates are offered, never applied behind the participant's back: the
 * service worker waits until `applyUpdate` is called. The app decides when to
 * offer it, and never does during an attempt. See SPEC section 8.4.
 *
 * Only Chromium fires `beforeinstallprompt`. Firefox installs from its own
 * menu, so there the offer simply never arrives and no button is shown.
 */

export type PwaState = {
  /** A new version is installed and waiting to take over. */
  updateWaiting: boolean;
  /** The browser has offered to install the app, and the offer is unused. */
  installable: boolean;
};

export type Pwa = {
  /** Calls `listener` whenever the state changes. Returns the unsubscribe. */
  subscribe: (listener: () => void) => () => void;
  /** The current state, the same object until it changes. */
  snapshot: () => PwaState;
  /** Lets the waiting version take over, and reloads the page into it. */
  applyUpdate: () => void;
  /** Shows the browser's install dialog. Does nothing without an offer. */
  install: () => Promise<void>;
};

/** `registerSW` from `virtual:pwa-register`, the part of it used here. */
export type RegisterServiceWorker = (options: {
  onNeedRefresh: () => void;
}) => (reloadPage?: boolean) => Promise<void>;

/** Chromium's `beforeinstallprompt` event, which no DOM typing includes. */
type InstallPromptEvent = Event & { prompt(): Promise<unknown> };

const staticState: PwaState = { updateWaiting: false, installable: false };

/** A page that is never installable and never updates: tests, and browsers with no service worker. */
export const staticPwa: Pwa = {
  subscribe: () => () => undefined,
  snapshot: () => staticState,
  applyUpdate: () => undefined,
  install: () => Promise.resolve(),
};

/**
 * Registers the service worker and listens on `target` (the window) for the
 * browser's install offer.
 */
export function connectPwa(target: EventTarget, register: RegisterServiceWorker): Pwa {
  let state: PwaState = { updateWaiting: false, installable: false };
  let offer: InstallPromptEvent | undefined;
  const listeners = new Set<() => void>();

  const change = (next: Partial<PwaState>) => {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  };

  target.addEventListener('beforeinstallprompt', (event) => {
    // Without this, Chromium shows its own mini-infobar and the offer is used up.
    event.preventDefault();
    offer = event as InstallPromptEvent;
    change({ installable: true });
  });
  target.addEventListener('appinstalled', () => {
    offer = undefined;
    change({ installable: false });
  });

  const update = register({ onNeedRefresh: () => change({ updateWaiting: true }) });

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => state,
    applyUpdate: () => void update(true),
    install: async () => {
      if (!offer) return;
      const used = offer;
      // A prompt can be shown only once, whether it is accepted or dismissed.
      offer = undefined;
      change({ installable: false });
      await used.prompt();
    },
  };
}
