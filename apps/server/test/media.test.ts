import { beforeAll, describe, expect, it } from "bun:test";
import { call, signUpAndGetCookie } from "./helpers.ts";

let cookie: string;
let otherCookie: string;

beforeAll(async () => {
	cookie = await signUpAndGetCookie("Media Owner");
	otherCookie = await signUpAndGetCookie("Other");
});

// 1×1 transparent PNG.
const PNG_BYTES = Uint8Array.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
	0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
	0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44,
	0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
	0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
	0x60, 0x82,
]);

function pngForm(name = "pixel.png", mime = "image/png"): FormData {
	const fd = new FormData();
	fd.append("file", new File([PNG_BYTES], name, { type: mime }));
	return fd;
}

async function uploadPng(c = cookie) {
	const res = await call("/media", {
		method: "POST",
		headers: { cookie: c },
		body: pngForm(),
	});
	expect(res.status).toBe(201);
	const body = (await res.json()) as {
		media: { id: string; mime: string; byteSize: number; url: string };
	};
	return body.media;
}

describe("media routes", () => {
	it("rejects anonymous upload", async () => {
		const res = await call("/media", { method: "POST", body: pngForm() });
		expect(res.status).toBe(401);
	});

	it("uploads a PNG and serves it back", async () => {
		const m = await uploadPng();
		expect(m.mime).toBe("image/png");
		expect(m.byteSize).toBe(PNG_BYTES.byteLength);
		expect(m.url).toBe(`/media/${m.id}/file`);

		const file = await call(m.url);
		expect(file.status).toBe(200);
		expect(file.headers.get("content-type")).toBe("image/png");
		const got = new Uint8Array(await file.arrayBuffer());
		expect(got.byteLength).toBe(PNG_BYTES.byteLength);
	});

	it("rejects an unsupported mime", async () => {
		const fd = new FormData();
		fd.append(
			"file",
			new File([new Uint8Array([1, 2, 3])], "x.txt", { type: "text/plain" }),
		);
		const res = await call("/media", {
			method: "POST",
			headers: { cookie },
			body: fd,
		});
		expect(res.status).toBe(422);
	});

	it("blocks deleting media owned by someone else", async () => {
		const m = await uploadPng();
		const res = await call(`/media/${m.id}`, {
			method: "DELETE",
			headers: { cookie: otherCookie },
		});
		expect(res.status).toBe(404);
	});

	it("owner can delete media", async () => {
		const m = await uploadPng();
		const res = await call(`/media/${m.id}`, {
			method: "DELETE",
			headers: { cookie },
		});
		expect(res.status).toBe(204);
		const file = await call(m.url);
		expect(file.status).toBe(404);
	});
});

describe("question media attachment", () => {
	async function createQuiz(c = cookie) {
		const res = await call("/quizzes", {
			method: "POST",
			headers: { "Content-Type": "application/json", cookie: c },
			body: JSON.stringify({ title: "Quiz w/ media" }),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { quiz: { id: string } };
		return body.quiz.id;
	}

	async function firstQuestionId(quizId: string, c = cookie) {
		const res = await call(`/quizzes/${quizId}`, { headers: { cookie: c } });
		const body = (await res.json()) as { questions: { id: string }[] };
		return body.questions[0]!.id;
	}

	it("attaches mediaIds to a question and returns them in GET", async () => {
		const m1 = await uploadPng();
		const m2 = await uploadPng();
		const quizId = await createQuiz();
		const qId = await firstQuestionId(quizId);

		const patch = await call(`/questions/${qId}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json", cookie },
			body: JSON.stringify({ mediaIds: [m1.id, m2.id] }),
		});
		expect(patch.status).toBe(200);

		const detail = (await (
			await call(`/quizzes/${quizId}`, { headers: { cookie } })
		).json()) as {
			questions: { id: string; media: { id: string; url: string }[] }[];
		};
		const q = detail.questions.find((x) => x.id === qId);
		expect(q?.media.map((m) => m.id)).toEqual([m1.id, m2.id]);
	});

	it("rejects mediaIds owned by another user", async () => {
		const theirs = await uploadPng(otherCookie);
		const quizId = await createQuiz();
		const qId = await firstQuestionId(quizId);

		const res = await call(`/questions/${qId}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json", cookie },
			body: JSON.stringify({ mediaIds: [theirs.id] }),
		});
		expect(res.status).toBe(422);
	});

	it("replaces media list when mediaIds is sent again", async () => {
		const m1 = await uploadPng();
		const m2 = await uploadPng();
		const quizId = await createQuiz();
		const qId = await firstQuestionId(quizId);

		await call(`/questions/${qId}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json", cookie },
			body: JSON.stringify({ mediaIds: [m1.id, m2.id] }),
		});
		await call(`/questions/${qId}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json", cookie },
			body: JSON.stringify({ mediaIds: [m2.id] }),
		});

		const detail = (await (
			await call(`/quizzes/${quizId}`, { headers: { cookie } })
		).json()) as {
			questions: { id: string; media: { id: string }[] }[];
		};
		const q = detail.questions.find((x) => x.id === qId);
		expect(q?.media.map((m) => m.id)).toEqual([m2.id]);
	});
});
