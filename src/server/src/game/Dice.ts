export interface DiceRoll {
    d1: number;
    d2: number;
    sum: number;
    isDoubles: boolean;
}

export function rollDice(): DiceRoll {
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    return {
        d1,
        d2,
        sum: d1 + d2,
        isDoubles: d1 === d2
    };
}
