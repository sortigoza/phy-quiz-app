import { parseMidi } from './midi';
import { createMusic } from './player';

/**
 * The library's background music: J. S. Bach, The Musical Offering (BWV 1079),
 * Canon 1 a 2, the "Crab Canon". One line of music played against itself
 * reversed, which suits an app about symmetry as well as physics.
 *
 * Relative to the page, like everything else, so the build works at any path.
 */
export const CRAB_CANON_URL = './music/crab-canon.mid';

export const CRAB_CANON_CREDIT =
  'J. S. Bach, The Musical Offering, BWV 1079: Canon 1 a 2 (the Crab Canon)';

export const backgroundMusic = createMusic({
  load: async () => {
    const response = await fetch(CRAB_CANON_URL);
    if (!response.ok) throw new Error(`Music not found: ${response.status}`);
    return parseMidi(new Uint8Array(await response.arrayBuffer()));
  },
  createContext: () => (typeof AudioContext === 'undefined' ? undefined : new AudioContext()),
});
