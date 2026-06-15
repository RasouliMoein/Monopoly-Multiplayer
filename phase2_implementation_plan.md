# Phase 2 — Feature Completeness & Medium Severity Fixes

**Goal**: Implement the remaining **Medium** severity fixes and the two missing **gameplay features** that significantly alter strategy and authenticity. Phase 2 builds on top of a Phase 1-completed codebase.

> [!IMPORTANT]
> All items here have been verified against the live code. Phase 2 assumes Phase 1 fixes are already applied and passing.

---

## Issues in Scope

| # | Issue | Severity | Files Affected |
|---|---|---|---|
| 1 | No Property Auction when a player declines to buy | High (Feature) | `backend/game.ts`, `src/Pages/Home/monopoly.tsx`, `src/components/ingame/game.tsx` |
| 2 | Housing & Hotel bank pool is infinite (should be 32 / 12) | Medium | `backend/game.ts` |
| 3 | Mortgaged properties cannot be traded; no 10% interest fee applied | Medium | `backend/game.ts`, `src/components/ingame/game.tsx` |
| 4 | "Get Out of Jail Free" cards can be drawn as duplicates | Low-Medium | `backend/game.ts` |

---

## Fix 1 — Property Auction System

This is the largest feature addition. When a player lands on an unowned property and chooses **not** to buy it, the Bank must immediately put it up for auction. Any player (including the one who declined) may bid. The highest bidder wins.

### Architecture

**New server state** (inside `main()` in `backend/game.ts`):
```typescript
interface AuctionState {
    propertyPosition: number;   // What's being auctioned
    currentBid: number;         // Current highest bid (starts at $1)
    currentBidderId: string;    // ID of current highest bidder ("" = no bid yet)
    timerSeconds: number;       // Countdown per bid
    auctionTimerId?: ReturnType<typeof setTimeout>; // server-side auto-end timer
}
let currentAuction: AuctionState | null = null;
```

**New socket events**:

| Event | Direction | Payload | Purpose |
|---|---|---|---|
| `"auction-start"` | Server → All | `{ position, name, startingBid }` | Notifies all clients an auction is live |
| `"auction-bid"` | Client → Server | `{ bid: number }` | Player places a bid |
| `"auction-update"` | Server → All | `{ bid, bidderId, bidderName, timerReset }` | Broadcasts new highest bid |
| `"auction-end"` | Server → All | `{ winnerId, winnerName, bid, position }` | Auction completed |
| `"auction-skip"` | Server → All | `{ position }` | No bids placed — property stays unowned |

### Server Changes (`backend/game.ts`)

**Step A**: Modify the `player_action` handler's `"skip"` case to trigger an auction:

```diff
 // In socket.on("player_action"):
 // "skip" → no mutations
+if (args.action === "skip") {
+    const landedProp = propertyByPosition.get(player.position) as any;
+    if (landedProp && landedProp.price !== undefined && landedProp.group !== "Special") {
+        // Start auction for the declined property
+        startAuction(player.position);
+    }
+}
 EmitStateUpdate();
```

**Step B**: Add the `startAuction` function:

