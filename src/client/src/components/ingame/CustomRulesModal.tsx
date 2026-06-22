import { Socket } from "../../utils/sockets";
import { MonopolyMode } from "../../../../shared/types/game";

interface CustomRulesModalProps {
    onClose: () => void;
    customConfig: MonopolyMode;
    setCustomConfig: (updated: MonopolyMode) => void;
    socket: Socket;
}

/**
 * CustomRulesModal component for configuring custom match settings in Monopoly.
 */
export default function CustomRulesModal({ onClose, customConfig, setCustomConfig, socket }: CustomRulesModalProps) {
    const handleConfigChange = (updated: MonopolyMode) => {
        setCustomConfig(updated);
        socket.emit("ready", { mode: updated });
    };

    return (
        <div
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0, 0, 0, 0.75)",
                backdropFilter: "blur(4px)",
                zIndex: 9999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "20px",
                fontFamily: "var(--font-family, inherit)",
            }}
        >
            <div
                style={{
                    width: "100%",
                    maxWidth: "480px",
                    backgroundColor: "#1c1c1e",
                    border: "1px solid var(--border-color)",
                    borderRadius: "16px",
                    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                }}
            >
                {/* Header */}
                <div
                    style={{
                        padding: "16px 20px",
                        borderBottom: "1px solid var(--border-color)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        backgroundColor: "rgba(255,255,255,0.02)",
                    }}
                >
                    <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "bold", color: "#fff" }}>
                        Custom Match Settings
                    </h3>
                    <button
                        onClick={onClose}
                        style={{
                            border: "none",
                            background: "none",
                            color: "#aaa",
                            fontSize: "20px",
                            cursor: "pointer",
                            lineHeight: 1,
                        }}
                    >
                        &times;
                    </button>
                </div>

                {/* Body */}
                <div
                    style={{
                        padding: "20px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "16px",
                        overflowY: "auto",
                        maxHeight: "70vh",
                    }}
                >
                    {/* Winning Mode */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <label
                            style={{
                                fontSize: "11px",
                                letterSpacing: "1px",
                                color: "#aaa",
                                fontWeight: "bold",
                            }}
                        >
                            WINNING CONDITION
                        </label>
                        <select
                            value={customConfig.WinningMode}
                            onChange={(e) => {
                                const val = e.target.value as MonopolyMode["WinningMode"];
                                handleConfigChange({ ...customConfig, WinningMode: val });
                            }}
                            style={{
                                padding: "10px 12px",
                                borderRadius: "8px",
                                backgroundColor: "rgba(0,0,0,0.3)",
                                color: "#fff",
                                border: "1px solid var(--border-color)",
                                outline: "none",
                                cursor: "pointer",
                                fontSize: "13px",
                            }}
                        >
                            <option value="last-standing">Last Standing (Classic)</option>
                            <option value="monopols">Monopols (3 sets)</option>
                            <option value="monopols & trains">Monopols & Trains (3 sets or 4 railroads)</option>
                        </select>
                    </div>

                    {/* Starting Cash */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <label
                                style={{
                                    fontSize: "11px",
                                    letterSpacing: "1px",
                                    color: "#aaa",
                                    fontWeight: "bold",
                                }}
                            >
                                STARTING CASH
                            </label>
                            <span style={{ fontSize: "13px", fontWeight: "bold", color: "#E0115F" }}>
                                {customConfig.startingCash}M
                            </span>
                        </div>
                        <input
                            type="range"
                            min="500"
                            max="5000"
                            step="100"
                            value={customConfig.startingCash}
                            onChange={(e) => {
                                const val = parseInt(e.target.value) || 1500;
                                handleConfigChange({ ...customConfig, startingCash: val });
                            }}
                            style={{
                                cursor: "pointer",
                                accentColor: "#E0115F",
                                width: "100%",
                            }}
                        />
                    </div>

                    {/* Turn Timer */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <label
                                style={{
                                    fontSize: "11px",
                                    letterSpacing: "1px",
                                    color: "#aaa",
                                    fontWeight: "bold",
                                }}
                            >
                                TURN TIMER
                            </label>
                            <span style={{ fontSize: "13px", fontWeight: "bold", color: "#E0115F" }}>
                                {customConfig.turnTimer === undefined || customConfig.turnTimer === 0
                                    ? "No Timer"
                                    : `${customConfig.turnTimer}s`}
                            </span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="120"
                            step="5"
                            value={customConfig.turnTimer ?? 0}
                            onChange={(e) => {
                                const val = parseInt(e.target.value);
                                const turnTimer = val === 0 ? undefined : val;
                                handleConfigChange({ ...customConfig, turnTimer });
                            }}
                            style={{
                                cursor: "pointer",
                                accentColor: "#E0115F",
                                width: "100%",
                            }}
                        />
                    </div>

                    {/* Toggles */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "4px" }}>
                        <label
                            style={{
                                fontSize: "11px",
                                letterSpacing: "1px",
                                color: "#aaa",
                                fontWeight: "bold",
                            }}
                        >
                            RULE TOGGLES
                        </label>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            <label
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    cursor: "pointer",
                                    fontSize: "13px",
                                    color: "#fff",
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={customConfig.AllowDeals}
                                    onChange={(e) => {
                                        handleConfigChange({ ...customConfig, AllowDeals: e.target.checked });
                                    }}
                                    style={{
                                        cursor: "pointer",
                                        accentColor: "#E0115F",
                                        width: "16px",
                                        height: "16px",
                                    }}
                                />
                                Allow Trades
                            </label>
                            <label
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    cursor: "pointer",
                                    fontSize: "13px",
                                    color: "#fff",
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={customConfig.mortageAllowed}
                                    onChange={(e) => {
                                        handleConfigChange({ ...customConfig, mortageAllowed: e.target.checked });
                                    }}
                                    style={{
                                        cursor: "pointer",
                                        accentColor: "#E0115F",
                                        width: "16px",
                                        height: "16px",
                                    }}
                                />
                                Allow Mortgages
                            </label>
                            <label
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    cursor: "pointer",
                                    fontSize: "13px",
                                    color: "#fff",
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={customConfig.allowAuctions}
                                    onChange={(e) => {
                                        handleConfigChange({ ...customConfig, allowAuctions: e.target.checked });
                                    }}
                                    style={{
                                        cursor: "pointer",
                                        accentColor: "#E0115F",
                                        width: "16px",
                                        height: "16px",
                                    }}
                                />
                                Allow Auctions
                            </label>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div
                    style={{
                        padding: "14px 20px",
                        borderTop: "1px solid var(--border-color)",
                        display: "flex",
                        justifyContent: "flex-end",
                        backgroundColor: "rgba(255,255,255,0.02)",
                    }}
                >
                    <button
                        onClick={onClose}
                        style={{
                            padding: "8px 18px",
                            borderRadius: "8px",
                            backgroundColor: "#E0115F",
                            color: "#fff",
                            border: "none",
                            fontSize: "13px",
                            fontWeight: "bold",
                            cursor: "pointer",
                        }}
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
