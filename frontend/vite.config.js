import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const hotToastShimPath = fileURLToPath(new URL('./src/shims/react-hot-toast.js', import.meta.url));

function pageChunkName(id) {
  const normalized = id.replace(/\\/g, '/');
  const match = normalized.match(/\/src\/pages\/([^/]+)\.(js|jsx)$/);
  if (!match) return null;
  const baseName = match[1]
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .toLowerCase();
  return `page-${baseName}`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = (env.VITE_PROXY_TARGET || env.VITE_API_BASE || 'http://localhost:5000').replace(/\/+$/, '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        'react-hot-toast': hotToastShimPath
      }
    },
    esbuild: {
      jsx: 'automatic'
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
                return 'vendor-react';
              }
              if (id.includes('socket.io-client')) {
                return 'vendor-socket';
              }
              if (id.includes('jspdf')) {
                return 'vendor-pdf';
              }
              return 'vendor-misc';
            }

            const pageChunk = pageChunkName(id);
            if (pageChunk) {
              return pageChunk;
            }

            return undefined;
          }
        }
      }
    },
    optimizeDeps: {
      esbuildOptions: {
        loader: {
          '.js': 'jsx',
          '.jsx': 'jsx'
        }
      }
    },
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true
        },
        '/uploads': {
          target: proxyTarget,
          changeOrigin: true
        },
        '/socket.io': {
          target: proxyTarget,
          ws: true,
          changeOrigin: true
        }
      }
    }
  };
});
