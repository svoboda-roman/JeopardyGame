import { randomBytes } from "node:crypto";

// 24 random bytes → 32 char base64url. Unguessable per FR-Q8 / NFR-S7.
export function generateShareToken(): string {
	return randomBytes(24).toString("base64url");
}
