import { defineConfig } from "astro/config";

// GitHub Pages serves the site under /photobooks; Cloudflare (Workers Builds sets
// WORKERS_CI) serves it from the domain root.
const cloudflare = Boolean(process.env.WORKERS_CI);

export default defineConfig({
  site: cloudflare ? undefined : "https://shu1995shijia.github.io",
  base: cloudflare ? "/" : "/photobooks",
  trailingSlash: "ignore",
});
