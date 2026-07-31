import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// DATABASE_URL points at the Neon Postgres database provisioned via the
// Vercel-Neon integration, pulled locally with `vercel env pull`.
const sql = neon(process.env.DATABASE_URL!);

export const db = drizzle(sql, { schema });
