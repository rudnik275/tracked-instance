import {fileURLToPath} from 'node:url'
import vue from '@vitejs/plugin-vue'
import {defineConfig} from 'vite'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // The demo runs the real library, straight from source
      'tracked-instance': fileURLToPath(new URL('../src/index.ts', import.meta.url)),
    },
  },
})
