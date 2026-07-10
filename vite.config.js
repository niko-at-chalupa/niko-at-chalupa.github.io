import { defineConfig } from 'vite'

export default defineConfig({
  base: '/', 
  appType: 'mpa',
  plugins: [
    {
      name: '404-page',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url || '';
          
          if (!url.includes('.') && req.headers.accept?.includes('text/html')) {
            const potentialPath = path.resolve(__dirname, url.slice(1));
            
            if (!fs.existsSync(potentialPath) && !fs.existsSync(`${potentialPath}.html`)) {
              req.url = '/404.html'; 
            }
          }
          next();
        });
      }
    }
  ]
})
