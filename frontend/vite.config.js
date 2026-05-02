import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/execute-workflow': 'http://localhost:3001',
      '/execute-node': 'http://localhost:3001',
      '/authenticate': 'http://localhost:3001',
      '/restore-auth': 'http://localhost:3001',
      '/auth-status': 'http://localhost:3001',
      '/clear-auth-cache': 'http://localhost:3001',
      '/health': 'http://localhost:3001',
    },
  },
});
