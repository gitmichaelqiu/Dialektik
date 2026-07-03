import { defineConfig } from "vite";
import { resolve } from "path";

/**
 * Vite build config for the headless JS engine bundle.
 * Output: flutter_ui/assets/engine.js (loaded by the WebView bridge).
 *
 * Run: npm run engine:build
 */
export default defineConfig({
  build: {
    outDir: resolve(__dirname, "flutter_ui/assets"),
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/engine-entry.ts"),
      name: "DialektikEngine",
      fileName: () => "engine.js",
      formats: ["iife"],
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    // Target modern browsers that support WebRTC
    target: "es2020",
    sourcemap: false,
    minify: true,
  },
  // Allow IndexedDB, WebRTC, and PeerJS globals
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});
