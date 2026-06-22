/**
 * @file code.ts
 * @description Lobby room code generation and verification helpers using SHA-256 hashing.
 */

import CryptoJS from "crypto-js";
import { Config } from "../config/index";

/**
 * Translates a user-facing lobby room code (or client address) into a secure,
 * reproducible SHA-256 hash using the environment's config prefix.
 *
 * @param ip User input room code or connection address
 * @returns SHA-256 hexadecimal hashed string representing the unique room ID
 */
export function TranslateCode(ip: string): string {
    const hashed = CryptoJS.SHA256(Config.CODE_PREFIX + ip).toString(CryptoJS.enc.Hex);
    return hashed;
}

/**
 * Helper to generate a random alpha-numeric string.
 *
 * @param length The length of the string to generate
 * @returns Random string of specified length
 */
function generateRandomString(length: number): string {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        result += characters[randomIndex];
    }
    return result;
}

/**
 * Generates a standard user-facing 6-character alpha-numeric room lobby code.
 *
 * @returns 6-character random room code (e.g., "A3B9X1")
 */
export function code(): string {
    return generateRandomString(6);
}
