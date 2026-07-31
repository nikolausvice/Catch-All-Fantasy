import {
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

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
      .$type<"sleeper" | "espn" | "yahoo">()
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
      .$type<"sleeper" | "espn" | "yahoo">()
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
