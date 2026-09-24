# 15: Music on the library

**What to build:** Opening the app plays J. S. Bach's Crab Canon, Canon 1 a 2 from The Musical Offering (BWV 1079), on the library screen. The music stops the moment the participant leaves the library for a quiz or any other screen, and starts again when they come back. A Music toggle turns it off, and the choice is remembered.

The Crab Canon is a single line of music played against itself reversed: the second voice is the first read from right to left. That symmetry is what makes it a fitting piece for a physics app, and it is also how the shipped file is checked.

**Blocked by:** 03

**Status:** done

- [x] Music plays on the library and on no other screen: not on start, attempt, review, history or help
- [x] Leaving the library stops the music with a short fade, and returning starts it again from the beginning
- [x] Where the browser blocks autoplay, the first click or key press starts it, and a click that leaves the library never lets a note sound
- [x] A Music toggle, shown on the library only, turns the music off and on, with `aria-pressed` for screen readers, which also meets WCAG 1.4.2 (Audio Control)
- [x] The toggle's state is remembered in this browser, and music turned off never starts, not even for a moment on load
- [x] A missing file, a file that will not parse, or a browser without Web Audio leaves the app silent and otherwise unaffected
- [x] The MIDI reader handles formats 0 and 1, tempo changes, running status, and note-on at velocity zero, with tests
- [x] `public/music/crab-canon.mid` is committed from a source whose licence allows it, with the source and licence recorded below
- [x] A test parses the committed file and asserts it is a crab canon: two voices, the second the first reversed

## Implementation notes

### Where things are

- `src/music/midi.ts`: a small Standard MIDI File reader, pure TypeScript. It gives each note its pitch, loudness, start and length in seconds, and its voice (the track in format 1, the channel in format 0).
- `src/music/crab.ts`: `isCrabCanon`, the check the committed file must pass. It compares timing as well as pitch: a reversed note that sounds from `start` to `start + duration` must sound from `end - start - duration`.
- `scripts/crab-canon.ts` (`pnpm crab-canon`): writes `public/music/crab-canon.mid`. A test holds the committed file to what the script writes, so they cannot drift apart.
- `src/music/player.ts`: `createMusic`, which synthesises a score with Web Audio and loops it. It takes the loader and the audio context as arguments, so the tests pass fakes.
- `src/music/background.ts`: the one instance the app uses, which fetches `./music/crab-canon.mid` relative to the page, so it works at any subpath like the rest of the build.
- `src/App.tsx`: `useMusicSetting` and `useBackgroundMusic`. The setting is a row in the existing `settings` table, so the database schema did not change.
- Tests: the reader and the check in `src/music/*.test.ts`, the player against a fake audio context, and the whole app in `src/app/music.test.tsx`.

### Decisions made along the way

- **A synthesiser, not a sampled instrument.** Each note is a triangle wave through a low-pass filter, with the two voices panned left and right, so the listener hears the line and its reflection as two. It suits the retro synthwave theme, it costs no download beyond the MIDI file (a few kilobytes), and it adds no dependency.
- **"Plays when opened" works within what browsers allow.** No browser lets a page make sound before the person has interacted with it, unless autoplay is allowed for that site. The player therefore treats `play` as a wish. It starts at once where autoplay is allowed, and otherwise on the first click or key press.
- **The first click can be the one that leaves the library, and that must stay silent.** Permission is taken on `click`, not `pointerdown`. The listener captures the click before React handles it, and React then commits the new screen and runs the layout effect that stops the music, all inside the same event. The audio context can only report that it is running afterwards, by which time music is no longer wanted.
- **The music loops**, with two seconds of silence between passes.
- **Failure is silent.** Music is decoration, so no failure of it is shown to the participant.

### Verified in a browser

Headless Chromium, driving the real app through Playwright with a stand-in file:

- notes were scheduled on open;
- they were stopped on the way to Help and scheduled again on the way back;
- they were stopped by the toggle, and the setting held across a reload;
- a click on Start as the first gesture scheduled nothing new;
- no errors appeared in the console.

Headless Chromium ignores the autoplay policy flag, so the path where the context waits for a gesture is covered only by the unit tests. Check it once by hand on a real phone.

### The file: source and licence

`public/music/crab-canon.mid` is sequenced in this repo, not taken from elsewhere, because MIDI files found online seldom state a licence.

- **The music** is Bach's, published in 1747, and in the public domain.
- **The sequencing** is `scripts/crab-canon.ts`, dedicated to the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The file says so in its copyright meta event.
- **What it holds:** Bach wrote one line of 18 bars, in C minor and 4/4, to be read forwards and backwards at once. The script transcribes that line only, and computes the second voice as its exact retrograde, in time as well as in pitch. It is a format 1 file with three tracks: a tempo track at 72 quarter notes a minute (one pass lasts a minute), then `Forwards` and `Backwards`. Notes are written at full length, and the player adds its own release.
- **How the notes were checked:** the line was compared note for note against two independent sequencings: the Canon 1 a 2 file on [Dave's J. S. Bach Page](http://www.jsbach.net/midi/midi_musicaloffering.html) (`1079-03.mid`), and the flute duet on [flutetunes.com](https://www.flutetunes.com/tunes.php?id=4602), which is transposed to G minor. The rhythm was checked against the LilyPond score on French Wikipedia's *Canon à l'écrevisse*. All 89 pitches agree with the jsbach.net file. Two places needed a decision:
  - Bar 12 reads A♭ D E♭ F G F E♭ D. French Wikipedia's second voice has D where its own first voice, and both other sources, have F. That is a typo in its second voice.
  - Bar 10 rises F G A♮ B♮ C. French Wikipedia writes A♭, and both other sources write A♮ (E♮ in the G minor flute version). The ascending melodic minor follows the majority.

To change the tempo or fix a note, edit `scripts/crab-canon.ts`, run `pnpm crab-canon`, and commit both files.

### Left open

- **Offline.** Ticket 11 should precache `music/crab-canon.mid` with the app shell, so the library still has its music offline.
- **Autoplay on a real phone.** Headless Chromium ignores the autoplay policy, so check once by hand that a phone waits for the first gesture and then plays.
