import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return;
            }

            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('scheduler')
            ) {
              return 'react-vendor';
            }

            if (id.includes('react-router')) {
              return 'router';
            }

            if (id.includes('@supabase/supabase-js')) {
              return 'supabase';
            }

            if (id.includes('/motion/')) {
              return 'motion';
            }

            if (id.includes('lucide-react')) {
              return 'icons';
            }

            if (id.includes('date-fns')) {
              return 'date-fns';
            }
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
