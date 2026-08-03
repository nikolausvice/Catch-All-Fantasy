CREATE TABLE "player_score_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"playerKey" text NOT NULL,
	"playerName" text NOT NULL,
	"points" real NOT NULL,
	"updatedAt" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connected_leagues" ADD COLUMN "demoRoster" jsonb;--> statement-breakpoint
ALTER TABLE "player_score_overrides" ADD CONSTRAINT "player_score_overrides_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "player_score_overrides_user_key_idx" ON "player_score_overrides" USING btree ("userId","playerKey");