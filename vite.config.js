import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  root: "web",
  base: "/",
  plugins: [vue()],
  build: {
    outDir: "../tools/cositalogo-api/dist",
    emptyOutDir: true,
  },
  server: {
    proxy: { "/api": "http://localhost:8787" },
  },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.js"],
  },
});