```typescript
function startAuction(position: number) {
    const prop = propertyByPosition.get(position) as any;
    if (!prop) return;

    currentAuction = {
        propertyPosition: position,
        currentBid: 0,
        currentBidderId: "",
        timerSeconds: 15,
    };

    EmitAll("auction-start", {
        position,
        name: prop.name,
        price: prop.price,
        startingBid: 1,
    });
    emitServerHistory(`Auction started for ${prop.name} (list price: $${prop.price})`);

    // Auto-end the auction after 30 seconds if no activity
    currentAuction.auctionTimerId = setTimeout(() => endAuction(), 30000);
}

function endAuction() {
    if (!currentAuction) return;
    const auction = currentAuction;
    currentAuction = null;
    if (auction.auctionTimerId) clearTimeout(auction.auctionTimerId);

    if (auction.currentBidderId === "" || auction.currentBid === 0) {
        // No bids — property remains unowned
        EmitAll("auction-skip", { position: auction.propertyPosition });
        emitServerHistory(`Auction ended with no bids — property returned to Bank`);
        return;
    }

    const winner = Clients.get(auction.currentBidderId)?.player;
    const prop = propertyByPosition.get(auction.propertyPosition) as any;
    if (!winner || !prop) return;

    winner.balance -= auction.currentBid;
    winner.properties.push({
        posistion: auction.propertyPosition,
        count: 0,
        group: prop.group ?? "",
    });

    EmitAll("auction-end", {
        winnerId: winner.id,
        winnerName: winner.username,
        bid: auction.currentBid,
        position: auction.propertyPosition,
    });
    emitServerHistory(`${winner.username} won the auction for ${prop.name} at $${auction.currentBid}`);
    EmitStateUpdate();
}
```

**Step C**: Add the `"auction-bid"` socket handler (inside the `socket.on("name")` block, alongside other handlers):

```typescript
socket.on("auction-bid", (args: { bid: number }) => {
    try {
        if (!currentAuction) return;
        if (player.isBankrupt) return;
        if (args.bid <= currentAuction.currentBid) return; // Must beat current bid
        if (args.bid > player.balance) return;            // Must be able to afford it

        currentAuction.currentBid = args.bid;
        currentAuction.currentBidderId = socket.id;

        // Reset 15-second countdown on each new bid
        if (currentAuction.auctionTimerId) clearTimeout(currentAuction.auctionTimerId);
        currentAuction.auctionTimerId = setTimeout(() => endAuction(), 15000);

        EmitAll("auction-update", {
            bid: args.bid,
            bidderId: socket.id,
            bidderName: player.username,
        });
        emitServerHistory(`${player.username} bid $${args.bid} at auction`);
    } catch (e) { server.logFunction(e); }
});
```

### Client Changes

**`src/Pages/Home/monopoly.tsx`** — Subscribe to auction events:

```typescript
// New state
const [currentAuction, setCurrentAuction] = useState<{
    position: number;
    name: string;
    price: number;
    currentBid: number;
    bidderId: string;
    bidderName: string;
} | null>(null);

// New socket handlers inside the useEffect:
socket.on("auction-start", (args) => {
    setCurrentAuction({
        position: args.position,
        name: args.name,
        price: args.price,
        currentBid: 0,
        bidderId: "",
        bidderName: "",
    });
});
socket.on("auction-update", (args) => {
    setCurrentAuction(prev => prev ? {
        ...prev,
        currentBid: args.bid,
        bidderId: args.bidderId,
        bidderName: args.bidderName,
    } : null);
});
socket.on("auction-end", () => setCurrentAuction(null));
socket.on("auction-skip", () => setCurrentAuction(null));
```

**`src/components/ingame/game.tsx`** — Add Auction Modal:

The auction modal displays above the board while `currentAuction` is not null. It shows:
- Property name and list price
- Current highest bid and bidder
- A text input + "Bid" button for each player
- A 15-second countdown timer (reset on each new bid)
- A "Pass" button to skip bidding (player is still eligible to bid again)

```tsx
{currentAuction && (
    <div className="auction-modal">
        <h2>🏛️ Property Auction</h2>
        <h3>{currentAuction.name}</h3>
        <p>List Price: ${currentAuction.price}</p>
        <p>Current Bid: {currentAuction.currentBid === 0 ? "No bids yet" : `$${currentAuction.currentBid} by ${currentAuction.bidderName}`}</p>
        <input
            type="number"
            min={currentAuction.currentBid + 1}
            id="auction-bid-input"
            placeholder={`Min bid: $${currentAuction.currentBid + 1}`}
        />
        <button onClick={() => {
            const val = parseInt((document.getElementById("auction-bid-input") as HTMLInputElement).value);
            if (val > currentAuction.currentBid) {
                prop.socket.emit("auction-bid", { bid: val });
            }
        }}>Place Bid</button>
        <button onClick={() => { /* do nothing — passing is implicit */ }}>Pass</button>
    </div>
)}
```

