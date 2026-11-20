// Desarrollo local de las pantallas de Cinema Reservas (Windows/Mac).
// Usa la misma configuracion que vite.config.js, pero:
//  - sirve en http://127.0.0.1:3010 (o $PORT) con recarga en vivo,
//  - envia /api al servidor de desarrollo (modo_desarrollo/servidor_dev.ps1, puerto 8002).
// Uso:  npx vite --config vite.local.config.mjs
import { defineConfig } from "vite";
import base from "./vite.config.js";

export default defineConfig((env) => {
  const cfg = base(env);
  const api = process.env.CR_API || "http://127.0.0.1:8002";
  cfg.server = {
    host: "127.0.0.1",
    port: Number(process.env.PORT || 3010),
    strictPort: true,
    proxy: { "/api": { target: api, changeOrigin: true } },
  };
  return cfg;
});
