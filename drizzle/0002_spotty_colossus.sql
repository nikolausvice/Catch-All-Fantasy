ALTER TABLE "player_score_overrides" ALTER COLUMN "points" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "player_score_overrides" ADD COLUMN "gameStatus" text;