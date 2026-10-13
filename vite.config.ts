import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The development server sends /api to the cluster API. CORS stays disabled.
const api = process.env.DELTA_API_URL ?? "http://10.0.0.47:30870";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": { target: api, changeOrigin: true } } },
  preview: { proxy: { "/api": { target: api, changeOrigin: true } } },
});
