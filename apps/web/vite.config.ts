/// <reference types="vitest/config" />

import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		tanstackRouter({ target: "react", autoCodeSplitting: true }),
		viteReact(),
		tailwindcss(),
	],
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./test/setup.ts"],
	},
});
