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
});
