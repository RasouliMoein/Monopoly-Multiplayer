/**
 * @file Dice.ts
 * @description Autoritative server-side dice roll generator returning standardized results.
 */

/**
 * Result structure returned by a dice roll event.
 */
export interface DiceRoll {
    /** The face value of the first die (1-6) */
    d1: number;
    /** The face value of the second die (1-6) */
    d2: number;
    /** The mathematical sum total of both dice */
    sum: number;
    /** True if both dice landed on the same face value, false otherwise */
    isDoubles: boolean;
}

/**
 * Simulates a pair of standard 6-sided dice being rolled.
 *
 * @returns A DiceRoll result indicating face values, sum, and doubles check
 */
export function rollDice(): DiceRoll {
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    return {
        d1,
        d2,
        sum: d1 + d2,
        isDoubles: d1 === d2,
    };
}
