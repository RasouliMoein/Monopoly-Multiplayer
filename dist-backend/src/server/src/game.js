"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const sockets_1 = require("./sockets");
const GameState_1 = require("./game/GameState");
const handlers_1 = require("./ws/handlers");
async function main(playersCount, f) {
    const maxPlayers = playersCount > 0 ? Math.min(playersCount, 6) : 6;
    const gameState = new GameState_1.GameState();
    const gameServer = new sockets_1.Server((server) => {
        server.clientsCount = () => gameState.clients.size;
        server.maxPlayers = maxPlayers;
        server.gameStarted = () => gameState.gameStarted;
        server.hostName = () => {
            const hostClient = gameState.clients.get(gameState.hostId);
            return hostClient ? hostClient.player.username : "Unknown";
        };
        server.hostId = () => gameState.hostId;
        server.setHostId = (id) => { gameState.hostId = id; };
        f?.(server.code, server);
    }, (socket, server) => {
        (0, handlers_1.registerSocketHandlers)(socket, server, gameState, maxPlayers);
    });
}
exports.main = main;
