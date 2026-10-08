import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// VITE_BASE lets the app be served from a sub-path (e.g. GitHub Pages: /gpuhedger/).
export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // React gets its own chunk; otherwise Rollup hoists it into `charts` and every page
        // (including the landing page) has to download Recharts.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          web3: ["wagmi", "viem", "@tanstack/react-query"],
          charts: ["recharts"],
        },
      },
    },
  },
});
