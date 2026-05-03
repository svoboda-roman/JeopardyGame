import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db/client.ts";
import { media as mediaTable } from "../db/schema.ts";
import { HttpError, notFound, requireUser } from "../lib/auth-helpers.ts";
import { storage } from "../storage/index.ts";

const ALLOWED_MIMES = new Set([
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
]);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function extFor(mime: string): string {
	switch (mime) {
		case "image/png":
			return "png";
		case "image/jpeg":
			return "jpg";
		case "image/webp":
			return "webp";
		case "image/gif":
			return "gif";
		default:
			return "bin";
	}
}

function storageKeyFor(id: string, mime: string): string {
	const now = new Date();
	const yyyy = now.getUTCFullYear();
	const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
	return `${yyyy}/${mm}/${id}.${extFor(mime)}`;
}

export const mediaRoutes = new Elysia({ tags: ["media"] })
	.onError(({ error, set }) => {
		if (error instanceof HttpError) {
			set.status = error.status;
			return { error: { code: error.code, message: error.message } };
		}
	})

	.post(
		"/media",
		async ({ request, body, set }) => {
			const u = await requireUser(request);
			const file = body.file;
			if (!(file instanceof File))
				throw new HttpError(422, "validation_error", "file is required");
			if (!ALLOWED_MIMES.has(file.type))
				throw new HttpError(
					422,
					"unsupported_mime",
					`Unsupported mime type: ${file.type}`,
				);
			if (file.size > MAX_BYTES)
				throw new HttpError(
					413,
					"file_too_large",
					`Max upload size is ${MAX_BYTES} bytes`,
				);

			const id = crypto.randomUUID();
			const key = storageKeyFor(id, file.type);
			const bytes = new Uint8Array(await file.arrayBuffer());
			await storage.put(key, bytes);

			const [row] = await db
				.insert(mediaTable)
				.values({
					id,
					ownerId: u.id,
					storageKey: key,
					mime: file.type,
					byteSize: file.size,
				})
				.returning();
			if (!row) throw new Error("media insert returned no row");
			set.status = 201;
			return {
				media: {
					id: row.id,
					mime: row.mime,
					byteSize: row.byteSize,
					url: `/media/${row.id}/file`,
				},
			};
		},
		{
			body: t.Object({
				file: t.File({ maxSize: MAX_BYTES }),
			}),
		},
	)

	.get("/media/:id/file", async ({ params }) => {
		const row = (
			await db
				.select()
				.from(mediaTable)
				.where(eq(mediaTable.id, params.id))
				.limit(1)
		)[0];
		if (!row) notFound("Media not found");
		const bytes = await storage.get(row.storageKey);
		// Copy into a fresh ArrayBuffer so the Blob ctor's BlobPart type is happy
		// across both the server's and web's tsconfigs (web sees this file via
		// the shared App type and is stricter about ArrayBufferLike).
		const buf = new ArrayBuffer(bytes.byteLength);
		new Uint8Array(buf).set(bytes);
		return new Response(new Blob([buf], { type: row.mime }), {
			headers: {
				"content-type": row.mime,
				"cache-control": "private, max-age=31536000, immutable",
			},
		});
	})

	.delete("/media/:id", async ({ request, params, set }) => {
		const u = await requireUser(request);
		const row = (
			await db
				.select()
				.from(mediaTable)
				.where(and(eq(mediaTable.id, params.id), eq(mediaTable.ownerId, u.id)))
				.limit(1)
		)[0];
		if (!row) notFound("Media not found");
		await db.delete(mediaTable).where(eq(mediaTable.id, params.id));
		await storage.delete(row.storageKey);
		set.status = 204;
	});
