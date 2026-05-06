import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function extractYouTubeId(input: string): string | null {
	const s = input.trim();
	if (!s) return null;
	if (YT_ID_RE.test(s)) return s;
	try {
		const url = new URL(s);
		if (url.hostname === "youtu.be") {
			const id = url.pathname.slice(1, 12);
			if (YT_ID_RE.test(id)) return id;
		}
		if (url.hostname.endsWith("youtube.com")) {
			const v = url.searchParams.get("v");
			if (v && YT_ID_RE.test(v)) return v;
			const m = url.pathname.match(/\/embed\/([A-Za-z0-9_-]{11})/);
			if (m?.[1]) return m[1];
		}
	} catch {
		// not a URL
	}
	return null;
}
