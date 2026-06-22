import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { Icons } from "../icons.tsx";
import HouseIcon from "/h.png";
import HotelIcon from "/ho.png";
import { translateGroup } from "./StreetCard.tsx";
import CardViewer from "./CardViewer.tsx";
import monopolyJSON from "../../../../shared/data/monopoly.json";
import { Socket } from "../../utils/sockets.ts";
import { Player } from "../../utils/player.ts";
import { CookieManager } from "../../utils/cookieManager.ts";
import { MonopolyCookie } from "../../../../shared/types/game";

interface PropertyTabProps {
    socket: Socket;
    players: Array<Player>;
    Morgage: {
        onMort: (a: number, prpName: string) => void;
        onCanc: (a: number, prpName: string) => void;
    };
    allowMortgage: boolean;
    myTurn: boolean;
    bankHouses?: number;
}
export interface PropertyTabRef {
    clickedOnBoard: (a: number) => void;
}

const PropertyTab = forwardRef<PropertyTabRef, PropertyTabProps>((props, ref) => {
    const propretyMap = new Map(
        monopolyJSON.properties.map((obj) => {
            return [obj.position ?? 0, obj];
        }),
    );

    const [currentCardPosition, SetCardPos] = useState<number>(-1);
    const [searchString, SetSearch] = useState<string>("");
    const [searchList, SetSearchList] = useState<Array<number>>([]);
    const [currentLookCard, SetLookCard] = useState<number>(-1);

    useImperativeHandle(ref, () => ({
        clickedOnBoard(a) {
            SetLookCard(-1);
            SetSearch("");
            SetSearchList([]);
            SetCardPos(a);
        },
    }));

    const mortgageApi = {
        canMortgage: (location: number) => {
            const x = propretyMap.get(location);
            const localP = props.players.filter((v) => v.id === props.socket.id)[0];

            return x !== undefined && x.group !== "Special" && localP.properties.some((v) => v.position === location);
        },
        isMortaged: (location: number) => {
            const localP = props.players.filter((v) => v.id === props.socket.id)[0];
            const a = localP.properties.find((v) => v.position === location);
            return a !== undefined && a.morgage === true;
        },
        buttons: {
            cancel: () => {
                const location = currentCardPosition;
                const localP = props.players.filter((v) => v.id === props.socket.id)[0];
                const prp = localP.properties.find((v) => v.position === location);
                if (!prp) return;

                const propData = propretyMap.get(location);
                if (!propData || propData.price === undefined) return;

                const cost = Math.round(propData.price * 0.55);
                prp.morgage = false;

                props.Morgage.onCanc(cost, propData.name ?? "");

                SetCardPos(-1);
                props.socket.emit("mortgage_action", {
                    action: "unmortgage",
                    amount: cost,
                    propertyPosition: location,
                });
            },
            pay: () => {
                const location = currentCardPosition;
                const localP = props.players.filter((v) => v.id === props.socket.id)[0];
                const prp = localP.properties.find((v) => v.position === location);
                if (!prp) return;

                if (prp.count !== 0 && prp.count !== undefined) {
                    alert("You must sell all houses/hotels on this property before mortgaging it!");
                    return;
                }

                const propData = propretyMap.get(location);
                if (!propData || propData.price === undefined) return;

                const mortgageVal = Math.round(propData.price * 0.5);
                prp.morgage = true;

                props.Morgage.onMort(mortgageVal, propData.name ?? "");

                SetCardPos(-1);
                props.socket.emit("mortgage_action", {
                    action: "mortgage",
                    amount: -mortgageVal,
                    propertyPosition: location,
                });
            },
        },
    };

    const localPlayer = props.players.filter((v) => v.id === props.socket.id)[0];

    const prp = localPlayer?.properties.find((v) => v.position === currentCardPosition);
    const propData = propretyMap.get(currentCardPosition);

    const group = prp?.group;
    const isColorGroup = prp && group && group !== "Special" && group !== "Railroad" && group !== "Utilities";

    let ownsFullSet = false;
    let hasMortgagedPropertyInGroup = false;
    let targetCount = 0;
    let canBuildEvenly = false;
    let canSellEvenly = false;
    let buildCost = 0;
    let sellRefund = 0;
    let isShortage = false;

    if (isColorGroup && propData) {
        const groupProps = Array.from(propretyMap.values()).filter((p) => p.group === group);
        const ownedGroupProps = localPlayer.properties.filter((p) => p.group === group);
        ownsFullSet = groupProps.length > 0 && ownedGroupProps.length === groupProps.length;
        hasMortgagedPropertyInGroup = ownedGroupProps.some((p) => p.morgage === true);

        const transformCount = (v: any) => {
            if (v === "h") return 5;
            return typeof v === "number" ? v : 0;
        };

        const groupCounts = ownedGroupProps.map((p) => transformCount(p.count));
        targetCount = transformCount(prp.count);

        const minCountInGroup = Math.min(...groupCounts);
        const maxCountInGroup = Math.max(...groupCounts);

        canBuildEvenly = targetCount === minCountInGroup;
        canSellEvenly = targetCount === maxCountInGroup;

        buildCost = targetCount === 4 ? (propData.ohousecost ?? 0) : (propData.housecost ?? 0);
        isShortage = targetCount === 5 && props.bankHouses !== undefined && props.bankHouses < 4;
        sellRefund = isShortage
            ? Math.round((propData.ohousecost ?? 0) * 0.5) + Math.round((propData.housecost ?? 0) * 0.5) * 4
            : targetCount === 5
              ? Math.round((propData.ohousecost ?? 0) * 0.5)
              : Math.round((propData.housecost ?? 0) * 0.5);
    }

    const handleBuild = () => {
        if (!prp || !propData) return;

        const audio = new Audio("./buying1.mp3");
        const cookieStr = CookieManager.get("monopolySettings");
        let volume = 0.5;
        if (cookieStr) {
            try {
                const cookie = JSON.parse(decodeURIComponent(cookieStr)) as MonopolyCookie;
                if (cookie.settings?.audio) {
                    volume = 0.5 * (cookie.settings.audio[1] / 100) * (cookie.settings.audio[0] / 100);
                }
            } catch (e) {
                console.error(e);
            }
        }
        audio.volume = volume;
        audio.play();

        props.socket.emit("player_action", {
            action: "buy-advance",
            newCount: targetCount + 1,
            housesAdded: 1,
            propertyPosition: currentCardPosition,
        });
    };

    const handleSell = () => {
        if (!prp || !propData) return;

        if (isShortage) {
            const confirmed = window.confirm(
                `There is a house shortage in the Bank. Selling this hotel will also sell all 4 houses on this property, reverting it to an unimproved state.\n\nYou will receive a total refund of $${sellRefund}M.\n\nAre you sure you want to proceed?`,
            );
            if (!confirmed) return;
        }

        const audio = new Audio("./moneyplus.mp3");
        const cookieStr = CookieManager.get("monopolySettings");
        let volume = 0.5;
        if (cookieStr) {
            try {
                const cookie = JSON.parse(decodeURIComponent(cookieStr)) as MonopolyCookie;
                if (cookie.settings?.audio) {
                    volume = 0.5 * (cookie.settings.audio[1] / 100) * (cookie.settings.audio[0] / 100);
                }
            } catch (e) {
                console.error(e);
            }
        }
        audio.volume = volume;
        audio.play();

        props.socket.emit("player_action", {
            action: "sell-advance",
            propertyPosition: currentCardPosition,
        });
    };
    function searchResults() {
        SetLookCard(-1);
        SetCardPos(-1);
        const safe = Array.from(propretyMap.values()).filter((v) => v.group != "Special");
        const lyricalSearch: Array<[string, number]> = safe.map((v) => [v.name, v.position]);
        const numricalSearch: Array<string> = safe.map((v) => v.position.toString());

        const s: Array<number> = [];

        for (const x of numricalSearch) {
            if (x.includes(searchString)) {
                s.push(parseInt(x));
            }
        }

        for (const y of lyricalSearch) {
            if (y[0].toLowerCase().includes(searchString.toLowerCase())) {
                s.push(y[1]);
            }
        }
        SetSearchList(s);
    }
    useEffect(searchResults, [searchString]);

    if (localPlayer === undefined) return <>Could not read local player!</>;

    return (
        <>
            <h3 style={{ textAlign: "center" }}>Propreties</h3>
            <input
                type="text"
                onChange={(e) => SetSearch(e.currentTarget.value)}
                placeholder="Search for global cards..."
            />

            <div
                className="propertyList"
                style={{
                    overflowY: "auto",
                    position: "relative",
                    flexGrow: 1,
                    cursor: "pointer",
                }}
            >
                {searchString.length > 0 ? (
                    searchList.map((v, i) => (
                        <>
                            {currentLookCard === v ? (
                                <center>
                                    <CardViewer
                                        key={i}
                                        style={{
                                            cursor: "pointer",
                                            marginBottom: 25,
                                            marginTop: 10,
                                        }}
                                        position={v}
                                        OnClick={() => {
                                            SetLookCard(-1);
                                        }}
                                    />
                                </center>
                            ) : (
                                <div key={i} onClick={() => SetLookCard(v)} className="proprety-nav">
                                    <i
                                        className="box"
                                        style={{
                                            backgroundColor: translateGroup(propretyMap.get(v)?.group ?? ""),
                                        }}
                                    ></i>
                                    <h3>{propretyMap.get(v)?.name ?? ""}</h3>
                                </div>
                            )}
                        </>
                    ))
                ) : currentCardPosition === -1 ? (
                    localPlayer.properties.map((v, i) => (
                        <div
                            key={i}
                            onClick={() => {
                                SetCardPos(v.position);
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
                                {propretyMap.get(v.position)?.name ?? ""}
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
                    ))
                ) : (
                    <div>
                        <center
                            style={{
                                transform: "scale(1) translateY(-50%) translateX(-50%)",
                                position: "absolute",
                                top: "50%",
                                left: "50%",
                            }}
                        >
                            <CardViewer
                                style={{ filter: "drop-shadow(5px 5px 0px rgba(255,255,255,20%))" }}
                                position={currentCardPosition}
                                OnClick={() => {
                                    SetCardPos(-1);
                                }}
                            />
                            {mortgageApi.canMortgage(currentCardPosition) && props.allowMortgage ? (
                                <>
                                    {" "}
                                    <h2>Actions</h2>
                                    <div
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: "10px",
                                            width: "100%",
                                            alignItems: "center",
                                            marginTop: "10px",
                                        }}
                                    >
                                        {mortgageApi.isMortaged(currentCardPosition) ? (
                                            <button
                                                className="railroads-actions"
                                                onClick={mortgageApi.buttons.cancel}
                                                style={{ width: "100%" }}
                                            >
                                                <Icons.Unlock
                                                    width={13}
                                                    height={13}
                                                    style={{ verticalAlign: "middle", marginRight: 4 }}
                                                />
                                                Unmortgage — Pay{" "}
                                                {Math.round((propretyMap.get(currentCardPosition)?.price ?? 0) * 0.55)}M
                                            </button>
                                        ) : (
                                            <button
                                                className="railroads-actions"
                                                onClick={mortgageApi.buttons.pay}
                                                style={{ width: "100%" }}
                                            >
                                                <Icons.Lock
                                                    width={13}
                                                    height={13}
                                                    style={{ verticalAlign: "middle", marginRight: 4 }}
                                                />
                                                Mortgage — Get{" "}
                                                {Math.round((propretyMap.get(currentCardPosition)?.price ?? 0) * 0.5)}M
                                            </button>
                                        )}

                                        {isColorGroup &&
                                            ownsFullSet &&
                                            !mortgageApi.isMortaged(currentCardPosition) && (
                                                <>
                                                    <button
                                                        className="railroads-actions"
                                                        style={{ width: "100%" }}
                                                        disabled={
                                                            !props.myTurn ||
                                                            hasMortgagedPropertyInGroup ||
                                                            targetCount >= 5 ||
                                                            !canBuildEvenly ||
                                                            localPlayer.balance < buildCost
                                                        }
                                                        onClick={handleBuild}
                                                        title={
                                                            !props.myTurn
                                                                ? "Not your turn"
                                                                : hasMortgagedPropertyInGroup
                                                                  ? "Cannot build: a property in this set is mortgaged"
                                                                  : targetCount >= 5
                                                                    ? "Fully built (Hotel)"
                                                                    : !canBuildEvenly
                                                                      ? "Cannot build: must build evenly across all properties in the set"
                                                                      : localPlayer.balance < buildCost
                                                                        ? "Cannot build: not enough money"
                                                                        : ""
                                                        }
                                                    >
                                                        <Icons.Home
                                                            width={13}
                                                            height={13}
                                                            style={{ verticalAlign: "middle", marginRight: 4 }}
                                                        />
                                                        {targetCount === 4 ? "Build Hotel" : "Build House"} — Pay{" "}
                                                        {buildCost}M
                                                    </button>

                                                    <button
                                                        className="railroads-actions"
                                                        style={{ width: "100%" }}
                                                        disabled={!props.myTurn || targetCount === 0 || !canSellEvenly}
                                                        onClick={handleSell}
                                                        title={
                                                            !props.myTurn
                                                                ? "Not your turn"
                                                                : targetCount === 0
                                                                  ? "No houses to sell"
                                                                  : !canSellEvenly
                                                                    ? "Cannot sell: must sell evenly across all properties in the set"
                                                                    : isShortage
                                                                      ? "Bank house shortage: hotel and all replacement houses will be sold back to the Bank."
                                                                      : ""
                                                        }
                                                    >
                                                        🪙{" "}
                                                        {isShortage
                                                            ? "Sell Hotel & Houses"
                                                            : targetCount === 5
                                                              ? "Sell Hotel"
                                                              : "Sell House"}{" "}
                                                        — Get {sellRefund}M
                                                    </button>
                                                </>
                                            )}
                                    </div>
                                </>
                            ) : (
                                <></>
                            )}
                        </center>
                    </div>
                )}
            </div>
        </>
    );
});
export default PropertyTab;
