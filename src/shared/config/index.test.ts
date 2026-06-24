import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { Config } from "./index";

describe("Config Class", () => {
    const originalEnv = { ...process.env };
    const originalProcess = global.process;

    beforeEach(() => {
        // Reset process.env before each test
        process.env = { ...originalEnv };
        delete process.env.PORT;
        delete process.env.DEBUG_PASSWORD;
        delete process.env.LOG_LEVEL;
        delete process.env.CODE_PREFIX;
    });

    afterEach(() => {
        // Restore global process first, then restore env
        global.process = originalProcess;
        process.env = originalEnv;
        if ("window" in global) {
            delete (global as any).window;
        }
    });

    describe("Server Environment (Node.js)", () => {
        it("should return default values when environment variables are not set", () => {
            expect(Config.PORT).toBe(3064);
            expect(Config.DEBUG_PASSWORD).toBe("monopolyadmin");
            expect(Config.LOG_LEVEL).toBe("info");
            expect(Config.CODE_PREFIX).toBe("my_monopoly_game");
        });

        it("should return custom values when env vars are defined", () => {
            process.env.PORT = "4000";
            process.env.DEBUG_PASSWORD = "custom_password";
            process.env.LOG_LEVEL = "debug";
            process.env.CODE_PREFIX = "test_prefix";

            expect(Config.PORT).toBe(4000);
            expect(Config.DEBUG_PASSWORD).toBe("custom_password");
            expect(Config.LOG_LEVEL).toBe("debug");
            expect(Config.CODE_PREFIX).toBe("test_prefix");
        });
    });

    describe("Client Environment (Browser Mock)", () => {
        beforeEach(() => {
            // Temporarily mock process.env to be undefined to simulate browser
            Object.defineProperty(global, "process", {
                value: undefined,
                writable: true,
                configurable: true,
            });
        });

        it("should return defaults if window is not defined", () => {
            expect(Config.PORT).toBe(3064);
            expect(Config.DEBUG_PASSWORD).toBe("monopolyadmin");
            expect(Config.LOG_LEVEL).toBe("info");
            expect(Config.CODE_PREFIX).toBe("my_monopoly_game");
        });

        it("should use window custom values if window is defined", () => {
            // Mock window global
            (global as any).window = {
                VITE_LOG_LEVEL: "warn",
                VITE_CODE_PREFIX: "client_prefix",
            };

            expect(Config.PORT).toBe(3064);
            expect(Config.DEBUG_PASSWORD).toBe("monopolyadmin");
            expect(Config.LOG_LEVEL).toBe("warn");
            expect(Config.CODE_PREFIX).toBe("client_prefix");
        });
    });
});
