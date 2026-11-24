import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Vite config for Cinema Productions frontend (migrated from CRA/react-scripts).
// - Keeps the "@/..." alias to src.
// - Keeps existing `process.env.REACT_APP_BACKEND_URL` references working via `define`.
// - Configures the dev server for the Emergent managed preview (port 3000 + HTTPS proxy on 443).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname), "");
  const backendUrl = env.REACT_APP_BACKEND_URL || "";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    // Expose CRA-style env vars so existing code keeps working unchanged.
    envPrefix: ["REACT_APP_", "VITE_"],
    define: {
      "process.env.REACT_APP_BACKEND_URL": JSON.stringify(backendUrl),
      "process.env.NODE_ENV": JSON.stringify(mode),
    },
    server: {
      host: "0.0.0.0",
      port: 3000,
      strictPort: true,
      // Preview is served over HTTPS on 443 and proxied to :3000.
      allowedHosts: true,
      hmr: {
        clientPort: 443,
        protocol: "wss",
      },
      watch: {
        usePolling: true,
        interval: 1000,
        ignored: ["**/node_modules/**", "**/.git/**", "**/build/**", "**/dist/**"],
      },
    },
    build: {
      // Keep the CRA-compatible output dir so `serve -s build` still works.
      outDir: "build",
      sourcemap: false,
      rollupOptions: {
        output: {
          // Librerías grandes en trozos propios (se cachean y se compilan aparte del código de
          // la app). jspdf/html2canvas NO van aquí: se cargan solo al exportar un PDF.
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run|@tanstack)[\\/]/.test(id)) return "vendor-react";
            if (/[\\/]node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/.test(id)) return "vendor-motion";
            if (/[\\/]node_modules[\\/](@radix-ui|@floating-ui|react-remove-scroll|react-remove-scroll-bar|react-style-singleton|use-callback-ref|use-sidecar|aria-hidden|get-nonce|tslib)[\\/]/.test(id)) return "vendor-radix";
            if (/[\\/]node_modules[\\/]lucide-react[\\/]/.test(id)) return "vendor-icons";
            if (/[\\/]node_modules[\\/](axios|form-data|proxy-from-env)[\\/]/.test(id)) return "vendor-misc";
            return undefined;
          },
        },
      },
    },
  };
});
