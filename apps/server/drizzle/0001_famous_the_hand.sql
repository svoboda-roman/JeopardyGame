CREATE TABLE "category" (
	"id" text PRIMARY KEY NOT NULL,
	"quiz_id" text NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	CONSTRAINT "category_quiz_position_uk" UNIQUE("quiz_id","position")
);
--> statement-breakpoint
CREATE TABLE "final_question" (
	"id" text PRIMARY KEY NOT NULL,
	"quiz_id" text NOT NULL,
	"category" text NOT NULL,
	"clue" text NOT NULL,
	"answer" text NOT NULL,
	CONSTRAINT "final_question_quiz_id_unique" UNIQUE("quiz_id")
);
--> statement-breakpoint
CREATE TABLE "question" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"position" integer NOT NULL,
	"point_value" integer NOT NULL,
	"is_daily_double" boolean DEFAULT false NOT NULL,
	"clue" text DEFAULT '' NOT NULL,
	"answer" text DEFAULT '' NOT NULL,
	CONSTRAINT "question_category_position_uk" UNIQUE("category_id","position")
);
--> statement-breakpoint
CREATE TABLE "quiz" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_share" (
	"id" text PRIMARY KEY NOT NULL,
	"quiz_id" text NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "quiz_share_quiz_id_unique" UNIQUE("quiz_id")
);
--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_quiz_id_quiz_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quiz"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "final_question" ADD CONSTRAINT "final_question_quiz_id_quiz_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quiz"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question" ADD CONSTRAINT "question_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz" ADD CONSTRAINT "quiz_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_share" ADD CONSTRAINT "quiz_share_quiz_id_quiz_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quiz"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_share_token_uk" ON "quiz_share" USING btree ("token");