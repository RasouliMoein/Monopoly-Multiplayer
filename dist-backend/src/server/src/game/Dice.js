"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rollDice = void 0;
function rollDice() {
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    return {
        d1,
        d2,
        sum: d1 + d2,
        isDoubles: d1 === d2,
    };
}
exports.rollDice = rollDice;
