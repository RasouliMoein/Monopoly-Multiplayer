import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { logger } from "./logger";
import { Config } from "../../shared/config/index";

describe("Logger", () => {
    let debugSpy: any;
    let infoSpy: any;
    let warnSpy: any;
    let errorSpy: any;
    let configSpy: any;

    beforeEach(() => {
        debugSpy = jest.spyOn(console, "debug").mockImplementation(() => {});
        infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
        warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
        errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        configSpy = jest.spyOn(Config, "LOG_LEVEL", "get");
    });

    afterEach(() => {
        debugSpy.mockRestore();
        infoSpy.mockRestore();
        warnSpy.mockRestore();
        errorSpy.mockRestore();
        configSpy.mockRestore();
    });

    it("should print everything in debug mode (level 0)", () => {
        configSpy.mockReturnValue("debug");

        logger.debug("test debug");
        logger.info("test info");
        logger.warn("test warn");
        logger.error("test error");

        expect(debugSpy).toHaveBeenCalledWith("[DEBUG] test debug");
        expect(infoSpy).toHaveBeenCalledWith("[INFO] test info");
        expect(warnSpy).toHaveBeenCalledWith("[WARN] test warn");
        expect(errorSpy).toHaveBeenCalledWith("[ERROR] test error");
    });

    it("should print info, warn, and error in info mode (level 1)", () => {
        configSpy.mockReturnValue("info");

        logger.debug("test debug");
        logger.info("test info");
        logger.warn("test warn");
        logger.error("test error");

        expect(debugSpy).not.toHaveBeenCalled();
        expect(infoSpy).toHaveBeenCalledWith("[INFO] test info");
        expect(warnSpy).toHaveBeenCalledWith("[WARN] test warn");
        expect(errorSpy).toHaveBeenCalledWith("[ERROR] test error");
    });

    it("should print warn and error in warn mode (level 2)", () => {
        configSpy.mockReturnValue("warn");

        logger.debug("test debug");
        logger.info("test info");
        logger.warn("test warn");
        logger.error("test error");

        expect(debugSpy).not.toHaveBeenCalled();
        expect(infoSpy).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledWith("[WARN] test warn");
        expect(errorSpy).toHaveBeenCalledWith("[ERROR] test error");
    });

    it("should print only error in error mode (level 3)", () => {
        configSpy.mockReturnValue("error");

        logger.debug("test debug");
        logger.info("test info");
        logger.warn("test warn");
        logger.error("test error");

        expect(debugSpy).not.toHaveBeenCalled();
        expect(infoSpy).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith("[ERROR] test error");
    });

    it("should default to info (level 1) if config is invalid or empty", () => {
        configSpy.mockReturnValue("invalid_level");

        logger.debug("test debug");
        logger.info("test info");

        expect(debugSpy).not.toHaveBeenCalled();
        expect(infoSpy).toHaveBeenCalledWith("[INFO] test info");
    });
});
