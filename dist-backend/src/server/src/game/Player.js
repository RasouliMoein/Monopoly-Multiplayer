"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Player = void 0;
class Player {
    id;
    username;
    icon;
    position;
    _balance = 0;
    get balance() {
        return this._balance;
    }
    set balance(val) {
        const prev = this._balance;
        this._balance = val;
        if (this.onBalanceChange && prev !== undefined) {
            this.onBalanceChange(prev, val);
        }
    }
    onBalanceChange;
    properties;
    isInJail;
    jailTurnsRemaining;
    getoutCards;
    connected;
    isBankrupt;
    hasRolled;
    allowRollAgain;
    constructor(_id, _name, _icon, cash) {
        this.id = _id;
        this.username = _name;
        this.icon = _icon;
        this.position = 0;
        this._balance = cash ?? 1500;
        this.properties = [];
        this.isInJail = false;
        this.jailTurnsRemaining = 0;
        this.getoutCards = 0;
        this.connected = true;
        this.isBankrupt = false;
        this.hasRolled = false;
        this.allowRollAgain = false;
    }
    to_json() {
        return {
            id: this.id,
            username: this.username,
            icon: this.icon,
            position: this.position,
            balance: this.balance,
            properties: this.properties,
            isInJail: this.isInJail,
            jailTurnsRemaining: this.jailTurnsRemaining,
            getoutCards: this.getoutCards,
            connected: this.connected,
            isBankrupt: this.isBankrupt,
            hasRolled: this.hasRolled,
            allowRollAgain: this.allowRollAgain,
        };
    }
    from_json(json) {
        if (this.id !== json.id)
            return;
        this.position = json.position;
        this.balance = json.balance;
        this.properties = json.properties;
        this.isInJail = json.isInJail;
        this.jailTurnsRemaining = json.jailTurnsRemaining;
        this.getoutCards = json.getoutCards;
        this.connected = json.connected ?? true;
        this.isBankrupt = json.isBankrupt ?? false;
        this.hasRolled = json.hasRolled ?? false;
        this.allowRollAgain = json.allowRollAgain ?? false;
    }
}
exports.Player = Player;
