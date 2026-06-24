import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { registerSocketHandlers } from "./handlers";
import { GameState } from "../game/GameState";
import { Player } from "../game/Player";
import { GameTrading, MonopolyModes } from "../../../shared/types/game";
import monopolyJSON from "../../../shared/data/monopoly.json";

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

    public simulate(event: string, args?: any) {
        if (this.callbacks[event]) {
            return this.callbacks[event](args);
        }
    }
}

describe("WebSocket Handlers & Authoritative Game Loop", () => {
    let server: any;
    let state: GameState;
    let s1: MockSocket;
    let s2: MockSocket;
    let s3: MockSocket;

    beforeEach(() => {
        server = {
            logFunction: jest.fn(),
            clearCleanupTimer: jest.fn(),
            resetCleanupTimer: jest.fn(),
            destroy: jest.fn(),
        };
        state = new GameState();
        s1 = new MockSocket("socket-1");
        s2 = new MockSocket("socket-2");
        s3 = new MockSocket("socket-3");

        registerSocketHandlers(s1 as any, server, state, 6);
        registerSocketHandlers(s2 as any, server, state, 6);
        registerSocketHandlers(s3 as any, server, state, 6);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    function setupLobbyPlayers() {
        s1.simulate("name", "Alice");
        s2.simulate("name", "Bob");
        s3.simulate("name", "Charlie");

        // Authenticating for debugging so we can use debug triggers
        s1.simulate("debug_authenticate", { password: "monopolyadmin" });
        s2.simulate("debug_authenticate", { password: "monopolyadmin" });
        s3.simulate("debug_authenticate", { password: "monopolyadmin" });
    }

    function startGame() {
        setupLobbyPlayers();
        s1.simulate("ready", { ready: true });
        s2.simulate("ready", { ready: true });
        s3.simulate("ready", { ready: true });
    }

    describe("Lobby & Management", () => {
        it("should register names and assign client objects in the game state", () => {
            s1.simulate("name", "Alice");
            expect(state.clients.has("socket-1")).toBe(true);
            expect(state.clients.get("socket-1")?.player.username).toBe("Alice");
            expect(state.hostId).toBe("socket-1"); // First client is host
        });

        it("should reconnect a player if connection updates", () => {
            s1.simulate("name", "Alice");
            const oldSocket = s1;
            const newS1 = new MockSocket("socket-1");
            registerSocketHandlers(newS1 as any, server, state, 6);

            newS1.simulate("name", "Alice");
            expect(state.clients.get("socket-1")?.socket).toBe(newS1);
        });

        it("should handle icon/color updates in the lobby", () => {
            s1.simulate("name", "Alice");
            s1.simulate("select_icon", 3);
            expect(state.clients.get("socket-1")?.player.icon).toBe(3);
        });

        it("should prevent duplicate icons/colors in the lobby", () => {
            s1.simulate("name", "Alice");
            s2.simulate("name", "Bob"); // Bob is automatically assigned icon 1 as second connection
            
            s1.simulate("select_icon", 2); // Alice takes 2
            s2.simulate("select_icon", 2); // Bob tries duplicate 2 (fails)
            expect(state.clients.get("socket-2")?.player.icon).toBe(1); // Bob retains 1
        });

        it("should allow host to kick a player", () => {
            setupLobbyPlayers();
            // Host is s1. Kick s2 (Bob)
            s1.simulate("kick-player", "socket-2");
            expect(state.clients.has("socket-2")).toBe(false);
        });

        it("should start the game when all players are ready", () => {
            setupLobbyPlayers();
            expect(state.gameStarted).toBe(false);

            s1.simulate("ready", { ready: true });
            s2.simulate("ready", { ready: true });
            s3.simulate("ready", { ready: true });

            expect(state.gameStarted).toBe(true);
        });
    });

    describe("Dice Rolling & Movement Mechanics", () => {
        beforeEach(() => {
            startGame();
        });

        it("should roll dice, move player, and trigger state update", () => {
            state.currentId = "socket-1";
            const player = state.clients.get("socket-1")?.player!;
            player.hasRolled = false;

            s1.simulate("debug_override_dice", { d1: 2, d2: 3 });
            s1.simulate("roll_dice");

            expect(player.position).toBe(5); // 0 + 5
            expect(player.hasRolled).toBe(true);
            expect(player.allowRollAgain).toBe(false);
        });

        it("should allow rolling again if player rolls doubles", () => {
            state.currentId = "socket-1";
            const player = state.clients.get("socket-1")?.player!;
            player.hasRolled = false;

            s1.simulate("debug_override_dice", { d1: 4, d2: 4 });
            s1.simulate("roll_dice");

            expect(player.position).toBe(8);
            expect(player.hasRolled).toBe(true);
            expect(player.allowRollAgain).toBe(true);
        });

        it("should send player to jail if they roll doubles three times in a row", () => {
            state.currentId = "socket-1";
            const player = state.clients.get("socket-1")?.player!;

            s1.simulate("debug_override_dice", { d1: 2, d2: 2 }); // 1st doubles
            s1.simulate("roll_dice");
            player.hasRolled = false;

            s1.simulate("debug_override_dice", { d1: 3, d2: 3 }); // 2nd doubles
            s1.simulate("roll_dice");
            player.hasRolled = false;

            s1.simulate("debug_override_dice", { d1: 1, d2: 1 }); // 3rd doubles
            s1.simulate("roll_dice");

            expect(player.position).toBe(10);
            expect(player.isInJail).toBe(true);
            expect(player.allowRollAgain).toBe(false);
        });

        it("should award $200 when passing GO space", () => {
            state.currentId = "socket-1";
            const player = state.clients.get("socket-1")?.player!;
            player.position = 35; // Short Line Railroad
            player.hasRolled = false;

            s1.simulate("debug_override_dice", { d1: 3, d2: 3 }); // lands on Mediterranean (1)
            s1.simulate("roll_dice");

            expect(player.position).toBe(1);
            expect(player.balance).toBe(1700); // 1500 + 200 passing Go
        });
    });

    describe("Rent & Purchasing Loops", () => {
        beforeEach(() => {
            startGame();
        });

        it("should allow buying an unowned property", () => {
            state.currentId = "socket-1";
            const p1 = state.clients.get("socket-1")?.player!;
            s1.simulate("debug_move_player", { targetPlayerId: "socket-1", position: 1 }); // Med Avenue

            s1.simulate("player_action", { action: "buy" });

            expect(p1.properties.length).toBe(1);
            expect(p1.properties[0].position).toBe(1);
            expect(p1.balance).toBe(1500 - 60); // price $60
        });

        it("should pay rent when landing on another player's property", () => {
            const p1 = state.clients.get("socket-1")?.player!;
            const p2 = state.clients.get("socket-2")?.player!;
            
            // P1 buys Baltic Avenue (3)
            s1.simulate("debug_move_player", { targetPlayerId: "socket-1", position: 3 });
            s1.simulate("player_action", { action: "buy" });

            // P2 lands on Baltic Avenue (3)
            state.currentId = "socket-2";
            p2.position = 0;
            p2.hasRolled = false;

            s2.simulate("debug_override_dice", { d1: 1, d2: 2 }); // lands on Baltic (pos 3)
            s2.simulate("roll_dice");

            expect(p2.balance).toBe(1500 - 4); // Baltic rent is $4
            expect(p1.balance).toBe(1500 - 60 + 4); // gets rent (balance - price + rent)
        });

        it("should charge double rent if player owns complete color monopoly", () => {
            const p1 = state.clients.get("socket-1")?.player!;
            const p2 = state.clients.get("socket-2")?.player!;

            // P1 buys Med (1) and Baltic (3)
            s1.simulate("debug_move_player", { targetPlayerId: "socket-1", position: 1 });
            s1.simulate("player_action", { action: "buy" });
            s1.simulate("debug_move_player", { targetPlayerId: "socket-1", position: 3 });
            s1.simulate("player_action", { action: "buy" });

            // P2 lands on Baltic (3)
            state.currentId = "socket-2";
            p2.position = 1;
            p2.hasRolled = false;
            s2.simulate("debug_override_dice", { d1: 1, d2: 1 }); // move 2
            s2.simulate("roll_dice");

            // Baltic base rent is $4. Double rent is $8.
            expect(p2.balance).toBe(1500 - 8);
        });

        it("should start an auction if player declines to buy property", () => {
            state.currentId = "socket-1";
            s1.simulate("debug_move_player", { targetPlayerId: "socket-1", position: 1 });
            s1.simulate("player_action", { action: "skip" });

            expect(state.currentAuction).not.toBeNull();
            expect(state.currentAuction?.propertyPosition).toBe(1);
        });

        it("should accept auction bids and end auction with a winner", () => {
            jest.useFakeTimers();
            state.currentId = "socket-1";
            s1.simulate("debug_move_player", { targetPlayerId: "socket-1", position: 1 });
            s1.simulate("player_action", { action: "skip" });

            s2.simulate("auction-bid", { bid: 100 });
            s3.simulate("auction-bid", { bid: 120 });

            expect(state.currentAuction?.currentBid).toBe(120);
            expect(state.currentAuction?.currentBidderId).toBe("socket-3");

            // Trigger end of auction
            state.endAuction();
            
            const p3 = state.clients.get("socket-3")?.player!;
            expect(p3.properties.some(p => p.position === 1)).toBe(true);
            expect(p3.balance).toBe(1500 - 120);
        });
    });

    describe("Upgrades, Mortgages, and Trades", () => {
        beforeEach(() => {
            startGame();
        });

        it("should buy house upgrades on color groups, checking even-build constraint", () => {
            const p1 = state.clients.get("socket-1")?.player!;
            // Give P1 Med (1) and Baltic (3)
            p1.properties.push({ position: 1, count: 0, group: "Purple" });
            p1.properties.push({ position: 3, count: 0, group: "Purple" });

            state.currentId = "socket-1";
            p1.position = 1;
            // Upgrade Med Ave
            s1.simulate("player_action", { action: "buy-advance", propertyPosition: 1, newCount: 1, housesAdded: 1 });
            expect(p1.properties.find(p => p.position === 1)?.count).toBe(1);

            // Try upgrading Med Ave again before Baltic (violates even build)
            s1.simulate("player_action", { action: "buy-advance", propertyPosition: 1, newCount: 2, housesAdded: 1 });
            expect(p1.properties.find(p => p.position === 1)?.count).toBe(1); // remains 1
        });

        it("should sell houses/hotels for cash refunds", () => {
            const p1 = state.clients.get("socket-1")?.player!;
            p1.properties.push({ position: 1, count: 2, group: "Purple" });
            p1.properties.push({ position: 3, count: 1, group: "Purple" });

            state.currentId = "socket-1";
            // Sell Baltic Ave house (demote from 2 to 1)
            s1.simulate("player_action", { action: "sell-advance", propertyPosition: 1 });
            expect(p1.properties.find(p => p.position === 1)?.count).toBe(1);
            expect(p1.balance).toBe(1500 + 25); // House refund is half price ($50 / 2 = $25)
        });

        it("should mortgage and unmortgage property", () => {
            const p1 = state.clients.get("socket-1")?.player!;
            p1.properties.push({ position: 1, count: 0, group: "Purple" });

            // Mortgage Med Ave
            s1.simulate("mortgage_action", { action: "mortgage", propertyPosition: 1 });
            expect(p1.properties[0].morgage).toBe(true);
            expect(p1.balance).toBe(1500 + 30); // Mortgage value: $30 (half of price $60)

            // Unmortgage Med Ave (costs mortgage + 10% fee = $33)
            s1.simulate("mortgage_action", { action: "unmortgage", propertyPosition: 1 });
            expect(p1.properties[0].morgage).toBe(false);
            expect(p1.balance).toBe(1530 - 33);
        });

        it("should exchange resources via player trade deals", () => {
            const p1 = state.clients.get("socket-1")?.player!;
            const p2 = state.clients.get("socket-2")?.player!;
            p1.properties.push({ position: 1, count: 0, group: "Purple" });

            const trade: GameTrading = {
                turnPlayer: {
                    id: "socket-1",
                    balance: 0,
                    prop: [{ position: 1, count: 0, group: "Purple" }],
                    accepted: true,
                },
                againstPlayer: {
                    id: "socket-2",
                    balance: 300,
                    prop: [],
                    accepted: false,
                },
            };

            // P1 proposes and accepts
            s1.simulate("trade-update", trade);

            // P2 accepts trade
            const tradeAccepted: GameTrading = {
                ...trade,
                againstPlayer: {
                    ...trade.againstPlayer,
                    accepted: true,
                }
            };
            s2.simulate("trade-update", tradeAccepted);

            expect(p1.balance).toBe(1500 + 300);
            expect(p2.balance).toBe(1500 - 300);
            expect(p2.properties.some(p => p.position === 1)).toBe(true);
            expect(p1.properties.length).toBe(0);
        });
    });

    describe("Jail and Escape Mechanics", () => {
        beforeEach(() => {
            startGame();
        });

        it("should allow unjailing by paying the standard $50 bribe", () => {
            const p1 = state.clients.get("socket-1")?.player!;
            state.currentId = "socket-1";
            p1.isInJail = true;
            p1.jailTurnsRemaining = 3;

            s1.simulate("unjail", "pay");

            expect(p1.isInJail).toBe(false);
            expect(p1.balance).toBe(1500 - 50);
        });

        it("should escape jail by using a Get Out of Jail Free card", () => {
            const p1 = state.clients.get("socket-1")?.player!;
            state.currentId = "socket-1";
            p1.isInJail = true;
            p1.jailTurnsRemaining = 3;
            p1.getoutCards = 1;
            state.chanceGetOutOwner = p1.id;

            s1.simulate("unjail", "card");

            expect(p1.isInJail).toBe(false);
            expect(p1.getoutCards).toBe(0);
            expect(state.chanceGetOutOwner).toBeNull();
        });

        it("should release player if they roll doubles while jailed", () => {
            const p1 = state.clients.get("socket-1")?.player!;
            state.currentId = "socket-1";
            p1.position = 10; // in Jail space
            p1.isInJail = true;
            p1.jailTurnsRemaining = 3;

            s1.simulate("debug_override_dice", { d1: 3, d2: 3 });
            s1.simulate("roll_dice");

            expect(p1.isInJail).toBe(false);
            expect(p1.position).toBe(16); // 10 + 6
        });
    });

    describe("Cards & Bankruptcy & Debug", () => {
        beforeEach(() => {
            startGame();
        });

        it("should execute resolveCard actions", () => {
            const p1 = state.clients.get("socket-1")?.player!;
            
            // Add funds card
            state.resolveCard(p1, { action: "addfunds", amount: 100 }, 7);
            expect(p1.balance).toBe(1600);

            // Remove funds card
            state.resolveCard(p1, { action: "removefunds", amount: 50 }, 7);
            expect(p1.balance).toBe(1550);

            // Add funds from players
            state.resolveCard(p1, { action: "addfundsfromplayers", amount: 10 }, 7);
            expect(p1.balance).toBe(1570); // 1550 + 10 + 10 (from Bob & Charlie)
            expect(state.clients.get("socket-2")?.player.balance).toBe(1490);

            // Remove funds to players
            state.resolveCard(p1, { action: "removefundstoplayers", amount: 10 }, 7);
            expect(p1.balance).toBe(1550); // 1570 - 10 - 10
            expect(state.clients.get("socket-2")?.player.balance).toBe(1500);

            // Nearest Railroad
            p1.position = 0;
            state.resolveCard(p1, { action: "movenearest", groupid: "railroad" }, 7);
            expect(p1.position).toBe(5); // Reading RR
        });

        it("should declare bankruptcy to bank and clear assets", () => {
            const p1 = state.clients.get("socket-1")?.player!;
            p1.properties.push({ position: 1, count: 0, group: "Purple" });
            p1.balance = -100;
            state.creditorMap.set(p1.id, "bank");

            s1.simulate("declare-bankruptcy");

            expect(p1.isBankrupt).toBe(true);
            expect(p1.properties.length).toBe(0);
        });

        it("should declare bankruptcy to another player and transfer assets", () => {
            const p1 = state.clients.get("socket-1")?.player!;
            const p2 = state.clients.get("socket-2")?.player!;
            p1.properties.push({ position: 1, count: 0, group: "Purple" });
            p1.balance = -100;
            state.creditorMap.set(p1.id, p2.id);

            s1.simulate("declare-bankruptcy");

            expect(p1.isBankrupt).toBe(true);
            expect(p2.properties.some(p => p.position === 1)).toBe(true);
        });

        it("should run admin debug command events", () => {
            const p2 = state.clients.get("socket-2")?.player!;

            // Authenticate first (Zod safeParse checks password)
            s1.simulate("debug_authenticate", { password: "monopolyadmin" });

            // Set balance
            s1.simulate("debug_set_balance", { targetPlayerId: "socket-2", balance: 5000 });
            expect(p2.balance).toBe(5000);

            // Teleport
            s1.simulate("debug_move_player", { targetPlayerId: "socket-2", position: 20 });
            expect(p2.position).toBe(20);

            // Jail
            s1.simulate("debug_send_to_jail", { targetPlayerId: "socket-2", inJail: true });
            expect(p2.isInJail).toBe(true);

            // Force bankruptcy
            s1.simulate("debug_force_bankruptcy", { targetPlayerId: "socket-2" });
            expect(p2.isBankrupt).toBe(true);
        });
    });
});
