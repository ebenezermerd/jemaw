/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 3003 },
  test: {
    environment: "happy-dom",
    globals: true,
  },
});
