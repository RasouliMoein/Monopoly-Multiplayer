import { test, expect } from "@playwright/test";

test.describe("Monopoly Multiplayer E2E Tests", () => {
    test("Full game loop: join, roll, move animations, audio intercepts, buy property, money animations, and insights tab", async ({
        browser,
    }) => {
        console.log("[E2E] Starting test with separate browser contexts...");

        // --- 1. SET UP ISOLATED BROWSER CONTEXTS ---
        const context1 = await browser.newContext();
        const context2 = await browser.newContext();

        const page1 = await context1.newPage();
        const page2 = await context2.newPage();

        // Print console logs from browser context to test runner stdout
        page1.on("console", (msg) => console.log(`[Host Console] ${msg.type()}: ${msg.text()}`));
        page2.on("console", (msg) => console.log(`[Guest Console] ${msg.type()}: ${msg.text()}`));

        // Track step sound network requests on page1
        const audioRequests: string[] = [];
        page1.on("request", (req) => {
            if (req.url().endsWith("step2.mp3")) {
                audioRequests.push(req.url());
            }
        });

        // --- 2. HOST GAME (PLAYER 1) ---
        console.log("[E2E] Page 1 navigating to home...");
        await page1.goto("/");
        await expect(page1).toHaveTitle(/Monopoly/);

        // Fill host name
        await page1.locator(".header-name-input").fill("HostPlayer");
        // Create 2-player lobby
        await page1.locator(".premium-select").selectOption("2");
        await page1.click("text=Host & Play Game");

        // Wait to join lobby and display room code
        console.log("[E2E] Page 1 waiting for room code...");
        await expect(page1.locator(".pill-code")).toBeVisible({ timeout: 15000 });
        const roomCode = await page1.locator(".pill-code").innerText();
        console.log(`[E2E] Room Code is: ${roomCode}`);
        expect(roomCode.length).toBeGreaterThan(0);

        // --- 3. JOIN LOBBY (PLAYER 2) ---
        console.log("[E2E] Page 2 navigating to home...");
        await page2.goto("/");
        await page2.locator(".header-name-input").fill("GuestPlayer");
        await page2.locator("#room-code").fill(roomCode);
        console.log("[E2E] Page 2 clicking Join Lobby...");
        await page2.click("text=Join Lobby");

        // Wait until both see both players in the lobby list
        console.log("[E2E] Waiting for player list to update with both usernames...");
        await expect(page1.locator("text=GuestPlayer")).toBeVisible({ timeout: 15000 });
        await expect(page2.locator("text=HostPlayer")).toBeVisible({ timeout: 15000 });

        // --- 4. TOGGLE READY TO START MATCH ---
        console.log("[E2E] Toggling players to ready...");
        // Player 2 Toggles Ready
        await page2.click("text=Toggle Ready");
        // Player 1 Toggles Ready (Host)
        await page1.click("text=Toggle Ready (Host)");

        // Wait for the game board to mount and display GO tile
        console.log("[E2E] Waiting for board GO tile to render...");
        await expect(page1.locator("div.street[data-position='0']")).toBeVisible({ timeout: 15000 });
        await expect(page2.locator("div.street[data-position='0']")).toBeVisible({ timeout: 15000 });

        // Ensure both players are placed at GO tile (position 0)
        const hostToken = page1.locator("div.player[player-position='0']").first();
        await expect(hostToken).toBeVisible();

        // --- 5. VERIFY GAME DEBUGGER PANEL & SET NEXT ROLL ---
        console.log("[E2E] Triggering debug authentication post-connection...");
        // Trigger debug authenticate window event to prevent client name-registration race condition
        await page1.evaluate(() => {
            window.dispatchEvent(
                new CustomEvent("debug_toggle_auth", {
                    detail: { password: "monopolyadmin" },
                }),
            );
        });

        console.log("[E2E] Waiting for Game Debugger panel to render...");
        await expect(page1.locator(".debug-panel")).toBeVisible({ timeout: 8000 });

        // Set Next Roll to [1, 2] (3 steps total) to land on position 3 (Baltic Avenue)
        await page1.locator("select").nth(2).selectOption("1"); // overrideD1
        await page1.locator("select").nth(3).selectOption("2"); // overrideD2

        // Click the precise "Set" button for dice overrides (exact match)
        await page1.getByRole("button", { name: "Set", exact: true }).click();
        console.log("[E2E] Dice override set to [1, 2]");

        // --- 6. ROLL DICE AND INTERCEPT STEP ANIMATIONS & AUDIO ---
        audioRequests.length = 0;
        console.log("[E2E] HostPlayer rolling dice...");
        await page1.click("button[data-button-type='roll']");

        // Wait for step-by-step movement: check that animation style was applied
        console.log("[E2E] Waiting for jumpstreet animation...");
        await page1.waitForFunction(
            () => {
                const playerEl = document.querySelector("div.player") as HTMLDivElement | null;
                return playerEl && playerEl.style.animation.includes("jumpstreet");
            },
            { timeout: 8000 },
        );

        // Assert step sound step2.mp3 was requested via network
        console.log("[E2E] Asserting audio requests for step2.mp3...");
        await expect.poll(() => audioRequests.length).toBeGreaterThan(0);

        // Wait for movement to finish (it lands at Baltic Avenue - pos 3)
        console.log("[E2E] Waiting for movement to complete (part animation)...");
        await page1.waitForFunction(
            () => {
                const playerEl = document.querySelector("div.player") as HTMLDivElement | null;
                return playerEl && playerEl.style.animation.includes("part");
            },
            { timeout: 10000 },
        );

        // --- 7. VERIFY BUY DIALOGUE OVERLAYS & BUYING ACTION ---
        console.log("[E2E] Verifying buy dialog...");
        const buyDialog = page1.locator(".card-display-actions");
        await expect(buyDialog).toBeVisible();

        const buyButton = page1.locator("#card-response-yes");
        await expect(buyButton).toBeVisible();

        // Capture money animation updates before clicking buy
        const moneyAnimationEl = page1.locator("img#moneyAnimations");
        await expect(moneyAnimationEl).toHaveAttribute("data-anim", "0");

        // Click BUY property
        console.log("[E2E] Clicking YES to buy property...");
        await buyButton.click();

        // Verify green particle overlay / money animations trigger (data-anim set to "1")
        console.log("[E2E] Verifying money animation attribute updates...");
        await expect(moneyAnimationEl).toHaveAttribute("data-anim", "1", { timeout: 5000 });

        // --- 8. VERIFY INSIGHTS DRAWER PANEL SLIDE ANIMATIONS ---
        console.log("[E2E] Verifying Insights bottom drawer...");
        const insightsNavBtn = page1.locator("div[data-tooltip-hover='insights']");
        await expect(insightsNavBtn).toBeVisible();
        await insightsNavBtn.click();

        const insightsDrawer = page1.locator(".insights-bottom-drawer");
        await expect(insightsDrawer).toBeVisible();
        await expect(page1.locator(".insights-drawer-panel")).toBeVisible();

        // Collapse the Game Debugger panel to prevent pointer event intercepts
        console.log("[E2E] Collapsing Game Debugger panel...");
        await page1.locator(".debug-close-btn").click();
        await expect(page1.locator(".debug-panel.collapsed")).toBeVisible({ timeout: 5000 });

        // Close insights drawer (can now be clicked normally)
        console.log("[E2E] Closing Insights drawer...");
        await page1.locator(".insights-drawer-close").click();
        await expect(insightsDrawer).not.toBeVisible();

        console.log("[E2E] Test run completed successfully!");
    });
});
