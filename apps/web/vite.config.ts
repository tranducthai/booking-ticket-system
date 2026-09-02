import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev proxy to the API Gateway — see docs/spec/08-api-contracts.md. In
// production the built SPA is served separately and VITE_API_BASE_URL
// (.env.example) should point at the real gateway origin directly.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
