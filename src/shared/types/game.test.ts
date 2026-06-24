import { describe, it, expect } from "@jest/globals";
import { history } from "./game";

describe("history log utility", () => {
    it("should create a history action with current timestamp", () => {
        const item = history("Game started");
        expect(item.action).toBe("Game started");
        expect(item.time).toBeDefined();
        // Check if time is a valid ISO date string
        expect(new Date(item.time).getTime()).not.toBeNaN();
        expect(item.balances).toBeUndefined();
    });

    it("should retain balances if provided", () => {
        const balances = [{ username: "Mo", balance: 1500, color: "red" }];
        const item = history("Rolled dice", balances);
        expect(item.balances).toEqual(balances);
    });

    it("should compress multiple spaces to a single space", () => {
        const item = history("Player   Mo   rolled   doubles");
        expect(item.action).toBe("Player Mo rolled doubles");
    });

    it("should replace 'payed' with 'paid' case-insensitively", () => {
        const item1 = history("Player1 payed $200 to Player2");
        expect(item1.action).toBe("Player1 paid $200 to Player2");

        const item2 = history("PAYED tax");
        expect(item2.action).toBe("paid tax");
    });

    it("should trim outer whitespace", () => {
        const item = history("  Some action here   ");
        expect(item.action).toBe("Some action here");
    });
});
