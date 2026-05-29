import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), basicSsl()],
    build: {
        outDir: "dist" // Fly.io expects 'dist' by default
    },
    server: {
        https: true,
    },
    base: "/", // Serve from root, not /Monopoly/
});