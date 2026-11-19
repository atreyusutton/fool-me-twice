import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// One dev server runs both the React app and the Worker (in workerd), so `npm run dev` is the only command.
export default defineConfig({
  plugins: [react(), cloudflare()],
});
