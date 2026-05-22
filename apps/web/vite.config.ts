import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api/supabase-mgmt': {
        target: 'https://api.supabase.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/supabase-mgmt/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('konva')) return 'vendor-konva';
          if (id.includes('react-router')) return 'vendor-router';
          if (id.match(/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/))
            return 'vendor-react';
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('@tanstack')) return 'vendor-query';
          if (id.includes('@radix-ui')) return 'vendor-radix';
          if (id.includes('zod') || id.includes('react-hook-form'))
            return 'vendor-forms';
          if (id.includes('lucide-react')) return 'vendor-icons';
          return 'vendor';
        },
      },
    },
  },
});
