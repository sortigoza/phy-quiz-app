import { describe, expect, it, vi } from 'vitest';
import { connectPwa, staticPwa, type RegisterServiceWorker } from './pwa';

/**
 * The installed-app side of the page: an update waiting in the service worker,
 * and the browser's offer to install.
 */

/** A service worker registration that reports a waiting update on demand. */
function fakeRegistration() {
  let needRefresh: (() => void) | undefined;
  const update = vi.fn((reloadPage?: boolean) => Promise.resolve(void reloadPage));
  const register: RegisterServiceWorker = (options) => {
    needRefresh = options.onNeedRefresh;
    return update;
  };
  return { register, update, updateWaits: () => needRefresh?.() };
}

/** The event Chromium fires when it would install the page. */
function installPrompt() {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  const prompt = vi.fn(() => Promise.resolve());
  Object.assign(event, { prompt });
  return { event, prompt };
}

describe('a waiting update', () => {
  it('is reported, and applying it tells the service worker to take over and reload', () => {
    const registration = fakeRegistration();
    const pwa = connectPwa(new EventTarget(), registration.register);
    const listener = vi.fn();
    pwa.subscribe(listener);

    expect(pwa.snapshot().updateWaiting).toBe(false);
    registration.updateWaits();
    expect(pwa.snapshot().updateWaiting).toBe(true);
    expect(listener).toHaveBeenCalled();

    pwa.applyUpdate();
    expect(registration.update).toHaveBeenCalledWith(true);
  });

  it('keeps the same snapshot until something changes', () => {
    const pwa = connectPwa(new EventTarget(), fakeRegistration().register);
    expect(pwa.snapshot()).toBe(pwa.snapshot());
    expect(staticPwa.snapshot()).toBe(staticPwa.snapshot());
  });
});

describe('the offer to install', () => {
  it('is held back from the browser and offered by the app instead', async () => {
    const target = new EventTarget();
    const pwa = connectPwa(target, fakeRegistration().register);
    const { event, prompt } = installPrompt();

    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(pwa.snapshot().installable).toBe(true);

    await pwa.install();
    expect(prompt).toHaveBeenCalledOnce();
  });

  it('is spent once used, whatever the answer', async () => {
    const target = new EventTarget();
    const pwa = connectPwa(target, fakeRegistration().register);
    target.dispatchEvent(installPrompt().event);

    await pwa.install();
    expect(pwa.snapshot().installable).toBe(false);
  });

  it('goes away once the app is installed some other way', () => {
    const target = new EventTarget();
    const pwa = connectPwa(target, fakeRegistration().register);
    const listener = vi.fn();
    pwa.subscribe(listener);
    target.dispatchEvent(installPrompt().event);

    target.dispatchEvent(new Event('appinstalled'));
    expect(pwa.snapshot().installable).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('does nothing when there is no offer', async () => {
    const pwa = connectPwa(new EventTarget(), fakeRegistration().register);
    await expect(pwa.install()).resolves.toBeUndefined();
  });

  it('stops notifying a listener that unsubscribed', () => {
    const target = new EventTarget();
    const pwa = connectPwa(target, fakeRegistration().register);
    const listener = vi.fn();
    pwa.subscribe(listener)();

    target.dispatchEvent(installPrompt().event);
    expect(listener).not.toHaveBeenCalled();
  });
});
