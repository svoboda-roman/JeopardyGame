import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const ROOT = __dirname;
const WEB_PORT = 5173;
const SERVER_PORT = 3000;

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
	timeout: 30_000,
	expect: { timeout: 10_000 },
	use: {
		baseURL: `http://localhost:${WEB_PORT}`,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
		actionTimeout: 10_000,
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
	webServer: [
		{
			command: "bunx vite dev --port 5173 --strictPort",
			cwd: resolve(ROOT, "apps/web"),
			url: `http://localhost:${WEB_PORT}`,
			reuseExistingServer: true,
			timeout: 60_000,
			stdout: "pipe",
			stderr: "pipe",
		},
		{
			command: "bun --hot src/index.ts",
			cwd: resolve(ROOT, "apps/server"),
			// `/` returns 404; use the OpenAPI doc which is a stable 200.
			url: `http://localhost:${SERVER_PORT}/docs/json`,
			reuseExistingServer: true,
			timeout: 60_000,
			stdout: "pipe",
			stderr: "pipe",
		},
	],
});
