import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

// Locally this points at a file on disk (no Turso account needed).
// In prod, set TURSO_DATABASE_URL/TURSO_AUTH_TOKEN to a Turso database and
// the exact same client + schema work unchanged.
const libsql = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:./local.db",
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});

export const db = drizzle(libsql, { schema });
