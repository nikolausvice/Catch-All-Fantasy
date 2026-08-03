import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";
import type { LeagueMatchup } from "@/lib/leagues/types";

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  /** Only set for credentials-based accounts; null for OAuth-only users. */
  passwordHash: text("passwordHash"),
  createdAt: timestamp("createdAt", { mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

export const platformIdentities = pgTable(
  "platform_identities",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform")
      .$type<"sleeper" | "espn" | "yahoo" | "demo">()
      .notNull(),
    platformUserId: text("platformUserId").notNull(),
    platformUsername: text("platformUsername"),
    /** Encrypted credential material (e.g. ESPN's espn_s2 cookie). Never stored in plaintext. */
    encryptedSecret: text("encryptedSecret"),
    createdAt: timestamp("createdAt", { mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("platform_identities_user_platform_id_idx").on(
      table.userId,
      table.platform,
      table.platformUserId,
    ),
  ],
);

export const connectedLeagues = pgTable(
  "connected_leagues",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform")
      .$type<"sleeper" | "espn" | "yahoo" | "demo">()
      .notNull(),
    platformLeagueId: text("platformLeagueId").notNull(),
    platformUserId: text("platformUserId"),
    leagueName: text("leagueName").notNull(),
    season: text("season").notNull(),
    sport: text("sport").notNull().default("nfl"),
    avatarUrl: text("avatarUrl"),
    /** Platform-specific id of the team/roster the user identified as their own. */
    userTeamId: text("userTeamId"),
    /** Denormalized so the dashboard can show it without refetching from the platform. */
    userTeamName: text("userTeamName"),
    /** Editable fake roster + scores for platform "demo" — lets you hand-tune player points to see how the probabilities react. */
    demoRoster: jsonb("demoRoster").$type<LeagueMatchup>(),
    createdAt: timestamp("createdAt", { mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("connected_leagues_user_platform_league_idx").on(
      table.userId,
      table.platform,
      table.platformLeagueId,
    ),
  ],
);

/**
 * A hand-typed score from the demo editor, applied on top of every league
 * (demo or real) where this same real-world player is rostered — keyed by
 * normalized name+position rather than any platform's own player id, since
 * that's the only identity shared across Sleeper/ESPN/demo. Deleting the row
 * un-overrides the player, letting the platform's own live data (or the demo
 * roster's stored value) be authoritative again.
 */
export const playerScoreOverrides = pgTable(
  "player_score_overrides",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** normalizePlayerKey(name, position) from roster-overlap.ts. */
    playerKey: text("playerKey").notNull(),
    playerName: text("playerName").notNull(),
    points: real("points").notNull(),
    updatedAt: timestamp("updatedAt", { mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("player_score_overrides_user_key_idx").on(table.userId, table.playerKey),
  ],
);
