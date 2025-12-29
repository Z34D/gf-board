import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// Build timestamp for cache busting
const BUILD_TIME = Date.now().toString();

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // TanStack Router plugin must be BEFORE React plugin
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
    cloudflare(),
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  define: {
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
});
