import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // The API's CORS setting allows exactly http://localhost:5173, so fail
    // instead of silently moving to another port.
    port: 5173,
    strictPort: true,
    // Allow importing ../shared (outside the frontend folder) in dev.
    fs: { allow: ['..'] },
  },
});
