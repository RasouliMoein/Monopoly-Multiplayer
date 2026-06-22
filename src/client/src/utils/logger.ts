import { Config } from "../../../shared/config/index";

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

class Logger {
    private getLogLevel(): number {
        const envVal = Config.LOG_LEVEL;

        const level: LogLevel = (envVal?.toLowerCase() as LogLevel) || "info";
        return LOG_LEVELS[level] !== undefined ? LOG_LEVELS[level] : 1;
    }

    public debug(message: string, ...args: unknown[]) {
        if (this.getLogLevel() <= 0) {
            console.debug(`[DEBUG] ${message}`, ...args);
        }
    }

    public info(message: string, ...args: unknown[]) {
        if (this.getLogLevel() <= 1) {
            console.info(`[INFO] ${message}`, ...args);
        }
    }

    public warn(message: string, ...args: unknown[]) {
        if (this.getLogLevel() <= 2) {
            console.warn(`[WARN] ${message}`, ...args);
        }
    }

    public error(message: string, ...args: unknown[]) {
        if (this.getLogLevel() <= 3) {
            console.error(`[ERROR] ${message}`, ...args);
        }
    }
}

export const logger = new Logger();
