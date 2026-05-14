import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Change this to '/mmbs-web/' when deploying to GitHub Pages
  // as https://<user>.github.io/mmbs-web/
  base: process.env.GITHUB_ACTIONS ? '/mmbs-web/' : '/',
});
