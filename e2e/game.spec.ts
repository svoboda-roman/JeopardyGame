import { type BrowserContext, expect, test } from "@playwright/test";
import { createQuizViaUI, registerUser } from "./helpers";

test.describe("game flow", () => {
	test("host creates game, player joins, full Q&A round", async ({
		browser,
	}) => {
		// Two isolated contexts — separate cookie jars = separate identities.
		const hostCtx: BrowserContext = await browser.newContext();
		const playerCtx: BrowserContext = await browser.newContext();
		const host = await hostCtx.newPage();
		const player = await playerCtx.newPage();

		try {
			// Host: register, build a quiz with one $100 cell.
			await registerUser(host, { name: "Host User" });
			await createQuizViaUI(host, {
				title: `E2E ${Date.now()}`,
				clue: "Largest planet",
				answer: "Jupiter",
			});

			// Open the host options dialog and start a game.
			await host.getByRole("button", { name: /host game/i }).click();
			const dialog = host.getByRole("dialog", { name: /host game options/i });
			await expect(dialog).toBeVisible();
			// Disable Final Jeopardy so the round closes after the single question.
			await dialog.getByLabel(/final jeopardy/i).uncheck();
			// Zero read-delay → buzz_open fires immediately, no early-buzz race.
			await dialog.getByLabel(/read delay/i).fill("0");
			await dialog.getByRole("button", { name: /start game/i }).click();
			await expect(host).toHaveURL(/\/host\/[A-Z0-9]{6}/);

			const url = host.url();
			const roomCode = url.split("/host/")[1]!;

			// Host should see the lobby (room code rendered, players section).
			await expect(host.locator(".room-code").first()).toHaveText(roomCode);
			await expect(
				host.getByRole("heading", { name: /players/i }),
			).toBeVisible();

			// Player: join via /join?code=…
			await player.goto(`/join?code=${roomCode}`);
			await player.getByLabel(/display name/i).fill("Player One");
			await player.getByRole("button", { name: /join game/i }).click();
			await expect(player).toHaveURL(new RegExp(`/play/${roomCode}`));
			await expect(player.getByText("Player One").first()).toBeVisible();

			// Host should now see the player listed.
			await expect(host.getByText("Player One").first()).toBeVisible();

			// Host starts the game.
			await host.getByRole("button", { name: /^start game$/i }).click();
			await expect(host.getByText(/Phase:/)).toContainText("picking");

			// Host clicks the $100 cell — opens the question. Board cells are
			// the only buttons whose accessible name is exactly "$100".
			await host
				.getByRole("button", { name: "$100", exact: true })
				.first()
				.click();
			await expect(host.getByText("Largest planet")).toBeVisible();
			await expect(player.getByText("Largest planet")).toBeVisible();

			// Wait until the server has actually opened buzz (host's phase line flips).
			// Otherwise a buzz during `reading` is treated as an early-buzz lockout.
			await expect(host.getByText(/Phase:/)).toContainText("buzz_open");
			const buzz = player.getByRole("button", { name: /buzz/i });
			await buzz.click();

			// Host sees "Player One ... buzzed in" and judges correct.
			await expect(host.getByText(/Player One/).first()).toBeVisible();
			await host.getByRole("button", { name: /^correct$/i }).click();

			// Score updates to 100 on both sides — assert via the score class
			// so we don't collide with the closed board cell that also reads $100.
			await expect(
				host.locator(".score").filter({ hasText: "$100" }).first(),
			).toBeVisible();
			await expect(
				player.locator(".score").filter({ hasText: "$100" }).first(),
			).toBeVisible();

			// After a correct judge the round returns to picking and the picker
			// rotates to the player who answered correctly (FR-MG).
			await expect(host.getByText(/Phase:/)).toContainText("picking");
		} finally {
			await hostCtx.close();
			await playerCtx.close();
		}
	});
});
