import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

import { Icons } from "../icons";
import HouseIcon from "/h.png";
import HotelIcon from "/ho.png";
import { Player } from "../../utils/player";
import { Socket } from "../../utils/sockets";
import StreetCard, {
    StreetDisplayInfo,
    UtilitiesDisplayInfo,
    RailroadDisplayInfo,
    translateGroup,
} from "./StreetCard.tsx";
import monopolyJSON from "../../../../shared/data/monopoly.json";
import ChacneCard, { ChanceDisplayInfo } from "./SpecialCards.tsx";
import { MonopolyCookie, MonopolySettings, GameTrading, MonopolyMode } from "../../../../shared/types/game";
import Slider from "../utils/Slider.tsx";
import { CookieManager } from "../../utils/cookieManager";
import { logger } from "../../utils/logger";
interface MonopolyGameProps {
    players: Array<Player>;
    myTurn: boolean;
    socket: Socket;
    clickedOnBoard: (a: number) => void;
    tradeObj?: undefined | GameTrading | boolean;
    tradeApi: {
        onSelectPlayer: (pId: string) => void;
    };
    selectedMode: MonopolyMode;
    // Phase 2F â€” turn-flow state passed from parent
    hasRolled?: boolean;
    allowRollAgain?: boolean;
    isDebtState?: boolean;
    onDeclaredBankruptcy?: () => void;
    // Fix 5b â€” mortgage transfer choice
    mortgageTransferPending?:
        | {
              position: number;
              name: string;
              mortgageValue: number;
              interestFee: number;
              unmortgageCost: number;
          }[]
        | null;
    mortgageBankruptName?: string;
    onMortgageTransferResolve?: (choices: { position: number; action: "unmortgage" | "keep" }[]) => void;
    // Phase 2 — Property Auction state
    currentAuction?: {
        position: number;
        name: string;
        price: number;
        currentBid: number;
        bidderId: string;
        bidderName: string;
        timerSeconds: number;
        bids: Array<{ bidderName: string; amount: number }>;
    } | null;
    isSpectator?: boolean;
}
export interface MonopolyGameRef {
    diceResults: (args: { l: [number, number]; time: number; onDone: () => void }) => void;
    freeDice: () => void;
    setStreet: (args: {
        location: number;
        rolls: number;
        onResponse: (action: "nothing" | "buy" | "someones" | "special_action" | "advance-buy", info: object) => void;
    }) => void;
    chorch: (
        element: {
            title: string;
            action: string;
            tileid: string;
            groupid?: undefined;
            rentmultiplier?: undefined;
            amount?: undefined;
            subaction?: undefined;
            count?: undefined;
            buildings?: undefined;
            hotels?: undefined;
        },
        is_chance: boolean,
        time: number,
    ) => void;
    applyAnimation: (type: number) => void;
    showJailsButtons: (is_card: boolean) => void;
}

export type g_Buy = 0 | 1 | 2 | 3 | 4 | "h";

