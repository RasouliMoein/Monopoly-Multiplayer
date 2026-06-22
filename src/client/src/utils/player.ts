/**
 * @file player.ts
 * @description Client-side representation of a Monopoly Player. Exposes helper methods to serialize/deserialize player payload packets.
 */

import { PlayerProprety } from "../../../shared/types/game";

/**
 * Player class representing a local or remote participant in the game.
 */
export class Player {
    public id: string;
    public username: string;
    public icon: number;

    public position: number;
    public balance: number;
    public properties: Array<PlayerProprety>;
    public isInJail: boolean;
    public jailTurnsRemaining: number;
    public getoutCards: number;
    public ready: boolean;
    public positions: { x: number; y: number };
    public connected?: boolean;
    public isBankrupt: boolean; // Phase 2A
    public hasRolled: boolean;
    public allowRollAgain: boolean;

    /**
     * Initializes a new Player instance.
     *
     * @param _id Socket connection ID of the player
     * @param _name Display username
     */
    constructor(_id: string, _name: string) {
        this.id = _id;
        this.username = _name;
        this.icon = -1;
        this.position = 0;
        this.balance = 1500;
        this.properties = [];
        this.isInJail = false;
        this.jailTurnsRemaining = 0;
        this.getoutCards = 0;
        this.ready = false;
        this.positions = { x: 0, y: 0 };
        this.connected = true;
        this.isBankrupt = false; // Phase 2A
        this.hasRolled = false;
        this.allowRollAgain = false;
    }

    /**
     * Updates the player instance fields with data from a JSON packet.
     *
     * @param json Deserialized JSON representation of the player state
     * @returns This instance updated with the JSON values
     */
    recieveJson(json: PlayerJSON) {
        this.username = json.username;
        this.position = json.position;
        this.icon = json.icon;
        this.balance = json.balance;
        this.properties = json.properties;
        this.isInJail = json.isInJail;
        this.jailTurnsRemaining = json.jailTurnsRemaining;
        this.getoutCards = json.getoutCards;
        this.connected = json.connected ?? true;
        this.isBankrupt = json.isBankrupt ?? false; // Phase 2A
        this.hasRolled = json.hasRolled ?? false;
        this.allowRollAgain = json.allowRollAgain ?? false;
        return this;
    }

    /**
     * Serializes this Player instance into a JSON packet format.
     *
     * @returns A serialized PlayerJSON packet
     */
    public toJson(): PlayerJSON {
        return {
            balance: this.balance,
            icon: this.icon,
            id: this.id,
            isInJail: this.isInJail,
            jailTurnsRemaining: this.jailTurnsRemaining,
            position: this.position,
            properties: this.properties,
            username: this.username,
            getoutCards: this.getoutCards,
            connected: this.connected,
            isBankrupt: this.isBankrupt, // Phase 2A
            hasRolled: this.hasRolled,
            allowRollAgain: this.allowRollAgain,
        } as PlayerJSON;
    }

    /**
     * Resolves the hexadecimal color value representing the player's icon avatar choice.
     */
    get color(): string {
        switch (this.icon) {
            case 0:
                return "#E0115F";
            case 1:
                return "#4169e1";
            case 2:
                return "#50C878";
            case 3:
                return "#FFC000";
            case 4:
                return "#a855f7";
            case 5:
                return "#FF7F50";
            default:
                return "";
        }
    }
}

/**
 * Serialized JSON format of a player state shared over WebSockets.
 */
export type PlayerJSON = {
    id: string;
    username: string;
    icon: number;
    position: number;
    balance: number;
    properties: Array<any>;
    isInJail: boolean;
    jailTurnsRemaining: number;
    getoutCards: number;
    connected?: boolean;
    isBankrupt?: boolean; // Phase 2A
    hasRolled?: boolean;
    allowRollAgain?: boolean;
};
