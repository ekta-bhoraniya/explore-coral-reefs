import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { validateContent } from './src/data/validate';

/** Validates spots/species/credits at dev start and on every build; a bad file fails the build. */
function contentCheck(): Plugin {
  return {
    name: 'reef-content-check',
    buildStart() {
      const problems = validateContent(process.cwd());
      if (problems.length) {
        const msg = 'Content validation failed:\n  - ' + problems.join('\n  - ');
        if (this.environment?.mode === 'dev') this.warn(msg);
        else this.error(msg);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), contentCheck()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
});
