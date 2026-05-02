import { expect, type Page } from "@playwright/test";

export function uniqueEmail(prefix = "e2e"): string {
	return `${prefix}+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.local`;
}

export const PASSWORD = "correct-horse-battery-staple";

/** Register a new user via the UI and end up on /me. */
export async function registerUser(
	page: Page,
	opts?: { name?: string; email?: string },
) {
	const email = opts?.email ?? uniqueEmail();
	const name = opts?.name ?? `User ${email.split("@")[0]}`;
	await page.goto("/register");
	await page.getByLabel("Display name").fill(name);
	await page.getByLabel("Email").fill(email);
	await page.getByLabel("Password").fill(PASSWORD);
	await page.getByRole("button", { name: /create account/i }).click();
	await expect(page).toHaveURL(/\/me$/);
	return { email, name };
}

export async function loginUser(
	page: Page,
	email: string,
	password = PASSWORD,
) {
	await page.goto("/login");
	await page.getByLabel("Email").fill(email);
	await page.getByLabel("Password").fill(password);
	await page.getByRole("button", { name: /^log in$/i }).click();
	await expect(page).toHaveURL(/\/me$/);
}

/** Build a tiny quiz (1 category, 1 $100 question) and return its id. */
export async function createQuizViaUI(
	page: Page,
	opts?: { title?: string; clue?: string; answer?: string },
) {
	await page.goto("/quizzes");
	await page.getByRole("button", { name: /new quiz/i }).click();
	const title = opts?.title ?? `E2E Quiz ${Date.now()}`;
	await page.getByLabel(/title/i).fill(title);
	await page.getByRole("button", { name: /create/i }).click();
	await expect(page).toHaveURL(/\/quizzes\/[a-z0-9-]+$/i);

	// First $100 cell — accessible name is "$100 empty" (value + placeholder).
	await page
		.getByRole("button", { name: /^\$100\b/ })
		.first()
		.click();
	await page.getByLabel(/clue/i).fill(opts?.clue ?? "What is 2 + 2?");
	await page.getByLabel(/^answer$/i).fill(opts?.answer ?? "4");
	// Wait for the debounced save to land.
	await expect(page.getByText(/saved at/i)).toBeVisible({ timeout: 5000 });
	await page.keyboard.press("Escape");
	return { title };
}
