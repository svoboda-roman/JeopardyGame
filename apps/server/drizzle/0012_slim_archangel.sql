CREATE TABLE IF NOT EXISTS "drink" (
	"id" text PRIMARY KEY NOT NULL,
	"quiz_id" text NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"amount" text NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "drink_quiz_position_uk" UNIQUE("quiz_id","position")
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'drink_quiz_id_quiz_id_fk'
  ) THEN
    ALTER TABLE "drink" ADD CONSTRAINT "drink_quiz_id_quiz_id_fk"
      FOREIGN KEY ("quiz_id") REFERENCES "public"."quiz"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
