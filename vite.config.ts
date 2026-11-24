import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const apiPort = Number(process.env.TANDEM_PORT ?? 4317);

export default defineConfig({
  root: "src/web",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
    rolldownOptions: {
      // The app's first paint needs React, Base UI and its own code. Split along the libraries so no chunk passes the 500 kB warning (#7); they load in parallel.
      output: {
        codeSplitting: {
          groups: [
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 2 },
            { name: "base-ui", test: /node_modules[\\/]@base-ui[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
  server: {
    port: Number(process.env.TANDEM_WEB_PORT ?? 5317),
    strictPort: true,
    proxy: { "/api": `http://127.0.0.1:${apiPort}` },
  },
});
