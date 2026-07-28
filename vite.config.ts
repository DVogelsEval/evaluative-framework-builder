import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Relative base so the static build works when served from a subpath
// (GitHub Pages project sites live under /<repo>/) as well as from root or a
// Tauri `file://` shell (Arch §7). The app is single-page and state-driven —
// no client router — so relative asset URLs are safe.
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    // Offline-capable PWA (R-015/R-025, Arch §7): precache the built assets so
    // the app opens with no network, and auto-update the service worker when a
    // new build is deployed. Local-first only — the SW caches this app's own
    // files; it makes no backend, account or cloud-sync calls (non-goals).
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Evaluative Framework Builder",
        short_name: "Eval Framework",
        description:
          "Build an explicit evaluative framework — rubrics, evidence and synthesis. Local-first; your data never leaves your device.",
        theme_color: "#1f2937",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "./",
        scope: "./",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2,json}"],
      },
      // The service worker is only built for `vite build`, never for
      // `vite dev` — so `npm run dev` (and the Playwright E2E that runs on it)
      // is untouched, and there is no stale-cache surprise during development.
      devOptions: { enabled: false },
    }),
  ],
});
