interface IconRule {
	keywords: string[];
	icon: string;
}

const RULES: IconRule[] = [
	{ keywords: ["vodka"], icon: "🍸" },
	{ keywords: ["rum"], icon: "🥃" },
	{ keywords: ["beefeater", "gin"], icon: "🍸" },
	{ keywords: ["beer", "pivo"], icon: "🍺" },
	{ keywords: ["wine", "vino"], icon: "🍷" },
	{ keywords: ["tequila", "tequilla"], icon: "🌵" },
	{ keywords: ["whiskey", "whisky"], icon: "🥃" },
	{ keywords: ["jager"], icon: "🦌" },
	{ keywords: ["zelena", "green"], icon: "🍃" },
	{ keywords: ["tatratea", "tatra"], icon: "🍵" },
];

const DEFAULT_ICON = "🥤";
const COMBINING_DIACRITICS = /[̀-ͯ]/g;

function normalize(s: string): string {
	return s.toLowerCase().normalize("NFD").replace(COMBINING_DIACRITICS, "");
}

export function iconForDrink(name: string): string {
	const n = normalize(name);
	for (const r of RULES) {
		if (r.keywords.some((k) => n.includes(k))) return r.icon;
	}
	return DEFAULT_ICON;
}
