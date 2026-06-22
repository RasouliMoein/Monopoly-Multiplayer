import { useState } from "react";
import { Player } from "../../utils/player.ts";
import { GameStats, PlayerStats } from "../../../../shared/types/game";
import monopolyJSON from "../../../../shared/data/monopoly.json";

interface InsightsTabProps {
    stats: GameStats | null;
    players: Array<Player>;
}

export default function InsightsTab({ stats, players }: InsightsTabProps) {
    const [subTab, setSubTab] = useState<number>(0);

    if (!stats || !stats.playerStats || Object.keys(stats.playerStats).length === 0) {
        return (
            <div className="insights-empty">
                <div className="insights-empty-icon">📊</div>
                <h3>No Analytics Available Yet</h3>
                <p>Roll the dice and make some moves to start generating in-game insights!</p>
            </div>
        );
    }

    // Helper to calculate current player assets (balance + unmortgaged property prices + house values)
    const getPlayerAssets = (player: Player) => {
        let assets = player.balance;
        player.properties.forEach((p) => {
            const propData = monopolyJSON.properties.find((pj: any) => pj.position === p.position);
            if (!propData) return;
            if (p.morgage === true || (p.morgage as any) === "true") {
                assets += Math.round((propData.price ?? 0) * 0.5);
            } else {
                assets += propData.price ?? 0;
                const houses = typeof p.count === "number" ? p.count : p.count === "h" ? 5 : 0;
                const houseCost = propData.housecost ?? 0;
                assets += houses * houseCost;
            }
        });
        return assets;
    };

    // Helper to resolve property details
    const getPropertyDetails = (position: number) => {
        return monopolyJSON.properties.find((p: any) => p.position === position);
    };

    const getGroupColor = (group: string) => {
        switch (group?.toLowerCase()) {
            case "purple":
                return "#78350f"; // brown
            case "lightgreen":
                return "#4ade80";
            case "violet":
                return "#d946ef";
            case "orange":
                return "#f97316";
            case "red":
                return "#ef4444";
            case "yellow":
                return "#eab308";
            case "darkgreen":
                return "#22c55e";
            case "darkblue":
                return "#3b82f6";
            case "railroad":
                return "#64748b";
            case "utilities":
                return "#06b6d4";
            default:
                return "#94a3b8";
        }
    };

    return (
        <div className="insights-tab">
            <div className="insights-header">
                <h3>Game Insights</h3>
                <div className="insights-subnav">
                    <button className={subTab === 0 ? "active" : ""} onClick={() => setSubTab(0)}>
                        Overview
                    </button>
                    <button className={subTab === 1 ? "active" : ""} onClick={() => setSubTab(1)}>
                        Performance
                    </button>
                    <button className={subTab === 2 ? "active" : ""} onClick={() => setSubTab(2)}>
                        Hotspots & ROI
                    </button>
                    <button className={subTab === 3 ? "active" : ""} onClick={() => setSubTab(3)}>
                        Luck Index
                    </button>
                </div>
            </div>

            <div className="insights-content scrollable">
                {subTab === 0 && (
                    <OverviewTab
                        stats={stats}
                        players={players}
                        getPlayerAssets={getPlayerAssets}
                        getPropertyDetails={getPropertyDetails}
                        getGroupColor={getGroupColor}
                    />
                )}
                {subTab === 1 && <PerformanceTab stats={stats} players={players} />}
                {subTab === 2 && (
                    <HotspotsTab
                        stats={stats}
                        players={players}
                        getPropertyDetails={getPropertyDetails}
                        getGroupColor={getGroupColor}
                    />
                )}
                {subTab === 3 && <LuckTab stats={stats} players={players} />}
            </div>
        </div>
    );
}

// ── OVERVIEW SUB-TAB ──────────────────────────────────────────────────────────
interface SubTabProps {
    stats: GameStats;
    players: Array<Player>;
    getPlayerAssets: (p: Player) => number;
    getPropertyDetails: (pos: number) => any;
    getGroupColor: (g: string) => string;
}

