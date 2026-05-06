CREATE TABLE IF NOT EXISTS "answer_media" (
	"question_id" text NOT NULL,
	"media_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "answer_media_pk" UNIQUE("question_id","media_id"),
	CONSTRAINT "answer_media_position_uk" UNIQUE("question_id","position")
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'answer_media_question_id_question_id_fk'
  ) THEN
    ALTER TABLE "answer_media" ADD CONSTRAINT "answer_media_question_id_question_id_fk"
      FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'answer_media_media_id_media_id_fk'
  ) THEN
    ALTER TABLE "answer_media" ADD CONSTRAINT "answer_media_media_id_media_id_fk"
      FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "question" ADD COLUMN IF NOT EXISTS "youtube_id" text;
--> statement-breakpoint
ALTER TABLE "question" ADD COLUMN IF NOT EXISTS "answer_youtube_id" text;
--> statement-breakpoint
ALTER TABLE "question" ADD COLUMN IF NOT EXISTS "host_notes" text DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE "question" ADD COLUMN IF NOT EXISTS "buzz_window_ms" integer DEFAULT NULL;
