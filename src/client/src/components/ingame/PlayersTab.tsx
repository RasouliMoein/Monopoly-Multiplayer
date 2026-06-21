import { useState, forwardRef, useImperativeHandle, useEffect } from "react";
import { Icons } from "../icons.tsx";
import { Socket } from "../../utils/sockets.ts";
import { Player } from "../../utils/player.ts";
import DiceIcon from "../../../public/roll.png";
import { translateGroup } from "./StreetCard.tsx";
import monopolyJSON from "../../../../shared/data/monopoly.json";
import HouseIcon from "../../../public/h.png";
import HotelIcon from "../../../public/ho.png";
import { MonopolyCookie, MonopolySettings, MonopolyMode, historyAction } from "../../../../shared/types/game";
// @ts-ignore
import { CookieManager } from "../../utils/cookieManager.ts";

const PROPERTY_COLORS = new Map<string, string>(
    monopolyJSON.properties.map((p) => {
        const group = p.group || "Special";
        const colors: Record<string, string> = {
            purple: "#8e44ad",
            lightgreen: "#2ecc71",
            violet: "#e040fb",
            orange: "#e67e22",
            red: "#e74c3c",
            yellow: "#f1c40f",
            darkgreen: "#27ae60",
            darkblue: "#2980b9",
            utilities: "#7f8c8d",
            railroad: "#34495e",
        };
        const c = colors[group.toLowerCase()] || "#7f8c8d";
        return [p.name, c];
    }),
);

interface ParsedHistory {
    type: string;
    emoji: string;
    player: string;
    details: string;
    amount?: string;
    details2?: string;
    targetPlayer?: string;
    target?: string;
    cardText?: string;
    bgClass: string;
}

