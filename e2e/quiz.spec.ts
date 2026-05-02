import { expect, test } from "@playwright/test";
import { createQuizViaUI, registerUser } from "./helpers";

test.describe("quizzes", () => {
	test("create, edit category, list, then delete", async ({ page }) => {
		await registerUser(page);

		const { title } = await createQuizViaUI(page, {
			title: `My Quiz ${Date.now()}`,
		});

		// Edit first category title — uses aria-label "Category 1 title".
		const cat = page.getByLabel(/Category 1 title/);
		await cat.fill("Trivia");
		await cat.blur();

		// Quizzes list shows the new quiz.
		await page.goto("/quizzes");
		await expect(
			page.getByRole("link", { name: new RegExp(title) }),
		).toBeVisible();

		// Open it and delete it.
		await page.getByRole("link", { name: new RegExp(title) }).click();
		page.once("dialog", (d) => d.accept());
		await page.getByRole("button", { name: /^delete$/i }).click();

		// Land back on /quizzes; the quiz is gone.
		await expect(page).toHaveURL(/\/quizzes$/);
		await expect(
			page.getByRole("link", { name: new RegExp(title) }),
		).toHaveCount(0);
	});
});
