import { describe, expect, it } from "bun:test";
import {
	generateRoomCode,
	isValidRoomCode,
	ROOM_CODE_LENGTH,
} from "../src/lib/room-code.ts";

describe("room code", () => {
	it("is the right length and uses only the allowed alphabet", () => {
		for (let i = 0; i < 200; i++) {
			const code = generateRoomCode();
			expect(code).toHaveLength(ROOM_CODE_LENGTH);
			expect(isValidRoomCode(code)).toBe(true);
			// No vowels, no I/O
			expect(/[AEIOU]/.test(code)).toBe(false);
		}
	});

	it("rejects bad codes", () => {
		expect(isValidRoomCode("AEIOUA")).toBe(false);
		expect(isValidRoomCode("SHORT")).toBe(false);
		expect(isValidRoomCode("TOOOLONG")).toBe(false);
		expect(isValidRoomCode("BCDfgh")).toBe(false); // lowercase not allowed
	});

	it("produces enough variety (sanity, not a randomness test)", () => {
		const seen = new Set<string>();
		for (let i = 0; i < 100; i++) seen.add(generateRoomCode());
		expect(seen.size).toBeGreaterThan(90);
	});
});
