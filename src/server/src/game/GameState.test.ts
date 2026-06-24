import { describe, it, expect, beforeEach } from "@jest/globals";
import { GameState } from "./GameState";
import { Player } from "./Player";
import { GameTrading } from "../../../shared/types/game";

describe("GameState Class", () => {
    let state: GameState;
    let p1: Player;
    let p2: Player;

    beforeEach(() => {
        state = new GameState();
        p1 = new Player("p1", "Mo", 0);
        p2 = new Player("p2", "Alex", 1);
        state.clients.set(p1.id, { player: p1, socket: {}, ready: true, positions: { x: 0, y: 0 } });
        state.clients.set(p2.id, { player: p2, socket: {}, ready: true, positions: { x: 0, y: 0 } });
    });

    it("should calculate correct net worth for a player", () => {
        p1.properties.push({ position: 1, count: 0, group: "Purple" });
        expect(state.calculateNetWorth(p1)).toBe(1560);

        p1.properties.push({ position: 3, count: 1, group: "Purple" });
        expect(state.calculateNetWorth(p1)).toBe(1670);
    });

    it("should determine the winner when only one active player is left", () => {
        p1.isBankrupt = false;
        p2.isBankrupt = true;

        const winner = state.checkWinCondition();
        expect(winner).toBe(p1);
    });

    it("should process bankruptcy from a player to the Bank", () => {
        p1.balance = -100;
        p1.properties.push({ position: 1, count: 0, group: "Purple" });
        state.creditorMap.set(p1.id, "bank");

        state.declareBankruptcyForPlayer(p1.id);
        expect(p1.isBankrupt).toBe(true);
        expect(p1.properties.length).toBe(0);
    });

    it("should process bankruptcy from a player to another player creditor", () => {
        p1.balance = -200;
        p1.properties.push({ position: 1, count: 0, group: "Purple" });
        state.creditorMap.set(p1.id, p2.id);

        state.declareBankruptcyForPlayer(p1.id);
        expect(p1.isBankrupt).toBe(true);
        expect(p2.properties).toContainEqual({ position: 1, count: 0, group: "Purple" });
    });

    it("should validate and execute trades between players", () => {
        p1.properties.push({ position: 1, count: 0, group: "Purple" });

        const trade: GameTrading = {
            turnPlayer: {
                id: p1.id,
                balance: 0,
                prop: [{ position: 1, count: 0, group: "Purple" }],
                getoutCards: 0,
                accepted: true,
            },
            againstPlayer: {
                id: p2.id,
                balance: 500,
                prop: [],
                getoutCards: 0,
                accepted: true,
            },
        };

        const success = state.validateAndExecuteTrade(trade);
        expect(success).toBe(true);
        expect(p1.balance).toBe(2000);
        expect(p2.balance).toBe(1000);
        expect(p2.properties).toContainEqual({ position: 1, count: 0, group: "Purple" });
        expect(p1.properties.length).toBe(0);
    });

    it("should validate and execute unjail card trades between players", () => {
        p1.getoutCards = 1;
        state.chanceGetOutOwner = p1.id;

        const trade: GameTrading = {
            turnPlayer: {
                id: p1.id,
                balance: 0,
                prop: [],
                getoutCards: 1,
                accepted: true,
            },
            againstPlayer: {
                id: p2.id,
                balance: 200,
                prop: [],
                getoutCards: 0,
                accepted: true,
            },
        };

        const success = state.validateAndExecuteTrade(trade);
        expect(success).toBe(true);
        expect(p1.balance).toBe(1700);
        expect(p2.balance).toBe(1300);
        expect(p1.getoutCards).toBe(0);
        expect(p2.getoutCards).toBe(1);
        expect(state.chanceGetOutOwner).toBe(p2.id);
    });
});
