import { useState } from "react";
import { Socket } from "../../utils/sockets";
import { Player } from "../../utils/player";
import { NotificatorRef } from "../Notificator";
import { Icons } from "../icons";
import monopolyJSON from "../../../../shared/data/monopoly.json";

interface DebugPanelProps {
    socket: Socket;
    clients: Map<string, Player>;
    notifyRef: React.RefObject<NotificatorRef | null>;
    setHasRolled: (val: boolean) => void;
    setAllowRollAgain: (val: boolean) => void;
    setIsDebtState: (val: boolean) => void;
    setMortgageBankruptName: (name: string) => void;
    setMortgageTransferPending: (pending: any[] | null) => void;
}

/**
 * DebugPanel component for game debugging.
 * Allows administrators/hosts to adjust money, move players, send to jail, and override dice rolls.
 */
export default function DebugPanel({
    socket,
    clients,
    notifyRef,
    setHasRolled,
    setAllowRollAgain,
    setIsDebtState,
    setMortgageBankruptName,
    setMortgageTransferPending,
}: DebugPanelProps) {
    const [debugCollapsed, setDebugCollapsed] = useState<boolean>(false);
    const [targetPlayerId, setTargetPlayerId] = useState<string>(socket.id);
    const [teleportPos, setTeleportPos] = useState<number>(0);
    const [adjustAmount, setAdjustAmount] = useState<number>(100);
    const [overrideD1, setOverrideD1] = useState<number>(1);
    const [overrideD2, setOverrideD2] = useState<number>(1);

    const activeTargetId = clients.has(targetPlayerId) ? targetPlayerId : socket.id;

    const handleTriggerInsolvency = () => {
        socket.emit("debug_set_balance", { targetPlayerId: activeTargetId, balance: -1 });
        socket.emit("debug_set_turn", { targetPlayerId: activeTargetId });
        if (activeTargetId === socket.id) {
            setHasRolled(true);
            setAllowRollAgain(false);
            setIsDebtState(true);
        }
        notifyRef.current?.message(
            `Bankruptcy test triggered for ${clients.get(activeTargetId)?.username}!`,
            "info",
            3,
        );
    };

    const handlePreviewMortgageModal = () => {
        setMortgageBankruptName("BankruptcyBot");
        setMortgageTransferPending([
            {
                position: 1,
                name: "Mediterranean Avenue",
                mortgageValue: 30,
                interestFee: 3,
                unmortgageCost: 33,
            },
            {
                position: 39,
                name: "Boardwalk",
                mortgageValue: 200,
                interestFee: 20,
                unmortgageCost: 220,
            },
        ]);
        notifyRef.current?.message("Previewing Mortgage Transfer Modal!", "info", 2);
    };

    const handleTakeTurn = () => {
        socket.emit("debug_set_turn", { targetPlayerId: activeTargetId });
        notifyRef.current?.message(`Forced turn to ${clients.get(activeTargetId)?.username}!`, "info", 2);
    };

    const handleAdjustBalance = (amount: number) => {
        const targetPlayer = clients.get(activeTargetId);
        if (targetPlayer) {
            const newBalance = targetPlayer.balance + amount;
            socket.emit("debug_set_balance", { targetPlayerId: activeTargetId, balance: newBalance });
            notifyRef.current?.message(
                `Balance of ${targetPlayer.username} adjusted by ${amount > 0 ? "+" : ""}$${amount}`,
                "info",
                2,
            );
        }
    };

    const handleClearBalance = () => {
        socket.emit("debug_set_balance", { targetPlayerId: activeTargetId, balance: 0 });
        notifyRef.current?.message(`Balance of ${clients.get(activeTargetId)?.username} set to $0`, "info", 2);
    };

    const handleToggleJail = (inJail: boolean) => {
        socket.emit("debug_send_to_jail", { targetPlayerId: activeTargetId, inJail });
        notifyRef.current?.message(
            `${clients.get(activeTargetId)?.username} ${inJail ? "sent to" : "released from"} jail`,
            "info",
            2,
        );
    };

    const handleTeleport = () => {
        socket.emit("debug_move_player", { targetPlayerId: activeTargetId, position: teleportPos });
        notifyRef.current?.message(
            `${clients.get(activeTargetId)?.username} teleported to tile ${teleportPos}`,
            "info",
            2,
        );
    };

    const handleSetDice = () => {
        socket.emit("debug_override_dice", { targetPlayerId: activeTargetId, d1: overrideD1, d2: overrideD2 });
        notifyRef.current?.message(
            `Next roll for ${clients.get(activeTargetId)?.username} set to [${overrideD1}, ${overrideD2}]`,
            "info",
            2,
        );
    };

    const handleForceBankruptcy = () => {
        const targetName = clients.get(activeTargetId)?.username;
        if (window.confirm(`Are you sure you want to force bankruptcy on ${targetName}?`)) {
            socket.emit("debug_force_bankruptcy", { targetPlayerId: activeTargetId });
        }
    };

    return (
        <>
            <style>{`
                .debug-panel {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    z-index: 99999;
                    background: rgba(15, 23, 42, 0.75);
                    backdrop-filter: blur(12px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    padding: 16px;
                    color: #f8fafc;
                    font-family: 'Outfit', sans-serif;
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
                    width: 240px;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .debug-panel.collapsed {
                    width: 48px;
                    height: 48px;
                    padding: 0;
                    overflow: hidden;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                }
                .debug-panel h4 {
                    margin: 0 0 12px 0;
                    font-size: 14px;
                    font-weight: 600;
                    letter-spacing: 0.05em;
                    text-transform: uppercase;
                    color: #a78bfa;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .debug-close-btn {
                    background: none;
                    border: none;
                    color: #94a3b8;
                    cursor: pointer;
                    font-size: 16px;
                    padding: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 4px;
                    transition: background 0.2s;
                }
                .debug-close-btn:hover {
                    background: rgba(255, 255, 255, 0.05);
                    color: #f8fafc;
                }
                .debug-panel-content {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .debug-btn {
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 8px;
                    color: #e2e8f0;
                    padding: 8px 12px;
                    font-size: 12px;
                    font-weight: 500;
                    text-align: left;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .debug-btn:hover {
                    background: rgba(167, 139, 250, 0.15);
                    border-color: rgba(167, 139, 250, 0.3);
                    color: #f8fafc;
                    transform: translateY(-1px);
                }
                .debug-btn-primary {
                    background: rgba(167, 139, 250, 0.2);
                    border-color: rgba(167, 139, 250, 0.4);
                    color: #ddd6fe;
                }
                .debug-btn-primary:hover {
                    background: rgba(167, 139, 250, 0.3);
                    border-color: rgba(167, 139, 250, 0.5);
                    color: #ffffff;
                }
            `}</style>
            {debugCollapsed ? (
                <div
                    className="debug-panel collapsed"
                    onClick={() => setDebugCollapsed(false)}
                    title="Open Debug Panel"
                >
                    <Icons.Wrench width={20} height={20} />
                </div>
            ) : (
                <div className="debug-panel" style={{ width: "260px" }}>
                    <h4>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <Icons.Wrench width={14} height={14} />
                            Game Debugger
                        </span>
                        <button className="debug-close-btn" onClick={() => setDebugCollapsed(true)}>
                            ×
                        </button>
                    </h4>
                    <div className="debug-panel-content">
                        <div style={{ marginBottom: "6px" }}>
                            <div
                                style={{
                                    fontSize: "11px",
                                    color: "#a78bfa",
                                    marginBottom: "4px",
                                    fontWeight: "600",
                                    textTransform: "uppercase",
                                }}
                            >
                                Target Player
                            </div>
                            <select
                                value={targetPlayerId}
                                onChange={(e) => setTargetPlayerId(e.target.value)}
                                style={{
                                    width: "100%",
                                    background: "rgba(30, 41, 59, 0.6)",
                                    color: "white",
                                    border: "1px solid rgba(255,255,255,0.2)",
                                    borderRadius: "6px",
                                    padding: "6px",
                                    fontSize: "12px",
                                    outline: "none",
                                }}
                            >
                                {Array.from(clients.values()).map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.username} {p.id === socket.id ? "(You)" : ""}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <button className="debug-btn debug-btn-primary" onClick={handleTriggerInsolvency}>
                            <Icons.DebtTrigger width={13} height={13} /> Trigger Debt (-$1)
                        </button>
                        <button className="debug-btn" onClick={handlePreviewMortgageModal}>
                            <Icons.Scale width={13} height={13} /> Preview Mortgage Modal
                        </button>
                        <button className="debug-btn" onClick={handleTakeTurn}>
                            <Icons.ForceTurn width={13} height={13} /> Force Turn
                        </button>

                        {/* Balance adjustment section */}
                        <div
                            style={{
                                borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                                marginTop: "6px",
                                paddingTop: "6px",
                            }}
                        >
                            <div
                                style={{
                                    fontSize: "11px",
                                    color: "#a78bfa",
                                    marginBottom: "6px",
                                    fontWeight: "600",
                                    textTransform: "uppercase",
                                }}
                            >
                                Adjust Balance
                            </div>
                            <div
                                style={{
                                    display: "flex",
                                    gap: "6px",
                                    alignItems: "center",
                                    marginBottom: "6px",
                                }}
                            >
                                <input
                                    type="number"
                                    value={adjustAmount}
                                    onChange={(e) => setAdjustAmount(Math.max(0, Number(e.target.value)))}
                                    style={{
                                        flex: 1,
                                        background: "rgba(30, 41, 59, 0.6)",
                                        color: "white",
                                        border: "1px solid rgba(255,255,255,0.2)",
                                        borderRadius: "4px",
                                        padding: "6px",
                                        fontSize: "12px",
                                        outline: "none",
                                        minWidth: "60px",
                                    }}
                                    placeholder="Amount"
                                />
                                <button
                                    onClick={() => handleAdjustBalance(adjustAmount)}
                                    style={{
                                        background: "rgba(34, 197, 94, 0.15)",
                                        border: "1px solid rgba(34, 197, 94, 0.3)",
                                        borderRadius: "4px",
                                        color: "#a7f3d0",
                                        padding: "6px 10px",
                                        fontSize: "11px",
                                        cursor: "pointer",
                                        fontWeight: "600",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "4px",
                                        height: "30px",
                                    }}
                                    title="Gain"
                                >
                                    <Icons.ArrowUp width={12} height={12} /> Gain
                                </button>
                                <button
                                    onClick={() => handleAdjustBalance(-adjustAmount)}
                                    style={{
                                        background: "rgba(239, 68, 68, 0.15)",
                                        border: "1px solid rgba(239, 68, 68, 0.3)",
                                        borderRadius: "4px",
                                        color: "#fca5a5",
                                        padding: "6px 10px",
                                        fontSize: "11px",
                                        cursor: "pointer",
                                        fontWeight: "600",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "4px",
                                        height: "30px",
                                    }}
                                    title="Lose"
                                >
                                    <Icons.ArrowDown width={12} height={12} /> Lose
                                </button>
                            </div>
                            <button
                                className="debug-btn"
                                style={{ width: "100%", justifyContent: "center" }}
                                onClick={handleClearBalance}
                            >
                                <Icons.Scale width={13} height={13} /> Set Balance $0
                            </button>
                        </div>

                        {/* Jail section */}
                        <div
                            style={{
                                borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                                marginTop: "6px",
                                paddingTop: "6px",
                            }}
                        >
                            <div
                                style={{
                                    fontSize: "11px",
                                    color: "#a78bfa",
                                    marginBottom: "4px",
                                    fontWeight: "600",
                                    textTransform: "uppercase",
                                }}
                            >
                                Jail Actions
                            </div>
                            <div style={{ display: "flex", gap: "6px" }}>
                                <button
                                    className="debug-btn"
                                    style={{ flex: 1, justifyContent: "center" }}
                                    onClick={() => handleToggleJail(true)}
                                >
                                    <Icons.Jail width={13} height={13} /> Send
                                </button>
                                <button
                                    className="debug-btn"
                                    style={{ flex: 1, justifyContent: "center" }}
                                    onClick={() => handleToggleJail(false)}
                                >
                                    <Icons.Police width={13} height={13} /> Release
                                </button>
                            </div>
                        </div>

                        {/* Teleport section */}
                        <div
                            style={{
                                borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                                marginTop: "6px",
                                paddingTop: "6px",
                            }}
                        >
                            <div
                                style={{
                                    fontSize: "11px",
                                    color: "#a78bfa",
                                    marginBottom: "4px",
                                    fontWeight: "600",
                                    textTransform: "uppercase",
                                }}
                            >
                                Teleport to Tile
                            </div>
                            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                <select
                                    value={teleportPos}
                                    onChange={(e) => setTeleportPos(Number(e.target.value))}
                                    style={{
                                        flex: 1,
                                        background: "rgba(30, 41, 59, 0.6)",
                                        color: "white",
                                        border: "1px solid rgba(255,255,255,0.2)",
                                        borderRadius: "4px",
                                        padding: "4px",
                                        fontSize: "12px",
                                        width: "140px",
                                    }}
                                >
                                    {monopolyJSON.properties.map((p) => (
                                        <option key={p.posistion} value={p.posistion}>
                                            {p.posistion}: {p.name}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    onClick={handleTeleport}
                                    style={{
                                        background: "rgba(167, 139, 250, 0.2)",
                                        border: "1px solid rgba(167, 139, 250, 0.4)",
                                        borderRadius: "4px",
                                        color: "white",
                                        padding: "4px 8px",
                                        fontSize: "11px",
                                        cursor: "pointer",
                                        fontWeight: "600",
                                        height: "26px",
                                    }}
                                >
                                    <Icons.MapPin width={12} height={12} style={{ verticalAlign: "middle" }} />
                                </button>
                            </div>
                        </div>

                        {/* Set Next Roll section */}
                        <div
                            style={{
                                borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                                marginTop: "6px",
                                paddingTop: "6px",
                            }}
                        >
                            <div
                                style={{
                                    fontSize: "11px",
                                    color: "#a78bfa",
                                    marginBottom: "4px",
                                    fontWeight: "600",
                                    textTransform: "uppercase",
                                }}
                            >
                                Set Next Roll
                            </div>
                            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                <select
                                    value={overrideD1}
                                    onChange={(e) => setOverrideD1(Number(e.target.value))}
                                    style={{
                                        flex: 1,
                                        background: "rgba(30, 41, 59, 0.6)",
                                        color: "white",
                                        border: "1px solid rgba(255,255,255,0.2)",
                                        borderRadius: "4px",
                                        padding: "4px",
                                        fontSize: "12px",
                                    }}
                                >
                                    {[1, 2, 3, 4, 5, 6].map((n) => (
                                        <option key={n} value={n}>
                                            {n}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    value={overrideD2}
                                    onChange={(e) => setOverrideD2(Number(e.target.value))}
                                    style={{
                                        flex: 1,
                                        background: "rgba(30, 41, 59, 0.6)",
                                        color: "white",
                                        border: "1px solid rgba(255,255,255,0.2)",
                                        borderRadius: "4px",
                                        padding: "4px",
                                        fontSize: "12px",
                                    }}
                                >
                                    {[1, 2, 3, 4, 5, 6].map((n) => (
                                        <option key={n} value={n}>
                                            {n}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    onClick={handleSetDice}
                                    style={{
                                        background: "rgba(167, 139, 250, 0.2)",
                                        border: "1px solid rgba(167, 139, 250, 0.4)",
                                        borderRadius: "4px",
                                        color: "white",
                                        padding: "4px 8px",
                                        fontSize: "11px",
                                        cursor: "pointer",
                                        fontWeight: "600",
                                    }}
                                >
                                    Set
                                </button>
                            </div>
                        </div>

                        {/* Force Bankruptcy section */}
                        <div
                            style={{
                                borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                                marginTop: "6px",
                                paddingTop: "6px",
                            }}
                        >
                            <button
                                className="debug-btn"
                                style={{
                                    width: "100%",
                                    justifyContent: "center",
                                    background: "rgba(239, 68, 68, 0.15)",
                                    border: "1px solid rgba(239, 68, 68, 0.3)",
                                    color: "#fca5a5",
                                }}
                                onClick={handleForceBankruptcy}
                            >
                                <Icons.Skull width={13} height={13} /> Force Bankruptcy
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
