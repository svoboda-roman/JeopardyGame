import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

const uuid = () => crypto.randomUUID()

// ───── better-auth core tables ─────
// Names match better-auth defaults so the drizzle adapter works without
// remapping. App-specific extensions go in `userProfile` below.

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ───── App profile (1:1 with user) ─────
// Holds JeopardyGame-specific fields not owned by better-auth.

export const userProfile = pgTable('user_profile', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  avatarMediaId: text('avatar_media_id'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ───── Quiz authoring ─────

export const quiz = pgTable('quiz', {
  id: text('id').primaryKey().$defaultFn(uuid),
  ownerId: text('owner_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const category = pgTable(
  'category',
  {
    id: text('id').primaryKey().$defaultFn(uuid),
    quizId: text('quiz_id')
      .notNull()
      .references(() => quiz.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    title: text('title').notNull(),
  },
  (t) => [unique('category_quiz_position_uk').on(t.quizId, t.position)],
)

export const question = pgTable(
  'question',
  {
    id: text('id').primaryKey().$defaultFn(uuid),
    categoryId: text('category_id')
      .notNull()
      .references(() => category.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    pointValue: integer('point_value').notNull(),
    isDailyDouble: boolean('is_daily_double').notNull().default(false),
    clue: text('clue').notNull().default(''),
    answer: text('answer').notNull().default(''),
  },
  (t) => [unique('question_category_position_uk').on(t.categoryId, t.position)],
)

export const finalQuestion = pgTable('final_question', {
  id: text('id').primaryKey().$defaultFn(uuid),
  quizId: text('quiz_id')
    .notNull()
    .unique()
    .references(() => quiz.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  clue: text('clue').notNull(),
  answer: text('answer').notNull(),
})

// Stores the share token in plaintext on purpose: it IS the URL secret,
// not a credential, and we need to display the URL back to the owner.
export const quizShare = pgTable(
  'quiz_share',
  {
    id: text('id').primaryKey().$defaultFn(uuid),
    quizId: text('quiz_id')
      .notNull()
      .unique()
      .references(() => quiz.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('quiz_share_token_uk').on(t.token)],
)

export type User = typeof user.$inferSelect
export type Session = typeof session.$inferSelect
export type UserProfile = typeof userProfile.$inferSelect
export type Quiz = typeof quiz.$inferSelect
export type Category = typeof category.$inferSelect
export type Question = typeof question.$inferSelect
export type FinalQuestion = typeof finalQuestion.$inferSelect
export type QuizShare = typeof quizShare.$inferSelect
