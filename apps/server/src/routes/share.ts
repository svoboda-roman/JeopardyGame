import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../db/client.ts";
import {
	game as gameTable,
	quizShare as quizShareTable,
	quiz as quizTable,
	userProfile as userProfileTable,
	user as userTable,
} from "../db/schema.ts";
import { HttpError, notFound } from "../lib/auth-helpers.ts";

export const share = new Elysia({ tags: ["share"] })
	.onError(({ error, set }) => {
		if (error instanceof HttpError) {
			set.status = error.status;
			return { error: { code: error.code, message: error.message } };
		}
	})
	.get("/share/:token", async ({ params }) => {
		const rows = await db
			.select({
				quizId: quizTable.id,
				ownerId: quizTable.ownerId,
				quizTitle: quizTable.title,
				ownerName: userProfileTable.displayName,
				userName: userTable.name,
			})
			.from(quizShareTable)
			.innerJoin(quizTable, eq(quizTable.id, quizShareTable.quizId))
			.innerJoin(userTable, eq(userTable.id, quizTable.ownerId))
			.leftJoin(userProfileTable, eq(userProfileTable.userId, userTable.id))
			.where(
				and(
					eq(quizShareTable.token, params.token),
					isNull(quizShareTable.revokedAt),
				),
			)
			.limit(1);
		const r = rows[0];
		if (!r) notFound("Share not found");

		// Surface the quiz owner's currently in-flight game (if any) so the
		// share preview can offer a one-click join. We match on `hostId`
		// rather than `quizId` because deleting a quiz nulls `game.quizId`
		// but the live game may still be running.
		const live = await db
			.select({ roomCode: gameTable.roomCode })
			.from(gameTable)
			.where(
				and(
					eq(gameTable.hostId, r.ownerId),
					inArray(gameTable.status, ["lobby", "active", "paused"]),
					eq(gameTable.quizId, r.quizId),
				),
			)
			.orderBy(desc(gameTable.createdAt))
			.limit(1);

		return {
			quizTitle: r.quizTitle,
			ownerDisplayName: r.ownerName ?? r.userName,
			activeRoomCode: live[0]?.roomCode ?? null,
		};
	});
