import { jest, describe, it, expect } from "@jest/globals";
import { Player } from "./Player";

describe("Player Class", () => {
    it("should initialize with correct default properties", () => {
        const player = new Player("socket-1", "Mo", 2);
        expect(player.id).toBe("socket-1");
        expect(player.username).toBe("Mo");
        expect(player.icon).toBe(2);
        expect(player.balance).toBe(1500);
        expect(player.position).toBe(0);
        expect(player.isInJail).toBe(false);
        expect(player.isBankrupt).toBe(false);
        expect(player.properties).toEqual([]);
    });

    it("should trigger onBalanceChange when balance is set", () => {
        const player = new Player("socket-1", "Mo", 2);
        const changeSpy = jest.fn();
        player.onBalanceChange = changeSpy as any;

        player.balance = 2000;
        expect(player.balance).toBe(2000);
        expect(changeSpy).toHaveBeenCalledWith(1500, 2000);
    });

    it("should serialize to JSON format correctly", () => {
        const player = new Player("socket-1", "Mo", 2);
        player.balance = 1200;
        player.position = 5;
        player.isInJail = true;
        player.properties.push({ position: 1, count: 0, group: "Purple" });

        const json = player.to_json();
        expect(json.id).toBe("socket-1");
        expect(json.username).toBe("Mo");
        expect(json.balance).toBe(1200);
        expect(json.position).toBe(5);
        expect(json.isInJail).toBe(true);
        expect(json.properties).toEqual([{ position: 1, count: 0, group: "Purple" }]);
    });

    it("should deserialize from JSON correctly", () => {
        const player = new Player("socket-1", "Mo", 2);
        const json = {
            id: "socket-1",
            username: "Mo-Updated",
            balance: 900,
            icon: 4,
            position: 12,
            isInJail: false,
            jailTurnsRemaining: 0,
            getoutCards: 1,
            isBankrupt: false,
            properties: [{ position: 3, count: 2 as const, group: "Purple" }],
            connected: true,
        };

        player.from_json(json);
        expect(player.position).toBe(12);
        expect(player.balance).toBe(900);
        expect(player.icon).toBe(4);
        expect(player.getoutCards).toBe(1);
        expect(player.properties).toEqual([{ position: 3, count: 2, group: "Purple" }]);
    });

    it("should ignore from_json updates if socket ID does not match", () => {
        const player = new Player("socket-1", "Mo", 2);
        const json = {
            id: "socket-2",
            username: "SomeoneElse",
            balance: 5000,
            icon: 5,
            position: 20,
            isInJail: true,
            jailTurnsRemaining: 3,
            getoutCards: 2,
            isBankrupt: true,
            properties: [],
            connected: false,
        };

        player.from_json(json);
        // Expect local fields remain unchanged since the json ID "socket-2" mismatch "socket-1"
        expect(player.position).toBe(0);
        expect(player.balance).toBe(1500);
        expect(player.isInJail).toBe(false);
    });
});
