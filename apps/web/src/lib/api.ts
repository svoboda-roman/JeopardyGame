import { treaty } from "@elysiajs/eden";
import type { App } from "server/src/app.ts";

const baseURL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export const api = treaty<App>(baseURL, {
	fetch: { credentials: "include" },
});

export type Api = typeof api;
