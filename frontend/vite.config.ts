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
        manualChunks: {
          web3: ["wagmi", "viem", "@tanstack/react-query"],
          charts: ["recharts"],
        },
      },
    },
  },
});
