import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [cloudflare()],
  build: {
    manifest: "manifest.json",
    rollupOptions: {
      input: {
        "shell-client": "src/client/shell-client.ts",
        "collab-client": "src/client/collab-client.ts",
      },
    },
  },
});