function parseHistoryAction(action: string): ParsedHistory {
    const text = action.trim();

    // 1. Roll: "chrome rolled [6, 5] moving to "St. Charles Place""
    if (text.includes("rolled [") && text.includes("] moving to")) {
        const rollMatch = text.match(/(.*?) rolled \[(.*?)] moving to "(.*?)"/);
        if (rollMatch) {
            return {
                type: "roll",
                emoji: "🎲",
                player: rollMatch[1],
                details: `rolled [${rollMatch[2]}] and moved to `,
                target: rollMatch[3],
                bgClass: "hist-roll",
            };
        }
    }

    // Escaped jail with doubles: "chrome rolled doubles [d1, d2] and escaped Jail!"
    if (text.includes("rolled doubles [") && text.includes("escaped Jail")) {
        const escMatch = text.match(/(.*?) rolled doubles \[(.*?)] and escaped Jail!/);
        if (escMatch) {
            return {
                type: "unjail",
                emoji: "🔓",
                player: escMatch[1],
                details: `rolled doubles [${escMatch[2]}] and escaped Jail!`,
                bgClass: "hist-unjail",
            };
        }
    }

    // Failed doubles in jail: "chrome failed doubles roll and stayed in Jail"
    if (text.includes("failed doubles roll and stayed in Jail")) {
        const stayMatch = text.match(/(.*?) failed doubles roll and stayed in Jail/);
        if (stayMatch) {
            return {
                type: "jail-stay",
                emoji: "⛓️",
                player: stayMatch[1],
                details: "failed doubles roll and stayed in Jail",
                bgClass: "hist-jail-stay",
            };
        }
    }

    // 2. Buy: "edge bought St. Charles Place"
    if (text.includes(" bought ")) {
        const buyMatch = text.match(/(.*?) bought (.*)/);
        if (buyMatch) {
            return {
                type: "buy",
                emoji: "🏠",
                player: buyMatch[1],
                details: "bought ",
                target: buyMatch[2],
                bgClass: "hist-buy",
            };
        }
    }

    // 3. Upgrade: "edge upgraded St. Charles Place"
    if (text.includes(" upgraded ")) {
        const upgradeMatch = text.match(/(.*?) upgraded (.*)/);
        if (upgradeMatch) {
            return {
                type: "upgrade",
                emoji: "🏘️",
                player: upgradeMatch[1],
                details: "upgraded ",
                target: upgradeMatch[2],
                bgClass: "hist-upgrade",
            };
        }
    }

    // 4. Rent: "edge paid $26 rent to chrome"
    if (text.includes(" paid $") && text.includes(" rent to ")) {
        const rentMatch = text.match(/(.*?) paid \$(.*?) rent to (.*)/);
        if (rentMatch) {
            return {
                type: "rent",
                emoji: "💸",
                player: rentMatch[1],
                details: `paid `,
                amount: `$${rentMatch[2]} rent`,
                details2: ` to `,
                targetPlayer: rentMatch[3],
                bgClass: "hist-rent",
            };
        }
    }

    // 5. Tax: "chrome paid $200 Income Tax" or "chrome paid $100 Luxury Tax"
    if (text.includes(" paid $") && text.toLowerCase().includes("tax")) {
        const taxMatch = text.match(/(.*?) paid \$(.*?) (Income Tax|Luxury Tax)/i);
        if (taxMatch) {
            return {
                type: "tax",
                emoji: "🏛️",
                player: taxMatch[1],
                details: `paid `,
                amount: `$${taxMatch[2]}`,
                details2: ` to ${taxMatch[3]}`,
                bgClass: "hist-tax",
            };
        }
    }

    // 6. Jail: "chrome goes to jail"
    if (text.includes(" goes to jail")) {
        const jailMatch = text.match(/(.*?) goes to jail/);
        if (jailMatch) {
            return {
                type: "jail",
                emoji: "👮",
                player: jailMatch[1],
                details: "was sent to Jail!",
                bgClass: "hist-jail",
            };
        }
    }

    // 7. Unjail pay: "chrome paid $50 to leave jail"
    if (text.includes(" paid $50 to leave jail")) {
        const unjailMatch = text.match(/(.*?) paid \$50 to leave jail/);
        if (unjailMatch) {
            return {
                type: "unjail",
                emoji: "🔓",
                player: unjailMatch[1],
                details: "paid $50 and left Jail",
                bgClass: "hist-unjail",
            };
        }
    }

    // Unjail card: "chrome used a Get Out of Jail Free card to leave jail"
    if (text.includes("used a Get Out of Jail Free card to leave jail")) {
        const cardUnjailMatch = text.match(/(.*?) used a Get Out of Jail Free card to leave jail/);
        if (cardUnjailMatch) {
            return {
                type: "unjail",
                emoji: "🔓",
                player: cardUnjailMatch[1],
                details: "used a Get Out of Jail Free card to escape Jail",
                bgClass: "hist-unjail",
            };
        }
    }

    // 8. Mortgage: unmortgage / mortgage
    if (text.includes("mortgage")) {
        if (text.includes("cancel the mortgage on")) {
            const match = text.match(/(.*?) paid \$(.*?) to cancel the mortgage on (.*)/);
            if (match) {
                return {
                    type: "unmortgage",
                    emoji: "🔓",
                    player: match[1],
                    details: "unmortgaged ",
                    target: match[3],
                    amount: ` for $${match[2]}`,
                    bgClass: "hist-unmortgage",
                };
            }
        } else if (text.includes("paid $") && text.includes(" to mortgage ")) {
            const match = text.match(/(.*?) paid \$(.*?) to mortgage (.*)/);
            if (match) {
                return {
                    type: "mortgage",
                    emoji: "💰",
                    player: match[1],
                    details: "mortgaged ",
                    target: match[3],
                    amount: ` for $${match[2]}`,
                    bgClass: "hist-mortgage",
                };
            }
        }

        // Also check nicer direct strings
        const mortgagedMatch = text.match(/(.*?) mortgaged (.*?) for \$(.*)/);
        if (mortgagedMatch) {
            return {
                type: "mortgage",
                emoji: "💰",
                player: mortgagedMatch[1],
                details: "mortgaged ",
                target: mortgagedMatch[2],
                amount: ` for $${mortgagedMatch[3]}`,
                bgClass: "hist-mortgage",
            };
        }

        const unmortgagedMatch = text.match(/(.*?) unmortgaged (.*?) for \$(.*)/);
        if (unmortgagedMatch) {
            return {
                type: "unmortgage",
                emoji: "🔓",
                player: unmortgagedMatch[1],
                details: "unmortgaged ",
                target: unmortgagedMatch[2],
                amount: ` for $${unmortgagedMatch[3]}`,
                bgClass: "hist-unmortgage",
            };
        }
    }

    // 9. Card drew: Chance or Community Chest
    if (text.includes(" drew Chance:") || text.includes(" drew Community Chest:")) {
        const cardMatch = text.match(/(.*?) drew (Chance|Community Chest): "(.*?)"/);
        if (cardMatch) {
            const isChance = cardMatch[2] === "Chance";
            return {
                type: isChance ? "chance" : "chest",
                emoji: isChance ? "❓" : "📦",
                player: cardMatch[1],
                details: `drew a ${cardMatch[2]} card: `,
                cardText: `"${cardMatch[3]}"`,
                bgClass: isChance ? "hist-chance" : "hist-chest",
            };
        }
    }

    // 10. Pass Go: "chrome passed Go and collected $200"
    if (text.includes("passed Go and collected")) {
        const goMatch = text.match(/(.*?) passed Go and collected \$(.*)/);
        if (goMatch) {
            return {
                type: "go",
                emoji: "🏁",
                player: goMatch[1],
                details: "passed Go and collected ",
                amount: `$${goMatch[2]}`,
                bgClass: "hist-go",
            };
        }
    }

    // 11. Trade: "chrome done a trade with edge"
    if (text.includes(" done a trade with ")) {
        const tradeMatch = text.match(/(.*?) done a trade with (.*)/);
        if (tradeMatch) {
            return {
                type: "trade",
                emoji: "🤝",
                player: tradeMatch[1],
                details: "completed a deal with ",
                targetPlayer: tradeMatch[2],
                bgClass: "hist-trade",
            };
        }
    }

    // 12. Bankruptcy: "chrome declared bankruptcy to edge" or "chrome declared bankruptcy to the Bank"
    if (text.includes(" declared bankruptcy to ")) {
        const bankruptMatch = text.match(/(.*?) declared bankruptcy to (.*)/);
        if (bankruptMatch) {
            return {
                type: "bankruptcy",
                emoji: "💀",
                player: bankruptMatch[1],
                details: "declared bankruptcy to ",
                targetPlayer: bankruptMatch[2],
                bgClass: "hist-bankruptcy",
            };
        }
    }

    // 13. Mortgage Fee: "edge paid $10 interest to Bank for mortgaged St. Charles Place"
    if (text.includes(" paid $") && text.includes(" interest to Bank for mortgaged ")) {
        const feeMatch = text.match(/(.*?) paid \$(.*?) interest to Bank for mortgaged (.*)/);
        if (feeMatch) {
            return {
                type: "bankruptcy-fee",
                emoji: "💸",
                player: feeMatch[1],
                details: "paid ",
                amount: `$${feeMatch[2]} interest`,
                details2: " to Bank for mortgaged ",
                target: feeMatch[3],
                bgClass: "hist-fee",
            };
        }
    }

    // 14. Property Transfer: "edge received St. Charles Place from chrome"
    if (text.includes(" received ") && text.includes(" from ")) {
        const transferMatch = text.match(/(.*?) received (.*?) from (.*)/);
        if (transferMatch) {
            return {
                type: "transfer",
                emoji: "📋",
                player: transferMatch[1],
                details: "received ",
                target: transferMatch[2],
                details2: " from ",
                targetPlayer: transferMatch[3],
                bgClass: "hist-transfer",
            };
        }
    }

    // Default fallback
    return {
        type: "event",
        emoji: "📝",
        player: "",
        details: text,
        bgClass: "hist-default",
    };
}

