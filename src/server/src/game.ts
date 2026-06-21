import { Socket, Server } from "./sockets";
import { GameState } from "./game/GameState";
import { registerSocketHandlers } from "./ws/handlers";

export async function main(playersCount: number, f?: (host: string, Server: Server) => void) {
    const maxPlayers = playersCount > 0 ? Math.min(playersCount, 6) : 6;
    const gameState = new GameState();

    new Server(
        (server) => {
            server.clientsCount = () => gameState.clients.size;
            server.maxPlayers = maxPlayers;
            server.gameStarted = () => gameState.gameStarted;
            server.hostName = () => {
                const hostClient = gameState.clients.get(gameState.hostId);
                return hostClient ? hostClient.player.username : "Unknown";
            };
            server.hostId = () => gameState.hostId;
            server.setHostId = (id: string) => {
                gameState.hostId = id;
            };
            f?.(server.code, server);
        },
        (socket: Socket, server: Server) => {
            registerSocketHandlers(socket, server, gameState, maxPlayers);
        },
    );
}
