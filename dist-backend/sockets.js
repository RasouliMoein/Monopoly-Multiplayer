"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Server = exports.activeServers = exports.Socket = void 0;
const ws_1 = require("ws");
const code_1 = require("./code");
class Socket {
    client;
    events;
    id;
    constructor(_socket, id) {
        this.id = id;
        this.client = _socket;
        this.events = new Map();
        this.client.on("message", (data) => {
            try {
                const d = JSON.parse(data.toString());
                const xhandler = this.events.get(d.event);
                if (xhandler !== undefined) {
                    xhandler(d.args);
                }
            }
            catch (e) {
                console.error("Message parse error", e);
            }
        });
        this.client.on("error", (error) => {
            console.error("Connection error:", error);
        });
        this.client.on("close", () => {
            try {
                const xhandler = this.events.get("disconnect");
                if (xhandler !== undefined) {
                    xhandler("");
                }
            }
            catch { }
        });
    }
    on(event_name, handler) {
        this.events.set(event_name, handler);
    }
    emit(event_name, args) {
        if (this.client.readyState === ws_1.WebSocket.OPEN) {
            this.client.send(JSON.stringify({ event: event_name, args: args ?? undefined }));
        }
    }
    disconnect() {
        this.emit("disconnect");
        this.client.close();
    }
}
exports.Socket = Socket;
exports.activeServers = new Map();
class Server {
    logFunction;
    renderFunction;
    logs = [];
    code;
    cleanupTimer;
    // Dynamic fields to expose game loop state to outer index API
    clientsCount;
    maxPlayers;
    gameStarted;
    hostName;
    hostId;
    setHostId;
    constructor(idf, onf) {
        this.code = (0, code_1.code)();
        exports.activeServers.set((0, code_1.TranslateCode)(this.code), this);
        this.logFunction = (...data) => {
            this.logs.push(data);
            console.log(`[Room ${this.code}]`, ...data);
            this.renderFunction(this.logs);
        };
        this.renderFunction = () => { };
        setTimeout(() => {
            if (idf)
                idf(this);
        }, 100);
        this.onConnection = (client, id) => {
            const socket = new Socket(client, id);
            socket.emit("assign_id", id);
            if (onf)
                onf(socket, this);
        };
        // Start idle timeout — destroy room if no player connects within 5 minutes
        this.resetCleanupTimer(5 * 60 * 1000);
    }
    onConnection;
    set OnLogs(v) {
        this.logFunction = v;
    }
    RenderLogs(f) {
        this.renderFunction = f;
    }
    /** Start (or restart) the room cleanup countdown. */
    resetCleanupTimer(delayMs) {
        this.clearCleanupTimer();
        this.cleanupTimer = setTimeout(() => this.destroy(), delayMs);
    }
    /** Cancel any running cleanup timer. */
    clearCleanupTimer() {
        if (this.cleanupTimer !== undefined) {
            clearTimeout(this.cleanupTimer);
            this.cleanupTimer = undefined;
        }
    }
    /** Permanently remove this room from activeServers. */
    destroy() {
        this.clearCleanupTimer();
        exports.activeServers.delete((0, code_1.TranslateCode)(this.code));
        this.logFunction(`[Lifecycle] Room ${this.code} has been destroyed and removed from active servers.`);
    }
}
exports.Server = Server;
