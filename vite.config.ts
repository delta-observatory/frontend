import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The development server sends /api to the cluster API. CORS stays disabled.
const api = process.env.DELTA_API_URL ?? "http://localhost:30870";
// Vite blocks host names that are not in this list. IP addresses and localhost are always allowed.
const allowedHosts = (process.env.DELTA_ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean);

export default defineConfig({
  plugins: [react()],
  server: { allowedHosts, proxy: { "/api": { target: api, changeOrigin: true }, "/gui-api": { target: api, changeOrigin: true } } },
  preview: { proxy: { "/api": { target: api, changeOrigin: true }, "/gui-api": { target: api, changeOrigin: true } } },
});
