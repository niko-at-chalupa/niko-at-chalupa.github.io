import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: '/', 
  appType: 'mpa',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        fallback: resolve(__dirname, '404.html')
      }
    }
  }
})
