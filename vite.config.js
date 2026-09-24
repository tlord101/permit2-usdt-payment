import { defineConfig } from 'vite';
import { resolve } from 'path';
import { cpSync, mkdirSync, existsSync } from 'fs';

function copyStatic() {
  return {
    name: 'copy-static',
    closeBundle() {
      mkdirSync('dist', { recursive: true });
      mkdirSync('dist/js', { recursive: true });

      cpSync('index.html', 'dist/index.html');
      cpSync('admin', 'dist/admin', { recursive: true });
      cpSync('css', 'dist/css', { recursive: true });

      if (existsSync('js/admin.js')) {
        cpSync('js/admin.js', 'dist/js/admin.js');
      }
    }
  };
}

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/wallet-permit2.js'),
      output: {
        entryFileNames: 'js/wallet-permit2.js',
        format: 'es',
        inlineDynamicImports: true
      }
    },
    target: 'esnext',
    minify: true,
    sourcemap: false
  },
  plugins: [copyStatic()]
});
