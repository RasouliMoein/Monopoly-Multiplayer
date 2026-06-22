/**
 * @file GameErrors.ts
 * @description Centralized custom error classes to represent Monopoly game logic failures, configuration errors, and session state issues.
 */

/**
 * Base custom error class for all domain-specific game failures.
 */
export class GameError extends Error {
    constructor(message: string) {
        super(message);
        this.name = this.constructor.name;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/**
 * Thrown when a player attempts an action requiring more cash than their current balance.
 */
export class InsufficientFundsError extends GameError {
    constructor(required: number, balance: number) {
        super(`Insufficient funds. Action requires $${required}, but player balance is $${balance}.`);
    }
}

/**
 * Thrown when a player performs an action that violates game rules (e.g. taking actions out of turn, bidding below current, etc.).
 */
export class InvalidActionError extends GameError {
    constructor(message: string) {
        super(message);
    }
}

/**
 * Thrown when a player attempts to join a lobby room that has reached its maximum connection limit.
 */
export class LobbyFullError extends GameError {
    constructor(max: number) {
        super(`The game room is full (maximum ${max} players allowed).`);
    }
}

/**
 * Thrown when a requested resource (e.g., player, room session, property tile) cannot be found.
 */
export class NotFoundError extends GameError {
    constructor(resource: string) {
        super(`${resource} was not found.`);
    }
}