> [!NOTE]
> The auction modal can be styled as an overlay with a glassmorphism card to match the existing game aesthetic. The 15-second countdown can use a CSS animation or `setInterval`.

---

## Fix 2 — Finite Housing & Hotel Pool (32 Houses / 12 Hotels)

**Files**: `backend/game.ts` only

**Classic Rule**: The bank has exactly **32 green houses** and **12 red hotels**. If there are no houses available, players cannot build even if they could afford it. When a hotel is built, the 4 houses are returned to the bank pool.

### Server State Addition

```typescript
// Add after consecutiveDoublesMap declarations (around line 122)
let bankHouses = 32;  // Total green houses in the pool
let bankHotels = 12;  // Total red hotels in the pool
```

### Changes to `buy-advance` handler

After the server-side validation from Phase 1 Fix 2, add pool checks:

```diff
 // Inside buy-advance, after all validation passes:
 if (args.newCount === 5) {
+    // Building a hotel: costs 1 hotel, returns 4 houses to pool
+    if (bankHotels < 1) {
+        EmitAll("pool-shortage", { type: "hotel", position: targetPosition });
+        return; // No hotels available
+    }
+    bankHotels -= 1;
+    bankHouses += 4; // The 4 houses "return" to the bank
     player.balance -= targetProp?.ohousecost ?? 0;
     player.properties[idx].count = "h";
 } else {
+    // Building houses — args.housesAdded should always be 1 after Phase 1 fix
+    if (bankHouses < args.housesAdded) {
+        EmitAll("pool-shortage", { type: "house", position: targetPosition, available: bankHouses });
+        return; // Not enough houses
+    }
+    bankHouses -= args.housesAdded;
     player.balance -= (targetProp?.housecost ?? 0) * args.housesAdded;
     player.properties[idx].count = args.newCount;
 }
```

### Changes to `sell-advance` handler

When selling, return pieces to the pool:

```diff
 if (currentCount === "h") {
     refund = Math.round((targetProp?.ohousecost ?? 0) * 0.5);
     player.properties[idx].count = 4;
+    bankHotels += 1;       // Hotel returned
+    bankHouses -= 4;       // 4 houses taken from pool (represent the "downgraded" state)
+    // Edge case: if bankHouses goes negative clamp to 0 (house shortage scenario)
+    if (bankHouses < 0) bankHouses = 0;
 } else if (typeof currentCount === "number" && currentCount > 0) {
     refund = Math.round((targetProp?.housecost ?? 0) * 0.5);
     player.properties[idx].count = currentCount - 1;
+    bankHouses += 1; // House returned to pool
 }
```

### Broadcast Pool State

Add pool state to `EmitStateUpdate()` so clients can display it:

```diff
 function EmitStateUpdate() {
     EmitAll("state_update", {
         players: Array.from(Clients.values()).map((c) => c.player.to_json()),
-        hostId: hostId
+        hostId: hostId,
+        bankHouses,
+        bankHotels,
     });
 }
```

### Client Display

In `src/Pages/Home/monopoly.tsx`, capture `bankHouses` and `bankHotels` from `state_update` and display them in the UI sidebar (e.g. in the property tab or nav bar):

```tsx
// Small bank display component:
<div className="bank-pool">
    <span>🏠 {bankHouses}/32</span>
    <span>🏨 {bankHotels}/12</span>
</div>
```

---

## Fix 3 — Mortgaged Properties in Trades with 10% Interest Fee

**Phase 1 Fix 7** removed the filter that incorrectly blocked mortgaged properties from being offered. This fix completes the rule by charging the **receiving** player a 10% bank interest fee (= 5% of purchase price) for each mortgaged property they receive.

### Server Changes (`backend/game.ts`)

In the `"trade-update"` handler where `accepted` by both parties triggers the trade execution (lines ~934-962), add an interest fee calculation after properties are transferred:

