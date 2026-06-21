import { WebSocketServer, WebSocket as WSWebSocket } from "ws";
import { TranslateCode, code } from "../../shared/utils/code";
import { IncomingMessage } from "http";
import { logger } from "./logger";

export class Socket {
private client: WSWebSocket;
public events: Map<string, (args: any) => void>;
public id: string;

constructor(_socket: WSWebSocket, id: string) {
this.id = id;
this.client = _socket;
this.events = new Map();

this.client.on("message", (data) => {
try {
const d = JSON.parse(data.toString()) as { event: string; args: any };
const xhandler = this.events.get(d.event);
if (xhandler !== undefined) {
xhandler(d.args);
}
} catch (e) {
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
} catch {}
});
}

public on(event_name: string, handler: (args: any) => void) {
this.events.set(event_name, handler);
}

public emit(event_name: string, args?: any) {
if (this.client.readyState === WSWebSocket.OPEN) {
this.client.send(JSON.stringify({ event: event_name, args: args ?? undefined }));
}
}

public disconnect() {
this.emit("disconnect");
this.client.close();
}
}

export const activeServers = new Map<string, Server>();

export class Server {
public logFunction: (...data: any[]) => void;
public renderFunction: (v: Array<any[]>) => void;
public logs: Array<any[]> = [];
public code: string;
private cleanupTimer?: ReturnType<typeof setTimeout>;

// Dynamic fields to expose game loop state to outer index API
public clientsCount?: () => number;
public maxPlayers?: number;
public gameStarted?: () => boolean;
public hostName?: () => string;
public hostId?: () => string;
public setHostId?: (id: string) => void;


constructor(
idf?: (thisobj: Server) => void,
onf?: (s: Socket, server: Server) => void
) {
this.code = code();
        activeServers.set(TranslateCode(this.code), this);

this.logFunction = (...data) => {
this.logs.push(data);
            logger.info(`[Room ${this.code}]`, ...data);
this.renderFunction(this.logs);
};
this.renderFunction = () => {};

        setTimeout(() => {
            if (idf) idf(this);
        }, 100);

        this.onConnection = (client: WSWebSocket, id: string) => {
            const socket = new Socket(client, id);
            socket.emit("assign_id", id);
            if (onf) onf(socket, this);
        };

        // Start idle timeout — destroy room if no player connects within 5 minutes
        this.resetCleanupTimer(5 * 60 * 1000);
}

    public onConnection: (client: WSWebSocket, id: string) => void;

public set OnLogs(v: (...data: any[]) => void) {
this.logFunction = v;
}

public RenderLogs(f: (v: Array<any[]>) => void) {
this.renderFunction = f;
}

/** Start (or restart) the room cleanup countdown. */
public resetCleanupTimer(delayMs: number) {
    this.clearCleanupTimer();
    this.cleanupTimer = setTimeout(() => this.destroy(), delayMs);
}

/** Cancel any running cleanup timer. */
public clearCleanupTimer() {
    if (this.cleanupTimer !== undefined) {
        clearTimeout(this.cleanupTimer);
        this.cleanupTimer = undefined;
    }
}

/** Permanently remove this room from activeServers. */
public destroy() {
    this.clearCleanupTimer();
    activeServers.delete(TranslateCode(this.code));
    this.logFunction(`[Lifecycle] Room ${this.code} has been destroyed and removed from active servers.`);
}
}
