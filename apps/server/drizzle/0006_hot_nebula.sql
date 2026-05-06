CREATE TABLE "answer_media" (
	"question_id" text NOT NULL,
	"media_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "answer_media_pk" UNIQUE("question_id","media_id"),
	CONSTRAINT "answer_media_position_uk" UNIQUE("question_id","position")
);
--> statement-breakpoint
ALTER TABLE "answer_media" ADD CONSTRAINT "answer_media_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_media" ADD CONSTRAINT "answer_media_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;