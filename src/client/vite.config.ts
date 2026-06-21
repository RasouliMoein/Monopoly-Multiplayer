import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), basicSsl()],
    build: {
        outDir: "../../dist", // Build to root dist so backend can serve it
        emptyOutDir: true
    },
    server: {
        https: true,
    },
    base: "/", // Serve from root, not /Monopoly/
});