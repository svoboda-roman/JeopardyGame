CREATE TABLE "game_result" (
	"game_id" text PRIMARY KEY NOT NULL,
	"ranking" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_result" ADD CONSTRAINT "game_result_game_id_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."game"("id") ON DELETE cascade ON UPDATE no action;