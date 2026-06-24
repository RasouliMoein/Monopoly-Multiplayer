/**
 * @file schemas.ts
 * @description Zod validation schemas for all incoming client-to-server WebSocket message payloads.
 */

import { z } from "zod";

/**
 * Schema for player property details.
 */
export const playerPropertySchema = z.object({
    position: z.number().int().min(0).max(39),
    count: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal("h")]),
    group: z.string(),
    rent: z.number().int().optional(),
    morgage: z.union([z.boolean(), z.string()]).optional(), // handles stringified boolean values from older front-end clients
});

/**
 * Schema for Monopoly settings custom configuration/rulesets.
 */
export const monopolyModeSchema = z.object({
    WinningMode: z.enum(["last-standing", "monopols", "monopols & trains"]),
    AllowDeals: z.boolean(),
    Name: z.string().min(1).max(50),
    startingCash: z.number().int().min(100).max(10000),
    mortageAllowed: z.boolean(),
    turnTimer: z.number().int().positive().optional(),
    allowAuctions: z.boolean(),
});

/**
 * Schema for trading proposals between players.
 */
export const gameTradingSchema = z.object({
    turnPlayer: z.object({
        id: z.string(),
        balance: z.number().int().min(0),
        prop: z.array(playerPropertySchema),
        accepted: z.boolean(),
    }),
    againstPlayer: z.object({
        id: z.string(),
        balance: z.number().int().min(0),
        prop: z.array(playerPropertySchema),
        accepted: z.boolean(),
    }),
});

/**
 * Validation schemas per WebSocket event channel.
 */
export const websocketSchemas = {
    spectator: z.string().min(1).max(20),
    name: z.string().min(1).max(20),
    select_icon: z.number().int().min(0).max(5),
    "kick-player": z.string(),
    unjail: z.enum(["card", "pay"]),
    roll_dice: z.any().optional(), // Roll dice takes no arguments
    player_action: z.object({
        action: z.enum(["buy", "buy-advance", "sell-advance", "skip"]),
        propertyPosition: z.number().int().min(0).max(39).optional(),
        newCount: z.union([z.number().int().min(0).max(5), z.literal("h")]).optional(),
        housesAdded: z.number().int().min(0).optional(),
    }),
    mortgage_action: z.object({
        action: z.enum(["mortgage", "unmortgage"]),
        propertyPosition: z.number().int().min(0).max(39),
    }),
    "auction-bid": z.object({
        bid: z.number().int().positive(),
    }),
    "finish-turn": z.any().optional(),
    debug_authenticate: z.object({
        password: z.string().optional(),
    }),
    debug_set_balance: z.object({
        targetPlayerId: z.string().optional(),
        balance: z.number().int(),
    }),
    debug_set_turn: z.object({
        targetPlayerId: z.string().optional(),
    }),
    debug_override_dice: z.object({
        targetPlayerId: z.string().optional(),
        d1: z.number().int().min(1).max(6),
        d2: z.number().int().min(1).max(6),
    }),
    debug_send_to_jail: z.object({
        targetPlayerId: z.string(),
        inJail: z.boolean(),
    }),
    debug_move_player: z.object({
        targetPlayerId: z.string(),
        position: z.number().int().min(0).max(39),
    }),
    debug_force_bankruptcy: z.object({
        targetPlayerId: z.string(),
    }),
    "declare-bankruptcy": z.any().optional(),
    "mortgage-transfer-resolve": z.object({
        choices: z.array(
            z.object({
                position: z.number().int().min(0).max(39),
                action: z.enum(["unmortgage", "keep"]),
            }),
        ),
    }),
    message: z.string().max(300),
    mouse: z.object({
        x: z.number(),
        y: z.number(),
    }),
    history: z.object({
        time: z.string(),
        action: z.string(),
        balances: z
            .array(
                z.object({
                    username: z.string(),
                    balance: z.number().int(),
                    color: z.string(),
                }),
            )
            .optional(),
    }),
    trade: z.any().optional(),
    "cancel-trade": z.any().optional(),
    "trade-update": gameTradingSchema,
    "submit-trade": gameTradingSchema,
    "leave-room": z.any().optional(),
    ready: z.object({
        ready: z.boolean().optional(),
        mode: monopolyModeSchema.optional(),
    }),
};
