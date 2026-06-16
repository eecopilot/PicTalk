import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
      '/uploads': 'http://localhost:8787'
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('vue') && !id.includes('element')) {
              return 'vue-vendor';
            }
            if (id.includes('element-plus') || id.includes('@element-plus')) {
              return 'element-plus';
            }
          }
        }
      }
    }
  }
});
