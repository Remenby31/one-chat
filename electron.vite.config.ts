import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  root: path.resolve(__dirname, 'electron'),
  build: {
    outDir: path.resolve(__dirname, 'dist-electron'),
    lib: {
      entry: {
        main: path.resolve(__dirname, 'electron/main.ts'),
        preload: path.resolve(__dirname, 'electron/preload.ts'),
      },
      formats: ['cjs'],
    },
    rollupOptions: {
      external: ['electron', 'path', 'fs', 'url'],
      output: {
        entryFileNames: '[name].js',
      },
    },
    emptyOutDir: true,
    minify: process.env.NODE_ENV === 'production',
  },
})