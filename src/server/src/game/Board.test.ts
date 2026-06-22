import { describe, it, expect, beforeEach } from "@jest/globals";
import { computeRent } from "./Board";
import { Player } from "./Player";

describe("Board / computeRent logic", () => {
    let p1: Player;
    let p2: Player;
    let players: Player[];

    beforeEach(() => {
        p1 = new Player("p1", "Mo", 0);
        p2 = new Player("p2", "Alex", 1);
        players = [p1, p2];
    });

    it("should return null owner and 0 amount for unowned properties", () => {
        const res = computeRent(1, 7, players);
        expect(res.owner).toBeNull();
        expect(res.amount).toBe(0);
    });

    it("should return owner and 0 amount if property is mortgaged", () => {
        p1.properties.push({ position: 1, count: 0, group: "Purple", morgage: true });
        const res = computeRent(1, 7, players);
        expect(res.owner).toBe(p1);
        expect(res.amount).toBe(0);
    });

    it("should compute base rent if player owns one Purple property", () => {
        p1.properties.push({ position: 1, count: 0, group: "Purple" });
        const res = computeRent(1, 7, players);
        expect(res.owner).toBe(p1);
        expect(res.amount).toBe(2);
    });

    it("should double the rent if player owns complete unimproved monopoly group", () => {
        p1.properties.push({ position: 1, count: 0, group: "Purple" });
        p1.properties.push({ position: 3, count: 0, group: "Purple" });

        const res = computeRent(1, 7, players);
        expect(res.owner).toBe(p1);
        expect(res.amount).toBe(4);
    });

    it("should calculate correct rent for house upgrades", () => {
        p1.properties.push({ position: 1, count: 1, group: "Purple" });
        const res = computeRent(1, 7, players);
        expect(res.owner).toBe(p1);
        expect(res.amount).toBe(10);
    });

    it("should calculate correct rent for hotel upgrade", () => {
        p1.properties.push({ position: 1, count: "h", group: "Purple" });
        const res = computeRent(1, 7, players);
        expect(res.owner).toBe(p1);
        expect(res.amount).toBe(250);
    });

    it("should compute utility rent based on dice rolls", () => {
        p1.properties.push({ position: 12, count: 0, group: "Utilities" });
        const res1 = computeRent(12, 10, players);
        expect(res1.owner).toBe(p1);
        expect(res1.amount).toBe(40);

        p1.properties.push({ position: 28, count: 0, group: "Utilities" });
        const res2 = computeRent(12, 10, players);
        expect(res2.amount).toBe(100);
    });

    it("should compute railroad rent based on number of railroads owned", () => {
        p1.properties.push({ position: 5, count: 0, group: "Railroad" });

        const res1 = computeRent(5, 7, players);
        expect(res1.amount).toBe(25);

        p1.properties.push({ position: 15, count: 0, group: "Railroad" });
        const res2 = computeRent(5, 7, players);
        expect(res2.amount).toBe(50);

        p1.properties.push({ position: 25, count: 0, group: "Railroad" });
        const res3 = computeRent(5, 7, players);
        expect(res3.amount).toBe(100);

        p1.properties.push({ position: 35, count: 0, group: "Railroad" });
        const res4 = computeRent(5, 7, players);
        expect(res4.amount).toBe(200);
    });
});
