import { expect, test } from "@playwright/test";
import { loginUser, PASSWORD, registerUser, uniqueEmail } from "./helpers";

test.describe("auth", () => {
	test("register lands on /me with the user name", async ({ page }) => {
		const { name } = await registerUser(page);
		await expect(page.getByRole("heading", { name })).toBeVisible();
	});

	test("logout returns to /login and blocks /me", async ({ page }) => {
		await registerUser(page);
		await page.getByRole("button", { name: /log out/i }).click();
		await expect(page).toHaveURL(/\/login/);
		await page.goto("/me");
		await expect(page).toHaveURL(/\/login/);
	});

	test("login of an existing account works", async ({ page }) => {
		const email = uniqueEmail();
		await registerUser(page, { email });
		await page.getByRole("button", { name: /log out/i }).click();
		await expect(page).toHaveURL(/\/login/);
		await loginUser(page, email, PASSWORD);
		await expect(page).toHaveURL(/\/me$/);
	});

	test("login with wrong password shows an error", async ({ page }) => {
		const email = uniqueEmail();
		await registerUser(page, { email });
		await page.getByRole("button", { name: /log out/i }).click();
		await page.goto("/login");
		await page.getByLabel("Email").fill(email);
		await page.getByLabel("Password").fill("wrong-password-1234");
		await page.getByRole("button", { name: /^log in$/i }).click();
		await expect(page.getByText(/invalid|incorrect|wrong/i)).toBeVisible();
		await expect(page).toHaveURL(/\/login/);
	});
});
