import express from "express";
import http from "http";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { activeServers } from "./sockets.js";
import { main as startGame } from "./game.js";

const app = express();
const PORT = process.env.PORT || 3001;

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
                clientId = crypto.randomUUID();
            }
            gameServer.onConnection(ws, clientId);
        } else {
            ws.close(1008, "Room not found");
        }
    } else {
        ws.close(1008, "Invalid endpoint");
    }
});

app.use(express.json());

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

server.listen(PORT, () => {
    console.log(`Main Authoritative Server is running on port ${PORT}`);
});