function renderHistoryIcon(type: string) {
    const iconProps = {
        width: 13,
        height: 13,
        style: { verticalAlign: "middle", marginRight: "4px" },
    };
    switch (type) {
        case "roll":
            return <Icons.Dice {...iconProps} style={{ ...iconProps.style, color: "#6366f1" }} />;
        case "unjail":
            return <Icons.Unlock {...iconProps} style={{ ...iconProps.style, color: "#06b6d4" }} />;
        case "jail":
            return <Icons.Jail {...iconProps} style={{ ...iconProps.style, color: "#8b5cf6" }} />;
        case "jail-stay":
            return <Icons.Lock {...iconProps} style={{ ...iconProps.style, color: "#a855f7" }} />;
        case "buy":
            return <Icons.Home {...iconProps} style={{ ...iconProps.style, color: "#10b981" }} />;
        case "upgrade":
            return <Icons.Building {...iconProps} style={{ ...iconProps.style, color: "#f59e0b" }} />;
        case "rent":
            return <Icons.DollarSign {...iconProps} style={{ ...iconProps.style, color: "#ef4444" }} />;
        case "tax":
            return <Icons.Scale {...iconProps} style={{ ...iconProps.style, color: "#b91c1c" }} />;
        case "unmortgage":
            return <Icons.Unlock {...iconProps} style={{ ...iconProps.style, color: "#14b8a6" }} />;
        case "mortgage":
            return <Icons.Lock {...iconProps} style={{ ...iconProps.style, color: "#ec4899" }} />;
        case "chance":
            return <Icons.CardDraw {...iconProps} style={{ ...iconProps.style, color: "#f97316" }} />;
        case "chest":
            return <Icons.Package {...iconProps} style={{ ...iconProps.style, color: "#0ea5e9" }} />;
        case "go":
            return <Icons.Flag {...iconProps} style={{ ...iconProps.style, color: "#10b981" }} />;
        case "trade":
            return <Icons.Handshake {...iconProps} style={{ ...iconProps.style, color: "#d97706" }} />;
        case "bankruptcy":
            return <Icons.Skull {...iconProps} style={{ ...iconProps.style, color: "#ef4444" }} />;
        case "bankruptcy-fee":
            return <Icons.DollarSign {...iconProps} style={{ ...iconProps.style, color: "#f43f5e" }} />;
        case "transfer":
            return <Icons.ClipBoard {...iconProps} style={{ ...iconProps.style, color: "#3b82f6" }} />;
        default:
            return <Icons.ClipBoard {...iconProps} style={{ ...iconProps.style, color: "#64748b" }} />;
    }
}

