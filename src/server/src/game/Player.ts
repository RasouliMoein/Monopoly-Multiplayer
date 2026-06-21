import { PlayerProprety } from "../../../shared/types/game";

export class Player {
    public id: string;
    public username: string;
    public icon: number;
    public position: number;

    private _balance = 0;
    public get balance(): number {
        return this._balance;
    }
    public set balance(val: number) {
        const prev = this._balance;
        this._balance = val;
        if (this.onBalanceChange && prev !== undefined) {
            this.onBalanceChange(prev, val);
        }
    }
    public onBalanceChange?: (prev: number, val: number) => void;

    public properties: Array<PlayerProprety>;
    public isInJail: boolean;
    public jailTurnsRemaining: number;
    public getoutCards: number;
    public connected?: boolean;
    public isBankrupt: boolean;
    public hasRolled: boolean;
    public allowRollAgain: boolean;

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

    from_json(json: PlayerJSON) {
        if (this.id !== json.id) return;
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
