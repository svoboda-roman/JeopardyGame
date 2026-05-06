import { sql } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex,
} from "drizzle-orm/pg-core";

const uuid = () => crypto.randomUUID();

// ───── better-auth core tables ─────
// Names match better-auth defaults so the drizzle adapter works without
// remapping. App-specific extensions go in `userProfile` below.

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").notNull().default(false),
	image: text("image"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export const session = pgTable("session", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	token: text("token").notNull().unique(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export const account = pgTable("account", {
	id: text("id").primaryKey(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at", {
		withTimezone: true,
	}),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
		withTimezone: true,
	}),
	scope: text("scope"),
	password: text("password"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

// ───── App profile (1:1 with user) ─────
// Holds JeopardyGame-specific fields not owned by better-auth.

export const userProfile = pgTable("user_profile", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	displayName: text("display_name").notNull(),
	avatarMediaId: text("avatar_media_id"),
	deletedAt: timestamp("deleted_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

// ───── Quiz authoring ─────

export const quiz = pgTable("quiz", {
	id: text("id").primaryKey().$defaultFn(uuid),
	ownerId: text("owner_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	title: text("title").notNull(),
	description: text("description"),
	settings: jsonb("settings")
		.$type<Record<string, unknown>>()
		.notNull()
		.default({}),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export const category = pgTable(
	"category",
	{
		id: text("id").primaryKey().$defaultFn(uuid),
		quizId: text("quiz_id")
			.notNull()
			.references(() => quiz.id, { onDelete: "cascade" }),
		position: integer("position").notNull(),
		title: text("title").notNull(),
	},
	(t) => [unique("category_quiz_position_uk").on(t.quizId, t.position)],
);

export const question = pgTable(
	"question",
	{
		id: text("id").primaryKey().$defaultFn(uuid),
		categoryId: text("category_id")
			.notNull()
			.references(() => category.id, { onDelete: "cascade" }),
		position: integer("position").notNull(),
		pointValue: integer("point_value").notNull(),
		isDailyDouble: boolean("is_daily_double").notNull().default(false),
		clue: text("clue").notNull().default(""),
		answer: text("answer").notNull().default(""),
		youtubeId: text("youtube_id"),
		answerYoutubeId: text("answer_youtube_id"),
		hostNotes: text("host_notes"),
		buzzWindowMs: integer("buzz_window_ms"),
	},
	(t) => [unique("question_category_position_uk").on(t.categoryId, t.position)],
);

export const media = pgTable(
	"media",
	{
		id: text("id").primaryKey().$defaultFn(uuid),
		ownerId: text("owner_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		storageKey: text("storage_key").notNull(),
		mime: text("mime").notNull(),
		byteSize: integer("byte_size").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [index("media_owner_idx").on(t.ownerId)],
);

export const questionMedia = pgTable(
	"question_media",
	{
		questionId: text("question_id")
			.notNull()
			.references(() => question.id, { onDelete: "cascade" }),
		mediaId: text("media_id")
			.notNull()
			.references(() => media.id, { onDelete: "cascade" }),
		position: integer("position").notNull(),
	},
	(t) => [
		unique("question_media_pk").on(t.questionId, t.mediaId),
		unique("question_media_position_uk").on(t.questionId, t.position),
	],
);

export const answerMedia = pgTable(
	"answer_media",
	{
		questionId: text("question_id")
			.notNull()
			.references(() => question.id, { onDelete: "cascade" }),
		mediaId: text("media_id")
			.notNull()
			.references(() => media.id, { onDelete: "cascade" }),
		position: integer("position").notNull(),
	},
	(t) => [
		unique("answer_media_pk").on(t.questionId, t.mediaId),
		unique("answer_media_position_uk").on(t.questionId, t.position),
	],
);

export const finalQuestion = pgTable("final_question", {
	id: text("id").primaryKey().$defaultFn(uuid),
	quizId: text("quiz_id")
		.notNull()
		.unique()
		.references(() => quiz.id, { onDelete: "cascade" }),
	category: text("category").notNull(),
	clue: text("clue").notNull(),
	answer: text("answer").notNull(),
});

// Stores the share token in plaintext on purpose: it IS the URL secret,
// not a credential, and we need to display the URL back to the owner.
export const quizShare = pgTable(
	"quiz_share",
	{
		id: text("id").primaryKey().$defaultFn(uuid),
		quizId: text("quiz_id")
			.notNull()
			.unique()
			.references(() => quiz.id, { onDelete: "cascade" }),
		token: text("token").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		revokedAt: timestamp("revoked_at", { withTimezone: true }),
	},
	(t) => [uniqueIndex("quiz_share_token_uk").on(t.token)],
);

// ───── Game runtime ─────

export const game = pgTable(
	"game",
	{
		id: text("id").primaryKey().$defaultFn(uuid),
		roomCode: text("room_code").notNull(),
		// Nullable + set null on quiz delete: deleting a quiz preserves the
		// game's history (results, room code, players) but loses the link to
		// the source quiz. Snapshots in `game_snapshot` keep the board.
		quizId: text("quiz_id").references(() => quiz.id, { onDelete: "set null" }),
		hostId: text("host_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		status: text("status").notNull(), // 'lobby' | 'active' | 'paused' | 'completed' | 'aborted'
		options: jsonb("options").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		startedAt: timestamp("started_at", { withTimezone: true }),
		endedAt: timestamp("ended_at", { withTimezone: true }),
	},
	(t) => [
		uniqueIndex("game_room_code_uk").on(t.roomCode),
		// A host may own at most one in-flight game (FR-G6).
		uniqueIndex("game_host_active_uk")
			.on(t.hostId)
			.where(sql`status in ('lobby','active','paused')`),
	],
);

export const gameSnapshot = pgTable("game_snapshot", {
	gameId: text("game_id")
		.primaryKey()
		.references(() => game.id, { onDelete: "cascade" }),
	quiz: jsonb("quiz").notNull(),
});

export const gamePlayer = pgTable(
	"game_player",
	{
		id: text("id").primaryKey().$defaultFn(uuid),
		gameId: text("game_id")
			.notNull()
			.references(() => game.id, { onDelete: "cascade" }),
		userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
		displayName: text("display_name").notNull(),
		guestToken: text("guest_token"),
		score: integer("score").notNull().default(0),
		status: text("status").notNull(), // 'joined' | 'left' | 'kicked' | 'disconnected'
		joinedAt: timestamp("joined_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		leftAt: timestamp("left_at", { withTimezone: true }),
	},
	(t) => [
		index("game_player_game_status_idx").on(t.gameId, t.status),
		index("game_player_game_user_idx").on(t.gameId, t.userId),
		uniqueIndex("game_player_guest_uk")
			.on(t.gameId, t.guestToken)
			.where(sql`guest_token is not null`),
	],
);

export const gameQuestionState = pgTable(
	"game_question_state",
	{
		id: text("id").primaryKey().$defaultFn(uuid),
		gameId: text("game_id")
			.notNull()
			.references(() => game.id, { onDelete: "cascade" }),
		questionRef: text("question_ref").notNull(), // id within the snapshot
		state: text("state").notNull(),
		currentPlayerId: text("current_player_id").references(() => gamePlayer.id, {
			onDelete: "set null",
		}),
		openedAt: timestamp("opened_at", { withTimezone: true }),
		buzzedAt: timestamp("buzzed_at", { withTimezone: true }),
		closedAt: timestamp("closed_at", { withTimezone: true }),
	},
	(t) => [uniqueIndex("game_question_state_uk").on(t.gameId, t.questionRef)],
);

export const gameEvent = pgTable(
	"game_event",
	{
		id: text("id").primaryKey().$defaultFn(uuid),
		gameId: text("game_id")
			.notNull()
			.references(() => game.id, { onDelete: "cascade" }),
		actorPlayerId: text("actor_player_id").references(() => gamePlayer.id, {
			onDelete: "set null",
		}),
		type: text("type").notNull(),
		payload: jsonb("payload").notNull(),
		at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index("game_event_game_at_idx").on(t.gameId, t.at)],
);

// Persisted final ranking, written when a game reaches `completed`.
// Surviving a server restart means `/games/:roomCode/result` keeps
// working without replaying game_event.
export const gameResult = pgTable("game_result", {
	gameId: text("game_id")
		.primaryKey()
		.references(() => game.id, { onDelete: "cascade" }),
	ranking: jsonb("ranking").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
});

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type UserProfile = typeof userProfile.$inferSelect;
export type Quiz = typeof quiz.$inferSelect;
export type Category = typeof category.$inferSelect;
export type Question = typeof question.$inferSelect;
export type Media = typeof media.$inferSelect;
export type QuestionMedia = typeof questionMedia.$inferSelect;
export type FinalQuestion = typeof finalQuestion.$inferSelect;
export type QuizShare = typeof quizShare.$inferSelect;
export type Game = typeof game.$inferSelect;
export type GameSnapshot = typeof gameSnapshot.$inferSelect;
export type GamePlayer = typeof gamePlayer.$inferSelect;
export type GameQuestionState = typeof gameQuestionState.$inferSelect;
export type GameEvent = typeof gameEvent.$inferSelect;
export type GameResult = typeof gameResult.$inferSelect;