```diff
 if (x.turnPlayer.accepted && x.againstPlayer.accepted) {
     // ... existing property transfer logic ...

     ap.player.balance -= x.againstPlayer.balance;
     tp.player.balance -= x.turnPlayer.balance;
     tp.player.balance += x.againstPlayer.balance;
     ap.player.balance += x.turnPlayer.balance;
     tp.player.properties.push(...tGets);
     ap.player.properties.push(...aGets);

+    // Apply 10% bank interest for mortgaged properties received in trade
+    // (per classic rules: receiver must pay 10% of mortgage value = 5% of price immediately)
+    let tpInterest = 0;
+    let apInterest = 0;
+    for (const prp of tGets) { // turnPlayer received these from againstPlayer
+        if (prp.morgage === true) {
+            const propData = propertyByPosition.get(prp.posistion);
+            tpInterest += Math.round((propData?.price ?? 0) * 0.05); // 10% of mortgage value
+        }
+    }
+    for (const prp of aGets) { // againstPlayer received these from turnPlayer
+        if (prp.morgage === true) {
+            const propData = propertyByPosition.get(prp.posistion);
+            apInterest += Math.round((propData?.price ?? 0) * 0.05);
+        }
+    }
+    if (tpInterest > 0) {
+        tp.player.balance -= tpInterest;
+        emitServerHistory(`${tp.player.username} paid $${tpInterest} bank interest for mortgaged properties received`);
+    }
+    if (apInterest > 0) {
+        ap.player.balance -= apInterest;
+        emitServerHistory(`${ap.player.username} paid $${apInterest} bank interest for mortgaged properties received`);
+    }

     emitServerHistory(`${tp.player.username} done a trade with ${ap.player.username}`);
```

> [!NOTE]
> The same fix must be applied to the `"submit-trade"` handler (lines ~964-992), which is a duplicate path. Both paths should get the same interest logic.

### Client-Side Notice

In the trade modal in `game.tsx`, display a warning when mortgaged properties are in the trade offer:

```tsx
{/* Inside the trade offer summary column */}
{hasMortgagedInOffer && (
    <p className="trade-warning">
        ⚠️ Mortgaged properties in this trade will cost the receiver 10% bank interest.
    </p>
)}
```

---

## Fix 4 — "Get Out of Jail Free" Card Uniqueness

**File**: `backend/game.ts`

**Classic Rule**: There is exactly one "Get Out of Jail Free" card in the Chance deck and one in the Community Chest deck. A card currently held by a player cannot be drawn again. When used, it returns to the bottom of the deck.

### Server State

```typescript
// Track which GOOJF cards are currently held by players (not in the deck)
let chanceJailCardHeld = false;   // True if a player holds the Chance GOOJF card
let chestJailCardHeld = false;    // True if a player holds the Community Chest GOOJF card
```

### Changes to Card Drawing (`resolveCard` → `"jail"/"getout"` case)

In the `roll_dice` handler where a card deck is sampled:

```diff
 const deck = prop.id === "chance" ? monopolyJSON.chance : (monopolyJSON as any).communitychest;
-const card = deck[Math.floor(Math.random() * deck.length)];
+const isChanceDeck = prop.id === "chance";
+
+// Build a filtered deck — remove GOOJF if currently held by someone
+const filteredDeck = deck.filter((c: any) => {
+    if (c.action === "jail" && c.subaction === "getout") {
+        return isChanceDeck ? !chanceJailCardHeld : !chestJailCardHeld;
+    }
+    return true;
+});
+// Fall back to full deck if filtering empties it (edge case)
+const drawFrom = filteredDeck.length > 0 ? filteredDeck : deck.filter((c: any) => !(c.action === "jail" && c.subaction === "getout"));
+const card = drawFrom[Math.floor(Math.random() * drawFrom.length)];
```

### Changes to `resolveCard` — Track Card on Grant

