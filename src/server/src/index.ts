import express from "express";
import http from "http";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { activeServers } from "./sockets.js";
import { main as startGame } from "./game.js";
import { logger } from "./logger.js";

import fs from "fs";

// Load .env file manually if it exists
try {
    const envPath = path.join(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, "utf-8");
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
} catch (e) {
    console.error("Failed to load .env file", e);
}

const app = express();
const PORT = process.env.PORT || 3064;


// Serve the built React app
app.use(express.static(path.join(__dirname, "..", "dist")));

const server = http.createServer(app);

// WebSocket for clients connecting to game rooms
const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
    // Expected URL format for joining: /room/:code?token=uuid
    const url = req.url || "/";
    if (url.startsWith("/room/")) {
        const parts = url.split("?");
        const pathPart = parts[0];
        const queryPart = parts[1] || "";
        const urlParams = new URLSearchParams(queryPart);
        const roomCode = pathPart.split("/")[2];
        const gameServer = activeServers.get(roomCode);
        
        if (gameServer) {
            let clientId = urlParams.get("token");
            if (!clientId || clientId === "null" || clientId === "undefined") {
                clientId = Date.now().toString(36) + Math.random().toString(36).substring(2);
            }
            logger.info(`[WS] Connection accepted for room ${roomCode}`);
            gameServer.onConnection(ws, clientId);
        } else {
            logger.warn(`[WS] Room not found: ${roomCode}. Active rooms: ${Array.from(activeServers.keys()).join(", ")}`);
            ws.close(1008, "Room not found");
        }
    } else {
        ws.close(1008, "Invalid endpoint");
    }
});

app.use(express.json());

// API Endpoint to Get Active Rooms
app.get("/api/rooms", (req, res) => {
    const list = Array.from(activeServers.entries()).map(([translatedCode, gameServer]) => {
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
    startGame(pCount, (hostCode, gameServerInstance) => {
        res.json({ success: true, hostCode: hostCode, translatedCode: gameServerInstance.code });
    });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "dist", "index.html"));
});

server.listen(PORT as number, "0.0.0.0", () => {
    logger.info(`Main Authoritative Server is running on port ${PORT}`);
});