function OverviewTab({ stats, players, getPlayerAssets, getPropertyDetails, getGroupColor }: SubTabProps) {
    // 1. Board Dominance (Donut Chart)
    const playerAssetsList = players.map((p) => ({
        id: p.id,
        username: p.username,
        color: p.color || "#64748b",
        assets: getPlayerAssets(p),
    }));
    const totalAssets = playerAssetsList.reduce((acc, curr) => acc + curr.assets, 0);

    // Compute donut slices using SVG path arcs for reliable browser rendering
    const cx = 90;
    const cy = 90;
    const radius = 65;
    const strokeWidth = 16;
    let currentAngle = -Math.PI / 2; // Start at 12 o'clock

    // 2. Dice Rolls Bar Chart
    const diceSums = Array.from({ length: 11 }, (_, i) => i + 2);
    const maxRollCount = Math.max(...diceSums.map((s) => stats.diceRolls[s] || 0), 1);

    // Leader, Hotspot, Max Rent calculations
    const leader =
        playerAssetsList.length > 0
            ? playerAssetsList.reduce((max, curr) => (curr.assets > max.assets ? curr : max), playerAssetsList[0])
            : null;

    const visitsList = Object.entries(stats.tileVisits)
        .map(([pos, count]) => ({
            position: parseInt(pos),
            count: count as number,
        }))
        .sort((a, b) => b.count - a.count);
    const hotspot = visitsList.length > 0 ? visitsList[0] : null;
    const hotspotDetails = hotspot ? getPropertyDetails(hotspot.position) : null;

    let maxRentProp: any = null;
    let maxRentValue = 0;
    let maxRentOwnerName = "";
    let maxRentOwnerColor = "";

    players.forEach((p) => {
        p.properties.forEach((prop) => {
            const details = getPropertyDetails(prop.position);
            if (!details) return;

            const isMortgaged = prop.morgage === true || (prop.morgage as any) === "true";
            if (isMortgaged) return;

            let rent = 0;
            if (details.group === "Utilities") {
                const ownedUtilitiesCount = p.properties.filter(
                    (op) => getPropertyDetails(op.position)?.group === "Utilities",
                ).length;
                rent = 7 * (ownedUtilitiesCount === 2 ? 10 : 4);
            } else if (details.group === "Railroad") {
                const ownedRailroadsCount = p.properties.filter(
                    (op) => getPropertyDetails(op.position)?.group === "Railroad",
                ).length;
                rent = [0, 25, 50, 100, 200][Math.min(ownedRailroadsCount, 4)];
            } else {
                const houseCount = typeof prop.count === "number" ? prop.count : prop.count === "h" ? 5 : 0;
                if (houseCount === 0) {
                    const groupList = monopolyJSON.properties.filter((pj) => pj.group === details.group);
                    const ownedGroup = p.properties.filter(
                        (op) => getPropertyDetails(op.position)?.group === details.group,
                    );
                    const hasMonopoly = groupList.length > 0 && ownedGroup.length === groupList.length;
                    const allUnimproved = ownedGroup.every((op) => {
                        const opHouseCount = typeof op.count === "number" ? op.count : op.count === "h" ? 5 : 0;
                        return opHouseCount === 0;
                    });
                    const noneMortgaged = ownedGroup.every((op) => {
                        return op.morgage !== true && (op.morgage as any) !== "true";
                    });
                    rent = details.rent * (hasMonopoly && allUnimproved && noneMortgaged ? 2 : 1);
                } else {
                    rent = details.multpliedrent[houseCount - 1] ?? details.rent;
                }
            }

            if (rent > maxRentValue) {
                maxRentValue = rent;
                maxRentProp = details;
                maxRentOwnerName = p.username;
                maxRentOwnerColor = p.color;
            }
        });
    });

    return (
        <div className="insights-section fade-in">
            {/* Insights Summary Cards */}
            <div className="insights-summary-grid">
                <div className="summary-card">
                    <div className="summary-card-icon leader">👑</div>
                    <div className="summary-card-content">
                        <span className="summary-card-label">Current Leader</span>
                        <span className="summary-card-value" style={{ color: leader?.color }}>
                            {leader ? leader.username : "None"}
                        </span>
                        <span className="summary-card-subtext">{leader ? `$${leader.assets} Assets` : "N/A"}</span>
                    </div>
                </div>
                <div className="summary-card">
                    <div className="summary-card-icon hotspot">🔥</div>
                    <div className="summary-card-content">
                        <span className="summary-card-label">Board Hotspot</span>
                        <span
                            className="summary-card-value"
                            style={{ color: hotspotDetails ? getGroupColor(hotspotDetails.group) : "#fff" }}
                        >
                            {hotspotDetails ? hotspotDetails.name : "None"}
                        </span>
                        <span className="summary-card-subtext">{hotspot ? `${hotspot.count} visits` : "0 visits"}</span>
                    </div>
                </div>
                <div className="summary-card">
                    <div className="summary-card-icon danger-zone">⚡</div>
                    <div className="summary-card-content">
                        <span className="summary-card-label">Highest Rent</span>
                        <span
                            className="summary-card-value"
                            style={{ color: maxRentProp ? getGroupColor(maxRentProp.group) : "#fff" }}
                        >
                            {maxRentProp ? maxRentProp.name : "None"}
                        </span>
                        <span
                            className="summary-card-subtext"
                            style={{ color: maxRentOwnerColor || "rgba(255,255,255,0.4)" }}
                        >
                            {maxRentProp ? `$${maxRentValue} rent (${maxRentOwnerName})` : "No developed properties"}
                        </span>
                    </div>
                </div>
            </div>
            <div className="insights-card">
                <h4>Board Dominance (Assets Value Share)</h4>
                <div className="donut-chart-wrapper">
                    <div className="donut-chart-container">
                        <svg width="180" height="180" viewBox="0 0 180 180">
                            <circle
                                cx={cx}
                                cy={cy}
                                r={radius}
                                fill="transparent"
                                stroke="rgba(255,255,255,0.03)"
                                strokeWidth={strokeWidth}
                            />
                            {playerAssetsList.map((item) => {
                                if (totalAssets === 0) return null;
                                const percent = item.assets / totalAssets;
                                if (percent <= 0) return null;

                                if (percent > 0.999) {
                                    return (
                                        <circle
                                            key={item.id}
                                            cx={cx}
                                            cy={cy}
                                            r={radius}
                                            fill="transparent"
                                            stroke={item.color}
                                            strokeWidth={strokeWidth}
                                        />
                                    );
                                }

                                const angleDelta = percent * 2 * Math.PI;
                                const startAngle = currentAngle;
                                const endAngle = currentAngle + angleDelta;
                                currentAngle = endAngle;

                                const x1 = cx + radius * Math.cos(startAngle);
                                const y1 = cy + radius * Math.sin(startAngle);
                                const x2 = cx + radius * Math.cos(endAngle);
                                const y2 = cy + radius * Math.sin(endAngle);

                                const largeArc = percent > 0.5 ? 1 : 0;
                                const pathData = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;

                                return (
                                    <path
                                        key={item.id}
                                        d={pathData}
                                        fill="transparent"
                                        stroke={item.color}
                                        strokeWidth={strokeWidth}
                                        strokeLinecap="round"
                                    />
                                );
                            })}
                        </svg>
                        <div className="donut-chart-total">
                            <span className="total-label">TOTAL WEALTH</span>
                            <span className="total-value">${totalAssets}</span>
                        </div>
                    </div>

                    <div className="donut-legend">
                        {playerAssetsList.map((item) => {
                            const percent = totalAssets > 0 ? Math.round((item.assets / totalAssets) * 100) : 0;
                            return (
                                <div key={item.id} className="legend-item">
                                    <span className="legend-dot" style={{ backgroundColor: item.color }} />
                                    <div className="legend-info">
                                        <span className="legend-name">{item.username}</span>
                                        <span className="legend-value">
                                            ${item.assets} ({percent}%)
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="insights-card">
                <h4>Dice Roll Distribution</h4>
                <div className="bar-chart-wrapper">
                    <svg width="100%" height="200" viewBox="0 0 440 200" preserveAspectRatio="none">
                        <defs>
                            <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="var(--color-primary, #4f8eff)" />
                                <stop offset="100%" stopColor="#8b5cf6" />
                            </linearGradient>
                        </defs>
                        {/* Horizontal gridlines */}
                        <line x1="40" y1="30" x2="420" y2="30" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                        <line x1="40" y1="95" x2="420" y2="95" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                        <line
                            x1="40"
                            y1="160"
                            x2="420"
                            y2="160"
                            stroke="rgba(255,255,255,0.05)"
                            strokeDasharray="3 3"
                        />

                        {diceSums.map((sum, idx) => {
                            const count = stats.diceRolls[sum] || 0;
                            const chartHeight = 130;
                            const barHeight = (count / maxRollCount) * chartHeight;
                            const barWidth = 22;
                            const x = 45 + idx * 34;
                            const y = 160 - barHeight;

                            return (
                                <g key={sum}>
                                    <rect
                                        x={x}
                                        y={y}
                                        width={barWidth}
                                        height={Math.max(barHeight, 2)}
                                        rx="4"
                                        fill="url(#barGradient)"
                                        className="bar-rect"
                                    />
                                    {count > 0 && (
                                        <text
                                            x={x + barWidth / 2}
                                            y={y - 6}
                                            textAnchor="middle"
                                            fill="#fff"
                                            fontSize="9"
                                            fontWeight="700"
                                        >
                                            {count}
                                        </text>
                                    )}
                                    <text
                                        x={x + barWidth / 2}
                                        y="180"
                                        textAnchor="middle"
                                        fill="rgba(255,255,255,0.5)"
                                        fontSize="10"
                                        fontWeight="600"
                                    >
                                        {sum}
                                    </text>
                                </g>
                            );
                        })}
                    </svg>
                </div>
            </div>
        </div>
    );
}

// ── PERFORMANCE SUB-TAB ───────────────────────────────────────────────────────
interface PerformanceTabProps {
    stats: GameStats;
    players: Array<Player>;
}

function PerformanceTab({ stats, players }: PerformanceTabProps) {
    // 1. Scaled Line Chart configuration for Net Worth
    const histories = players.map((p) => ({
        id: p.id,
        color: p.color || "#64748b",
        username: p.username,
        data: stats.playerStats[p.id]?.netWorthHistory || [{ turn: 0, netWorth: 1500 }],
    }));

    const maxTurn = Math.max(...histories.flatMap((h) => h.data.map((d) => d.turn)), 1);
    const allNetWorths = histories.flatMap((h) => h.data.map((d) => d.netWorth));
    const maxNW = Math.max(...allNetWorths, 2000);
    const minNW = Math.min(...allNetWorths, 0);

    const svgWidth = 1000;
    const svgHeight = 220;
    const padLeft = 55;
    const padRight = 30;
    const padTop = 20;
    const padBottom = 35;
    const chartW = svgWidth - padLeft - padRight;
    const chartH = svgHeight - padTop - padBottom;

    const getX = (turn: number) => padLeft + (turn / maxTurn) * chartW;
    const getY = (nw: number) => {
        const range = maxNW - minNW;
        if (range === 0) return padTop + chartH / 2;
        return padTop + chartH - ((nw - minNW) / range) * chartH;
    };

    // Format money labels
    const formatYVal = (val: number) => {
        if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`;
        return `$${val}`;
    };

    return (
        <div className="insights-section vertical fade-in">
            <div className="insights-card">
                <h4>Net Worth Over Turns</h4>
                <div className="line-chart-wrapper">
                    <svg width="100%" height="220" viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="none">
                        {/* Grid lines */}
                        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                            const y = padTop + chartH * ratio;
                            const val = maxNW - (maxNW - minNW) * ratio;
                            return (
                                <g key={i}>
                                    <line
                                        x1={padLeft}
                                        y1={y}
                                        x2={svgWidth - padRight}
                                        y2={y}
                                        stroke="rgba(255,255,255,0.05)"
                                    />
                                    <text
                                        x={padLeft - 10}
                                        y={y + 4}
                                        textAnchor="end"
                                        fill="rgba(255,255,255,0.4)"
                                        fontSize="11"
                                        fontFamily="monospace"
                                    >
                                        {formatYVal(val)}
                                    </text>
                                </g>
                            );
                        })}

                        {/* Line paths for each player */}
                        {histories.map((h) => {
                            if (h.data.length === 0) return null;
                            const points = h.data.map((d) => `${getX(d.turn)},${getY(d.netWorth)}`).join(" ");

                            return (
                                <g key={h.id}>
                                    <polyline
                                        points={points}
                                        fill="none"
                                        stroke={h.color}
                                        strokeWidth="4"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className="line-path"
                                        style={{ filter: `drop-shadow(0 2px 4px ${h.color}33)` }}
                                    />
                                    {h.data.length < 25 &&
                                        h.data.map((d, index) => (
                                            <circle
                                                key={index}
                                                cx={getX(d.turn)}
                                                cy={getY(d.netWorth)}
                                                r="5"
                                                fill="#14131a"
                                                stroke={h.color}
                                                strokeWidth="2.5"
                                            />
                                        ))}
                                </g>
                            );
                        })}

                        {/* X-axis turns labels */}
                        {Array.from({ length: Math.min(maxTurn + 1, 6) }, (_, i) => {
                            const turn = Math.round((maxTurn / Math.min(maxTurn, 5)) * i);
                            if (turn > maxTurn) return null;
                            return (
                                <text
                                    key={i}
                                    x={getX(turn)}
                                    y={svgHeight - 10}
                                    textAnchor="middle"
                                    fill="rgba(255,255,255,0.4)"
                                    fontSize="12"
                                    fontWeight="600"
                                >
                                    T{turn}
                                </text>
                            );
                        })}
                    </svg>
                </div>
            </div>

            <div className="insights-card">
                <h4>Financial Flow Profiles</h4>
                <div className="financial-flows-list">
                    {players.map((p) => {
                        const statsObj: PlayerStats = stats.playerStats[p.id] || {
                            totalGained: 0,
                            totalLost: 0,
                            rentPaid: 0,
                            rentReceived: 0,
                            taxesPaid: 0,
                            netWorthHistory: [],
                            doublesRolled: 0,
                            goodCardsDrawn: 0,
                            badCardsDrawn: 0,
                            jailCount: 0,
                        };

                        const totalGainLoss = statsObj.totalGained + statsObj.totalLost || 1;
                        const gainPercent = (statsObj.totalGained / totalGainLoss) * 100;
                        const lossPercent = (statsObj.totalLost / totalGainLoss) * 100;

                        return (
                            <div key={p.id} className="player-flow-row">
                                <div className="player-flow-meta">
                                    <span className="player-flow-name" style={{ color: p.color }}>
                                        {p.username}
                                    </span>
                                    <span className="player-flow-nw">Balance: ${p.balance}</span>
                                </div>

                                <div className="cash-flow-bar-container">
                                    <div className="flow-bar-labels">
                                        <span className="gain-label">Gained: ${statsObj.totalGained}</span>
                                        <span className="loss-label">Lost: ${statsObj.totalLost}</span>
                                    </div>
                                    <div className="flow-progress-bar">
                                        <div className="progress-gain" style={{ width: `${gainPercent}%` }} />
                                        <div className="progress-loss" style={{ width: `${lossPercent}%` }} />
                                    </div>
                                </div>

                                <div className="rent-flow-details">
                                    <div className="rent-flow-stat">
                                        <span>Rent Sent</span>
                                        <span className="rent-paid">${statsObj.rentPaid}</span>
                                    </div>
                                    <div className="rent-flow-stat">
                                        <span>Rent Earned</span>
                                        <span className="rent-received">${statsObj.rentReceived}</span>
                                    </div>
                                    <div className="rent-flow-stat">
                                        <span>Taxes/Fees Paid</span>
                                        <span className="tax-paid">${statsObj.taxesPaid}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// ── HOTSPOTS & ROI SUB-TAB ───────────────────────────────────────────────────
interface HotspotsTabProps {
    stats: GameStats;
    players: Array<Player>;
    getPropertyDetails: (pos: number) => any;
    getGroupColor: (g: string) => string;
}

function HotspotsTab({ stats, players, getPropertyDetails, getGroupColor }: HotspotsTabProps) {
    // 1. Calculate Top 5 Visited Hotspots
    const visitsList = Object.entries(stats.tileVisits)
        .map(([pos, count]) => ({
            position: parseInt(pos),
            count: count as number,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    const maxVisits = visitsList.length > 0 ? visitsList[0].count : 1;

    // 2. Calculate Property ROI leaderboard
    // ROI = (currentRent / totalInvested) * 100
    // Get all properties currently owned in the game
    interface RoiProp {
        propertyName: string;
        ownerName: string;
        ownerColor: string;
        groupName: string;
        investment: number;
        rent: number;
        roi: number;
        mortgaged: boolean;
    }

    const roiLeaderboard: RoiProp[] = [];

    players.forEach((p) => {
        p.properties.forEach((prop) => {
            const details = getPropertyDetails(prop.position);
            if (!details) return;

            const isMortgaged = prop.morgage === true || (prop.morgage as any) === "true";

            // Calculate investment
            const buyPrice = details.price ?? 0;
            const houseCount = typeof prop.count === "number" ? prop.count : prop.count === "h" ? 5 : 0;
            const houseCost = details.housecost ?? 0;
            const totalInvested = buyPrice + houseCount * houseCost;

            // Calculate current rent
            let currentRent = 0;
            if (!isMortgaged) {
                if (details.group === "Utilities") {
                    // Average dice roll sum is 7
                    const ownedUtilitiesCount = p.properties.filter(
                        (op) => getPropertyDetails(op.position)?.group === "Utilities",
                    ).length;
                    currentRent = 7 * (ownedUtilitiesCount === 2 ? 10 : 4);
                } else if (details.group === "Railroad") {
                    const ownedRailroadsCount = p.properties.filter(
                        (op) => getPropertyDetails(op.position)?.group === "Railroad",
                    ).length;
                    currentRent = [0, 25, 50, 100, 200][Math.min(ownedRailroadsCount, 4)];
                } else {
                    // Normal color group
                    if (houseCount === 0) {
                        // Check for group monopoly
                        const groupList = monopolyJSON.properties.filter((pj) => pj.group === details.group);
                        const ownedGroup = p.properties.filter(
                            (op) => getPropertyDetails(op.position)?.group === details.group,
                        );
                        const hasMonopoly = groupList.length > 0 && ownedGroup.length === groupList.length;
                        const allUnimproved = ownedGroup.every((op) => {
                            const opHouseCount = typeof op.count === "number" ? op.count : op.count === "h" ? 5 : 0;
                            return opHouseCount === 0;
                        });
                        const noneMortgaged = ownedGroup.every((op) => {
                            return op.morgage !== true && (op.morgage as any) !== "true";
                        });
                        currentRent = details.rent * (hasMonopoly && allUnimproved && noneMortgaged ? 2 : 1);
                    } else {
                        currentRent = details.multpliedrent[houseCount - 1] ?? details.rent;
                    }
                }
            }

            const roiPercent = totalInvested > 0 ? (currentRent / totalInvested) * 100 : 0;

            roiLeaderboard.push({
                propertyName: details.name,
                ownerName: p.username,
                ownerColor: p.color,
                groupName: details.group,
                investment: totalInvested,
                rent: currentRent,
                roi: Math.round(roiPercent),
                mortgaged: isMortgaged,
            });
        });
    });

    // Sort ROI leaderboard descending
    roiLeaderboard.sort((a, b) => b.roi - a.roi);

    return (
        <div className="insights-section fade-in">
            <div className="insights-card">
                <h4>Top 5 Board Hotspots</h4>
                <div className="hotspots-list">
                    {visitsList.map((item, idx) => {
                        const details = getPropertyDetails(item.position) || {
                            name: `Space ${item.position}`,
                            group: "Special",
                        };
                        const fillWidth = (item.count / maxVisits) * 100;
                        const color = getGroupColor(details.group);

                        return (
                            <div key={idx} className="hotspot-item">
                                <div className="hotspot-header">
                                    <div className="hotspot-title">
                                        <span className="group-color-tag" style={{ backgroundColor: color }} />
                                        <span className="hotspot-name">{details.name}</span>
                                    </div>
                                    <span className="hotspot-count">{item.count} visits</span>
                                </div>
                                <div className="hotspot-bar-outer">
                                    <div
                                        className="hotspot-bar-inner"
                                        style={{ width: `${fillWidth}%`, backgroundColor: color }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                    {visitsList.length === 0 && <p className="no-data-msg">No tiles visited yet.</p>}
                </div>
            </div>

            <div className="insights-card">
                <h4>Property ROI Yields</h4>
                <div className="roi-table-wrapper">
                    {roiLeaderboard.length === 0 ? (
                        <p className="no-data-msg">No properties owned yet. Buy spaces to see ROI statistics!</p>
                    ) : (
                        <table className="roi-table">
                            <thead>
                                <tr>
                                    <th>Property</th>
                                    <th>Owner</th>
                                    <th>Invested</th>
                                    <th>Rent</th>
                                    <th>ROI</th>
                                </tr>
                            </thead>
                            <tbody>
                                {roiLeaderboard.map((item, idx) => (
                                    <tr key={idx} className={item.mortgaged ? "mortgaged-row" : ""}>
                                        <td className="prop-name-cell">
                                            <span
                                                className="group-color-dot"
                                                style={{ backgroundColor: getGroupColor(item.groupName) }}
                                            />
                                            {item.propertyName}
                                        </td>
                                        <td style={{ color: item.ownerColor, fontWeight: "600" }}>{item.ownerName}</td>
                                        <td>${item.investment}</td>
                                        <td>{item.mortgaged ? "Mortgaged" : `$${item.rent}`}</td>
                                        <td
                                            className="roi-value-cell"
                                            style={{
                                                color: item.mortgaged
                                                    ? "rgba(255,255,255,0.3)"
                                                    : item.roi > 35
                                                      ? "#34d399"
                                                      : item.roi > 15
                                                        ? "#eab308"
                                                        : "#f87171",
                                            }}
                                        >
                                            {item.mortgaged ? "0%" : `${item.roi}%`}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── LUCK INDEX SUB-TAB ────────────────────────────────────────────────────────
interface LuckTabProps {
    stats: GameStats;
    players: Array<Player>;
}

function LuckTab({ stats, players }: LuckTabProps) {
    return (
        <div className="insights-section fade-in">
            <div className="luck-tab-header">
                <h4>Player Luck Index</h4>
                <div className="luck-help-container">
                    <span className="luck-help-trigger">ℹ️ How is this calculated?</span>
                    <div className="luck-help-tooltip">
                        <h5>True Luck Index (0-100)</h5>
                        <p>The Luck Index compares your actual rolls to mathematical expectations:</p>
                        <ul>
                            <li>
                                <strong>Dodging Rent:</strong> Rolling past expensive opponent properties and landing on
                                safe tiles instead gains Luck Points! Landing on expensive rent tiles loses Luck Points.
                            </li>
                            <li>
                                <strong>Board Opportunities:</strong> Landing on unowned properties counts as a positive
                                opportunity (<strong>+0.20</strong> luck, or <strong>+0.50</strong> if it completes a
                                monopoly).
                            </li>
                            <li>
                                <strong>Doubles & Cards:</strong> Rolling doubles or drawing positive cards adds luck;
                                going to jail or drawing bad cards subtracts luck.
                            </li>
                        </ul>
                        <div className="luck-help-footer">
                            A score of 50 is perfectly average. Above 50 is lucky; below 50 is unlucky. Trades and
                            purchases are player decisions, so they do not count.
                        </div>
                    </div>
                </div>
            </div>
            {players.map((p) => {
                const statsObj: PlayerStats = stats.playerStats[p.id] || {
                    totalGained: 0,
                    totalLost: 0,
                    rentPaid: 0,
                    rentReceived: 0,
                    taxesPaid: 0,
                    netWorthHistory: [],
                    doublesRolled: 0,
                    goodCardsDrawn: 0,
                    badCardsDrawn: 0,
                    jailCount: 0,
                    luckyEvents: 0,
                    unluckyEvents: 0,
                    cumulativeLuck: 0,
                    luckEventsCount: 0,
                };

                // Luck Score formula
                let luckScore = 50;
                let avgLuck = 0;
                if (statsObj.luckEventsCount !== undefined && statsObj.luckEventsCount > 0) {
                    avgLuck = statsObj.cumulativeLuck / statsObj.luckEventsCount;
                    luckScore = Math.round(50 + avgLuck * 50);
                } else {
                    // Fallback to event count formula if expectation fields are not defined or 0
                    const lucky = statsObj.luckyEvents ?? statsObj.doublesRolled + statsObj.goodCardsDrawn;
                    const unlucky = statsObj.unluckyEvents ?? statsObj.badCardsDrawn + statsObj.jailCount;
                    const totalEvents = lucky + unlucky;
                    if (totalEvents > 0) {
                        avgLuck = (lucky - unlucky) / totalEvents;
                        luckScore = Math.round(50 + avgLuck * 50);
                    }
                }
                luckScore = Math.max(0, Math.min(100, luckScore));

                // Luck Profile description
                let profileName = "Balanced Karma";
                let profileColor = "rgba(255,255,255,0.6)";
                if (luckScore >= 75) {
                    profileName = "Blessed by Fortune 🌟";
                    profileColor = "#eab308"; // gold
                } else if (luckScore >= 55) {
                    profileName = "Lucky Streak 🍀";
                    profileColor = "#34d399"; // emerald
                } else if (luckScore >= 45) {
                    profileName = "Balanced Karma ⚖️";
                    profileColor = "#38bdf8"; // sky
                } else if (luckScore >= 25) {
                    profileName = "Unfortunate Rolls ⚠️";
                    profileColor = "#f97316"; // orange
                } else {
                    profileName = "Cursed 💀";
                    profileColor = "#ef4444"; // red
                }

                return (
                    <div key={p.id} className="insights-card player-luck-card">
                        <div className="luck-card-header">
                            <span className="luck-player-name" style={{ color: p.color }}>
                                {p.username}
                            </span>
                            <span
                                className="luck-badge"
                                style={{
                                    color: profileColor,
                                    border: `1px solid ${profileColor}40`,
                                    backgroundColor: `${profileColor}10`,
                                }}
                            >
                                {profileName}
                            </span>
                        </div>

                        <div className="luck-score-section">
                            <div className="luck-score-circle">
                                <svg width="70" height="70" viewBox="0 0 70 70">
                                    <circle
                                        cx="35"
                                        cy="35"
                                        r="28"
                                        fill="transparent"
                                        stroke="rgba(255,255,255,0.03)"
                                        strokeWidth="6"
                                    />
                                    <circle
                                        cx="35"
                                        cy="35"
                                        r="28"
                                        fill="transparent"
                                        stroke={profileColor}
                                        strokeWidth="6"
                                        strokeDasharray={`${(luckScore / 100) * 175.9} 175.9`}
                                        transform="rotate(-90 35 35)"
                                        strokeLinecap="round"
                                    />
                                    <text x="35" y="40" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="800">
                                        {luckScore}
                                    </text>
                                </svg>
                                <span className="score-label">Luck Index</span>
                            </div>

                            <div className="luck-counters">
                                <div className="luck-counter-pill">
                                    <span className="counter-val">{statsObj.doublesRolled}</span>
                                    <span className="counter-lbl">Doubles</span>
                                </div>
                                <div className="luck-counter-pill">
                                    <span className="counter-val success">{statsObj.goodCardsDrawn}</span>
                                    <span className="counter-lbl">Good Cards</span>
                                </div>
                                <div className="luck-counter-pill">
                                    <span className="counter-val danger">{statsObj.badCardsDrawn}</span>
                                    <span className="counter-lbl">Bad Cards</span>
                                </div>
                                <div className="luck-counter-pill">
                                    <span className="counter-val warning">{statsObj.jailCount}</span>
                                    <span className="counter-lbl">Jail Stays</span>
                                </div>
                            </div>
                        </div>

                        {/* Raw Calculations & Variables breakdown */}
                        <div className="luck-calculations-details">
                            <div className="luck-details-grid">
                                <div className="luck-detail-item">
                                    <span
                                        className={`luck-detail-val ${statsObj.cumulativeLuck > 0 ? "positive" : statsObj.cumulativeLuck < 0 ? "negative" : "neutral"}`}
                                    >
                                        {statsObj.cumulativeLuck > 0 ? "+" : ""}
                                        {statsObj.cumulativeLuck.toFixed(2)}
                                    </span>
                                    <span className="luck-detail-lbl">Net Luck Points</span>
                                </div>
                                <div className="luck-detail-item">
                                    <span className="luck-detail-val neutral">{statsObj.luckEventsCount}</span>
                                    <span className="luck-detail-lbl">Turns Tracked</span>
                                </div>
                                <div className="luck-detail-item">
                                    <span
                                        className={`luck-detail-val ${avgLuck > 0 ? "positive" : avgLuck < 0 ? "negative" : "neutral"}`}
                                    >
                                        {avgLuck > 0 ? "+" : ""}
                                        {avgLuck.toFixed(3)}
                                    </span>
                                    <span className="luck-detail-lbl">Avg Roll Luck</span>
                                </div>
                            </div>

                            <div
                                className="luck-details-grid"
                                style={{ marginTop: "4px", gridTemplateColumns: "1fr 1fr" }}
                            >
                                <div className="luck-detail-item">
                                    <span className="luck-detail-val success">{statsObj.luckyEvents}</span>
                                    <span className="luck-detail-lbl">Lucky Events</span>
                                </div>
                                <div className="luck-detail-item">
                                    <span className="luck-detail-val danger">{statsObj.unluckyEvents}</span>
                                    <span className="luck-detail-lbl">Unlucky Events</span>
                                </div>
                            </div>

                            <div className="luck-formula-bar">
                                <span className="luck-formula-lbl">Luck Score Formula</span>
                                <span className="luck-formula-val">
                                    50 + ({avgLuck > 0 ? "+" : ""}
                                    {avgLuck.toFixed(3)} * 50) = {luckScore}
                                </span>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
