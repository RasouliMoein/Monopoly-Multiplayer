import { describe, it, expect } from "@jest/globals";
import { GameError, InsufficientFundsError, InvalidActionError, LobbyFullError, NotFoundError } from "./GameErrors";

describe("GameErrors", () => {
    it("should instantiate GameError correctly", () => {
        const error = new GameError("Generic game error");
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(GameError);
        expect(error.message).toBe("Generic game error");
        expect(error.name).toBe("GameError");
    });

    it("should instantiate InsufficientFundsError correctly", () => {
        const error = new InsufficientFundsError(500, 200);
        expect(error).toBeInstanceOf(GameError);
        expect(error.message).toBe("Insufficient funds. Action requires $500, but player balance is $200.");
        expect(error.name).toBe("InsufficientFundsError");
    });

    it("should instantiate InvalidActionError correctly", () => {
        const error = new InvalidActionError("Not your turn");
        expect(error).toBeInstanceOf(GameError);
        expect(error.message).toBe("Not your turn");
        expect(error.name).toBe("InvalidActionError");
    });

    it("should instantiate LobbyFullError correctly", () => {
        const error = new LobbyFullError(6);
        expect(error).toBeInstanceOf(GameError);
        expect(error.message).toBe("The game room is full (maximum 6 players allowed).");
        expect(error.name).toBe("LobbyFullError");
    });

    it("should instantiate NotFoundError correctly", () => {
        const error = new NotFoundError("Player Mo");
        expect(error).toBeInstanceOf(GameError);
        expect(error.message).toBe("Player Mo was not found.");
        expect(error.name).toBe("NotFoundError");
    });
});
