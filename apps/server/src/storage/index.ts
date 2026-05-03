import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

// Abstract media backend. Swapping to S3/R2 later means replacing the
// concrete impl, not touching call sites.
export interface Storage {
	put(key: string, bytes: Uint8Array): Promise<void>;
	get(key: string): Promise<Uint8Array>;
	delete(key: string): Promise<void>;
}

export class LocalDiskStorage implements Storage {
	constructor(private readonly root: string) {}

	private path(key: string): string {
		// Block path traversal — keys are server-generated but defence in depth.
		const safe = key.replace(/\\/g, "/").replace(/^\/+/, "");
		if (safe.includes("..")) throw new Error(`bad storage key: ${key}`);
		return resolve(this.root, safe);
	}

	async put(key: string, bytes: Uint8Array): Promise<void> {
		const p = this.path(key);
		await mkdir(dirname(p), { recursive: true });
		await writeFile(p, bytes);
	}

	async get(key: string): Promise<Uint8Array> {
		return new Uint8Array(await readFile(this.path(key)));
	}

	async delete(key: string): Promise<void> {
		try {
			await unlink(this.path(key));
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
		}
	}
}

const root = process.env.UPLOADS_DIR
	? resolve(process.env.UPLOADS_DIR)
	: join(process.cwd(), "uploads");

export const storage: Storage = new LocalDiskStorage(root);
