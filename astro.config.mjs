import react from "@astrojs/react";
import AstroPWA from "@vite-pwa/astro";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [
    react(),
    AstroPWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Pomodoro — Focus gently",
        short_name: "Pomodoro",
        description: "A calm, offline-friendly to-do list and Pomodoro timer.",
        theme_color: "#f5f1e8",
        background_color: "#f5f1e8",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png"
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{css,js,html,svg,png,woff2}"]
      }
    })
  ]
});

