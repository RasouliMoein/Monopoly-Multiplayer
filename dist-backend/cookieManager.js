"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CookieManager = void 0;
class CookieManager {
    // Set a cookie with a given name, value, and optional expiration date.
    static set(name, value, daysToExpire) {
        let cookieString = `${name}=${value}`;
        if (daysToExpire) {
            const expirationDate = new Date();
            expirationDate.setDate(expirationDate.getDate() + daysToExpire);
            cookieString += `; expires=${expirationDate.toUTCString()}`;
        }
        document.cookie = cookieString;
    }
    // Get the value of a cookie by its name.
    static get(name) {
        const cookies = document.cookie.split(";").map((cookie) => cookie.trim());
        for (const cookie of cookies) {
            const [cookieName, cookieValue] = cookie.split("=");
            if (cookieName === name) {
                return decodeURIComponent(cookieValue);
            }
        }
        return null;
    }
    // Check if a cookie with the given name exists.
    static has(name) {
        return this.get(name) !== null;
    }
    // Delete a cookie by setting its expiration date to the past.
    static delete(name) {
        this.set(name, "", -1);
    }
    // Get a typed value from a cookie (string, number, or boolean).
    static getTyped(name) {
        const value = this.get(name);
        if (value === null) {
            return null;
        }
        if (typeof value === "string") {
            if (value.toLowerCase() === "true") {
                return true;
            }
            else if (value.toLowerCase() === "false") {
                return false;
            }
            else if (/^-?\d+(\.\d+)?$/.test(value)) {
                return parseFloat(value);
            }
            else {
                return value;
            }
        }
        return value;
    }
}
exports.CookieManager = CookieManager;