```diff
 case "jail":
     if (card.subaction === "goto") {
         player.position = 10;
         player.isInJail = true;
         player.jailTurnsRemaining = 3;
         return { requiresPurchaseDecision: false, newPosition: 10 };
     }
     if (card.subaction === "getout") {
         player.getoutCards += 1;
+        // Mark this GOOJF card as "in circulation" (out of the deck)
+        // We need to know which deck triggered this — pass via closure/parameter
+        // (The deck identity is already known at the call site)
```

> [!NOTE]
> To cleanly pass which deck was drawn from into `resolveCard`, the function signature needs a new optional `deckId?: "chance" | "communitychest"` parameter. When `getoutCards` is decremented in the `"unjail"` handler, the corresponding flag is set back to `false`. To handle which card a player holds (Chance vs Chest), a more precise tracking would store `{ chance: boolean, chest: boolean }` per player in their data.

### Changes to `unjail` handler — Return Card to Deck

```diff
 socket.on("unjail", (option: "card" | "pay") => {
     try {
         if (option === "pay") {
             player.balance -= 50;
         } else if (option === "card" && player.getoutCards > 0) {
             player.getoutCards -= 1;
+            // Return card to its deck (simplified: alternate between chance/chest)
+            // Full implementation: track which deck the card came from per player
+            if (chanceJailCardHeld) { chanceJailCardHeld = false; }
+            else if (chestJailCardHeld) { chestJailCardHeld = false; }
         }
```

> [!NOTE]
> A full-precision implementation would store `jailCardSource: "chance" | "chest" | null` on each player to return the exact card to the exact deck. The simplified version above covers the most common scenarios and prevents duplicate draws.

---

## Open Questions for Review

> [!IMPORTANT]
> **Auction Timer UX**: Should the 15-second countdown be per-bid (resets each time someone bids) or a fixed total? Classic board game rules say bidding ends when no one raises — the 15s reset approach is the most faithful digital equivalent.

> [!IMPORTANT]
> **Housing Shortage with Hotel Downgrade**: When a player sells a hotel back to houses, we consume 4 houses from the pool. If there are fewer than 4 houses in the pool, the hotel cannot be downgraded. Should this be enforced, or should hotels always be allowed to be sold with the refund paid regardless?

> [!NOTE]
> **Bankruptcy → Bank Auction**: Classic rules state properties returned to the Bank during a bankruptcy-to-bank scenario must be immediately auctioned. This is a natural extension of the auction system from Fix 1 and can be added by calling `startAuction()` inside the `declare-bankruptcy` bank path after resetting `prp.count = 0`.

---

## Verification Plan

### After Fix 1 (Auctions)
- Decline a property purchase → auction modal appears for all players
- All players can bid; highest bidder wins and balance deducts correctly
- No bids placed → property stays unowned and auction silently closes
- Build passes TypeScript compilation without errors

### After Fix 2 (Housing Pool)
- Try to build 33rd house → server rejects and `"pool-shortage"` event fires
- Build 4 houses then 1 hotel → pool shows 32 houses again (4 returned) and 11 hotels
- Sell hotel back to 4 houses → pool shows 32−4=28 houses and 12 hotels

### After Fix 3 (Mortgaged Trade Fee)
- Trade a mortgaged property → receiver's balance decremented by 5% of price
- Trade confirms via history log showing interest charge

### After Fix 4 (GOOJF Card Uniqueness)
- Player draws GOOJF from Chance → `chanceJailCardHeld = true`
- Second player lands on Chance → GOOJF cannot be drawn again
- First player uses the card → `chanceJailCardHeld = false`, card re-enters deck

---

## Order of Implementation

1. **Fix 4** (GOOJF uniqueness) — self-contained, minimal scope
2. **Fix 2** (housing pool) — add two counters and pool-check guards in existing handlers
3. **Fix 3** (mortgaged trade fee) — add to both `trade-update` and `submit-trade` handlers
4. **Fix 1** (auction system) — largest change; implement server first, then client
