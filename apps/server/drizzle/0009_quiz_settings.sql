ALTER TABLE "quiz" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;
