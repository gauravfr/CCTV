
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

function apiProxy() {
  return {
    target: 'http://localhost:3000',
    changeOrigin: true,
    secure: true,
    configure(proxy: any) {
      proxy.on('proxyReq', (proxyReq: any, req: any) => {
        if (req.headers.origin) {
          proxyReq.setHeader('origin', 'http://localhost:3000');
        }
      });
    },
  };
}

export default defineConfig({
  root: 'frontend',

  plugins: [react()],

  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,

    proxy: {
      '/api': apiProxy(),
      '/stream': apiProxy(),
    },
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },

  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    pool: 'threads',
    isolate: false,
    maxWorkers: 1,
    include: [
      'src/**/*.test.{ts,tsx}',
      '../src/**/*.test.js',
    ],
  },
});
