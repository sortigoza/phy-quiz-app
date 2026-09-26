import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

/**
 * Generates the app icons in `public/` from `public/icon.svg`: run
 * `pnpm pwa-assets` after changing the drawing, and commit the output.
 * The maskable icon is padded with the app background, not white.
 */
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: {
      ...minimal2023Preset.maskable,
      resizeOptions: { background: '#07050d' },
    },
    apple: {
      ...minimal2023Preset.apple,
      resizeOptions: { background: '#07050d' },
    },
  },
  images: ['public/icon.svg'],
});
