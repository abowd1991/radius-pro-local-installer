import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
import { APP_VERSION } from './shared/version.js';
import type { Plugin } from 'vite';

// ─── Plugin: inject <link rel="modulepreload"> for critical chunks ────────────────
// Tells the browser to fetch react-core, ui-lib, vendor in parallel
// before the main entry script requests them
function modulePreloadPlugin(): Plugin {
  return {
    name: 'inject-modulepreload',
    transformIndexHtml(html, ctx) {
      if (!ctx.bundle) return html;
      // Find chunks that should be preloaded (react-core, ui-lib, vendor)
      const preloadChunks = Object.keys(ctx.bundle).filter(name =>
        name.match(/\/(react-core|ui-lib|vendor)-[A-Za-z0-9]+\.js$/)
      );
      const tags = preloadChunks.map(chunk => ({
        tag: 'link',
        attrs: { rel: 'modulepreload', href: `/${chunk}`, crossorigin: '' },
        injectTo: 'head' as const,
      }));
      return tags;
    },
  };
}


const plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime(), modulePreloadPlugin()];

export default defineConfig({
  plugins,
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // مكتبات خارجية كبيرة — chunk منفصل
          if (id.includes('node_modules/apexcharts') || id.includes('node_modules/react-apexcharts')) {
            return 'charts';
          }
          if (id.includes('node_modules/framer-motion')) {
            return 'motion';
          }
          if (id.includes('node_modules/html2canvas') || id.includes('node_modules/jspdf') || id.includes('node_modules/pdf-lib')) {
            return 'pdf';
          }
          if (id.includes('node_modules/xlsx')) {
            return 'xlsx';
          }
          if (id.includes('node_modules/tesseract')) {
            return 'ocr';
          }
          // React + UI + vendor كلها في chunk واحد لمنع circular dependency
          if (id.includes('node_modules/')) {
            return 'vendor';
          }
        },
      },
    },
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
