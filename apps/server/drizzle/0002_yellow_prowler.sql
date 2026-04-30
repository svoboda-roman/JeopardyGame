CREATE TABLE "game" (
	"id" text PRIMARY KEY NOT NULL,
	"room_code" text NOT NULL,
	"quiz_id" text NOT NULL,
	"host_id" text NOT NULL,
	"status" text NOT NULL,
	"options" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "game_event" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"actor_player_id" text,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_player" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"user_id" text,
	"display_name" text NOT NULL,
	"guest_token" text,
	"score" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "game_question_state" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"question_ref" text NOT NULL,
	"state" text NOT NULL,
	"current_player_id" text,
	"opened_at" timestamp with time zone,
	"buzzed_at" timestamp with time zone,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "game_snapshot" (
	"game_id" text PRIMARY KEY NOT NULL,
	"quiz" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game" ADD CONSTRAINT "game_quiz_id_quiz_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quiz"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game" ADD CONSTRAINT "game_host_id_user_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_event" ADD CONSTRAINT "game_event_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_event" ADD CONSTRAINT "game_event_actor_player_id_game_player_id_fk" FOREIGN KEY ("actor_player_id") REFERENCES "public"."game_player"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_player" ADD CONSTRAINT "game_player_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_player" ADD CONSTRAINT "game_player_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_question_state" ADD CONSTRAINT "game_question_state_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_question_state" ADD CONSTRAINT "game_question_state_current_player_id_game_player_id_fk" FOREIGN KEY ("current_player_id") REFERENCES "public"."game_player"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_snapshot" ADD CONSTRAINT "game_snapshot_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_room_code_uk" ON "game" USING btree ("room_code");--> statement-breakpoint
CREATE UNIQUE INDEX "game_host_active_uk" ON "game" USING btree ("host_id") WHERE status in ('lobby','active','paused');--> statement-breakpoint
CREATE INDEX "game_event_game_at_idx" ON "game_event" USING btree ("game_id","at");--> statement-breakpoint
CREATE INDEX "game_player_game_status_idx" ON "game_player" USING btree ("game_id","status");--> statement-breakpoint
CREATE INDEX "game_player_game_user_idx" ON "game_player" USING btree ("game_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_player_guest_uk" ON "game_player" USING btree ("game_id","guest_token") WHERE guest_token is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "game_question_state_uk" ON "game_question_state" USING btree ("game_id","question_ref");