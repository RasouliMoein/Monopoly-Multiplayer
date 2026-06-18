"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const ws_1 = require("ws");
const sockets_js_1 = require("./sockets.js");
const game_js_1 = require("./game.js");
const fs_1 = __importDefault(require("fs"));
// Load .env file manually if it exists
try {
    const envPath = path_1.default.join(process.cwd(), ".env");
    if (fs_1.default.existsSync(envPath)) {
        const envContent = fs_1.default.readFileSync(envPath, "utf-8");
        for (const line of envContent.split("\n")) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith("#")) {
                const [key, ...values] = trimmed.split("=");
                if (key) {
                    process.env[key.trim()] = values.join("=").trim();
                }
            }
        }
    }
}
catch (e) {
    console.error("Failed to load .env file", e);
}
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3064;
// Serve the built React app
app.use(express_1.default.static(path_1.default.join(__dirname, "..", "dist")));
const server = http_1.default.createServer(app);
// WebSocket for clients connecting to game rooms
const wss = new ws_1.WebSocketServer({ server });
wss.on("connection", (ws, req) => {
    // Expected URL format for joining: /room/:code?token=uuid
    const url = req.url || "/";
    if (url.startsWith("/room/")) {
        const parts = url.split("?");
        const pathPart = parts[0];
        const queryPart = parts[1] || "";
        const urlParams = new URLSearchParams(queryPart);
        const roomCode = pathPart.split("/")[2];
        const gameServer = sockets_js_1.activeServers.get(roomCode);
        if (gameServer) {
            let clientId = urlParams.get("token");
            if (!clientId || clientId === "null" || clientId === "undefined") {
                clientId = Date.now().toString(36) + Math.random().toString(36).substring(2);
            }
            console.log(`[WS] Connection accepted for room ${roomCode}`);
            gameServer.onConnection(ws, clientId);
        }
        else {
            console.log(`[WS] Room not found: ${roomCode}. Active rooms:`, Array.from(sockets_js_1.activeServers.keys()));
            ws.close(1008, "Room not found");
        }
    }
    else {
        ws.close(1008, "Invalid endpoint");
    }
});
app.use(express_1.default.json());
// API Endpoint to Get Active Rooms
app.get("/api/rooms", (req, res) => {
    const list = Array.from(sockets_js_1.activeServers.entries()).map(([translatedCode, gameServer]) => {
        return {
            code: gameServer.code,
            translatedCode: translatedCode,
            clientsCount: gameServer.clientsCount ? gameServer.clientsCount() : 0,
            maxPlayers: gameServer.maxPlayers ?? 6,
            gameStarted: gameServer.gameStarted ? gameServer.gameStarted() : false,
            hostName: gameServer.hostName ? gameServer.hostName() : "Unknown",
        };
    });
    res.json(list);
});
// API Endpoint to Create a Room
// The front-end will call this instead of running main() locally
app.post("/api/create-room", (req, res) => {
    const { playersCount } = req.body;
    const pCount = playersCount ? parseInt(playersCount) : 4;
    // We start the game logic on the Node environment!
    (0, game_js_1.main)(pCount, (hostCode, gameServerInstance) => {
        res.json({ success: true, hostCode: hostCode, translatedCode: gameServerInstance.code });
    });
});
app.get("*", (req, res) => {
    res.sendFile(path_1.default.join(__dirname, "..", "dist", "index.html"));
});
server.listen(PORT, "0.0.0.0", () => {
    console.log(`Main Authoritative Server is running on port ${PORT}`);
});
