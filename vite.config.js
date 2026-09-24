import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'js',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/wallet-permit2.js'),
      name: 'WalletPermit2',
      formats: ['es'],
      fileName: () => 'wallet-permit2.js'
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    },
    target: 'esnext',
    minify: true,
    sourcemap: false
  }
});
