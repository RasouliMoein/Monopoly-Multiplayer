"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.code = exports.TranslateCode = void 0;
const crypto_js_1 = __importDefault(require("crypto-js"));
const index_1 = require("../config/index");
function TranslateCode(ip) {
    const hashed = crypto_js_1.default.SHA256(index_1.Config.CODE_PREFIX + ip).toString(crypto_js_1.default.enc.Hex);
    return hashed;
}
exports.TranslateCode = TranslateCode;
function generateRandomString(length) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        result += characters[randomIndex];
    }
    return result;
}
function code() {
    return generateRandomString(6);
}
exports.code = code;
