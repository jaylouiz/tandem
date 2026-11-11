// The static demo: the web app plus Tandem's own API over demo data, both in the page (`src/demo/`). No server, no GitHub,
// nothing written anywhere: any static host can serve `dist/demo` (it needs every path rewritten to `/index.html`, `vercel.json`).
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const node = fileURLToPath(new URL("./src/demo/node.ts", import.meta.url));

export default defineConfig({
  root: "src/demo",
  // a host that serves the demo from a sub-path (GitHub Pages: `/tandem/pr-4/`): DEMO_BASE names it, with both slashes
  base: process.env.DEMO_BASE ?? "/",
  publicDir: "../web/public",
  plugins: [react(), tailwindcss()],
  resolve: { alias: [{ find: /^node:(fs|fs\/promises|os|path|url|child_process|util)$/, replacement: node }] },
  define: { "process.env": "{}", "process.pid": "1", "process.platform": '"browser"' },
  build: { outDir: "../../dist/demo", emptyOutDir: true, target: "es2022" },
  server: { port: Number(process.env.TANDEM_WEB_PORT ?? 5318), strictPort: true },
});
