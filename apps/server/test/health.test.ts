import { describe, expect, it } from "bun:test";
import { call } from "./helpers.ts";

describe("GET /health", () => {
	it("returns 200 and { ok: true }", async () => {
		const res = await call("/health");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
	});
});
