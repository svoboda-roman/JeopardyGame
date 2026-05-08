import { expect, type Page, test } from "@playwright/test";

/**
 * Mobile UI smoke tests. Run only on phone-class device projects (see
 * playwright.config.ts). The big rule we're enforcing: every <input> a
 * player can focus must have a computed font-size ≥ 16px, otherwise iOS
 * Safari auto-zooms the page on focus — which is exactly what the user
 * reported when scanning a QR code into /join.
 */

const MIN_FONT_PX = 16;

async function assertNoHorizontalScroll(page: Page) {
	const overflow = await page.evaluate(() => ({
		scrollWidth: document.documentElement.scrollWidth,
		clientWidth: document.documentElement.clientWidth,
	}));
	expect(
		overflow.scrollWidth,
		`page overflowed horizontally (scrollWidth=${overflow.scrollWidth}, clientWidth=${overflow.clientWidth})`,
	).toBeLessThanOrEqual(overflow.clientWidth);
}

async function assertInputsAreReadable(page: Page) {
	const inputs = page.locator(
		'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"])',
	);
	const count = await inputs.count();
	expect(count, "page should have at least one user input").toBeGreaterThan(0);
	for (let i = 0; i < count; i++) {
		const el = inputs.nth(i);
		const fontPx = await el.evaluate(
			(node) =>
				Number.parseFloat(getComputedStyle(node as Element).fontSize) || 0,
		);
		const name =
			(await el.getAttribute("name")) ??
			(await el.getAttribute("id")) ??
			(await el.getAttribute("type")) ??
			`#${i}`;
		expect(
			fontPx,
			`input "${name}" has font-size ${fontPx}px — < ${MIN_FONT_PX}px will trigger iOS auto-zoom on focus`,
		).toBeGreaterThanOrEqual(MIN_FONT_PX);
	}
}

test.describe("phone-sized layouts don't auto-zoom or overflow", () => {
	test("/join", async ({ page }) => {
		await page.goto("/join");
		await expect(
			page.getByRole("heading", { name: /join a game/i }),
		).toBeVisible();
		await assertInputsAreReadable(page);
		await assertNoHorizontalScroll(page);
	});

	test("/login", async ({ page }) => {
		await page.goto("/login");
		await expect(page.getByLabel(/email/i)).toBeVisible();
		await assertInputsAreReadable(page);
		await assertNoHorizontalScroll(page);
	});

	test("/register", async ({ page }) => {
		await page.goto("/register");
		await expect(page.getByLabel(/display name/i)).toBeVisible();
		await assertInputsAreReadable(page);
		await assertNoHorizontalScroll(page);
	});

	test("/join with prefilled QR code param", async ({ page }) => {
		await page.goto("/join?code=ABCDEF");
		const codeInput = page.locator("#code");
		await expect(codeInput).toHaveValue("ABCDEF");
		await assertInputsAreReadable(page);
		await assertNoHorizontalScroll(page);
	});

	test("/ landing page", async ({ page }) => {
		await page.goto("/");
		await assertNoHorizontalScroll(page);
	});
});
