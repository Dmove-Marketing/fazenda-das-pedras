import { defineConfig } from 'astro/config';

// Ajuste `site` para o domínio do projeto (usado em canonical/OG).
export default defineConfig({
  site: 'https://espacofazendadaspedras.com.br',
  output: 'static',
  prefetch: true,
  build: {
    inlineStylesheets: 'always',
  },
  server: {
    port: 4321,
  },
  vite: {
    css: {
      transformer: 'lightningcss',
      lightningcss: {
        targets: {
          safari: (14 << 16),   // Safari 14 requires -webkit-backdrop-filter
          firefox: (103 << 16), // Firefox 103+ uses standard backdrop-filter
          chrome: (76 << 16),   // Chrome 76+ uses standard backdrop-filter
        },
      },
    },
  },
});
