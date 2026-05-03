import { treaty } from "@elysiajs/eden";
import type { App } from "server/src/app.ts";

const baseURL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export const api = treaty<App>(baseURL, {
	fetch: { credentials: "include" },
});

export type Api = typeof api;

/** Resolve a server-relative path (e.g. /media/<id>/file) to a full URL. */
export function apiUrl(path: string): string {
	if (path.startsWith("http")) return path;
	return `${baseURL}${path.startsWith("/") ? "" : "/"}${path}`;
}