// Create the component with forwardRef
const MonopolyGame = forwardRef<MonopolyGameRef, MonopolyGameProps>((prop, ref) => {
    const propretyMap = new Map(
        monopolyJSON.properties.map((obj) => {
            return [obj.posistion ?? 0, obj];
        }),
    );

    const [showDice, SetShowDice] = useState<boolean>(false);
    const [sended, SetSended] = useState<boolean>(false);
    const [showStreet, ShowStreet] = useState<boolean>(false);
    const [advnacedStreet, SetAdvancedStreet] = useState<boolean>(false);
    const [rotation, SetRotation] = useState<number>(0);
    const [scale, SetScale] = useState<number>(1);
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
    const [timer, SetTimer] = useState<number>(0);
    // Fix 5b: local selection state for the mortgage transfer choice modal
    const [mortgageChoices, setMortgageChoices] = useState<Record<number, "unmortgage" | "keep">>({});

    // Phase 2 — Property Auction States & Handlers
    const [customBidValue, setCustomBidValue] = useState<number>(1);
    useEffect(() => {
        if (prop.currentAuction) {
            setCustomBidValue(prop.currentAuction.currentBid + 1);
        }
    }, [prop.currentAuction?.currentBid]);

    const handleBidSubmit = (bid: number) => {
        if (prop.currentAuction && bid > prop.currentAuction.currentBid) {
            prop.socket.emit("auction-bid", { bid });
        }
    };

    const handleRoll = () => {
        SetSended(true);
        prop.socket.emit("roll_dice");
        SetTimer(0);

        const localPlayer = prop.players.find((v) => v.id === prop.socket.id);
        if (localPlayer && localPlayer.isInJail) {
            const payElement = document.querySelector(`button[data-button-type="pay"]`) as HTMLButtonElement;
            const cardElement = document.querySelector(`button[data-button-type="card"]`) as HTMLButtonElement;
            if (payElement) {
                payElement.onclick = null;
                payElement.setAttribute("aria-disabled", "true");
                payElement.style.translate = "0px 0px";
            }
            if (cardElement) {
                cardElement.onclick = null;
                cardElement.setAttribute("aria-disabled", "true");
            }
        }
    };

    useEffect(() => {
        const settings_interval = setInterval(() => {
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
        }, 200);

        return () => {
            clearInterval(settings_interval);
        };
    }, [document.cookie]);

    const [streetDisplay, SetStreetDisplay] = useState<
        StreetDisplayInfo | UtilitiesDisplayInfo | RailroadDisplayInfo | ChanceDisplayInfo
    >({
        cardCost: -1,
        hotelsCost: -1,
        housesCost: -1,
        multpliedrent: [-1, -1, -1, -1, -1],
        rent: -1,
        rentWithColorSet: -1,
        title: "deafult",
        type: "electricity",
    } as UtilitiesDisplayInfo);

    const [streetType, SetStreetType] = useState<"Street" | "Utilities" | "Railroad" | "Chance" | "CommunityChest">(
        "Street",
    );

    function diceAnimation(a: number, b: number) {
        const element = document.getElementById("dice-panel") as HTMLDivElement;

        let bb = true;

        function randomCube() {
            const l = "./c";
            const numA = Math.floor(Math.random() * 6) + 1;
            const numB = Math.floor(Math.random() * 6) + 1;
            element.innerHTML = `
                <img src="${l}${numA}.png" />
                <img src="${l}${numB}.png" />
                
                `;
        }
        function anim() {
            if (bb) {
                randomCube();

                requestAnimationFrame(anim);
            } else {
                const l = "./c";
                element.innerHTML = `
                <img src="${l}${a}.png" />
                <img src="${l}${b}.png" />
                `;
            }
        }
        setTimeout(() => {
            bb = false;
        }, 1000);

        requestAnimationFrame(anim);
    }
    function applyAnimation(type: number) {
        const element = document.querySelector("img#moneyAnimations");
        if (element === null) return;
        const imageElement = element as HTMLImageElement;
        imageElement.setAttribute("data-anim", "0");
        requestAnimationFrame(() => {
            imageElement.setAttribute("data-anim", type.toString());
            setTimeout(() => {
                imageElement.setAttribute("data-anim", "0");
            }, 1000);
        });
    }
    function swipeSound() {
        const _settings = settings;
        const audio = new Audio("./card.mp3");
        audio.volume = ((_settings?.audio[1] ?? 100) / 100) * ((_settings?.audio[0] ?? 100) / 100);
        audio.loop = false;
        audio.play();
    }

    const localFreeDice = () => {
        const element = document.getElementById("dice-panel") as HTMLDivElement;
        if (element) {
            element.innerHTML = "";
        }
        SetSended(false);
    };

    useImperativeHandle(ref, () => ({
        diceResults: (args) => {
            diceAnimation(...args.l);
            SetShowDice(true);
            setTimeout(() => {
                SetShowDice(false);
                args.onDone();
            }, args.time);
        },
        freeDice: () => {
            localFreeDice();
        },
        setStreet: (args) => {
            // find data based on location
            const localPlayer = prop.players.filter((v) => v.id === prop.socket.id)[0];
            const x = propretyMap.get(args.location);

            if (x && args.location !== -1 && args.location < 40 && args.location >= 0) {
                function searchForButtons(
                    advanced: boolean,
                    location: number,
                    fartherInfo?: {
                        rolls: number;
                    },
                ) {
                    function clickSound() {
                        const _settings = settings;
                        const audio = new Audio("./click.mp3");
                        audio.volume = ((_settings?.audio[1] ?? 100) / 100) * ((_settings?.audio[0] ?? 100) / 100);
                        audio.loop = false;
                        audio.play();
                    }
                    function func() {
                        if (advanced) {
                            const b = document.querySelector("div#advanced-responses");

                            if (b) {
                                const _property = propretyMap.get(location);
                                if (!_property) return;
                                const divB = b as HTMLDivElement;
                                while (divB.firstChild) {
                                    divB.removeChild(divB.firstChild);
                                }
                                const propId = Array.from(
                                    new Map(localPlayer.properties.map((v, i) => [i, v])).entries(),
                                ).filter((v) => v[1].posistion === args.location)[0][0];

                                function transformCount(v: 0 | 2 | 1 | 3 | 4 | "h") {
                                    switch (v) {
                                        case "h":
                                            return 5;

                                        default:
                                            return v;
                                    }
                                }
                                const count: number = transformCount(localPlayer.properties[propId].count);

                                const propertyGroupCount = Array.from(propretyMap.values()).filter(
                                    (p) => p.group === _property.group,
                                ).length;
                                const playerGroupCount = localPlayer.properties.filter(
                                    (p) => p.group === _property.group,
                                ).length;
                                const ownsFullSet = propertyGroupCount > 0 && propertyGroupCount === playerGroupCount;

                                for (let index = count + 1; index < 6; index++) {
                                    const myButton = document.createElement("button");
                                    if (index === 5) {
                                        myButton.innerHTML = `buy hotel`;
                                        // dont let someone buy hotel of not have a set of 4 houses
                                        myButton.disabled =
                                            !ownsFullSet ||
                                            index !== count + 1 ||
                                            (_property.ohousecost ?? 0) >
                                                (prop.players.filter((v) => v.id === prop.socket.id)[0].balance ?? 0);
                                        myButton.onclick = () => {
                                            args.onResponse("advance-buy", {
                                                state: index,
                                                money: 1,
                                            });
                                            ShowStreet(false);
                                        };
                                    } else {
                                        myButton.innerHTML = `buy ${index} house${index > 1 ? "s" : ""}`;
                                        myButton.onclick = () => {
                                            args.onResponse("advance-buy", {
                                                state: index,
                                                money: index - count,
                                            });
                                            ShowStreet(false);
                                        };
                                        myButton.disabled =
                                            !ownsFullSet ||
                                            (index - count) * (_property.housecost ?? 0) >
                                                (prop.players.filter((v) => v.id === prop.socket.id)[0].balance ?? 0);
                                    }
                                    divB.appendChild(myButton);
                                }
                                // last button of cancel
                                const continueButtons = document.createElement("button");
                                continueButtons.innerHTML = "CONTINUE";
                                continueButtons.onclick = () => {
                                    clickSound();
                                    args.onResponse("nothing", {});
                                    ShowStreet(false);
                                };
                                divB.appendChild(continueButtons);
                            } else {
                                requestAnimationFrame(func);
                            }
                        } else {
                            const b = document.querySelector("button#card-response-yes");

                            if (b) {
                                (b as HTMLButtonElement).onclick = () => {
                                    if (fartherInfo !== undefined)
                                        args.onResponse("special_action", {
                                            rolls: fartherInfo.rolls,
                                        });
                                    else args.onResponse("buy", {});
                                    ShowStreet(false);
                                };
                                (document.querySelector("button#card-response-no") as HTMLButtonElement).onclick =
                                    () => {
                                        clickSound();
                                        args.onResponse("nothing", {});
                                        ShowStreet(false);
                                    };
                            } else {
                                requestAnimationFrame(func);
                            }
                        }
                    }
                    return func;
                }

                let belong_to_me = false;
                let belong_to_others = false;
                let count: 0 | 1 | 2 | 3 | 4 | "h" = 0;
                // check states
                for (const _prp of localPlayer.properties) {
                    if (!belong_to_me && _prp.posistion === args.location) {
                        belong_to_me = true;
                        count = _prp.count;
                    }
                }
                for (const _p of prop.players) {
                    for (const _prp of _p.properties) {
                        if (_prp.posistion === args.location && _p.id != localPlayer.id) belong_to_others = true;
                    }
                }

                if (x.group === "Special") {
                    args.onResponse("nothing", {});
                    ShowStreet(false);
                } else if (x.group === "Utilities") {
                    if (!belong_to_me) {
                        if (belong_to_others) {
                            args.onResponse("someones", {});
                            ShowStreet(false);
                            return;
                        } else {
                            if (localPlayer.balance - (x?.price ?? 0) < 0) {
                                ShowStreet(false);
                                args.onResponse("nothing", {});
                                return;
                            } else {
                                SetStreetType("Utilities");
                                const streetInfo = {
                                    cardCost: x.price ?? -1,
                                    title: x.name ?? "error",
                                    type: x.id.includes("water") ? "water" : "electricity",
                                } as UtilitiesDisplayInfo;
                                SetStreetDisplay(streetInfo);
                                SetAdvancedStreet(false);

                                swipeSound();
                                ShowStreet(true);
                                requestAnimationFrame(
                                    searchForButtons(false, args.location, {
                                        rolls: args.rolls,
                                    }),
                                );
                            }
                        }
                    } else {
                        args.onResponse("nothing", {});
                    }
                } else if (x.group === "Railroad") {
                    if (!belong_to_me) {
                        if (belong_to_others) {
                            args.onResponse("someones", {});
                            ShowStreet(false);
                            return;
                        } else {
                            if (localPlayer.balance - (x?.price ?? 0) < 0) {
                                ShowStreet(false);
                                args.onResponse("nothing", {});
                                return;
                            } else {
                                SetStreetType("Railroad");
                                const streetInfo = {
                                    cardCost: x.price ?? -1,
                                    title: x.name ?? "error",
                                } as UtilitiesDisplayInfo;
                                SetStreetDisplay(streetInfo);
                                SetAdvancedStreet(false);
                                swipeSound();
                                ShowStreet(true);
                                requestAnimationFrame(searchForButtons(false, args.location));
                            }
                        }
                    } else {
                        args.onResponse("nothing", {});
                    }
                } else {
                    if (!belong_to_me && localPlayer.balance - (x?.price ?? 0) < 0) {
                        ShowStreet(false);
                        args.onResponse("nothing", {});
                        return;
                    }

                    if (!belong_to_me && belong_to_others) {
                        args.onResponse("someones", {});
                        ShowStreet(false);
                        return;
                    }
                    if (belong_to_me && count === "h") {
                        ShowStreet(false);
                        args.onResponse("nothing", {});
                        return;
                    }
                    SetStreetType("Street");
                    const streetInfo = {
                        cardCost: x.price ?? -1,
                        hotelsCost: x.ohousecost ?? -1,
                        housesCost: x.housecost ?? -1,
                        rent: x.rent ?? -1,
                        multpliedrent: x.multpliedrent
                            ? [
                                  x.multpliedrent[0] ?? -1,
                                  x.multpliedrent[1] ?? -1,
                                  x.multpliedrent[2] ?? -1,
                                  x.multpliedrent[3] ?? -1,
                                  x.multpliedrent[4] ?? -1,
                              ]
                            : [-1, -1, -1, -1, -1],
                        rentWithColorSet: x.rent ? x.rent * 2 : -1,
                        title: x.name ?? "error",
                        group: x.group,
                    } as StreetDisplayInfo;
                    SetStreetDisplay(streetInfo);
                    belong_to_me ? SetAdvancedStreet(true) : SetAdvancedStreet(false);
                    swipeSound();
                    ShowStreet(true);
                    requestAnimationFrame(searchForButtons(belong_to_me, args.location));
                }
            } else {
                args.onResponse("nothing", {});
                ShowStreet(false);
            }
        },
        chorch(element, is_chance, time) {
            SetStreetType(is_chance ? "Chance" : "CommunityChest");
            SetStreetDisplay({
                title: element.title,
            } as ChanceDisplayInfo);
            swipeSound();
            ShowStreet(true);
            setTimeout(() => {
                ShowStreet(false);
            }, time);
        },
        applyAnimation(type) {
            applyAnimation(type);
        },
        showJailsButtons: (is_card: boolean) => {
            const payElement = document.querySelector(`button[data-button-type="pay"]`) as HTMLButtonElement;
            const cardElement = document.querySelector(`button[data-button-type="card"]`) as HTMLButtonElement;

            function returnToNormal() {
                SetTimer(0);
                SetSended(true);
                cardElement.onclick = () => {};
                cardElement.setAttribute("aria-disabled", "true");
                setTimeout(() => {
                    cardElement.setAttribute("aria-disabled", "true");
                }, 300);

                payElement.style.translate = "0px 0px";
                payElement.onclick = () => {};
                payElement.setAttribute("aria-disabled", "true");
                setTimeout(() => {
                    payElement.setAttribute("aria-disabled", "true");
                }, 300);
            }

            payElement.setAttribute("aria-disabled", "false");
            payElement.onclick = () => {
                // handle paying
                applyAnimation(1);

                prop.socket.emit("unjail", "pay");
                prop.socket.emit("roll_dice");
                console.warn("pay");

                returnToNormal();
            };

            if (is_card) {
                const cardButton = cardElement as HTMLButtonElement;
                cardButton.setAttribute("aria-disabled", "false");
                cardButton.onclick = () => {
                    // take 1 card
                    prop.socket.emit("unjail", "card");
                    prop.socket.emit("roll_dice");
                    console.warn("card");
                    returnToNormal();
                };
            }
        },
    }));

    useEffect(() => {
        // Rotation and Scale with mouse
        (document.getElementById("locations") as HTMLDivElement).onwheel = (e) => {
            if (e.shiftKey) {
                SetScale((old) => old + (e.deltaY * (settings !== undefined ? settings.accessibility[1] : 5)) / 5000);
            } else {
                SetRotation(
                    (old) => old + (e.deltaY * (settings !== undefined ? settings.accessibility[0] : 45)) / 100,
                );
            }
        };
        // Clicking Street
        const safe = Array.from(propretyMap.values()).filter((v) => v.group != "Special");
        for (const x of safe) {
            const element = (document.getElementById("locations") as HTMLDivElement).querySelector(
                `div.street[data-position="${x.posistion}"]`,
            ) as HTMLDivElement;

            element.onclick = () => {
                prop.clickedOnBoard(x.posistion);
            };

            element.onmousemove = () => {
                element.style.cursor = "pointer";
                element.style.backgroundColor = "rgba(0,0,0,15%)";
            };
            element.onmouseleave = () => {
                element.style.cursor = "unset";
                element.style.scale = "1";
                element.style.backgroundColor = "rgba(0,0,0,0%)";
            };
        }
    }, [settings]);

    useEffect(() => {
        let continue_to_animate = true;
        const animate = () => {
            for (const x of prop.players.filter((v) => !v.isBankrupt)) {
                const location = x.position;
                const icon = x.icon + 1;
                const injail = x.isInJail && x.position === 10;

                const elementSearch = document.querySelector(`div.player[player-id="${x.id}"]`);
                if (elementSearch !== null) {
                    const _img = elementSearch.querySelector("div") as HTMLDivElement;
                    _img.style.rotate = `${-rotation}deg`;
                    _img.style.aspectRatio = "1";
                    if (settings === undefined || settings.accessibility[4] === true) {
                        _img.setAttribute("data-tooltip-color", x.color);
                    } else if (_img.hasAttribute("data-tooltip-color")) {
                        (_img.querySelector("img") as HTMLImageElement).style.filter = ``;
                        _img.removeAttribute("data-tooltip-color");
                    }

                    // check if loaction is the same
                    const pos = elementSearch.parentElement?.getAttribute("data-position") as string;
                    if (parseInt(pos) !== x.position) {
                        elementSearch.parentElement?.removeChild(elementSearch);
                        document.querySelector(`div.street[data-position="${location}"]`)?.appendChild(elementSearch);
                    }
                    if (!injail && elementSearch.querySelector("img.jailIcon") != null) {
                        const div = elementSearch.querySelector("div") as HTMLDivElement;
                        const jailIcon = div.querySelector("img.jailIcon") as HTMLImageElement;
                        div.removeChild(jailIcon);
                    }

                    if (injail && elementSearch.querySelector("img.jailIcon") == null) {
                        while (elementSearch.firstChild) {
                            elementSearch.removeChild(elementSearch.firstChild);
                        }

                        const secondDiv = document.createElement("div");
                        secondDiv.setAttribute("data-tooltip-hover", x.username);
                        const image = document.createElement("img");
                        image.src = `./p${icon}.png`;
                        secondDiv.appendChild(image);

                        const jimage = document.createElement("img");
                        jimage.src = `./jail.png`;
                        jimage.className = "jailIcon";
                        secondDiv.appendChild(jimage);
                        elementSearch.appendChild(secondDiv);
                    }
                } else {
                    // Create
                    const element = document.createElement("div");
                    element.className = "player";
                    element.setAttribute("player-id", x.id);
                    element.setAttribute("player-position", x.position.toString());
                    const secondDiv = document.createElement("div");
                    secondDiv.setAttribute("data-tooltip-hover", x.username);
                    const image = document.createElement("img");
                    image.src = `./p${icon}.png`;
                    secondDiv.appendChild(image);
                    element.appendChild(secondDiv);
                    if (injail) {
                        const jimage = document.createElement("img");
                        jimage.src = `./jail.png`;
                        jimage.className = "jailIcon";
                        element.appendChild(jimage);
                    }

                    document.querySelector(`div.street[data-position="${location}"]`)?.appendChild(element);
                }
            }

            function propertiesDisplay() {
                const folder = document.getElementById("display-houses") as HTMLDivElement;
                // remove all older proprerties!
                const allStreets = Array.from(folder.querySelectorAll("div.street-houses"));
                for (const _st of allStreets) {
                    const st = _st as HTMLDivElement;
                    while (st.firstChild) {
                        st.removeChild(st.firstChild);
                    }
                    st.onclick = () => {};
                    st.style.cursor = "unset";
                    st.style.backgroundColor = "rgba(0,0,0,0%)";
                    st.style.padding = "0px";
                    st.innerHTML = "";
                    st.setAttribute("data-tooltip-hover", "");
                    st.style.zIndex = "unset";
                    st.style.boxShadow = "";
                }
                const streetsFolder = document.getElementById("display-streets") as HTMLDivElement;
                if (streetsFolder) {
                    const allStreetEls = Array.from(streetsFolder.querySelectorAll("div.street"));
                    for (const el of allStreetEls) {
                        el.classList.remove("is-mortgaged");
                    }
                }
                for (const _player of prop.players) {
                    for (const _prp of _player.properties) {
                        const location = _prp.posistion;
                        const state = _prp.count;

                        if (streetsFolder) {
                            const streetElement = streetsFolder.querySelector(
                                `div.street[data-position="${location}"]`,
                            ) as HTMLDivElement;
                            if (streetElement && (_prp.morgage === true || (_prp.morgage as any) === "true")) {
                                streetElement.classList.add("is-mortgaged");
                            }
                        }

                        const queryElement = folder.querySelector(`div.street-houses[data-position="${location}"`);
                        if (queryElement != null) {
                            // add new propertie
                            const st = queryElement as HTMLDivElement;
                            st.setAttribute("data-tooltip-hover", _player.username);

                            st.onclick = () => {
                                const element = document.querySelector(
                                    `div.player[player-id="${_player.id}"]`,
                                ) as HTMLDivElement;
                                element.style.animation = "spin2 1s cubic-bezier(.21, 1.57, .55, 1) infinite";
                                setTimeout(() => {
                                    element.style.animation = "";
                                }, 1 * 1000);
                            };

                            st.style.cursor = "pointer";

                            st.style.zIndex = "5";
                            switch (state) {
                                case 0:
                                    st.style.backgroundColor = "rgba(0,0,0,25%)";
                                    if (settings === undefined || settings?.accessibility[4]) {
                                        st.style.backgroundColor = _player.color;
                                        st.style.boxShadow = "0px 0px 5px black";
                                    }
                                    let payment_ammount = 0;
                                    if (_prp.group === "Railroad") {
                                        const count = _player.properties
                                            .filter((v) => v.group === "Railroad")
                                            .filter(
                                                (v) =>
                                                    v.morgage === undefined ||
                                                    (v.morgage !== undefined && v.morgage === false),
                                            ).length;
                                        const rents = [0, 25, 50, 100, 200];
                                        payment_ammount = rents[count];
                                    } else if (_prp.group === "Utilities" && _prp.rent) {
                                        const multy_ =
                                            _player.properties.filter((v) => v.group === "Utilities").length === 2
                                                ? 10
                                                : 4;
                                        payment_ammount = _prp.rent * multy_;
                                    }

                                    if (payment_ammount !== 0) {
                                        st.innerHTML = `<p>${payment_ammount}M</p>`;
                                        st.style.backgroundColor = "rgba(0,0,0,75%)";
                                        if (settings === undefined || settings?.accessibility[4]) {
                                            st.style.backgroundColor = `${_player.color}`;
                                            st.style.boxShadow = "0px 0px 5px black";
                                        }
                                    }
                                    break;

                                case 1:
                                case 2:
                                case 3:
                                case 4:
                                    for (let index = 0; index < state; index++) {
                                        const image = document.createElement("img");
                                        image.src = HouseIcon.replace("public/", "");
                                        st.appendChild(image);
                                    }
                                    break;
                                case "h":
                                    const image = document.createElement("img");
                                    image.src = HotelIcon.replace("public/", "");
                                    st.appendChild(image);
                                    break;

                                default:
                                    break;
                            }
                        }
                    }
                }
            }
            propertiesDisplay();

            if (continue_to_animate) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);

        return () => {
            continue_to_animate = false;
        };
    }, [prop.players, rotation]);

    useEffect(() => {
        let l: NodeJS.Timeout | undefined = undefined;
        if (prop.myTurn && !sended) {
            if (prop.selectedMode.turnTimer !== undefined && prop.selectedMode.turnTimer > 0) {
                let x = 0;
                l = setInterval(() => {
                    x += 1;
                    SetTimer(x);
                    if (prop.selectedMode.turnTimer !== undefined && prop.selectedMode.turnTimer > 0) {
                        if (x >= prop.selectedMode.turnTimer) {
                            if (prop.myTurn && !sended) {
                                const rollElement = document.querySelector(
                                    `button[data-button-type="roll"]`,
                                ) as HTMLButtonElement;
                                const endTurnElement = document.getElementById("btn-end-turn") as HTMLButtonElement;
                                const cardNoElement = document.querySelector(
                                    "button#card-response-no",
                                ) as HTMLButtonElement;
                                const continueElement = Array.from(
                                    document.querySelectorAll("div#advanced-responses button"),
                                ).find((btn) => btn.textContent?.includes("CONTINUE")) as HTMLButtonElement;

                                if (rollElement) {
                                    rollElement.click();
                                } else if (endTurnElement) {
                                    endTurnElement.click();
                                } else if (cardNoElement) {
                                    cardNoElement.click();
                                } else if (continueElement) {
                                    continueElement.click();
                                }
                                SetTimer(0);
                                clearInterval(l);
                            }
                        }
                    }
                }, 1000);
            }
        }

        return () => {
            clearInterval(l);
            SetTimer(0);
            logger.debug("stopped");
        };
    }, [prop.myTurn, sended, prop.selectedMode]);
    return (
        <>
            <div className="game" style={prop.tradeObj !== undefined ? { translate: "0px -100%" } : {}}>
                {prop.isSpectator && (
                    <>
                        <style>{`
                            .spectator-banner {
                                position: fixed;
                                top: 20px;
                                left: 50%;
                                transform: translateX(-50%);
                                z-index: 10000;
                                background: rgba(15, 23, 42, 0.65);
                                backdrop-filter: blur(12px);
                                border: 1px solid rgba(255, 255, 255, 0.15);
                                padding: 8px 16px;
                                border-radius: 9999px;
                                box-shadow: 0 4px 20px rgba(0,0,0,0.4);
                                pointer-events: none;
                                font-family: 'Outfit', sans-serif;
                            }
                            .spectator-badge-container {
                                display: flex;
                                align-items: center;
                                gap: 8px;
                            }
                            .spectator-text {
                                font-size: 0.85rem;
                                font-weight: 600;
                                color: #cbd5e1;
                                letter-spacing: 0.05em;
                            }
                            .spectator-ping {
                                width: 8px;
                                height: 8px;
                                background-color: #3b82f6;
                                border-radius: 50%;
                                position: relative;
                            }
                            .spectator-ping::after {
                                content: '';
                                position: absolute;
                                top: 0; left: 0; right: 0; bottom: 0;
                                border-radius: 50%;
                                background-color: #3b82f6;
                                animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
                            }
                            @keyframes ping {
                                75%, 100% {
                                    transform: scale(2.5);
                                    opacity: 0;
                                }
                            }
                        `}</style>
                        <div className="spectator-banner animate-fade">
                            <div className="spectator-badge-container">
                                <span className="spectator-ping"></span>
                                <span className="spectator-text">SPECTATING GAME</span>
                            </div>
                        </div>
                    </>
                )}
                <div style={{ overflowY: "hidden" }}>
                    <div id="dice-panel" data-show={showDice}></div>
                    <div
                        className="board"
                        style={{
                            transform: `translateX(-50%) translateY(-50%) rotate(${rotation}deg) scale(${scale})`,
                        }}
                        id="locations"
                    >
                        <div id="display-houses">
                            <div
                                data-position="39"
                                data-rotate="4"
                                className="street-houses"
                                style={{
                                    top: "83%",
                                    left: "93.5%",
                                }}
                            ></div>
                            <div
                                data-position="37"
                                data-rotate="4"
                                className="street-houses"
                                style={{
                                    top: "66.5%",
                                    left: "93.5%",
                                }}
                            ></div>
                            <div
                                data-position="35"
                                data-rotate="4"
                                className="street-houses"
                                style={{
                                    top: "50%",
                                    left: "93.5%",
                                }}
                            ></div>
                            <div
                                data-position="34"
                                data-rotate="4"
                                className="street-houses"
                                style={{
                                    top: "41.75%",
                                    left: "93.5%",
                                }}
                            ></div>
                            <div
                                data-position="32"
                                data-rotate="4"
                                className="street-houses"
                                style={{
                                    top: "25.5%",
                                    left: "93.5%",
                                }}
                            ></div>
                            <div
                                data-position="31"
                                data-rotate="4"
                                className="street-houses"
                                style={{
                                    top: "17.25%",
                                    left: "93.5%",
                                }}
                            ></div>
                            <div
                                data-position="29"
                                data-rotate="3"
                                className="street-houses"
                                style={{
                                    top: "6.5%",
                                    left: "83%",
                                }}
                            ></div>
                            <div
                                data-position="28"
                                data-rotate="3"
                                className="street-houses"
                                style={{
                                    top: "6.5%",
                                    left: "74.75%",
                                }}
                            ></div>
                            <div
                                data-position="27"
                                data-rotate="3"
                                className="street-houses"
                                style={{
                                    top: "6.5%",
                                    left: "66.5%",
                                }}
                            ></div>
                            <div
                                data-position="26"
                                data-rotate="3"
                                className="street-houses"
                                style={{
                                    top: "6.5%",
                                    left: "58.25%",
                                }}
                            ></div>
                            <div
                                data-position="25"
                                data-rotate="3"
                                className="street-houses"
                                style={{
                                    top: "6.5%",
                                    left: "50%",
                                }}
                            ></div>
                            <div
                                data-position="24"
                                data-rotate="3"
                                className="street-houses"
                                style={{
                                    top: "6.5%",
                                    left: "41.75%",
                                }}
                            ></div>
                            <div
                                data-position="23"
                                data-rotate="3"
                                className="street-houses"
                                style={{
                                    top: "6.5%",
                                    left: "33.5%",
                                }}
                            ></div>
                            <div
                                data-position="21"
                                data-rotate="3"
                                className="street-houses"
                                style={{
                                    top: "6.5%",
                                    left: "17.25%",
                                }}
                            ></div>

                            <div
                                data-position="19"
                                data-rotate="2"
                                className="street-houses"
                                style={{
                                    top: "17.25%",
                                    left: "6.5%",
                                }}
                            ></div>

                            <div
                                data-position="18"
                                data-rotate="2"
                                className="street-houses"
                                style={{
                                    top: "25.5%",
                                    left: "6.5%",
                                }}
                            ></div>

                            <div
                                data-position="16"
                                data-rotate="2"
                                className="street-houses"
                                style={{
                                    top: "41.75%",
                                    left: "6.5%",
                                }}
                            ></div>

                            <div
                                data-position="15"
                                data-rotate="2"
                                className="street-houses"
                                style={{
                                    top: "50%",
                                    left: "6.5%",
                                }}
                            ></div>

                            <div
                                data-position="14"
                                data-rotate="2"
                                className="street-houses"
                                style={{
                                    top: "58.25%",
                                    left: "6.5%",
                                }}
                            ></div>

                            <div
                                data-position="13"
                                data-rotate="2"
                                className="street-houses"
                                style={{
                                    top: "66.5%",
                                    left: "6.5%",
                                }}
                            ></div>
                            <div
                                data-position="12"
                                data-rotate="2"
                                className="street-houses"
                                style={{
                                    top: "74.75%",
                                    left: "6.5%",
                                }}
                            ></div>

                            <div
                                data-position="11"
                                data-rotate="2"
                                className="street-houses"
                                style={{
                                    top: "83%",
                                    left: "6.5%",
                                }}
                            ></div>

                            <div
                                data-position="9"
                                data-rotate="1"
                                className="street-houses"
                                style={{
                                    top: "93.5%",
                                    left: "17.25%",
                                }}
                            ></div>

                            <div
                                data-position="8"
                                data-rotate="1"
                                className="street-houses"
                                style={{
                                    top: "93.5%",
                                    left: "25.5%",
                                }}
                            ></div>

                            <div
                                data-position="6"
                                data-rotate="1"
                                className="street-houses"
                                style={{
                                    top: "93.5%",
                                    left: "41.75%",
                                }}
                            ></div>
                            <div
                                data-position="5"
                                data-rotate="1"
                                className="street-houses"
                                style={{
                                    top: "93.5%",
                                    left: "50%",
                                }}
                            ></div>
                            <div
                                data-position="3"
                                data-rotate="1"
                                className="street-houses"
                                style={{
                                    top: "93.5%",
                                    left: "66.5%",
                                }}
                            ></div>
                            <div
                                data-position="1"
                                data-rotate="1"
                                className="street-houses"
                                style={{
                                    top: "93.5%",
                                    left: "83%",
                                }}
                            ></div>
                        </div>
                        <div id="display-streets">
                            <div
                                data-position="39"
                                className="street"
                                style={{
                                    width: 120,
                                    height: 75,
                                    top: "83%",
                                    left: "93.5%",
                                }}
                            ></div>
                            <div
                                data-position="38"
                                className="street"
                                style={{
                                    width: 120,
                                    height: 75,
                                    top: "74.25%",
                                    left: "93.5%",
                                }}
                            ></div>
                            <div
                                data-position="37"
                                className="street"
                                style={{
                                    width: 120,
                                    height: 75,
                                    top: "66.5%",
                                    left: "93.5%",
                                }}
                            ></div>
                            <div
                                data-position="36"
                                className="street"
                                style={{
                                    width: 120,
                                    height: 75,
                                    top: "58.25%",
                                    left: "93.5%",
                                }}
                            ></div>
                            <div
                                data-position="35"
                                className="street"
                                style={{
                                    width: 120,
                                    height: 75,
                                    top: "50%",
                                    left: "93.5%",
                                }}
                            ></div>
                            <div
                                data-position="34"
                                className="street"
                                style={{
                                    width: 120,
                                    height: 75,
                                    top: "41.75%",
                                    left: "93.5%",
                                }}
                            ></div>
                            <div
                                data-position="33"
                                className="street"
                                style={{
                                    width: 120,
                                    height: 75,
                                    top: "33.5%",
                                    left: "93.5%",
                                }}
                            ></div>
                            <div
                                data-position="32"
                                className="street"
                                style={{
                                    width: 120,
                                    height: 75,
                                    top: "25.5%",
                                    left: "93.5%",
                                }}
                            ></div>
                            <div
                                data-position="31"
                                className="street"
                                style={{
                                    width: 120,
                                    height: 75,
                                    top: "17.25%",
                                    left: "93.5%",
                                }}
                            ></div>
                            <div
                                data-position="30"
                                className="street"
                                style={{
                                    width: 120,
                                    height: 120,
                                    top: "6.5%",
                                    left: "93.5%",
                                }}
                            ></div>
                            <div
                                data-position="29"
                                className="street"
                                style={{
                                    width: 75,
                                    height: 120,
                                    top: "6.5%",
                                    left: "83%",
                                }}
                            ></div>
                            <div
                                data-position="28"
                                className="street"
                                style={{
                                    width: 75,
                                    height: 120,
                                    top: "6.5%",
                                    left: "74.75%",
                                }}
                            ></div>
                            <div
                                data-position="27"
                                className="street"
                                style={{
                                    width: 75,
                                    height: 120,
                                    top: "6.5%",
                                    left: "66.5%",
                                }}
                            ></div>
                            <div
                                data-position="26"
                                className="street"
                                style={{
                                    width: 75,
                                    height: 120,
                                    top: "6.5%",
                                    left: "58.25%",
                                }}
                            ></div>
                            <div
                                data-position="25"
                                className="street"
                                style={{
                                    width: 75,
                                    height: 120,
                                    top: "6.5%",
                                    left: "50%",
                                }}
                            ></div>
                            <div
                                data-position="24"
                                className="street"
                                style={{
                                    width: 75,
                                    height: 120,
                                    top: "6.5%",
                                    left: "41.75%",
                                }}
                            ></div>
                            <div
                                data-position="23"
                                className="street"
                                style={{
                                    width: 75,
                                    height: 120,
                                    top: "6.5%",
                                    left: "33.5%",
                                }}
                            ></div>
                            <div
                                data-position="22"
                                className="street"
                                style={{
                                    width: 75,
                                    height: 120,
                                    top: "6.5%",
                                    left: "25.5%",
                                }}
                            ></div>
                            <div
                                data-position="21"
                                className="street"
                                style={{
                                    width: 75,
                                    height: 120,
                                    top: "6.5%",
                                    left: "17.25%",
                                }}
                            ></div>

                            <div
                                data-position="20"
                                className="street"
                                style={{
                                    width: 120,
                                    height: 120,
                                    top: "6.5%",
                                    left: "6.5%",
                                }}
                            ></div>

                            <div
                                data-position="19"
                                className="street"
                                style={{
                                    width: 120,
                                    height: 75,
                                    top: "17.25%",
                                    left: "6.5%",
                                }}
                            ></div>

                            <div
                                data-position="18"
                                className="street"
                                style={{
                                    width: 120,
                                    height: 75,
                                    top: "25.5%",
                                    left: "6.5%",
                                }}
                            ></div>

                            <div
                                data-position="17"
                                className="street"
                                style={{
                                    width: 120,
                                    height: 75,
                                    top: "33.5%",
                                    left: "6.5%",
                                }}
                            ></div>

                            <div
                                data-position="16"
                                className="street"
                                style={{
                                    width: 120,
                                    height: 75,
                                    top: "41.75%",
                                    left: "6.5%",
                                }}
                            ></div>

                            <div
                                data-position="15"
                                className="street"
                                style={{
                                    width: 120,
                                    height: 75,
                                    top: "50%",
                                    left: "6.5%",
                                }}
                            ></div>

                            <div
                                data-position="14"
                                className="street"
                                style={{
                                    width: 120,
                                    height: 75,
                                    top: "58.25%",
                                    left: "6.5%",
                                }}
                            ></div>

                            <div
                                data-position="13"
                                className="street"
                                style={{
                                    width: 120,
                                    height: 75,
                                    top: "66.5%",
                                    left: "6.5%",
                                }}
                            ></div>

                            <div
                                data-position="12"
                                className="street"
                                style={{
                                    width: 120,
                                    height: 75,
                                    top: "74.75%",
                                    left: "6.5%",
                                }}
                            ></div>

                            <div
                                data-position="11"
                                className="street"
                                style={{
                                    width: 120,
                                    height: 75,
                                    top: "83%",
                                    left: "6.5%",
                                }}
                            ></div>

                            <div
                                className="street"
                                data-position="10"
                                style={{
                                    width: 120,
                                    height: 120,
                                    top: "93.5%",
                                    left: "6.5%",
                                }}
                            ></div>

                            <div
                                data-position="9"
                                className="street"
                                style={{
                                    width: 75,
                                    height: 120,
                                    top: "93.5%",
                                    left: "17.25%",
                                }}
                            ></div>

                            <div
                                data-position="8"
                                className="street"
                                style={{
                                    width: 75,
                                    height: 120,
                                    top: "93.5%",
                                    left: "25.5%",
                                }}
                            ></div>

                            <div
                                data-position="7"
                                className="street"
                                style={{
                                    width: 75,
                                    height: 120,
                                    top: "93.5%",
                                    left: "33.5%",
                                }}
                            ></div>
                            <div
                                data-position="6"
                                className="street"
                                style={{
                                    width: 75,
                                    height: 120,
                                    top: "93.5%",
                                    left: "41.75%",
                                }}
                            ></div>
                            <div
                                data-position="5"
                                className="street"
                                style={{
                                    width: 75,
                                    height: 120,
                                    top: "93.5%",
                                    left: "50%",
                                }}
                            ></div>
                            <div
                                data-position="4"
                                className="street"
                                style={{
                                    width: 75,
                                    height: 120,
                                    top: "93.5%",
                                    left: "58.25%",
                                }}
                            ></div>
                            <div
                                data-position="3"
                                className="street"
                                style={{
                                    width: 75,
                                    height: 120,
                                    top: "93.5%",
                                    left: "66.5%",
                                }}
                            ></div>
                            <div
                                data-position="2"
                                className="street"
                                style={{
                                    width: 75,
                                    height: 120,
                                    top: "93.5%",
                                    left: "74.75%",
                                }}
                            ></div>
                            <div
                                data-position="1"
                                className="street"
                                style={{
                                    width: 75,
                                    height: 120,
                                    top: "93.5%",
                                    left: "83%",
                                }}
                            ></div>

                            <div
                                data-position="0"
                                className="street"
                                style={{
                                    width: 120,
                                    height: 120,
                                    top: "93.5%",
                                    left: "93.5%",
                                }}
                            ></div>
                        </div>
                    </div>
                    <div
                        className="action-bar"
                        style={
                            prop.myTurn && !sended && !prop.players.find((v) => v.id === prop.socket.id)?.isBankrupt
                                ? {}
                                : { translate: "-50% 20vh" }
                        }
                    >
                        {prop.selectedMode.turnTimer !== undefined && prop.selectedMode.turnTimer > 0 ? (
                            <>
                                <p
                                    style={{
                                        display: "inline-block",
                                        opacity: 1,
                                        color: "rgb(0, 114, 187)",
                                        marginRight: 5,
                                    }}
                                >
                                    {prop.selectedMode.turnTimer - timer}{" "}
                                </p>
                                <hr style={{ display: "inline", opacity: 0.5 }} />
                            </>
                        ) : (
                            <></>
                        )}
                        {/* Phase 2F: Render buttons based on turn state */}
                        {prop.isDebtState ? (
                            <button
                                id="btn-declare-bankruptcy"
                                className="action-btn bankruptcy-btn"
                                onClick={() => {
                                    const firstConfirm = window.confirm(
                                        "Are you sure you want to declare bankruptcy? This will eliminate you from the game.",
                                    );
                                    if (firstConfirm) {
                                        const secondConfirm = window.confirm(
                                            "This action is irreversible. Are you absolutely sure you want to declare bankruptcy?",
                                        );
                                        if (secondConfirm) {
                                            prop.socket.emit("declare-bankruptcy");
                                            prop.onDeclaredBankruptcy?.();
                                        }
                                    }
                                }}
                            >
                                <Icons.Skull width={15} height={15} style={{ flexShrink: 0 }} />
                                Declare Bankruptcy
                            </button>
                        ) : !(prop.hasRolled && !prop.allowRollAgain) ? (
                            <button data-button-type="roll" aria-disabled={false} onClick={handleRoll}>
                                <p>ROLL THE DICE</p>
                                <Icons.Dice width={18} height={18} style={{ marginLeft: 8, flexShrink: 0 }} />
                            </button>
                        ) : (
                            <button
                                id="btn-end-turn"
                                className="action-btn end-turn-btn"
                                onClick={() => {
                                    localFreeDice();
                                    prop.socket.emit("finish-turn");
                                }}
                            >
                                End Turn
                                <Icons.EndTurn width={16} height={16} style={{ flexShrink: 0 }} />
                            </button>
                        )}
                        <button data-button-type="pay" data-tooltip-hover="pay" aria-disabled={true}>
                            <img src="pay1.png" />
                        </button>
                        <button data-button-type="card" data-tooltip-hover="card" aria-disabled={true}>
                            <img src="golden-card.png" />
                        </button>
                        {prop.selectedMode.AllowDeals ? (
                            <button
                                data-button-type="trade"
                                data-tooltip-hover="trade"
                                aria-disabled={false}
                                onClick={() => {
                                    SetSended(true);
                                    prop.socket.emit("trade");
                                }}
                            >
                                <img src="morgage.png" />
                            </button>
                        ) : (
                            <></>
                        )}
                    </div>
                    <div
                        className={
                            streetType === "Chance" || streetType === "CommunityChest"
                                ? "chance-display-actions"
                                : "card-display-actions"
                        }
                        style={
                            !showStreet
                                ? {
                                      transform: "translateY(-50%) translateX(-70vw)",
                                  }
                                : {}
                        }
                    >
                        {streetType === "Chance" || streetType === "CommunityChest" ? (
                            <>
                                {streetType === "Chance" ? (
                                    <ChacneCard chance={streetDisplay as ChanceDisplayInfo} />
                                ) : streetType === "CommunityChest" ? (
                                    <ChacneCard chance={streetDisplay as ChanceDisplayInfo} />
                                ) : (
                                    <></>
                                )}
                            </>
                        ) : (
                            <>
                                <h3>
                                    {advnacedStreet
                                        ? "would you like to buy this card?"
                                        : "you can buy houses and hotels"}
                                </h3>
                                {streetType === "Railroad" ? (
                                    <StreetCard railroad={streetDisplay as RailroadDisplayInfo} />
                                ) : streetType === "Utilities" ? (
                                    <StreetCard utility={streetDisplay as UtilitiesDisplayInfo} />
                                ) : (
                                    <StreetCard street={streetDisplay as StreetDisplayInfo} />
                                )}
                                <div>
                                    <center>
                                        {advnacedStreet ? (
                                            <div id="advanced-responses"></div>
                                        ) : (
                                            <>
                                                <button id="card-response-yes">YES</button>
                                                <button id="card-response-no">NO</button>
                                            </>
                                        )}
                                    </center>
                                </div>
                            </>
                        )}
                    </div>
                    <img data-anim="0" id="moneyAnimations" alt="" />
                </div>
                <div className="trade-table">
                    <div className="middle">
                        <h3>Trade</h3>
                        {typeof prop.tradeObj !== "object" ? (
                            <>
                                <h2>Select your opponent</h2>
                                <center>
                                    <div className="select-players">
                                        {prop.players
                                            .filter((v) => v.id !== prop.socket.id && !v.isBankrupt)
                                            .map((v, i) => (
                                                <button
                                                    style={{
                                                        animation: "tradepopout .3s cubic-bezier(0.21, 1.57, 0.55, 1)",
                                                    }}
                                                    data-selectable={prop.myTurn}
                                                    key={i}
                                                    onClick={() => {
                                                        if (prop.myTurn) {
                                                            prop.tradeApi.onSelectPlayer(v.id);
                                                        }
                                                    }}
                                                >
                                                    {v.username}
                                                </button>
                                            ))}
                                        <button
                                            data-selectable={prop.myTurn}
                                            onClick={() => {
                                                if (prop.myTurn) {
                                                    prop.socket.emit("cancel-trade");
                                                    SetSended(false);
                                                }
                                            }}
                                        >
                                            {" "}
                                            CANCEL TRADE
                                        </button>
                                    </div>
                                </center>
                            </>
                        ) : (
                            <>
                                {(() => {
                                    const hasMortgagedTransfers =
                                        (prop.tradeObj as GameTrading).turnPlayer.prop.some(
                                            (p: any) => p.morgage === true || p.morgage === "true",
                                        ) ||
                                        (prop.tradeObj as GameTrading).againstPlayer.prop.some(
                                            (p: any) => p.morgage === true || p.morgage === "true",
                                        );
                                    if (hasMortgagedTransfers) {
                                        return (
                                            <div
                                                className="trade-mortgage-warning"
                                                style={{
                                                    backgroundColor: "rgba(245, 158, 11, 0.15)",
                                                    border: "1px solid #f59e0b",
                                                    color: "#f59e0b",
                                                    padding: "8px 12px",
                                                    borderRadius: "6px",
                                                    marginBottom: "12px",
                                                    fontSize: "0.85rem",
                                                    textAlign: "center",
                                                }}
                                            >
                                                ⚠️ Warning: One or more traded properties are mortgaged. The receiver
                                                will immediately be prompted to pay 10% interest to keep them mortgaged
                                                or unmortgage them now.
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}
                                <div className="trade-mission">
                                    <div className="flexchild">
                                        {prop.socket.id === prop.tradeObj.againstPlayer.id ||
                                        prop.socket.id === prop.tradeObj.turnPlayer.id ? (
                                            <div className="trade-craft">
                                                <p>
                                                    {" "}
                                                    {prop.socket.id === prop.tradeObj.againstPlayer.id
                                                        ? "You are the Opponent"
                                                        : "You are the Current Player"}
                                                </p>
                                                <Slider
                                                    max={Math.max(
                                                        0,
                                                        prop.socket.id === prop.tradeObj.againstPlayer.id
                                                            ? prop.players.filter(
                                                                  (v) =>
                                                                      v.id ===
                                                                      (prop.tradeObj as GameTrading).againstPlayer.id,
                                                              )[0].balance
                                                            : prop.players.filter(
                                                                  (v) =>
                                                                      v.id ===
                                                                      (prop.tradeObj as GameTrading).turnPlayer.id,
                                                              )[0].balance,
                                                    )}
                                                    min={0}
                                                    step={25}
                                                    onChange={(e) => {
                                                        const v = parseInt(e.currentTarget.value);
                                                        const b = JSON.parse(
                                                            JSON.stringify(prop.tradeObj),
                                                        ) as GameTrading;
                                                        if (
                                                            prop.socket.id ===
                                                            (prop.tradeObj as GameTrading).againstPlayer.id
                                                        ) {
                                                            b.againstPlayer.balance = v;
                                                        } else {
                                                            b.turnPlayer.balance = v;
                                                        }
                                                        b.turnPlayer.accepted = false;
                                                        b.againstPlayer.accepted = false;
                                                        prop.socket.emit("trade-update", b);
                                                    }}
                                                    suffix=" M"
                                                />
                                                <br />

                                                {prop.socket.id === prop.tradeObj.againstPlayer.id ? (
                                                    prop.players
                                                        .filter(
                                                            (v) =>
                                                                v.id ===
                                                                (prop.tradeObj as GameTrading).againstPlayer.id,
                                                        )[0]
                                                        .properties.filter(
                                                            (v) =>
                                                                !(prop.tradeObj as GameTrading).againstPlayer.prop
                                                                    .map((v) => JSON.stringify(v))
                                                                    .includes(JSON.stringify(v)),
                                                        )
                                                        .filter((v) => {
                                                            // Fix 7: block properties whose color group has any buildings on any property
                                                            if (
                                                                !v.group ||
                                                                v.group === "Railroad" ||
                                                                v.group === "Utilities"
                                                            )
                                                                return true;
                                                            const ownerProps =
                                                                prop.players.find(
                                                                    (p) =>
                                                                        p.id ===
                                                                        (prop.tradeObj as GameTrading).againstPlayer.id,
                                                                )?.properties ?? [];
                                                            return !ownerProps
                                                                .filter((p) => p.group === v.group)
                                                                .some((p) => p.count !== 0 && p.count !== undefined);
                                                        })
                                                        .map((v, i) => (
                                                            <div
                                                                key={i}
                                                                className="proprety-nav"
                                                                onClick={() => {
                                                                    const b = JSON.parse(
                                                                        JSON.stringify(prop.tradeObj),
                                                                    ) as GameTrading;
                                                                    b.againstPlayer.prop.push(v);
                                                                    b.turnPlayer.accepted = false;
                                                                    b.againstPlayer.accepted = false;
                                                                    prop.socket.emit("trade-update", b);
                                                                }}
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
                                                                        <img
                                                                            src={HotelIcon.replace("public/", "")}
                                                                            alt=""
                                                                        />
                                                                    ) : typeof v.count === "number" && v.count > 0 ? (
                                                                        <>
                                                                            <p>{v.count}</p>
                                                                            <img
                                                                                src={HouseIcon.replace("public/", "")}
                                                                                alt=""
                                                                            />
                                                                        </>
                                                                    ) : (
                                                                        <></>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))
                                                ) : prop.socket.id === prop.tradeObj.turnPlayer.id ? (
                                                    prop.players
                                                        .filter(
                                                            (v) =>
                                                                v.id === (prop.tradeObj as GameTrading).turnPlayer.id,
                                                        )[0]
                                                        .properties.filter(
                                                            (v) =>
                                                                !(prop.tradeObj as GameTrading).turnPlayer.prop
                                                                    .map((v) => JSON.stringify(v))
                                                                    .includes(JSON.stringify(v)),
                                                        )
                                                        .filter((v) => {
                                                            // Fix 7: block properties whose color group has any buildings on any property
                                                            if (
                                                                !v.group ||
                                                                v.group === "Railroad" ||
                                                                v.group === "Utilities"
                                                            )
                                                                return true;
                                                            const ownerProps =
                                                                prop.players.find(
                                                                    (p) =>
                                                                        p.id ===
                                                                        (prop.tradeObj as GameTrading).turnPlayer.id,
                                                                )?.properties ?? [];
                                                            return !ownerProps
                                                                .filter((p) => p.group === v.group)
                                                                .some((p) => p.count !== 0 && p.count !== undefined);
                                                        })
                                                        .map((v, i) => (
                                                            <div
                                                                key={i}
                                                                className="proprety-nav"
                                                                onClick={() => {
                                                                    const b = JSON.parse(
                                                                        JSON.stringify(prop.tradeObj),
                                                                    ) as GameTrading;
                                                                    b.turnPlayer.prop.push(v);
                                                                    b.turnPlayer.accepted = false;
                                                                    b.againstPlayer.accepted = false;
                                                                    prop.socket.emit("trade-update", b);
                                                                }}
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
                                                                        <img
                                                                            src={HotelIcon.replace("public/", "")}
                                                                            alt=""
                                                                        />
                                                                    ) : typeof v.count === "number" && v.count > 0 ? (
                                                                        <>
                                                                            <p>{v.count}</p>
                                                                            <img
                                                                                src={HouseIcon.replace("public/", "")}
                                                                                alt=""
                                                                            />
                                                                        </>
                                                                    ) : (
                                                                        <></>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))
                                                ) : (
                                                    <></>
                                                )}
                                            </div>
                                        ) : (
                                            <></>
                                        )}
                                    </div>

                                    <div className="flexchild">
                                        <div className="player">
                                            <h5>
                                                current player{" "}
                                                {(prop.tradeObj as GameTrading).turnPlayer.accepted && (
                                                    <span
                                                        style={{
                                                            backgroundColor: "#10b981",
                                                            color: "white",
                                                            fontSize: "0.75rem",
                                                            padding: "2px 6px",
                                                            borderRadius: "4px",
                                                            marginLeft: "8px",
                                                            display: "inline-block",
                                                            verticalAlign: "middle",
                                                        }}
                                                    >
                                                        ✓ ACCEPTED
                                                    </span>
                                                )}
                                                <h2>
                                                    {
                                                        prop.players.filter(
                                                            (v) =>
                                                                v.id === (prop.tradeObj as GameTrading).turnPlayer.id,
                                                        )[0].username
                                                    }
                                                </h2>
                                            </h5>
                                            <table>
                                                <tr>
                                                    <td>Balance</td>
                                                    <td>{prop.tradeObj.turnPlayer.balance} M</td>
                                                </tr>
                                                {prop.tradeObj.turnPlayer.prop.length > 0 ? (
                                                    <tr>
                                                        <td>Propreties</td>
                                                        <td>
                                                            {prop.tradeObj.turnPlayer.prop.map((v, i) => (
                                                                <div
                                                                    key={i}
                                                                    className="proprety-nav"
                                                                    data-actionable={
                                                                        prop.socket.id ===
                                                                        (prop.tradeObj as GameTrading).turnPlayer.id
                                                                    }
                                                                    onClick={() => {
                                                                        if (
                                                                            prop.socket.id ===
                                                                            (prop.tradeObj as GameTrading).turnPlayer.id
                                                                        ) {
                                                                            const b = JSON.parse(
                                                                                JSON.stringify(prop.tradeObj),
                                                                            ) as GameTrading;
                                                                            b.turnPlayer.prop.splice(i, 1);
                                                                            b.turnPlayer.accepted = false;
                                                                            b.againstPlayer.accepted = false;
                                                                            prop.socket.emit("trade-update", b);
                                                                        }
                                                                    }}
                                                                >
                                                                    <i
                                                                        className="box"
                                                                        style={{
                                                                            backgroundColor: translateGroup(v.group),
                                                                        }}
                                                                    ></i>
                                                                    <h3
                                                                        style={
                                                                            v.morgage !== undefined &&
                                                                            v.morgage === true
                                                                                ? {
                                                                                      textDecoration:
                                                                                          "line-through white",
                                                                                  }
                                                                                : {}
                                                                        }
                                                                    >
                                                                        {propretyMap.get(v.posistion)?.name ?? ""}
                                                                        {v.morgage !== undefined &&
                                                                            v.morgage === true && (
                                                                                <span
                                                                                    style={{
                                                                                        color: "#f59e0b",
                                                                                        fontSize: "0.65rem",
                                                                                        marginLeft: "6px",
                                                                                        display: "inline-block",
                                                                                        verticalAlign: "middle",
                                                                                    }}
                                                                                >
                                                                                    (Mortgaged)
                                                                                </span>
                                                                            )}
                                                                    </h3>
                                                                    <div>
                                                                        {v.count == "h" ? (
                                                                            <img
                                                                                src={HotelIcon.replace("public/", "")}
                                                                                alt=""
                                                                            />
                                                                        ) : typeof v.count === "number" &&
                                                                          v.count > 0 ? (
                                                                            <>
                                                                                <p>{v.count}</p>
                                                                                <img
                                                                                    src={HouseIcon.replace(
                                                                                        "public/",
                                                                                        "",
                                                                                    )}
                                                                                    alt=""
                                                                                />
                                                                            </>
                                                                        ) : (
                                                                            <></>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    <></>
                                                )}
                                            </table>
                                        </div>
                                        <div className="player">
                                            <h5>
                                                opponent player{" "}
                                                {(prop.tradeObj as GameTrading).againstPlayer.accepted && (
                                                    <span
                                                        style={{
                                                            backgroundColor: "#10b981",
                                                            color: "white",
                                                            fontSize: "0.75rem",
                                                            padding: "2px 6px",
                                                            borderRadius: "4px",
                                                            marginLeft: "8px",
                                                            display: "inline-block",
                                                            verticalAlign: "middle",
                                                        }}
                                                    >
                                                        ✓ ACCEPTED
                                                    </span>
                                                )}
                                                <h2>
                                                    {
                                                        prop.players.filter(
                                                            (v) =>
                                                                v.id ===
                                                                (prop.tradeObj as GameTrading).againstPlayer.id,
                                                        )[0].username
                                                    }
                                                </h2>
                                            </h5>
                                            <table>
                                                <tr>
                                                    <td>Balance</td>
                                                    <td>{prop.tradeObj.againstPlayer.balance} M</td>
                                                </tr>
                                                {prop.tradeObj.againstPlayer.prop.length > 0 ? (
                                                    <tr>
                                                        <td>Propreties</td>
                                                        <td>
                                                            {prop.tradeObj.againstPlayer.prop.map((v, i) => (
                                                                <div
                                                                    key={i}
                                                                    data-actionable={
                                                                        prop.socket.id ===
                                                                        (prop.tradeObj as GameTrading).againstPlayer.id
                                                                    }
                                                                    className="proprety-nav"
                                                                    onClick={() => {
                                                                        if (
                                                                            prop.socket.id ===
                                                                            (prop.tradeObj as GameTrading).againstPlayer
                                                                                .id
                                                                        ) {
                                                                            const b = JSON.parse(
                                                                                JSON.stringify(prop.tradeObj),
                                                                            ) as GameTrading;
                                                                            b.againstPlayer.prop.splice(i, 1);
                                                                            b.turnPlayer.accepted = false;
                                                                            b.againstPlayer.accepted = false;
                                                                            prop.socket.emit("trade-update", b);
                                                                        }
                                                                    }}
                                                                >
                                                                    <i
                                                                        className="box"
                                                                        style={{
                                                                            backgroundColor: translateGroup(v.group),
                                                                        }}
                                                                    ></i>
                                                                    <h3
                                                                        style={
                                                                            v.morgage !== undefined &&
                                                                            v.morgage === true
                                                                                ? {
                                                                                      textDecoration:
                                                                                          "line-through white",
                                                                                  }
                                                                                : {}
                                                                        }
                                                                    >
                                                                        {propretyMap.get(v.posistion)?.name ?? ""}
                                                                        {v.morgage !== undefined &&
                                                                            v.morgage === true && (
                                                                                <span
                                                                                    style={{
                                                                                        color: "#f59e0b",
                                                                                        fontSize: "0.65rem",
                                                                                        marginLeft: "6px",
                                                                                        display: "inline-block",
                                                                                        verticalAlign: "middle",
                                                                                    }}
                                                                                >
                                                                                    (Mortgaged)
                                                                                </span>
                                                                            )}
                                                                    </h3>
                                                                    <div>
                                                                        {v.count == "h" ? (
                                                                            <img
                                                                                src={HotelIcon.replace("public/", "")}
                                                                                alt=""
                                                                            />
                                                                        ) : typeof v.count === "number" &&
                                                                          v.count > 0 ? (
                                                                            <>
                                                                                <p>{v.count}</p>
                                                                                <img
                                                                                    src={HouseIcon.replace(
                                                                                        "public/",
                                                                                        "",
                                                                                    )}
                                                                                    alt=""
                                                                                />
                                                                            </>
                                                                        ) : (
                                                                            <></>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    <></>
                                                )}
                                            </table>
                                        </div>
                                    </div>
                                    <div className="flexchild"></div>
                                </div>
                                {prop.socket.id === (prop.tradeObj as GameTrading).turnPlayer.id ||
                                prop.socket.id === (prop.tradeObj as GameTrading).againstPlayer.id ? (
                                    <center>
                                        <div className="trade-craft-buttons">
                                            <button
                                                onClick={() => {
                                                    prop.socket.emit("cancel-trade");
                                                    SetSended(false);
                                                }}
                                            >
                                                {prop.socket.id === (prop.tradeObj as GameTrading).turnPlayer.id
                                                    ? "CANCEL"
                                                    : "DECLINE"}
                                            </button>
                                            {prop.socket.id === (prop.tradeObj as GameTrading).turnPlayer.id && (
                                                <button
                                                    onClick={() => {
                                                        prop.socket.emit("trade");
                                                    }}
                                                >
                                                    BACK
                                                </button>
                                            )}
                                            <button
                                                className={
                                                    (
                                                        prop.socket.id === (prop.tradeObj as GameTrading).turnPlayer.id
                                                            ? (prop.tradeObj as GameTrading).turnPlayer.accepted
                                                            : (prop.tradeObj as GameTrading).againstPlayer.accepted
                                                    )
                                                        ? "trade-accept-btn active"
                                                        : "trade-accept-btn"
                                                }
                                                onClick={() => {
                                                    const b = JSON.parse(JSON.stringify(prop.tradeObj)) as GameTrading;
                                                    if (prop.socket.id === b.turnPlayer.id) {
                                                        b.turnPlayer.accepted = !b.turnPlayer.accepted;
                                                    } else {
                                                        b.againstPlayer.accepted = !b.againstPlayer.accepted;
                                                    }
                                                    prop.socket.emit("trade-update", b);
                                                }}
                                            >
                                                {(
                                                    prop.socket.id === (prop.tradeObj as GameTrading).turnPlayer.id
                                                        ? (prop.tradeObj as GameTrading).turnPlayer.accepted
                                                        : (prop.tradeObj as GameTrading).againstPlayer.accepted
                                                )
                                                    ? "✓ Accepted"
                                                    : "Accept Offer"}
                                            </button>
                                        </div>
                                    </center>
                                ) : (
                                    <></>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Fix 5b: Mortgage Transfer Choice Modal */}
            {prop.mortgageTransferPending &&
                prop.mortgageTransferPending.length > 0 &&
                (() => {
                    const myPlayer = prop.players.find((v) => v.id === prop.socket.id);
                    const myBalance = myPlayer?.balance ?? 0;
                    return (
                        <div className="mortgage-modal-overlay">
                            <div className="mortgage-modal-card">
                                {/* Header */}
                                <div className="mortgage-modal-header">
                                    <div>
                                        <h3 className="mortgage-modal-title">Mortgage Transfer</h3>
                                        <p className="mortgage-modal-subtitle">
                                            <strong>{prop.mortgageBankruptName ?? "A player"}</strong> went bankrupt.
                                            Decide what to do with each mortgaged property you received. The game is
                                            paused until you confirm.
                                        </p>
                                    </div>
                                </div>

                                {/* Balances Section */}
                                <div className="mortgage-modal-balances">
                                    <div className="mortgage-balance-item you">
                                        <span className="mortgage-balance-badge">YOU</span>
                                        <span className="mortgage-balance-name">{myPlayer?.username}</span>
                                        <span className="mortgage-balance-val">${myBalance}</span>
                                    </div>
                                    {prop.players
                                        .filter((p) => p.id !== prop.socket.id && !p.isBankrupt)
                                        .map((p) => (
                                            <div key={p.id} className="mortgage-balance-item">
                                                <span
                                                    className="mortgage-balance-name"
                                                    style={{ color: p.color || "var(--text-main)" }}
                                                >
                                                    {p.username}
                                                </span>
                                                <span className="mortgage-balance-val">${p.balance}</span>
                                            </div>
                                        ))}
                                </div>

                                {/* Rules box */}
                                <div className="mortgage-modal-rules">
                                    <span className="mortgage-modal-rules-label">How it works</span>
                                    <p>
                                        A mortgaged property earns no rent and cannot have houses built on it.
                                        <strong> Unmortgage Now</strong> activates it immediately (you pay principal +
                                        10% interest).
                                        <strong> Keep Mortgaged</strong> means you pay only the 10% interest today and
                                        can unmortgage it later for the same total cost.
                                    </p>
                                </div>

                                {/* Property grid */}
                                <div className="mortgage-modal-grid">
                                    {prop.mortgageTransferPending.map((item) => {
                                        const choice = mortgageChoices[item.position] ?? "keep";
                                        const canAfford = myBalance >= item.unmortgageCost;
                                        return (
                                            <div key={item.position} className="mortgage-prop-row">
                                                <div className="mortgage-prop-name">
                                                    <span>{item.name}</span>
                                                    <span className="mortgage-prop-value">
                                                        Mortgaged for ${item.mortgageValue}
                                                    </span>
                                                </div>
                                                <div className="mortgage-choices">
                                                    <button
                                                        id={`mortgage-choice-unmortgage-${item.position}`}
                                                        className={
                                                            "mortgage-choice-btn unmortgage-btn" +
                                                            (choice === "unmortgage" ? " selected" : "") +
                                                            (!canAfford ? " cant-afford" : "")
                                                        }
                                                        disabled={!canAfford}
                                                        onClick={() =>
                                                            setMortgageChoices((c) => ({
                                                                ...c,
                                                                [item.position]: "unmortgage",
                                                            }))
                                                        }
                                                    >
                                                        <div className="mortgage-choice-top">
                                                            <span className="choice-icon">[+]</span>
                                                            <span className="choice-title">Unmortgage Now</span>
                                                            <span className="choice-price">${item.unmortgageCost}</span>
                                                        </div>
                                                        <div className="choice-desc">
                                                            Pays off the debt. Property becomes active — collect rent,
                                                            build houses right away.
                                                            {!canAfford && (
                                                                <span className="cant-afford-note">
                                                                    {" "}
                                                                    You need ${item.unmortgageCost} but only have $
                                                                    {myBalance}.
                                                                </span>
                                                            )}
                                                        </div>
                                                    </button>
                                                    <button
                                                        id={`mortgage-choice-keep-${item.position}`}
                                                        className={
                                                            "mortgage-choice-btn keep-btn" +
                                                            (choice !== "unmortgage" ? " selected" : "")
                                                        }
                                                        onClick={() =>
                                                            setMortgageChoices((c) => ({
                                                                ...c,
                                                                [item.position]: "keep",
                                                            }))
                                                        }
                                                    >
                                                        <div className="mortgage-choice-top">
                                                            <span className="choice-icon">[~]</span>
                                                            <span className="choice-title">Keep Mortgaged</span>
                                                            <span className="choice-price">
                                                                ${item.interestFee} now
                                                            </span>
                                                        </div>
                                                        <div className="choice-desc">
                                                            Pays transfer interest only. Property stays inactive.
                                                            Unmortgage later for ${item.unmortgageCost} total.
                                                        </div>
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Footer */}
                                <div className="mortgage-modal-footer">
                                    <p className="mortgage-modal-footer-note">
                                        Once confirmed, the game resumes and the next player's turn begins.
                                    </p>
                                    <button
                                        id="btn-confirm-mortgage-choices"
                                        className="mortgage-confirm-btn"
                                        onClick={() => {
                                            const resolved = (prop.mortgageTransferPending ?? []).map((item) => ({
                                                position: item.position,
                                                action: (mortgageChoices[item.position] ?? "keep") as
                                                    | "unmortgage"
                                                    | "keep",
                                            }));
                                            prop.onMortgageTransferResolve?.(resolved);
                                            setMortgageChoices({});
                                        }}
                                    >
                                        Confirm All Decisions
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })()}

            {/* Phase 2: Property Auction Modal Overlay */}
            {prop.currentAuction &&
                (() => {
                    const myPlayer = prop.players.find((v) => v.id === prop.socket.id);
                    const isSpectator = !myPlayer || prop.isSpectator;
                    const myBalance = myPlayer ? myPlayer.balance : 0;
                    const isBankrupt = myPlayer ? myPlayer.isBankrupt : false;
                    const auctionProp = propretyMap.get(prop.currentAuction.position);
                    if (!auctionProp) return null;

                    const isUtility = auctionProp.group === "Utilities";
                    const isRailroad = auctionProp.group === "Railroad";

                    return (
                        <div className="auction-modal-overlay">
                            <div className="auction-modal-card animate-pop">
                                <div className="auction-modal-header">
                                    <div>
                                        <h3 className="auction-modal-title">🏛️ Property Auction</h3>
                                        <p className="auction-modal-subtitle">
                                            Active bidding for <strong>{auctionProp.name}</strong>. Listing price is $
                                            {auctionProp.price}.
                                        </p>
                                    </div>
                                </div>

                                {/* Timer Bar */}
                                <div className="auction-timer-container">
                                    <div
                                        className={`auction-timer-bar ${prop.currentAuction.timerSeconds <= 5 ? "pulse" : ""}`}
                                        style={{
                                            width: `${Math.min(100, Math.max(0, (prop.currentAuction.timerSeconds / 20) * 100))}%`,
                                        }}
                                    />
                                    <span className="auction-timer-text">{prop.currentAuction.timerSeconds}s</span>
                                </div>

                                <div className="auction-modal-body">
                                    {/* Left side: Card Preview */}
                                    <div className="auction-prop-preview">
                                        {isUtility ? (
                                            <StreetCard
                                                utility={{
                                                    title: auctionProp.name ?? "",
                                                    cardCost: auctionProp.price ?? 0,
                                                    type: auctionProp.id?.includes("water") ? "water" : "electricity",
                                                }}
                                            />
                                        ) : isRailroad ? (
                                            <StreetCard
                                                railroad={{
                                                    title: auctionProp.name ?? "",
                                                    cardCost: auctionProp.price ?? 0,
                                                }}
                                            />
                                        ) : (
                                            <StreetCard
                                                street={{
                                                    title: auctionProp.name ?? "",
                                                    cardCost: auctionProp.price ?? 0,
                                                    hotelsCost: auctionProp.ohousecost ?? 0,
                                                    housesCost: auctionProp.housecost ?? 0,
                                                    rent: auctionProp.rent ?? 0,
                                                    multpliedrent: (auctionProp.multpliedrent as [
                                                        number,
                                                        number,
                                                        number,
                                                        number,
                                                        number,
                                                    ]) || [0, 0, 0, 0, 0],
                                                    rentWithColorSet: (auctionProp.rent ?? 0) * 2,
                                                    group: auctionProp.group ?? "",
                                                }}
                                            />
                                        )}
                                    </div>

                                    {/* Right side: Bidding details and controls */}
                                    <div className="auction-controls-panel">
                                        <div className="auction-bidding-status">
                                            <div className="status-label">Current Bid</div>
                                            <div className="status-value">
                                                $
                                                {prop.currentAuction.currentBid === 0
                                                    ? "No bids yet"
                                                    : prop.currentAuction.currentBid}
                                            </div>
                                            {prop.currentAuction.bidderId ? (
                                                <div
                                                    className="status-bidder"
                                                    style={{
                                                        color:
                                                            prop.players.find(
                                                                (p) => p.id === prop.currentAuction!.bidderId,
                                                            )?.color || "var(--text-main)",
                                                    }}
                                                >
                                                    by {prop.currentAuction.bidderName}
                                                </div>
                                            ) : (
                                                <div className="status-bidder no-bids">
                                                    Be the first to bid! Minimum bid is $1.
                                                </div>
                                            )}
                                        </div>

                                        {/* Quick Bids */}
                                        <div className="auction-quick-bids">
                                            <button
                                                disabled={
                                                    isSpectator ||
                                                    isBankrupt ||
                                                    myBalance <= prop.currentAuction.currentBid
                                                }
                                                onClick={() => handleBidSubmit(prop.currentAuction!.currentBid + 1)}
                                            >
                                                +$1
                                            </button>
                                            <button
                                                disabled={
                                                    isSpectator ||
                                                    isBankrupt ||
                                                    myBalance <= prop.currentAuction.currentBid + 9
                                                }
                                                onClick={() => handleBidSubmit(prop.currentAuction!.currentBid + 10)}
                                            >
                                                +$10
                                            </button>
                                            <button
                                                disabled={
                                                    isSpectator ||
                                                    isBankrupt ||
                                                    myBalance <= prop.currentAuction.currentBid + 49
                                                }
                                                onClick={() => handleBidSubmit(prop.currentAuction!.currentBid + 50)}
                                            >
                                                +$50
                                            </button>
                                            <button
                                                disabled={
                                                    isSpectator ||
                                                    isBankrupt ||
                                                    myBalance <= prop.currentAuction.currentBid + 99
                                                }
                                                onClick={() => handleBidSubmit(prop.currentAuction!.currentBid + 100)}
                                            >
                                                +$100
                                            </button>
                                        </div>

                                        {/* Custom Bid Input */}
                                        <div className="auction-input-group">
                                            <input
                                                type="number"
                                                id="auction-custom-bid"
                                                min={prop.currentAuction.currentBid + 1}
                                                max={myBalance}
                                                value={customBidValue}
                                                onChange={(e) => setCustomBidValue(parseInt(e.target.value) || 0)}
                                                placeholder={
                                                    isSpectator
                                                        ? "Spectating"
                                                        : `Min: $${prop.currentAuction.currentBid + 1}`
                                                }
                                                disabled={isSpectator || isBankrupt}
                                            />
                                            <button
                                                className="bid-btn"
                                                disabled={
                                                    isSpectator ||
                                                    isBankrupt ||
                                                    customBidValue <= prop.currentAuction.currentBid ||
                                                    customBidValue > myBalance
                                                }
                                                onClick={() => handleBidSubmit(customBidValue)}
                                            >
                                                Place Bid
                                            </button>
                                        </div>
                                        {isSpectator && (
                                            <div
                                                className="spectator-bid-notice"
                                                style={{
                                                    color: "#94a3b8",
                                                    fontSize: "0.8rem",
                                                    textAlign: "center",
                                                    marginTop: "10px",
                                                    fontWeight: 500,
                                                }}
                                            >
                                                👁️ Spectators cannot place bids
                                            </div>
                                        )}

                                        {/* Bid History */}
                                        <div className="auction-history-scroller">
                                            <label className="history-label">Bid Log</label>
                                            <div className="history-list">
                                                {prop.currentAuction.bids.length === 0 ? (
                                                    <div className="no-bids-msg">No bids placed yet.</div>
                                                ) : (
                                                    [...prop.currentAuction.bids].reverse().map((bid, index) => (
                                                        <div key={index} className="history-row animate-fade">
                                                            <span className="history-bidder">{bid.bidderName}</span>
                                                            <span className="history-amount">${bid.amount}</span>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })()}
        </>
    );
});
export default MonopolyGame;
