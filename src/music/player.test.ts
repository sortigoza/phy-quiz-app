import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Score } from './midi';
import { createMusic, type AudioContextLike } from './player';

/**
 * A stand-in for Web Audio that records what was scheduled. jsdom has no
 * AudioContext, and the behaviour worth testing is when sound is scheduled and
 * cancelled, not what it sounds like.
 */
class FakeParam {
  value = 0;
  setValueAtTime = vi.fn(() => this);
  linearRampToValueAtTime = vi.fn(() => this);
}

class FakeNode {
  connect = vi.fn((target: unknown) => target);
  disconnect = vi.fn();
}

class FakeOscillator extends FakeNode {
  type = 'sine';
  frequency = new FakeParam();
  start = vi.fn();
  stop = vi.fn();
}

class FakeContext {
  state: AudioContextState = 'suspended';
  currentTime = 0;
  destination = new FakeNode();
  oscillators: FakeOscillator[] = [];
  private listeners: Array<() => void> = [];

  resume = vi.fn(() => {
    this.becomes('running');
    return Promise.resolve();
  });

  becomes(state: AudioContextState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }

  addEventListener(_type: string, listener: () => void): void {
    this.listeners.push(listener);
  }

  createGain() {
    return Object.assign(new FakeNode(), { gain: new FakeParam() });
  }

  createStereoPanner() {
    return Object.assign(new FakeNode(), { pan: new FakeParam() });
  }

  createBiquadFilter() {
    return Object.assign(new FakeNode(), { type: 'lowpass', frequency: new FakeParam() });
  }

  createOscillator() {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }
}

const score: Score = {
  notes: [
    { pitch: 69, velocity: 1, start: 0, duration: 1, voice: 0 },
    { pitch: 57, velocity: 1, start: 1, duration: 1, voice: 1 },
  ],
  duration: 2,
};

let context: FakeContext;

function music({ load = () => Promise.resolve(score), available = true } = {}) {
  context = new FakeContext();
  return createMusic({
    load,
    createContext: () => (available ? (context as unknown as AudioContextLike) : undefined),
    gap: 1,
  });
}

/** Lets the score's promise and anything waiting on it settle. */
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('background music', () => {
  it('schedules nothing until the browser lets the audio context run', async () => {
    const player = music();
    player.play();
    await settle();
    expect(context.oscillators).toHaveLength(0);

    player.unlock();
    await settle();

    expect(context.oscillators).toHaveLength(2);
    expect(context.oscillators.map((oscillator) => oscillator.frequency.value)).toEqual([440, 220]);
  });

  it('plays at once where the browser allows autoplay', async () => {
    const player = music();
    context.state = 'running';
    player.play();
    await settle();
    expect(context.oscillators).toHaveLength(2);
  });

  it('stays silent when unlocked while music is not wanted', async () => {
    const player = music();
    player.play();
    player.stop();
    player.unlock();
    await settle();
    expect(context.oscillators).toHaveLength(0);
  });

  it('stops what is sounding, and schedules no further pass', async () => {
    const player = music();
    context.state = 'running';
    player.play();
    await settle();

    player.stop();
    for (const oscillator of context.oscillators) expect(oscillator.stop).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(context.oscillators).toHaveLength(2);
  });

  it('loops, one pass after another', async () => {
    const player = music();
    context.state = 'running';
    player.play();
    await settle();

    // The lead-in, the score's two seconds, and the one-second gap.
    await vi.advanceTimersByTimeAsync(3_200);

    expect(context.oscillators).toHaveLength(4);
  });

  it('does not stack a second pass when play is called again', async () => {
    const player = music();
    context.state = 'running';
    player.play();
    player.play();
    await settle();
    player.play();
    await settle();
    expect(context.oscillators).toHaveLength(2);
  });

  it('loads the score once, however often it plays', async () => {
    const load = vi.fn(() => Promise.resolve(score));
    const player = music({ load });
    context.state = 'running';
    player.play();
    await settle();
    player.stop();
    player.play();
    await settle();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not start if stopped while the score was still loading', async () => {
    let resolve: (value: Score) => void = () => undefined;
    const player = music({ load: () => new Promise((done) => (resolve = done)) });
    context.state = 'running';
    player.play();
    player.stop();
    resolve(score);
    await settle();
    expect(context.oscillators).toHaveLength(0);
  });

  it('stays silent, without throwing, when the score cannot be loaded', async () => {
    const player = music({ load: () => Promise.reject(new Error('404')) });
    context.state = 'running';
    player.play();
    await settle();
    expect(context.oscillators).toHaveLength(0);
  });

  it('does nothing where the platform has no Web Audio', async () => {
    const player = music({ available: false });
    expect(() => {
      player.play();
      player.unlock();
      player.stop();
    }).not.toThrow();
    await settle();
  });
});
