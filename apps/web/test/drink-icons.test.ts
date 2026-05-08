import { describe, expect, it } from "vitest";
import { iconForDrink } from "#/lib/drink-icons.ts";

describe("iconForDrink", () => {
	it.each([
		["Vodka", "🍸"],
		["absolut vodka", "🍸"],
		["Rum", "🥃"],
		["Bacardi Rum", "🥃"],
		["Beefeater", "🍸"],
		["Bombay Gin", "🍸"],
		["Pilsner Beer", "🍺"],
		["pivo", "🍺"],
		["Red Wine", "🍷"],
		["bílé víno", "🍷"],
		["Tequila", "🌵"],
		["tequilla shot", "🌵"],
		["Whiskey Sour", "🥃"],
		["whisky", "🥃"],
		["Jägermeister", "🦌"],
		["jagermeister", "🦌"],
		["Zelená", "🍃"],
		["green chartreuse", "🍃"],
		["Tatratea", "🍵"],
		["mystery juice", "🥤"],
	])("maps %s → %s", (name, expected) => {
		expect(iconForDrink(name)).toBe(expected);
	});
});