interface PlayersTabProps {
    socket: Socket;
    players: Array<Player>;
    currentTurn: string;
    clickedOnPlayer: (position: number) => void;
    hostId: string;
    bankHouses?: number;
    bankHotels?: number;
    history: Array<historyAction>;
    time: Date;
    selectedMode: MonopolyMode;
}

export interface PlayersTabRef {
    clickdOnPlayer: (playerId: string) => void;
}

const playersTab = forwardRef<PlayersTabRef, PlayersTabProps>((props, ref) => {
    const propretyMap = new Map(
        monopolyJSON.properties.map((obj) => {
            return [obj.posistion ?? 0, obj];
        }),
    );

    const [current, SetCurrentPlayer] = useState<Player | undefined>();
    const [currentTime, setCurrentTime] = useState<Date>(new Date());
    const [expandedIndex, setExpandedIndex] = useState<Record<string, boolean>>({});

    const [settings, SetSettings] = useState<MonopolySettings>(() => {
        try {
            const cookieStr = CookieManager.get("monopolySettings");
            if (cookieStr) {
                const cookie = JSON.parse(decodeURIComponent(cookieStr)) as MonopolyCookie;
                if (cookie.settings) {
                    return cookie.settings;
                }
            }
        } catch (e) {
            console.error(e);
        }
        return {
            gameEngine: "2d",
            accessibility: [45, 5, false, false, true],
            audio: [100, 100, 5],
            notifications: true,
        };
    });

    useEffect(() => {
        const t_interval = setInterval(() => {
            setCurrentTime(new Date());
        }, 1000);
        return () => {
            clearInterval(t_interval);
        };
    }, []);

    useEffect(() => {
        try {
            const cookieStr = CookieManager.get("monopolySettings");
            if (cookieStr) {
                const cookieObj = JSON.parse(decodeURIComponent(cookieStr)) as MonopolyCookie;
                if (cookieObj.settings) {
                    SetSettings(cookieObj.settings);
                }
            }
        } catch (e) {
            console.error(e);
        }
    }, [document.cookie]);

    useImperativeHandle(ref, () => ({
        clickdOnPlayer(playerId) {
            for (const x of props.players) {
                if (x.id === playerId) {
                    SetCurrentPlayer(x);
                }
            }
        },
    }));

    function sum(number: number[]) {
        let x = 0;
        for (const n of number) {
            x += n;
        }
        return x;
    }

    function getTimeString(s: string) {
        const _d = new Date(s);
        const hours = _d.getHours().toString().padStart(2, "0");
        const minutes = _d.getMinutes().toString().padStart(2, "0");
        return `${hours}:${minutes}`;
    }

    function calculateTimeDifference(a: Date, b: Date) {
        const startTime = a.getTime();
        const endTime = b.getTime();
        const timeDifference = endTime - startTime;
        const hours = Math.floor(timeDifference / 3600000);
        const minutes = Math.floor((timeDifference % 3600000) / 60000);
        const seconds = Math.floor((timeDifference % 60000) / 1000);
        const h = hours.toString().padStart(2, "0");
        const m = minutes.toString().padStart(2, "0");
        const s = seconds.toString().padStart(2, "0");
        if (hours === 0) {
            return `${m}:${s}`;
        } else {
            return `${h}:${m}:${s}`;
        }
    }

    const toggleExpand = (key: string) => {
        setExpandedIndex((old) => ({ ...old, [key]: !old[key] }));
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
            <div
                className="container-top-custom"
                style={{
                    flex: current === undefined ? "1 1 55%" : "1 1 100%",
                    overflowY: "auto",
                    paddingBottom: "10px",
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                <h3
                    data-clickable={current !== undefined}
                    style={{ textAlign: "center" }}
                    onClick={() => {
                        if (current === undefined) return;
                        SetCurrentPlayer(undefined);
                    }}
                >
                    {current !== undefined ? "← Back to Players" : "Players"}
                </h3>

                {current === undefined && (
                    <div className="bank-pool-status">
                        <span className="pool-item houses">
                            🏠 Houses: <strong>{props.bankHouses ?? 32}</strong>/32
                        </span>
                        <span className="pool-item hotels">
                            🏨 Hotels: <strong>{props.bankHotels ?? 12}</strong>/12
                        </span>
                    </div>
                )}

                {current !== undefined ? (
                    <div className="playerDetailCard" style={{ padding: "0 10px" }}>
                        <table>
                            <tbody>
                                <tr>
                                    <td>balance</td>
                                    <td>{current.balance}</td>
                                </tr>
                                <tr>
                                    <td>position</td>
                                    <td>
                                        {propretyMap.get(current.position)?.name} [{current.position}]
                                    </td>
                                </tr>
                                <tr>
                                    <td>properties counts</td>
                                    <td>{current.properties.length}</td>
                                </tr>
                                <tr>
                                    <td>houses counts</td>
                                    <td>
                                        {sum(
                                            current.properties
                                                .filter((v) => typeof v.count === "number")
                                                .map((v) => v.count as number),
                                        )}
                                    </td>
                                </tr>
                                <tr>
                                    <td>hotel counts</td>
                                    <td>{current.properties.filter((v) => v.count === "h").length}</td>
                                </tr>
                                <tr>
                                    <td>get-out cards</td>
                                    <td>{current.getoutCards}</td>
                                </tr>
                                <tr>
                                    <td>is in jail</td>
                                    <td>{current.isInJail.toString()}</td>
                                </tr>
                            </tbody>
                        </table>
                        {current.properties.length === 0 ? (
                            <p></p>
                        ) : (
                            <div style={{ marginTop: "15px" }}>
                                {current.properties.map((v, i) => (
                                    <div
                                        key={i}
                                        onClick={() => {
                                            SetCurrentPlayer(undefined);
                                            props.clickedOnPlayer(v.posistion);
                                        }}
                                        className="proprety-nav"
                                    >
                                        <i
                                            className="box"
                                            style={{
                                                backgroundColor: translateGroup(v.group),
                                            }}
                                        ></i>
                                        <h3
                                            style={
                                                v.morgage !== undefined && v.morgage === true
                                                    ? { textDecoration: "line-through white" }
                                                    : {}
                                            }
                                        >
                                            {propretyMap.get(v.posistion)?.name ?? ""}
                                        </h3>
                                        <div>
                                            {v.count == "h" ? (
                                                <img src={HotelIcon.replace("public/", "")} alt="" />
                                            ) : typeof v.count === "number" && v.count > 0 ? (
                                                <>
                                                    <p>{v.count}</p>
                                                    <img src={HouseIcon.replace("public/", "")} alt="" />
                                                </>
                                            ) : (
                                                <></>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="playersInfos">
                        {props.players.map((v, i) => {
                            const isTurn = v.id === props.currentTurn;
                            return (
                                <div
                                    key={`playersInfos[${i}]`}
                                    className="playerInfo"
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "12px",
                                    }}
                                    onClick={() => {
                                        const element = document.querySelector(
                                            `div.player[player-id="${v.id}"]`,
                                        ) as HTMLDivElement;
                                        if (element) {
                                            element.style.animation =
                                                "spin2 1s cubic-bezier(.21, 1.57, .55, 1) infinite";
                                            setTimeout(() => {
                                                element.style.animation = "";
                                            }, 1 * 1000);
                                        }
                                    }}
                                    onDoubleClick={() => {
                                        SetCurrentPlayer(v);
                                    }}
                                >
                                    <div
                                        className={`sidebar-player-avatar-badge ${isTurn ? "is-turn" : ""}`}
                                        style={{
                                            backgroundColor: v.color || "#64748b",
                                            borderColor: isTurn ? "#ffffff" : "transparent",
                                            color: v.color || "#64748b",
                                        }}
                                    >
                                        <img src={`./p${v.icon + 1}.png`} alt="" />
                                    </div>

                                    <p
                                        key={60}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "8px",
                                            margin: 0,
                                            flexGrow: 1,
                                        }}
                                    >
                                        <span>
                                            {settings?.accessibility[2] ? `[${v.id}]` : ""} {v.username}{" "}
                                            {v.id === props.hostId && (
                                                <Icons.Crown
                                                    width={12}
                                                    height={12}
                                                    style={{ verticalAlign: "middle", marginLeft: 3, color: "#fbbf24" }}
                                                />
                                            )}
                                            {v.isBankrupt && (
                                                <span
                                                    style={{
                                                        color: "#ff4444",
                                                        fontSize: "0.8em",
                                                        fontWeight: 700,
                                                        marginLeft: 4,
                                                    }}
                                                >
                                                    (Bankrupt)
                                                </span>
                                            )}
                                        </span>
                                        {props.hostId === props.socket.id && v.id !== props.socket.id && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (
                                                        window.confirm(`Are you sure you want to kick ${v.username}?`)
                                                    ) {
                                                        props.socket.emit("kick-player", v.id);
                                                    }
                                                }}
                                                style={{
                                                    background: "none",
                                                    border: "none",
                                                    color: "#ff4444",
                                                    cursor: "pointer",
                                                    fontSize: "18px",
                                                    padding: "0 5px",
                                                    lineHeight: 1,
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    verticalAlign: "middle",
                                                    marginLeft: "5px",
                                                }}
                                                title="Kick Player"
                                            >
                                                &times;
                                            </button>
                                        )}
                                    </p>
                                    {isTurn ? (
                                        <img src={DiceIcon.replace("public/", "")} className="turn-dice-icon" />
                                    ) : (
                                        <></>
                                    )}
                                    {v.getoutCards > 0 ? (
                                        <p key={61} className="orange">
                                            {v.getoutCards}
                                        </p>
                                    ) : (
                                        <></>
                                    )}
                                    <p key={62}>{v.balance}</p>
                                    <p key={63}>{v.properties.length}</p>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Timeline History Event Log at the bottom */}
            {current === undefined && (
                <div
                    className="timeline-logs-container"
                    style={{
                        flex: "1 1 45%",
                        borderTop: "1px solid var(--border-color)",
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                    }}
                >
                    <div className="timeline-logs-header">
                        <h4>Game Feed</h4>
                        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            Elapsed: {calculateTimeDifference(props.time, currentTime)}
                        </span>
                    </div>

                    <div className="timeline-logs-scroller">
                        {(() => {
                            const sortedHistory = [...props.history].sort((a, b) => {
                                return new Date(b.time).getTime() - new Date(a.time).getTime();
                            });
                            return sortedHistory.map((v, i) => {
                                const getPlayerColor = (username: string) => {
                                    const p = props.players.find((pl) => pl.username === username);
                                    return p ? p.color : "#38bdf8";
                                };
                                const parsed = parseHistoryAction(v.action);

                                const playerColor = getPlayerColor(parsed.player);
                                const targetColor = parsed.target ? PROPERTY_COLORS.get(parsed.target) : undefined;
                                const targetPlayerColor = parsed.targetPlayer
                                    ? getPlayerColor(parsed.targetPlayer)
                                    : undefined;

                                const key = `${v.time}-${i}`;
                                const isExpanded = !!expandedIndex[key];
                                const balanceChangingTypes = [
                                    "buy",
                                    "upgrade",
                                    "rent",
                                    "tax",
                                    "unmortgage",
                                    "mortgage",
                                    "go",
                                    "trade",
                                    "chance",
                                    "chest",
                                    "bankruptcy",
                                    "bankruptcy-fee",
                                    "transfer",
                                ];
                                const isUnjailPay = parsed.type === "unjail" && v.action.includes("paid $50");
                                const showBalancesDropdown =
                                    v.balances &&
                                    v.balances.length > 0 &&
                                    (balanceChangingTypes.includes(parsed.type) || isUnjailPay);
                                return (
                                    <div className={`timeline-event ${parsed.bgClass}`} key={key}>
                                        <div
                                            className="timeline-event-dot"
                                            style={{ backgroundColor: playerColor || "var(--text-muted)" }}
                                        ></div>

                                        <div
                                            className="history-action-header"
                                            style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                fontSize: "11px",
                                                color: "var(--text-muted)",
                                                marginBottom: "3px",
                                            }}
                                        >
                                            <div
                                                className="history-action-type"
                                                style={{ display: "flex", alignItems: "center" }}
                                            >
                                                {renderHistoryIcon(parsed.type)}
                                                <span
                                                    style={{
                                                        fontSize: "10px",
                                                        textTransform: "uppercase",
                                                        fontWeight: 700,
                                                        letterSpacing: "0.5px",
                                                    }}
                                                >
                                                    {parsed.type}
                                                </span>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                                                <div>{getTimeString(v.time)}</div>
                                                {showBalancesDropdown && (
                                                    <button
                                                        className={`history-balances-toggle ${isExpanded ? "expanded" : ""}`}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleExpand(key);
                                                        }}
                                                        style={{
                                                            background: "none",
                                                            border: "none",
                                                            color: "var(--text-muted)",
                                                            cursor: "pointer",
                                                            fontSize: "9px",
                                                            padding: 0,
                                                        }}
                                                        title="Show balances"
                                                    >
                                                        ▼
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <div
                                            className="history-action-body"
                                            style={{ fontSize: "12px", color: "var(--text-main)", lineHeight: 1.4 }}
                                        >
                                            {parsed.player && (
                                                <span
                                                    className="history-player"
                                                    style={{
                                                        color: playerColor || "#fff",
                                                        fontWeight: 600,
                                                        marginRight: "4px",
                                                    }}
                                                >
                                                    {parsed.player}
                                                </span>
                                            )}
                                            <span>{parsed.details}</span>
                                            {parsed.amount && (
                                                <span
                                                    className="history-amount"
                                                    style={{
                                                        fontWeight: 600,
                                                        color: "var(--color-primary)",
                                                        marginInline: "3px",
                                                    }}
                                                >
                                                    {parsed.amount}
                                                </span>
                                            )}
                                            {parsed.details2 && <span>{parsed.details2}</span>}
                                            {parsed.targetPlayer && (
                                                <span
                                                    className="history-player"
                                                    style={{
                                                        color: targetPlayerColor || "#fff",
                                                        fontWeight: 600,
                                                        marginInline: "3px",
                                                    }}
                                                >
                                                    {parsed.targetPlayer}
                                                </span>
                                            )}
                                            {parsed.target && (
                                                <span
                                                    className="history-target"
                                                    style={{
                                                        color: targetColor || "#fff",
                                                        borderBottom: `1px solid ${targetColor || "rgba(255,255,255,0.2)"}`,
                                                        paddingBottom: "1px",
                                                        marginInline: "3px",
                                                        fontWeight: 500,
                                                    }}
                                                >
                                                    {parsed.target}
                                                </span>
                                            )}
                                            {parsed.cardText && (
                                                <span
                                                    className="history-card-text"
                                                    style={{
                                                        fontStyle: "italic",
                                                        opacity: 0.85,
                                                        display: "block",
                                                        marginTop: "2px",
                                                        paddingLeft: "6px",
                                                        borderLeft: "2px solid rgba(255,255,255,0.15)",
                                                    }}
                                                >
                                                    {parsed.cardText}
                                                </span>
                                            )}
                                        </div>

                                        {isExpanded && v.balances && (
                                            <div
                                                className="history-action-balances"
                                                style={{
                                                    marginTop: "6px",
                                                    padding: "6px",
                                                    background: "rgba(0,0,0,0.15)",
                                                    borderRadius: "6px",
                                                    fontSize: "11px",
                                                }}
                                            >
                                                {v.balances.map((pl, idx) => {
                                                    const origIdx = props.history.indexOf(v);
                                                    const prevEvent =
                                                        origIdx > 0 ? props.history[origIdx - 1] : undefined;
                                                    const prevPl = prevEvent?.balances?.find(
                                                        (p) => p.username === pl.username,
                                                    );
                                                    const prevBalance = prevPl
                                                        ? prevPl.balance
                                                        : (props.selectedMode?.startingCash ?? 1500);
                                                    const diff = pl.balance - prevBalance;
                                                    return (
                                                        <div
                                                            key={idx}
                                                            className="history-balance-row"
                                                            style={{
                                                                display: "flex",
                                                                justifyContent: "space-between",
                                                                paddingBlock: "2px",
                                                                borderLeft: `2px solid ${pl.color || "#64748b"}`,
                                                                paddingLeft: "6px",
                                                                marginBottom: "2px",
                                                            }}
                                                        >
                                                            <span
                                                                className="balance-username"
                                                                style={{ color: "var(--text-muted)" }}
                                                            >
                                                                {pl.username}
                                                            </span>
                                                            <span className="balance-value">
                                                                {diff !== 0 ? (
                                                                    <>
                                                                        <span
                                                                            className="balance-prev"
                                                                            style={{ opacity: 0.6 }}
                                                                        >
                                                                            {prevBalance}M
                                                                        </span>
                                                                        <span
                                                                            className="balance-arrow"
                                                                            style={{ marginInline: "4px" }}
                                                                        >
                                                                            ➔
                                                                        </span>
                                                                        <span
                                                                            className="balance-curr"
                                                                            style={{ fontWeight: 600 }}
                                                                        >
                                                                            {pl.balance}M
                                                                        </span>
                                                                        <span
                                                                            className={`balance-diff ${diff > 0 ? "positive" : "negative"}`}
                                                                            style={{
                                                                                marginLeft: "4px",
                                                                                color:
                                                                                    diff > 0
                                                                                        ? "var(--color-green)"
                                                                                        : "var(--color-red)",
                                                                            }}
                                                                        >
                                                                            {diff > 0 ? `(+${diff}M)` : `(${diff}M)`}
                                                                        </span>
                                                                    </>
                                                                ) : (
                                                                    <span>{pl.balance}M</span>
                                                                )}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            });
                        })()}
                    </div>
                </div>
            )}
        </div>
    );
});

export default playersTab;
