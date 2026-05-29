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
const uuid_1 = require("uuid");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
// Serve the built React app
app.use(express_1.default.static(path_1.default.join(__dirname, "..", "dist")));
const server = http_1.default.createServer(app);
// WebSocket for clients connecting to game rooms
const wss = new ws_1.WebSocketServer({ server });
wss.on("connection", (ws, req) => {
    // Expected URL format for joining: /room/:code
    const url = req.url || "/";
    if (url.startsWith("/room/")) {
        const roomCode = url.split("/")[2];
        const gameServer = sockets_js_1.activeServers.get(roomCode);
        if (gameServer) {
            const clientId = (0, uuid_1.v4)();
            gameServer.onConnection(ws, clientId);
        }
        else {
            ws.close(1008, "Room not found");
        }
    }
    else {
        ws.close(1008, "Invalid endpoint");
    }
});
app.use(express_1.default.json());
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
server.listen(PORT, () => {
    console.log(`Main Authoritative Server is running on port ${PORT}`);
});
