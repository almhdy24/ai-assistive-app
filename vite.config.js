import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: [
        "icons/icon.svg",
        "icons/maskable.svg",
        "offline.html",
      ],
      manifest: {
        name: "AI Assistive",
        short_name: "AI Assistive",
        description:
          "مساعد بصري بالذكاء الاصطناعي للمكفوفين: التعرف على الأشياء، قراءة النصوص، وصف المكان، والمساعدة في التنقل.",
        lang: "en",
        dir: "ltr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        theme_color: "#2563eb",
        background_color: "#ffffff",
        categories: ["accessibility", "utilities", "education"],
        icons: [
          {
            src: "/icons/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "/icons/maskable.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
        shortcuts: [
          {
            name: "التعرف على الأشياء",
            short_name: "الأشياء",
            url: "/object-detection",
            icons: [{ src: "/icons/icon.svg", sizes: "any" }],
          },
          {
            name: "قراءة النص",
            short_name: "قراءة",
            url: "/read-text",
            icons: [{ src: "/icons/icon.svg", sizes: "any" }],
          },
          {
            name: "وصف المكان",
            short_name: "وصف",
            url: "/scene-description",
            icons: [{ src: "/icons/icon.svg", sizes: "any" }],
          },
          {
            name: "المساعدة في التنقل",
            short_name: "تنقل",
            url: "/navigation",
            icons: [{ src: "/icons/icon.svg", sizes: "any" }],
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            /* Never cache Gemini calls — offline shows a clear message */
            urlPattern: /^https:\/\/generativelanguage\.googleapis\.com\/.*/i,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "google-fonts-stylesheets",
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
