import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./src/client/e2e",
    timeout: 60000,
    expect: {
        timeout: 10000,
    },
    fullyParallel: false,
    workers: 1,
    reporter: "html",
    use: {
        baseURL: "http://localhost:3064",
        trace: "on-first-retry",
        ignoreHTTPSErrors: true,
    },
    webServer: {
        command: "npm run build && npm run build:backend && node dist-backend/src/server/src/index.js",
        url: "http://localhost:3064/api/health",
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
    },
    projects: [
        {
            name: "msedge",
            use: { ...devices["Desktop Chrome"], channel: "msedge" },
        },
    ],
});
