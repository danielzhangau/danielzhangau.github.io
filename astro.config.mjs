import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://danielzhangau.github.io",
  integrations: [mdx(), sitemap()],
  build: {
    // Inline all stylesheets into the HTML head to eliminate the
    // render-blocking <link rel="stylesheet"> request. Our compiled
    // CSS is ~9KB so the inline cost is acceptable for the LCP win.
    inlineStylesheets: "always",
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
