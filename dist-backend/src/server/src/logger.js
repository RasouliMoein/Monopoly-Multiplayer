"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
class Logger {
    getLogLevel() {
        const envVal = typeof process !== "undefined" && process.env ? process.env.LOG_LEVEL : undefined;
        const level = envVal?.toLowerCase() || "info";
        return LOG_LEVELS[level] !== undefined ? LOG_LEVELS[level] : 1;
    }
    debug(message, ...args) {
        if (this.getLogLevel() <= 0) {
            console.debug(`[DEBUG] ${message}`, ...args);
        }
    }
    info(message, ...args) {
        if (this.getLogLevel() <= 1) {
            console.info(`[INFO] ${message}`, ...args);
        }
    }
    warn(message, ...args) {
        if (this.getLogLevel() <= 2) {
            console.warn(`[WARN] ${message}`, ...args);
        }
    }
    error(message, ...args) {
        if (this.getLogLevel() <= 3) {
            console.error(`[ERROR] ${message}`, ...args);
        }
    }
}
exports.logger = new Logger();
