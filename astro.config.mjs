import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://vavgroup.pro',
  output: 'static',
  trailingSlash: 'never',
  build: {
    format: 'directory',
  },
});
