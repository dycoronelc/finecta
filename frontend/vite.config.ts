import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
// Caché fuera de node_modules: en CI (p. ej. Railway) evita EBUSY al borrar node_modules/.vite
export default defineConfig({
  cacheDir: ".vite-cache",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
