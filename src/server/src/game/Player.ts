/**
 * @file Player.ts
 * @description Authoritative server-side Player class wrapping player state, property catalogs, jail logs, bankruptcy attributes, and change event triggers.
 */

import { PlayerProprety } from "../../../shared/types/game";

/**
 * Authoritative Player class running on the authorative server.
 */
export class Player {
    public id: string;
    public username: string;
    public icon: number;
    public position: number;

    private _balance = 0;

    /**
     * Gets the player's current cash balance.
     */
    public get balance(): number {
        return this._balance;
    }

    /**
     * Sets the player's cash balance and triggers balance changes listener hooks.
     */
    public set balance(val: number) {
        const prev = this._balance;
        this._balance = val;
        if (this.onBalanceChange && prev !== undefined) {
            this.onBalanceChange(prev, val);
        }
    }

    /** Callback triggered whenever player's balance updates (useful for statistics tracing) */
    public onBalanceChange?: (prev: number, val: number) => void;

    public properties: Array<PlayerProprety>;
    public isInJail: boolean;
    public jailTurnsRemaining: number;
    public getoutCards: number;
    public connected?: boolean;
    public isBankrupt: boolean;
    public hasRolled: boolean;
    public allowRollAgain: boolean;

    /**
     * Constructs a new server authoritative Player instance.
     *
     * @param _id Socket connection ID
     * @param _name Chosen username
     * @param _icon Chosen avatar index
     * @param cash Starting cash amount (defaults to 1500)
     */
    constructor(_id: string, _name: string, _icon: number, cash?: number) {
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

    /**
     * Serializes player state details to send over room socket broadcast loops.
     *
     * @returns A PlayerJSON serializable packet
     */
    to_json(): PlayerJSON {
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

    /**
     * Restores state details from a raw PlayerJSON payload.
     *
     * @param json Serialized player data packet
     */
    from_json(json: PlayerJSON) {
        if (this.id !== json.id) return;
        this.position = json.position;
        this.balance = json.balance;
        this.properties = json.properties;
        this.isInJail = json.isInJail;
        this.jailTurnsRemaining = json.jailTurnsRemaining;
        this.getoutCards = json.getoutCards;
        this.icon = json.icon;
        this.connected = json.connected ?? true;
        this.isBankrupt = json.isBankrupt ?? false;
        this.hasRolled = json.hasRolled ?? false;
        this.allowRollAgain = json.allowRollAgain ?? false;
    }
}

/**
 * Serialized representation of a player's core details on the server.
 */
export type PlayerJSON = {
    id: string;
    username: string;
    icon: number;
    position: number;
    balance: number;
    properties: Array<PlayerProprety>;
    isInJail: boolean;
    jailTurnsRemaining: number;
    getoutCards: number;
    connected?: boolean;
    isBankrupt?: boolean;
    hasRolled?: boolean;
    allowRollAgain?: boolean;
};
