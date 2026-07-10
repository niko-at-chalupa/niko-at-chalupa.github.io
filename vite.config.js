import { defineConfig } from 'vite'

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
