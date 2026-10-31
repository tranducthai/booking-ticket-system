import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev proxy to the API Gateway — see docs/spec/08-api-contracts.md. In
// production the built SPA is served separately and VITE_API_BASE_URL
// (.env.example) should point at the real gateway origin directly.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      // Images uploaded in local dev are stored as absolute URLs under /event/media/files — they were once
      // served by the gateway on :3000, which the web app now owns.
      "/event/media": { target: "http://localhost:4000", changeOrigin: true },
    },
  },
});
