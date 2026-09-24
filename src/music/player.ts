import type { Score } from './midi';

/**
 * Background music: one score, synthesised with Web Audio and looped.
 *
 * Browsers refuse to make sound until the person has interacted with the
 * page, so "play" is a wish rather than a command. `play` records that music
 * is wanted; it starts as soon as the audio context is running, which is at
 * once where the browser allows autoplay and otherwise at the first tap or key
 * press, passed in through `unlock`. `stop` withdraws the wish and fades out
 * anything sounding.
 *
 * Failure is silent on purpose. Music is decoration: a missing file or a
 * browser without Web Audio must never stand between a participant and a quiz.
 */
export type Music = {
  play(): void;
  stop(): void;
  /** Call from inside a user gesture, so the browser lets the context start. */
  unlock(): void;
};

/** The part of `AudioContext` the player uses, so tests can pass a fake. */
export type AudioContextLike = Pick<
  AudioContext,
  | 'currentTime'
  | 'destination'
  | 'state'
  | 'resume'
  | 'createGain'
  | 'createOscillator'
  | 'createStereoPanner'
  | 'createBiquadFilter'
  | 'addEventListener'
>;

type Options = {
  /** Fetches and parses the score. Called once, on first play. */
  load: () => Promise<Score>;
  /** Undefined where the platform has no Web Audio. */
  createContext: () => AudioContextLike | undefined;
  /** Silence between the end of one pass and the start of the next, in seconds. */
  gap?: number;
};

/** Loud enough to hear, quiet enough to read over. */
const VOLUME = 0.12;
/** Left and right, so the two voices of a canon are heard as two. */
const PAN = [-0.6, 0.6];
const ATTACK = 0.015;
const RELEASE = 0.12;
const FADE_OUT = 0.25;
/** How far ahead of now a pass is scheduled, so its first note is not clipped. */
const LEAD_IN = 0.1;

export function createMusic({ load, createContext, gap = 2 }: Options): Music {
  let context: AudioContextLike | undefined;
  let output: AudioNode | undefined;
  let score: Promise<Score | undefined> | undefined;
  let wanted = false;
  let pass:
    | { gain: GainNode; oscillators: OscillatorNode[]; next: ReturnType<typeof setTimeout> }
    | undefined;

  function ensureContext(): AudioContextLike | undefined {
    if (context) return context;
    try {
      const created = createContext();
      if (!created) return undefined;

      const filter = created.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2400;
      const gain = created.createGain();
      gain.gain.value = VOLUME;
      filter.connect(gain).connect(created.destination);
      output = filter;

      // The single place playback starts: whenever the context comes to life,
      // whether autoplay allowed it or a gesture did.
      created.addEventListener('statechange', () => void start());
      context = created;
    } catch {
      // A partial Web Audio: stay silent rather than throw from every click.
      return undefined;
    }
    return context;
  }

  async function start(): Promise<void> {
    const audio = ensureContext();
    if (!wanted || pass || !audio || audio.state !== 'running') return;
    score ??= load().catch(() => undefined);
    const loaded = await score;
    // Anything may have changed while the score loaded.
    if (!loaded || loaded.notes.length === 0 || !wanted || pass || audio.state !== 'running')
      return;
    try {
      schedule(audio, loaded);
    } catch {
      // Web Audio refused a node: stay silent.
    }
  }

  function schedule(audio: AudioContextLike, loaded: Score): void {
    const t0 = audio.currentTime + LEAD_IN;
    const gain = audio.createGain();
    gain.connect(output!);

    // Older Safari has no stereo panner: the voices then share the middle.
    const panners = (typeof audio.createStereoPanner === 'function' ? PAN : []).map((value) => {
      const panner = audio.createStereoPanner();
      panner.pan.value = value;
      panner.connect(gain);
      return panner;
    });

    const oscillators = loaded.notes.map((note) => {
      const start = t0 + note.start;
      const end = start + Math.max(note.duration, ATTACK);
      const peak = 0.25 + 0.5 * note.velocity;

      const envelope = audio.createGain();
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(peak, start + ATTACK);
      envelope.gain.setValueAtTime(peak, end);
      envelope.gain.linearRampToValueAtTime(0, end + RELEASE);
      envelope.connect(panners[note.voice] ?? gain);

      const oscillator = audio.createOscillator();
      oscillator.type = 'triangle';
      oscillator.frequency.value = 440 * 2 ** ((note.pitch - 69) / 12);
      oscillator.connect(envelope);
      oscillator.start(start);
      oscillator.stop(end + RELEASE);
      return oscillator;
    });

    const next = setTimeout(
      () => {
        gain.disconnect();
        pass = undefined;
        void start();
      },
      (LEAD_IN + loaded.duration + gap) * 1000,
    );
    pass = { gain, oscillators, next };
  }

  function halt(): void {
    if (!pass || !context) return;
    const { gain, oscillators, next } = pass;
    pass = undefined;
    clearTimeout(next);
    const now = context.currentTime;
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + FADE_OUT);
    for (const oscillator of oscillators) {
      try {
        oscillator.stop(now + FADE_OUT);
      } catch {
        // Already stopped: its note had ended.
      }
    }
    setTimeout(() => gain.disconnect(), (FADE_OUT + RELEASE) * 1000);
  }

  return {
    play() {
      wanted = true;
      void start();
    },
    stop() {
      wanted = false;
      halt();
    },
    unlock() {
      const audio = ensureContext();
      if (audio && audio.state !== 'running') audio.resume().catch(() => undefined);
    },
  };
}
