import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { auth } from "./auth.ts";
import { env } from "./env.ts";
import { games } from "./routes/games.ts";
import { gamesWs } from "./routes/games-ws.ts";
import { mediaRoutes } from "./routes/media.ts";
import { quizzes } from "./routes/quizzes.ts";
import { share } from "./routes/share.ts";

export const app = new Elysia()
	.use(
		openapi({
			path: "/docs",
			documentation: {
				info: {
					title: "JeopardyGame API",
					version: "0.1.0",
					description:
						"Realtime Jeopardy-style quiz game. See docs/api.md for the canonical contract.",
				},
				tags: [
					{ name: "auth", description: "Identity, sessions, password reset." },
					{ name: "quizzes", description: "Quiz authoring CRUD." },
					{ name: "share", description: "Public quiz share links." },
					{
						name: "meta",
						description: "Health and other operational endpoints.",
					},
				],
			},
		}),
	)
	.use(
		cors({
			origin: env.webOrigin,
			credentials: true,
			allowedHeaders: ["Content-Type", "Authorization"],
			methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
		}),
	)
	.get("/health", () => ({ ok: true }), { detail: { tags: ["meta"] } })
	.all("/api/auth/*", ({ request }) => auth.handler(request), {
		detail: {
			tags: ["auth"],
			description:
				"better-auth handler. See better-auth docs for the catalogue of paths under /api/auth.",
		},
	})
	.get(
		"/me",
		async ({ request, set }) => {
			const session = await auth.api.getSession({ headers: request.headers });
			if (!session) {
				set.status = 401;
				return { error: { code: "unauthenticated", message: "No session" } };
			}
			return { user: session.user, session: session.session };
		},
		{ detail: { tags: ["auth"] } },
	)
	.use(quizzes)
	.use(mediaRoutes)
	.use(share)
	.use(games)
	.use(gamesWs);

export type App = typeof app;
