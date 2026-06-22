import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { registerSocketHandlers } from "./handlers";
import { GameState } from "../game/GameState";

class MockSocket {
    public id: string;
    public callbacks: Record<string, (args: any) => void> = {};
    public emits: Array<{ event: string; args: any }> = [];

    constructor(id: string) {
        this.id = id;
    }

    public on(event: string, callback: (args: any) => void) {
        this.callbacks[event] = callback;
        return this;
    }

    public emit(event: string, args: any) {
        this.emits.push({ event, args });
    }

    public disconnect() {
        if (this.callbacks["disconnect"]) {
            this.callbacks["disconnect"](null as any);
        }
    }

    public simulate(event: string, args: any) {
        if (this.callbacks[event]) {
            return this.callbacks[event](args);
        }
    }
}

describe("WebSocket Handlers & Schemas", () => {
    let socket: MockSocket;
    let server: any;
    let state: GameState;

    beforeEach(() => {
        socket = new MockSocket("socket-1");
        server = {
            logFunction: jest.fn(),
            clearCleanupTimer: jest.fn(),
            resetCleanupTimer: jest.fn(),
            destroy: jest.fn(),
        };
        state = new GameState();
        registerSocketHandlers(socket as any, server, state, 6);
    });

    it("should allow a spectator to register", () => {
        socket.simulate("spectator", "Spectator-Mo");
        expect(state.spectators.has("socket-1")).toBe(true);
        expect(socket.emits.some((e) => e.event === "initials")).toBe(true);
    });

    it("should allow a player to register their name", () => {
        socket.simulate("name", "Player-Mo");
        expect(state.clients.has("socket-1")).toBe(true);
        expect(state.clients.get("socket-1")?.player.username).toBe("Player-Mo");
    });

    it("should block invalid spectator names via Zod validation schema", async () => {
        // Name is too long (over 20 characters)
        const longName = "Spectator-Mo-Which-Is-Way-Too-Long-And-Should-Be-Rejected";
        await socket.simulate("spectator", longName);

        const errorEmit = socket.emits.find((e) => e.event === "error-message");
        expect(errorEmit).toBeDefined();
        expect(errorEmit?.args.message).toContain("Invalid input");
        expect(state.spectators.has("socket-1")).toBe(false);
    });

    it("should block invalid option in unjail payload", async () => {
        // Player joins first to register the unjail handlers
        socket.simulate("name", "Player-Mo");

        // Simulate invalid unjail option "bribe" (should be "card" or "pay")
        await socket.simulate("unjail", "bribe");

        const errorEmit = socket.emits.find((e) => e.event === "error-message");
        expect(errorEmit).toBeDefined();
        expect(errorEmit?.args.message).toContain("Invalid input");
    });

    it("should block invalid bid values in property auction", async () => {
        socket.simulate("name", "Player-Mo");

        // Auction bid must be positive integer (we send -10)
        await socket.simulate("auction-bid", { bid: -10 });

        const errorEmit = socket.emits.find((e) => e.event === "error-message");
        expect(errorEmit).toBeDefined();
        expect(errorEmit?.args.message).toContain("Invalid input");
    });
});
