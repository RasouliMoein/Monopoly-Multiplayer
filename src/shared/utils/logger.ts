/**
 * @file logger.ts
 * @description Custom level-aware logging utility that handles both server-side (Node) and client-side (Vite) env configurations.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

/**
 * Standard utility class providing level-aware console wrapping functions.
 */
class Logger {
    /**
     * Resolves the current log level numerical representation from environment configurations.
     * Checks process.env.LOG_LEVEL (Node/Express) and import.meta.env.VITE_LOG_LEVEL (Vite/Client).
     *
     * @returns Log level index number (0 = debug, 1 = info, 2 = warn, 3 = error)
     */
    private getLogLevel(): number {
        let envVal: string | undefined;
        try {
            if (typeof process !== "undefined" && process.env) {
                envVal = process.env.LOG_LEVEL;
            }
        } catch {
            // ignore
        }
        try {
            const getMeta = new Function("return import.meta");
            const meta = getMeta();
            if (meta && meta.env) {
                envVal = meta.env.VITE_LOG_LEVEL;
            }
        } catch {
            // ignore
        }

        const level: LogLevel = (envVal?.toLowerCase() as LogLevel) || "info";
        return LOG_LEVELS[level] !== undefined ? LOG_LEVELS[level] : 1;
    }

    /**
     * Log a debug level event.
     *
     * @param message Text formatting log explanation
     * @param args Arbitrary variables to output
     */
    public debug(message: string, ...args: unknown[]) {
        if (this.getLogLevel() <= 0) {
            console.debug(`[DEBUG] ${message}`, ...args);
        }
    }

    /**
     * Log an informational level event.
     *
     * @param message Text formatting log explanation
     * @param args Arbitrary variables to output
     */
    public info(message: string, ...args: unknown[]) {
        if (this.getLogLevel() <= 1) {
            console.info(`[INFO] ${message}`, ...args);
        }
    }

    /**
     * Log a warning level event.
     *
     * @param message Text formatting log explanation
     * @param args Arbitrary variables to output
     */
    public warn(message: string, ...args: unknown[]) {
        if (this.getLogLevel() <= 2) {
            console.warn(`[WARN] ${message}`, ...args);
        }
    }

    /**
     * Log an error level event.
     *
     * @param message Text formatting log explanation
     * @param args Arbitrary variables to output
     */
    public error(message: string, ...args: unknown[]) {
        if (this.getLogLevel() <= 3) {
            console.error(`[ERROR] ${message}`, ...args);
        }
    }
}

/**
 * Shared singleton logger instance.
 */
export const logger = new Logger();
