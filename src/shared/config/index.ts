export const Config = {
    get PORT(): number {
        const isServer = typeof process !== "undefined" && process.env;
        return isServer ? Number(process.env.PORT || 3064) : 3064;
    },
    get DEBUG_PASSWORD(): string {
        const isServer = typeof process !== "undefined" && process.env;
        return isServer ? process.env.DEBUG_PASSWORD || "monopolyadmin" : "monopolyadmin";
    },
    get LOG_LEVEL(): string {
        const isServer = typeof process !== "undefined" && process.env;
        if (isServer) {
            return process.env.LOG_LEVEL || "info";
        }
        const isClient = typeof window !== "undefined";
        return (isClient ? (window as any).VITE_LOG_LEVEL : undefined) || "info";
    },
    get CODE_PREFIX(): string {
        const isServer = typeof process !== "undefined" && process.env;
        if (isServer) {
            return process.env.CODE_PREFIX || "my_monopoly_game";
        }
        const isClient = typeof window !== "undefined";
        return (isClient ? (window as any).VITE_CODE_PREFIX : undefined) || "my_monopoly_game";
    },
};
